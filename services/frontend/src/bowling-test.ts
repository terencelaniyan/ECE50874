/**
 * Bowling Alley Simulator — Rapier3D v0.19 + Three.js
 * Full physics simulation with proper hook mechanics, pin physics, and game logic.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// ══════════════════════════════════════════════════════════════════════════
// Constants (USBC specifications, SI units)
// ══════════════════════════════════════════════════════════════════════════
const LANE_L = 18.288;      // 60 ft
const LANE_W = 1.0636;      // 41.875 in (USBC spec, 39 boards)
const APPROACH_L = 4.572;   // 15 ft approach
const BALL_R = 0.1085;      // 4.25 in diameter
const BALL_MASS = 6.8;      // 15 lb
const PIN_R_BOT = 0.057;    // ~2.25 in diameter at base (visual profile, not contact patch)
const PIN_R_MID = 0.0605;   // 2.383 in belly radius (USBC: 4.766" diameter at widest)
const PIN_R_NECK = 0.023;   // 0.899 in neck radius (USBC: 1.797" diameter at narrowest)
const PIN_H = 0.381;        // 15 in
const PIN_MASS = 1.53;      // 3 lb 6 oz
const G = 9.81;
const BOARDS = 39;
const SP = 0.3048;          // 12 in pin center-to-center
const ARROW_Z = 4.572;      // arrows at 15 ft from foul line
const DOT_Z1 = 3.658;       // dots at 12 ft
const DOT_Z2 = 2.134;       // dots at 7 ft

// Gutter specs (USBC)
const GUTTER_W = 0.235;     // 9.25 in width
const GUTTER_D = 0.0476;    // 1.875 in depth

const PIN_POS: [number, number][] = [
  [0, 0],
  [-SP / 2, SP * 0.866], [SP / 2, SP * 0.866],
  [-SP, SP * 1.732], [0, SP * 1.732], [SP, SP * 1.732],
  [-SP * 1.5, SP * 2.598], [-SP / 2, SP * 2.598], [SP / 2, SP * 2.598], [SP * 1.5, SP * 2.598],
];

// Pin profile points for lathe geometry (visual mesh)
// Matches USBC pin dimensions: widest 4.766" at 4.5" up, neck 1.797" at ~10" up
const PIN_PROFILE_PTS: [number, number][] = [
  [0, 0],
  [PIN_R_BOT, 0],                    // base: 2.25" diameter
  [PIN_R_BOT, 0.02],
  [PIN_R_MID, 0.08],                 // belly widens
  [PIN_R_MID, 0.114],                // widest at 4.5" (0.114m) from base
  [PIN_R_MID * 0.85, 0.19],          // taper begins
  [PIN_R_NECK * 1.3, 0.25],          // narrowing toward neck
  [PIN_R_NECK, 0.254],               // neck narrowest at ~10" (0.254m)
  [PIN_R_NECK * 0.95, 0.32],         // head widens slightly
  [PIN_R_NECK * 0.75, 0.37],         // top taper
  [0, PIN_H],                        // tip
];

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const info = document.getElementById('info') as HTMLElement;


// ══════════════════════════════════════════════════════════════════════════
// Item 7: Sound Effects (Web Audio synthesis)
// ══════════════════════════════════════════════════════════════════════════
let audioCtx: AudioContext | null = null;
let audioMuted = false;
let rollingOsc: OscillatorNode | null = null;
let rollingGain: GainNode | null = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playPinHitSound(force: number) {
  if (audioMuted) return;
  const ctx = ensureAudioCtx();
  const vol = Math.min(1, force * 0.3);

  // White noise burst
  const bufferSize = ctx.sampleRate * 0.15;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  noiseSrc.connect(noiseGain).connect(ctx.destination);
  noiseSrc.start();
  noiseSrc.stop(ctx.currentTime + 0.15);

  // Low sine thud
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

function startRollingSound() {
  if (audioMuted) return;
  const ctx = ensureAudioCtx();
  if (rollingOsc) return;

  rollingOsc = ctx.createOscillator();
  rollingOsc.type = 'sine';
  rollingOsc.frequency.setValueAtTime(50, ctx.currentTime);
  rollingGain = ctx.createGain();
  rollingGain.gain.setValueAtTime(0.08, ctx.currentTime);

  // Add slight frequency modulation for realism
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(3, ctx.currentTime);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(8, ctx.currentTime);
  lfo.connect(lfoGain).connect(rollingOsc.frequency);
  lfo.start();

  rollingOsc.connect(rollingGain).connect(ctx.destination);
  rollingOsc.start();
}

function updateRollingSound(ballSpeed: number) {
  if (!rollingGain || !rollingOsc || audioMuted) return;
  const ctx = ensureAudioCtx();
  const gain = Math.min(0.12, ballSpeed * 0.015);
  rollingGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.05);
  rollingOsc.frequency.setTargetAtTime(40 + ballSpeed * 3, ctx.currentTime, 0.05);
}

function stopRollingSound() {
  if (rollingOsc) {
    try { rollingOsc.stop(); } catch { /* already stopped */ }
    rollingOsc = null;
  }
  rollingGain = null;
}

function playStrikeSound() {
  if (audioMuted) return;
  const ctx = ensureAudioCtx();

  // Layered crash with long decay
  const bufferSize = ctx.sampleRate * 1.2;
  const crashBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = crashBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.6;
  }
  const crashSrc = ctx.createBufferSource();
  crashSrc.buffer = crashBuffer;
  const crashGain = ctx.createGain();
  crashGain.gain.setValueAtTime(0.5, ctx.currentTime);
  crashSrc.connect(crashGain).connect(ctx.destination);
  crashSrc.start();
  crashSrc.stop(ctx.currentTime + 1.2);

  // Rising chime
  const chime = ctx.createOscillator();
  chime.type = 'triangle';
  chime.frequency.setValueAtTime(400, ctx.currentTime + 0.1);
  chime.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.6);
  const chimeGain = ctx.createGain();
  chimeGain.gain.setValueAtTime(0, ctx.currentTime);
  chimeGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.15);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  chime.connect(chimeGain).connect(ctx.destination);
  chime.start(ctx.currentTime + 0.1);
  chime.stop(ctx.currentTime + 0.8);
}

async function main() {
  info.textContent = 'Loading Rapier3D WASM...';
  await RAPIER.init();
  info.textContent = 'Ready. Click LAUNCH.';

  // ══════════════════════════════════════════════════════════════════════
  // THREE.JS SCENE
  // ══════════════════════════════════════════════════════════════════════
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1018);

  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 80);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // ── Lighting (warm bowling alley atmosphere — 2700-3000K warm whites + accent) ──
  scene.add(new THREE.AmbientLight(0x352030, 0.4)); // dim purple-tinted ambient
  scene.add(new THREE.HemisphereLight(0x443344, 0x221122, 0.15)); // subtle sky/ground fill

  // Overhead lane spots — warm white (2700K) at regular intervals
  for (let z = 2; z < LANE_L; z += 3.5) {
    const spot = new THREE.SpotLight(0xffd9b3, 1.4, 14, Math.PI / 5, 0.6, 1);
    spot.position.set(0, 4.5, z);
    spot.target.position.set(0, 0, z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    scene.add(spot);
    scene.add(spot.target);

    // Visible light fixture housing (small dark box on ceiling)
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.06, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3 })
    );
    fixture.position.set(0, 4.5, z);
    scene.add(fixture);
  }

  // Accent LED strip along gutter edges (subtle blue/purple glow)
  for (const s of [-1, 1]) {
    const accentLight = new THREE.PointLight(0x4444aa, 0.3, 8);
    accentLight.position.set(s * (LANE_W / 2 + 0.1), 0.1, LANE_L / 2);
    scene.add(accentLight);
  }

  // Pin deck spotlight — bright, focused, slightly warm
  const pinLight = new THREE.SpotLight(0xfff5e0, 2.5, 10, Math.PI / 5, 0.3, 1);
  pinLight.position.set(0, 4, LANE_L + 0.3);
  pinLight.target.position.set(0, 0, LANE_L + 0.4);
  pinLight.castShadow = true;
  pinLight.shadow.mapSize.set(1024, 1024);
  scene.add(pinLight);
  scene.add(pinLight.target);

  // Secondary fill light on pin deck from the side
  const pinFill = new THREE.SpotLight(0xffeedd, 0.8, 8, Math.PI / 4, 0.5, 1);
  pinFill.position.set(1.5, 3, LANE_L + 0.5);
  pinFill.target.position.set(0, 0, LANE_L + 0.4);
  scene.add(pinFill);
  scene.add(pinFill.target);

  // ══════════════════════════════════════════════════════════════════════
  // Item 4: Lane Material Zones (Maple vs Pine)
  // ══════════════════════════════════════════════════════════════════════

  // Pine texture (lane body — oiled, warm yellow, open grain)
  const pineCanvas = document.createElement('canvas');
  pineCanvas.width = 256;
  pineCanvas.height = 1024;
  const pctx = pineCanvas.getContext('2d')!;
  pctx.fillStyle = '#9B7020';
  pctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 39; i++) {
    const x = (i / 39) * 256;
    // Board-to-board color variation
    const shade = Math.random() * 15;
    pctx.fillStyle = `rgba(${140 + shade}, ${95 + shade}, ${25 + shade}, 0.15)`;
    pctx.fillRect(x, 0, 256 / 39, 1024);
    // Board lines
    pctx.strokeStyle = `rgba(80,50,10,${i % 5 === 0 ? 0.15 : 0.05})`;
    pctx.lineWidth = i % 5 === 0 ? 1.5 : 0.5;
    pctx.beginPath();
    pctx.moveTo(x, 0);
    pctx.lineTo(x, 1024);
    pctx.stroke();
  }
  // Open grain (wider strokes)
  for (let i = 0; i < 2000; i++) {
    pctx.fillStyle = `rgba(${60 + Math.random() * 40}, ${40 + Math.random() * 20}, ${5 + Math.random() * 15}, 0.08)`;
    pctx.fillRect(Math.random() * 256, Math.random() * 1024, Math.random() * 12 + 2, 1.5);
  }
  const pineTexture = new THREE.CanvasTexture(pineCanvas);
  pineTexture.wrapS = THREE.RepeatWrapping;
  pineTexture.wrapT = THREE.RepeatWrapping;
  pineTexture.repeat.set(1, 8);

  const pineMat = new THREE.MeshStandardMaterial({
    map: pineTexture, roughness: 0.25, metalness: 0.05,
  });

  // Maple texture (approach + pin deck — pale cream, tight grain, matte)
  const mapleCanvas = document.createElement('canvas');
  mapleCanvas.width = 256;
  mapleCanvas.height = 512;
  const mctx = mapleCanvas.getContext('2d')!;
  mctx.fillStyle = '#DDD0B8';
  mctx.fillRect(0, 0, 256, 512);
  // Tight grain lines (many, thin, closely spaced)
  for (let i = 0; i < 120; i++) {
    const x = (i / 120) * 256 + (Math.random() - 0.5) * 1.5;
    mctx.strokeStyle = `rgba(160,140,110,${0.08 + Math.random() * 0.06})`;
    mctx.lineWidth = 0.3 + Math.random() * 0.3;
    mctx.beginPath();
    mctx.moveTo(x, 0);
    // Slight waviness
    for (let y = 0; y < 512; y += 32) {
      mctx.lineTo(x + (Math.random() - 0.5) * 0.8, y + 32);
    }
    mctx.stroke();
  }
  // Fine noise overlay
  for (let i = 0; i < 1500; i++) {
    mctx.fillStyle = `rgba(${180 + Math.random() * 30}, ${160 + Math.random() * 30}, ${130 + Math.random() * 20}, 0.05)`;
    mctx.fillRect(Math.random() * 256, Math.random() * 512, Math.random() * 4 + 1, 1);
  }
  const mapleTexture = new THREE.CanvasTexture(mapleCanvas);
  mapleTexture.wrapS = THREE.RepeatWrapping;
  mapleTexture.wrapT = THREE.RepeatWrapping;
  mapleTexture.repeat.set(1, 4);

  const mapleMat = new THREE.MeshStandardMaterial({
    map: mapleTexture, roughness: 0.5, metalness: 0.02,
  });

  // Lane mesh (pine)
  const laneMesh = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.04, LANE_L), pineMat);
  laneMesh.position.set(0, -0.02, LANE_L / 2);
  laneMesh.receiveShadow = true;
  scene.add(laneMesh);

  // Approach area (maple)
  const approach = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.5, 0.04, APPROACH_L), mapleMat);
  approach.position.set(0, -0.02, -APPROACH_L / 2);
  approach.receiveShadow = true;
  scene.add(approach);

  // Pin deck (maple — wider than lane to include side catching areas)
  const deckLen = SP * 2.6 + 0.6;
  const deckVisualW = LANE_W + GUTTER_W * 2 + 0.4; // covers gutters + side areas
  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(deckVisualW, 0.04, deckLen), mapleMat);
  deckMesh.position.set(0, -0.02, LANE_L + deckLen / 2);
  deckMesh.receiveShadow = true;
  scene.add(deckMesh);

  // Foul line (bright red, glowing)
  const foulLine = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_W + 0.02, 0.006, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xdd2222, emissive: 0xaa1111, emissiveIntensity: 0.6 })
  );
  foulLine.position.set(0, 0.002, 0);
  scene.add(foulLine);

  // Approach dots (3 rows: 15ft, 12ft, and near foul line on the approach)
  const approachDotMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const approachDotGeo = new THREE.CircleGeometry(0.008, 8);
  const approachDotBoards = [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37];
  for (const z of [-0.08, -1.0, -2.5]) { // near foul line, ~3ft back, ~8ft back
    for (const board of approachDotBoards) {
      const x = (board / BOARDS) * LANE_W - LANE_W / 2;
      const adot = new THREE.Mesh(approachDotGeo, approachDotMat);
      adot.rotation.x = -Math.PI / 2;
      adot.position.set(x, 0.002, z);
      scene.add(adot);
    }
  }

  // Arrows
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const arrowBoards = [5, 10, 15, 20, 25, 30, 35];
  for (const board of arrowBoards) {
    const x = (board / BOARDS) * LANE_W - LANE_W / 2;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.015);
    shape.lineTo(-0.008, -0.015);
    shape.lineTo(0.008, -0.015);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const arrow = new THREE.Mesh(geo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(x, 0.002, ARROW_Z);
    scene.add(arrow);
  }

  // Guide dots
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const dotGeo = new THREE.CircleGeometry(0.006, 8);
  for (const z of [DOT_Z1, DOT_Z2]) {
    for (const board of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
      const x = (board / BOARDS) * LANE_W - LANE_W / 2;
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x, 0.002, z);
      scene.add(dot);
    }
  }

  // Oil pattern — visible sheen on oiled portion (house shot: 38ft)
  // The oiled section is slightly glossy compared to the dry backend
  const oilLen = 38 * 0.3048;
  const oilGeo = new THREE.PlaneGeometry(LANE_W - 0.04, oilLen);
  const oilMat = new THREE.MeshStandardMaterial({
    color: 0x8ab0d0, transparent: true, opacity: 0.08,
    roughness: 0.05, metalness: 0.4, // glossy sheen
  });
  const oilOverlay = new THREE.Mesh(oilGeo, oilMat);
  oilOverlay.rotation.x = -Math.PI / 2;
  oilOverlay.position.set(0, 0.003, oilLen / 2);
  scene.add(oilOverlay);

  // Oil pattern end marker (subtle line where oil stops — bowlers look for this)
  const oilEndLine = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_W - 0.04, 0.002, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x6688aa, transparent: true, opacity: 0.15 })
  );
  oilEndLine.position.set(0, 0.003, oilLen);
  scene.add(oilEndLine);

  // ══════════════════════════════════════════════════════════════════════
  // Item 5: Proper Gutter Geometry (USBC Spec semi-circular)
  // ══════════════════════════════════════════════════════════════════════
  const gutterDarkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const gutterFullLen = LANE_L + APPROACH_L;

  for (const s of [-1, 1]) {
    // Semi-elliptical cross-section gutter
    const gutterShape = new THREE.Shape();
    const halfW = GUTTER_W / 2;
    gutterShape.moveTo(-halfW, 0);
    // Approximate ellipse with cubic bezier
    gutterShape.bezierCurveTo(-halfW, -GUTTER_D * 0.8, halfW, -GUTTER_D * 0.8, halfW, 0);
    gutterShape.lineTo(halfW, 0.005);
    gutterShape.lineTo(-halfW, 0.005);
    gutterShape.closePath();

    const extrudeSettings = { depth: gutterFullLen, bevelEnabled: false };
    const gutterGeo = new THREE.ExtrudeGeometry(gutterShape, extrudeSettings);
    const gutter = new THREE.Mesh(gutterGeo, gutterDarkMat);
    gutter.rotation.x = -Math.PI / 2;
    gutter.position.set(s * (LANE_W / 2 + halfW), 0, -APPROACH_L);
    scene.add(gutter);

    // Raised lip between lane and gutter
    const lipGeo = new THREE.BoxGeometry(0.012, 0.018, gutterFullLen);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.1 });
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.position.set(s * (LANE_W / 2 + 0.006), 0.005, (LANE_L - APPROACH_L) / 2);
    scene.add(lip);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Visual Polish — Sideboards, kickbacks, pit, ball return
  // ══════════════════════════════════════════════════════════════════════
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.7 });
  const paddedMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const kickbackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.2 });
  const pinAreaVisualWidth = LANE_W / 2 + GUTTER_W + 0.3;
  const pinAreaVisualEnd = LANE_L + SP * 2.6 + 1.5;

  // Sideboards (vertical panels flanking lane behind gutters — approach/lane area)
  for (const s of [-1, 1]) {
    const sideGeo = new THREE.BoxGeometry(0.04, 0.3, gutterFullLen);
    const sideboard = new THREE.Mesh(sideGeo, darkWoodMat);
    sideboard.position.set(s * (LANE_W / 2 + GUTTER_W + 0.02), 0.13, (LANE_L - APPROACH_L) / 2);
    scene.add(sideboard);
  }

  // Kickback plates (vertical walls flanking pin deck — pins bounce off these)
  for (const s of [-1, 1]) {
    const kickGeo = new THREE.BoxGeometry(0.06, 0.8, pinAreaVisualEnd - LANE_L + 0.5);
    const kickback = new THREE.Mesh(kickGeo, kickbackMat);
    kickback.position.set(s * pinAreaVisualWidth, 0.35, (LANE_L + pinAreaVisualEnd) / 2);
    scene.add(kickback);
  }

  // Side floors (dark platforms flanking the pin deck to catch scattered pins)
  for (const s of [-1, 1]) {
    const sideFloorGeo = new THREE.BoxGeometry(0.6, 0.04, pinAreaVisualEnd - LANE_L + 0.5);
    const sideFloorMesh = new THREE.Mesh(sideFloorGeo, paddedMat);
    sideFloorMesh.position.set(s * (pinAreaVisualWidth + 0.3), -0.02, (LANE_L + pinAreaVisualEnd) / 2);
    scene.add(sideFloorMesh);
  }

  // Pit back wall (taller, padded)
  const pitWallGeo = new THREE.BoxGeometry(pinAreaVisualWidth * 2 + 0.6, 1.0, 0.1);
  const pitWall = new THREE.Mesh(pitWallGeo, paddedMat);
  pitWall.position.set(0, 0.3, pinAreaVisualEnd);
  scene.add(pitWall);

  // Pit floor (at lane level, not recessed — solid catching surface)
  const pitFloorGeo = new THREE.BoxGeometry(pinAreaVisualWidth * 2 + 0.6, 0.04, pinAreaVisualEnd - LANE_L + 0.5);
  const pitFloor = new THREE.Mesh(pitFloorGeo, paddedMat);
  pitFloor.position.set(0, -0.02, (LANE_L + pinAreaVisualEnd) / 2);
  scene.add(pitFloor);

  // Ball return tunnel opening (dark opening at pit floor)
  const tunnelGeo = new THREE.CircleGeometry(0.12, 12);
  const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.DoubleSide });
  const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
  tunnel.position.set(0, -0.01, pinAreaVisualEnd - 0.05);
  scene.add(tunnel);

  // Ball return housing near approach
  const returnHousingGeo = new THREE.BoxGeometry(0.35, 0.18, 0.5);
  const returnHousingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const housing = new THREE.Mesh(returnHousingGeo, returnHousingMat);
    housing.position.set(s * (LANE_W / 2 + 0.2), 0.05, -APPROACH_L + 0.3);
    scene.add(housing);
  }

  // Ball return tracks
  for (const s of [-1, 1]) {
    const trackGeo = new THREE.BoxGeometry(0.08, 0.04, LANE_L + 3);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.3 });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(s * (LANE_W / 2 + GUTTER_W + 0.06), -0.08, LANE_L / 2);
    scene.add(track);
  }

  // Pin sweep bar placeholder (horizontal bar above pin deck)
  const sweepBarGeo = new THREE.BoxGeometry(LANE_W + 0.1, 0.03, 0.06);
  const sweepBarMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.4 });
  const sweepBar = new THREE.Mesh(sweepBarGeo, sweepBarMat);
  sweepBar.position.set(0, PIN_H + 0.15, LANE_L - 0.1);
  scene.add(sweepBar);

  // Adjacent lane hint
  for (const s of [-1, 1]) {
    const adjLane = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_W, 0.04, LANE_L + APPROACH_L),
      new THREE.MeshStandardMaterial({ color: 0x7B5A18, roughness: 0.6 })
    );
    adjLane.position.set(s * (LANE_W + GUTTER_W * 2 + 0.15), -0.025, (LANE_L - APPROACH_L) / 2);
    adjLane.receiveShadow = true;
    scene.add(adjLane);
  }

  // Ceiling (dark with subtle texture, lower to feel more enclosed)
  const ceilingGeo = new THREE.PlaneGeometry(LANE_W * 5, LANE_L + APPROACH_L + 5);
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x121018, side: THREE.BackSide });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 5, (LANE_L - APPROACH_L) / 2);
  scene.add(ceiling);

  // Side walls (dark paneled look, flanking the full lane area)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1520, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const wallGeo = new THREE.BoxGeometry(0.05, 5, LANE_L + APPROACH_L + 5);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(s * (LANE_W * 2), 2.5, (LANE_L - APPROACH_L) / 2);
    scene.add(wall);
  }

  // Masking panel above pin deck (hides machinery — dark horizontal panel)
  const maskPanelGeo = new THREE.BoxGeometry(LANE_W + GUTTER_W * 2 + 0.8, 2.5, 0.08);
  const maskPanel = new THREE.Mesh(maskPanelGeo, new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
  maskPanel.position.set(0, 3.5, LANE_L - 0.2);
  scene.add(maskPanel);

  // ══════════════════════════════════════════════════════════════════════
  // PIN MESHES
  // ══════════════════════════════════════════════════════════════════════
  // Pin mesh with geometry centered at PIN_H/2 — matches physics body origin.
  // This ensures rotated (fallen) pins render at the correct position.
  function makePinMesh(): THREE.Group {
    const pts = PIN_PROFILE_PTS.map(([r, y]) => new THREE.Vector2(r, y));
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(pts, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xf8f8f2, roughness: 0.18, metalness: 0.02,
        clearcoat: 0.4, clearcoatRoughness: 0.2, // nylon/surlyn coating
      })
    );
    // Shift geometry down so pivot is at PIN_H/2 (center of pin, matching physics body)
    body.position.y = -PIN_H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);
    for (const y of [0.10, 0.13]) {
      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(PIN_R_MID + 0.001, PIN_R_MID + 0.001, 0.012, 16),
        new THREE.MeshStandardMaterial({ color: 0xcc2222 })
      );
      stripe.position.y = y - PIN_H / 2; // also shift stripes
      grp.add(stripe);
    }
    return grp;
  }

  const pinMeshes: THREE.Group[] = [];
  for (let i = 0; i < 10; i++) {
    const pin = makePinMesh();
    // Initial position: physics body is at PIN_H/2, mesh pivot is now also at PIN_H/2
    pin.position.set(PIN_POS[i][0], PIN_H / 2, LANE_L + PIN_POS[i][1]);
    scene.add(pin);
    pinMeshes.push(pin);
  }

  // ══════════════════════════════════════════════════════════════════════
  // BALL MESH
  // ══════════════════════════════════════════════════════════════════════
  const ballGroup = new THREE.Group();
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 32, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x2244aa, metalness: 0.15, roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.1,
    })
  );
  ballMesh.castShadow = true;
  ballGroup.add(ballMesh);

  const holeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [dx, dz, r] of [[0, 0.04, 0.012], [-0.015, 0.065, 0.010], [0.015, 0.065, 0.010]] as const) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 8), holeMat);
    hole.position.set(dx, BALL_R - 0.01, dz);
    hole.rotation.x = -0.2;
    ballGroup.add(hole);
  }
  ballGroup.visible = false;
  scene.add(ballGroup);

  let trailLine: THREE.Line | null = null;
  const trailPts: THREE.Vector3[] = [];

  // ══════════════════════════════════════════════════════════════════════
  // GAME STATE
  // ══════════════════════════════════════════════════════════════════════
  type Frame = {
    ball: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; vx: number; vz: number };
    pins: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }[];
  };
  let simFrames: Frame[] = [];
  let playing = false;

  // Item 1: Time-based playback state
  let fractionalPlayIdx = 0;
  let lastTimestamp = 0;
  const FRAME_DURATION = 1000 / 30; // ms per sim frame (recorded every 2 physics steps at 1/60s each = 33.33ms)

  // Playback speed (user-controlled via slider)
  let timeScale = 1.0;

  // Pre-allocated interpolation objects (avoid GC in render loop)
  const _interpPos = new THREE.Vector3();
  const _nextPos = new THREE.Vector3();
  const _interpQuat = new THREE.Quaternion();
  const _nextQuat = new THREE.Quaternion();

  // ══════════════════════════════════════════════════════════════════════
  // Item 6: Score HUD elements
  // ══════════════════════════════════════════════════════════════════════
  const scoreHud = document.getElementById('scoreHud') as HTMLElement;
  const scoreCount = document.getElementById('scoreCount') as HTMLElement;
  const scoreResult = document.getElementById('scoreResult') as HTMLElement;
  const pinDots = document.querySelectorAll<HTMLElement>('.pin-dot');

  function updateScoreHud(fallen: number, fallenPins: boolean[], isFinished: boolean) {
    scoreCount.textContent = `${fallen} / 10`;

    pinDots.forEach((dot) => {
      const idx = parseInt(dot.dataset.pin ?? '0');
      dot.classList.toggle('fallen', fallenPins[idx] ?? false);
    });

    if (isFinished) {
      if (fallen === 10) {
        scoreResult.textContent = 'STRIKE!';
      } else if (fallen >= 9) {
        scoreResult.textContent = `${fallen} pins — almost!`;
      } else {
        scoreResult.textContent = `${fallen} pins`;
      }
      scoreResult.classList.add('show', 'pulse');
    }
  }

  function resetScoreHud() {
    scoreHud.style.display = 'none';
    scoreResult.classList.remove('show', 'pulse');
    scoreResult.textContent = '';
    pinDots.forEach(d => d.classList.remove('fallen'));
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHYSICS SIMULATION (Item 3: convex hull pin colliders)
  // ══════════════════════════════════════════════════════════════════════
  function createAndRunSim(speedMph: number, revRpm: number, angleDeg: number, boardNum: number,
    ballRg: number, ballDiff: number, coverstockType: string): Frame[] {

    const world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    (world as any).maxVelocityIterations = 8;

    const oilEndM = 38 * 0.3048;
    const pinAreaEnd = LANE_L + SP * 2.6 + 1.5; // pin triangle + pit space
    const pinAreaWidth = LANE_W / 2 + GUTTER_W + 0.3; // lane + gutter + side floor

    // ── Main lane floor (thick to prevent tunneling) ──
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(LANE_W / 2 + 0.3, 0.5, LANE_L / 2 + 1)
        .setTranslation(0, -0.5, LANE_L / 2 - 1)
        .setFriction(0.04)
        .setRestitution(0.0),
      groundBody
    );

    // ── Pin deck + pit floor — wide, thick, high friction ──
    // Extends from lane end all the way to pit back wall, wider than lane to catch side scatter
    const deckBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const deckStart = LANE_L - 0.5;
    const deckEnd = pinAreaEnd;
    const deckMidZ = (deckStart + deckEnd) / 2;
    const deckHalfZ = (deckEnd - deckStart) / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(pinAreaWidth, 0.5, deckHalfZ)
        .setTranslation(0, -0.5, deckMidZ)
        .setFriction(0.45)      // dry maple deck
        .setRestitution(0.05),
      deckBody
    );

    // ── Side floors (catch pins that scatter sideways past gutters) ──
    for (const s of [-1, 1]) {
      const sideFloorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.3, 0.5, deckHalfZ)
          .setTranslation(s * (pinAreaWidth + 0.3), -0.5, deckMidZ)
          .setFriction(0.5)
          .setRestitution(0.0),
        sideFloorBody
      );
    }

    // ── Kickback walls (vertical plates flanking pin deck — pins bounce off these) ──
    for (const s of [-1, 1]) {
      const kickBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.03, 0.4, deckHalfZ)
          .setTranslation(s * pinAreaWidth, 0.4, deckMidZ)
          .setFriction(0.3)
          .setRestitution(0.35), // pins bounce off kickbacks
        kickBody
      );
    }

    // ── Pit back wall (stops pins from flying out the back) ──
    const backWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(pinAreaWidth + 0.3, 0.5, 0.05)
        .setTranslation(0, 0.3, pinAreaEnd)
        .setFriction(0.5)
        .setRestitution(0.2),
      backWallBody
    );

    // Item 5: Gutter physics — 3 angled cuboids per side approximating semicircle
    for (const s of [-1, 1]) {
      const gw = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const cx = s * (LANE_W / 2 + GUTTER_W / 2);

      // Bottom flat
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(GUTTER_W * 0.3, 0.01, LANE_L / 2)
          .setTranslation(cx, -GUTTER_D, LANE_L / 2)
          .setFriction(0.3),
        gw
      );
      // Inner slope (~30°)
      const slopeBody1 = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const innerX = s * (LANE_W / 2 + GUTTER_W * 0.15);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(GUTTER_W * 0.2, 0.01, LANE_L / 2)
          .setTranslation(innerX, -GUTTER_D * 0.4, LANE_L / 2)
          .setRotation({ x: 0, y: 0, z: s * 0.5, w: Math.cos(0.25) })
          .setFriction(0.3),
        slopeBody1
      );
      // Outer slope (~30°)
      const slopeBody2 = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const outerX = s * (LANE_W / 2 + GUTTER_W * 0.85);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(GUTTER_W * 0.2, 0.01, LANE_L / 2)
          .setTranslation(outerX, -GUTTER_D * 0.4, LANE_L / 2)
          .setRotation({ x: 0, y: 0, z: -s * 0.5, w: Math.cos(0.25) })
          .setFriction(0.3),
        slopeBody2
      );

      // Gutter inner wall (lane edge)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.005, 0.05, LANE_L / 2)
          .setTranslation(s * (LANE_W / 2 + 0.005), 0.01, LANE_L / 2),
        gw
      );
    }

    // 4-part compound pin colliders: base, belly, taper, neck
    //
    // USBC pin specs (validated against bowl.com equipment manual):
    //   Height: 15" (0.381m), Weight: 3lb 6oz–3lb 10oz (1.53–1.64 kg)
    //   Widest diameter: 4.766" at 4.5" above base (radius 0.0605m)
    //   Base diameter: ~2.03" (radius 0.026m) — THIS is the deck contact patch
    //   Neck narrowest: 1.797" at ~10" above base (radius 0.023m)
    //   Center of gravity: 5 5/16" (0.135m) from base
    //   Tipping angle: 7.5°–11° (research consensus)
    //
    // Key insight: the TIPPING ANGLE depends on the base contact radius (0.026m),
    // NOT the belly radius. arctan(0.026 / 0.135) ≈ 10.9° — matches research.
    //
    // Segment layout (absolute Y from ground):
    //   Base:   y=0.00–0.03  r=0.026  12% mass (narrow contact patch)
    //   Belly:  y=0.03–0.16  r=0.058  55% mass (widest, heaviest)
    //   Taper:  y=0.16–0.26  r=0.036  21% mass
    //   Neck:   y=0.26–0.38  r=0.023  12% mass
    // Resulting COM ≈ 0.137m from ground (35.9%), tipping angle ≈ 10.8°
    const PIN_BASE_R  = 0.026;   // actual deck contact patch radius (2.03" diameter)
    const PIN_BELLY_R = 0.058;   // just under widest (4.766" dia)
    const PIN_TAPER_R = 0.036;
    const PIN_NECK_COLL_R = 0.023; // matches USBC 1.797" neck diameter
    const PIN_BASE_HH  = 0.015; // half-height
    const PIN_BELLY_HH = 0.065; // half-height
    const PIN_TAPER_HH = 0.05;
    const PIN_NECK_HH  = 0.06;
    const PIN_BODY_Y = PIN_H / 2; // rigid body origin

    // COR: USBC ball-pin COR is 0.650–0.750. Pin-pin ~0.50–0.60.
    const PIN_COR = 0.55; // pin surface COR (combined with ball's 0.70 → avg 0.625)

    const pinBodies: RAPIER.RigidBody[] = [];
    for (const [px, pz] of PIN_POS) {
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(px, PIN_BODY_Y, LANE_L + pz)
        .setCcdEnabled(true)
        .setAngularDamping(0.5)
        .setLinearDamping(0.3);
      const body = world.createRigidBody(desc);

      // Base (y=0 to 0.03, center at 0.015) — narrow contact patch, determines tipping
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(PIN_BASE_HH, PIN_BASE_R)
          .setTranslation(0, 0.015 - PIN_BODY_Y, 0)
          .setDensity((PIN_MASS * 0.12) / (Math.PI * PIN_BASE_R ** 2 * PIN_BASE_HH * 2))
          .setRestitution(PIN_COR)
          .setFriction(0.45),
        body
      );
      // Belly (y=0.03 to 0.16, center at 0.095) — heaviest segment
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(PIN_BELLY_HH, PIN_BELLY_R)
          .setTranslation(0, 0.095 - PIN_BODY_Y, 0)
          .setDensity((PIN_MASS * 0.55) / (Math.PI * PIN_BELLY_R ** 2 * PIN_BELLY_HH * 2))
          .setRestitution(PIN_COR)
          .setFriction(0.40),
        body
      );
      // Taper (y=0.16 to 0.26, center at 0.21)
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(PIN_TAPER_HH, PIN_TAPER_R)
          .setTranslation(0, 0.21 - PIN_BODY_Y, 0)
          .setDensity((PIN_MASS * 0.21) / (Math.PI * PIN_TAPER_R ** 2 * PIN_TAPER_HH * 2))
          .setRestitution(PIN_COR)
          .setFriction(0.35),
        body
      );
      // Neck + head (y=0.26 to 0.38, center at 0.32)
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(PIN_NECK_HH, PIN_NECK_COLL_R)
          .setTranslation(0, 0.32 - PIN_BODY_Y, 0)
          .setDensity((PIN_MASS * 0.12) / (Math.PI * PIN_NECK_COLL_R ** 2 * PIN_NECK_HH * 2))
          .setRestitution(PIN_COR)
          .setFriction(0.30),
        body
      );

      pinBodies.push(body);
    }

    // Ball
    const v0 = speedMph * 0.44704;
    const omega = (revRpm * 2 * Math.PI) / 60;
    const rad = (angleDeg * Math.PI) / 180;
    const startX = (boardNum / BOARDS) * LANE_W - LANE_W / 2;

    const coverstockMultiplier: Record<string, number> = {
      'solid': 1.0, 'hybrid': 0.88, 'pearl': 0.75, 'urethane': 0.50, 'plastic': 0.08,
    };
    const coverMult = coverstockMultiplier[coverstockType] ?? 0.8;
    const hookFactor = ballDiff * coverMult;
    const rgOffset = (ballRg - 2.50) * 3.0;

    const effectiveRad = rad * 0.35;
    const ballDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startX, BALL_R + 0.002, 0.1)
      .setLinvel(-Math.sin(effectiveRad) * v0, 0, Math.cos(effectiveRad) * v0)
      .setAngvel({ x: v0 / BALL_R, y: omega * 0.5, z: 0 }) // x: forward roll, y: hook spin
      .setCcdEnabled(true)
      .setLinearDamping(0.01)
      .setAngularDamping(0.01)
      .setGravityScale(1.0);    // real gravity — no artificial hack
    const ballBody = world.createRigidBody(ballDesc);
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R)
        .setDensity(BALL_MASS / ((4 / 3) * Math.PI * BALL_R ** 3))
        .setRestitution(0.70)   // USBC ball COR: 0.650–0.750 (critical for pin energy transfer)
        .setFriction(0.03),
      ballBody
    );

    // Simulate
    const oilEnd = oilEndM + rgOffset;
    const frames: Frame[] = [];
    let ballPastPins = false;
    let settleSteps = 0;
    const PIN_SETTLE_STEPS = 600;

    for (let s = 0; s < 2000; s++) {
      world.step();

      const postBp = ballBody.translation();
      const vel = ballBody.linvel();

      if (postBp.z > oilEnd && postBp.z < LANE_L && postBp.y > -0.1) {
        const dryProgress = Math.min(1, (postBp.z - oilEnd) / (LANE_L - oilEnd));
        const hookCurve = Math.sin(dryProgress * Math.PI * 0.7);
        const maxHookVx = Math.min(0.30, omega * hookFactor * 0.25);
        const hookVx = -maxHookVx * hookCurve;
        const baseVx = -Math.sin(effectiveRad) * Math.abs(vel.z) / (Math.cos(effectiveRad) || 1);
        ballBody.setLinvel({ x: baseVx + hookVx, y: Math.min(vel.y, 0), z: vel.z }, true);
      }

      // Anti-bounce on lane: ball should roll on surface, not bounce.
      // Ball COR is 0.70 (needed for pin impact) so we suppress lane bounce here.
      // Proportional correction: stronger than before since gravityScale is now 1.0.
      if (postBp.z < LANE_L) {
        const excess = postBp.y - (BALL_R + 0.005); // 5mm tolerance
        if (excess > 0) {
          // Proportional + clamp: pulls ball down smoothly
          ballBody.setLinvel({ x: vel.x, y: Math.min(vel.y, -excess * 20), z: vel.z }, true);
        }
      }

      if (!ballPastPins && postBp.z > LANE_L) {
        ballPastPins = true;
      }

      // Pit curtain: once ball clears the pin triangle, apply heavy damping so it
      // decelerates into the pit instead of bouncing back through the pins.
      // Pin triangle extends to SP*2.598 = 0.792m past LANE_L; add 0.1m margin.
      if (postBp.z > LANE_L + SP * 2.6 + 0.1) {
        ballBody.setLinearDamping(8.0);   // heavy drag — like hitting a padded curtain
        ballBody.setAngularDamping(3.0);
        // Kill any backward velocity — ball never returns through the pins
        if (vel.z < 0) {
          ballBody.setLinvel({ x: vel.x * 0.5, y: vel.y, z: 0 }, true);
        }
      }

      if (ballPastPins) settleSteps++;

      if (s % 2 === 0) {
        const bq = ballBody.rotation();
        const pins = pinBodies.map(pb => {
          const pp = pb.translation();
          const pq = pb.rotation();
          return { x: pp.x, y: pp.y, z: pp.z, qx: pq.x, qy: pq.y, qz: pq.z, qw: pq.w };
        });
        frames.push({
          ball: { x: postBp.x, y: postBp.y, z: postBp.z, qx: bq.x, qy: bq.y, qz: bq.z, qw: bq.w, vx: vel.x, vz: vel.z },
          pins,
        });
      }

      if (ballPastPins && settleSteps > 120 && settleSteps % 30 === 0) {
        let allSettled = true;
        for (const pb of pinBodies) {
          const pv = pb.linvel();
          const speed = Math.sqrt(pv.x * pv.x + pv.y * pv.y + pv.z * pv.z);
          if (speed > 0.05) { allSettled = false; break; }
        }
        if (allSettled) break;
      }
      if (ballPastPins && settleSteps > PIN_SETTLE_STEPS) break;
    }

    world.free();
    return frames;
  }

  // ══════════════════════════════════════════════════════════════════════
  // UI & CONTROLS
  // ══════════════════════════════════════════════════════════════════════
  function setCamera(mode: string) {
    switch (mode) {
      case 'overhead':
        camera.position.set(0, 14, -3);
        camera.lookAt(0, 0, LANE_L / 2);
        break;
      case 'bowler':
        camera.position.set(0, 1.4, -APPROACH_L + 0.5);
        camera.lookAt(0, 0.15, LANE_L);
        break;
      case 'side':
        camera.position.set(3.5, 2.5, LANE_L / 2);
        camera.lookAt(0, 0, LANE_L / 2);
        break;
      case 'chase':
        camera.position.set(0, 2, -1);
        camera.lookAt(0, 0, 5);
        break;
      case 'tv':
        camera.position.set(1.5, 1.0, LANE_L - 3);
        camera.lookAt(0, 0.2, LANE_L + 0.3);
        break;
    }
  }

  // Find the last frame BEFORE ball reaches pins (forward approach only, not bounce-back)
  function getPrePinFrame(): Frame {
    for (let i = 0; i < simFrames.length; i++) {
      if (simFrames[i].ball.z >= LANE_L - 0.2) return simFrames[Math.max(0, i - 1)];
    }
    return simFrames[0];
  }

  function countFallen(frame: Frame): { count: number; fallen: boolean[] } {
    const fallen: boolean[] = [];
    let count = 0;
    frame.pins.forEach((p, i) => {
      const origY = PIN_H / 2;
      const isFallen = Math.abs(p.x - PIN_POS[i][0]) > 0.05 ||
        Math.abs(p.z - (LANE_L + PIN_POS[i][1])) > 0.05 ||
        p.y < origY - 0.04;
      fallen.push(isFallen);
      if (isFallen) count++;
    });
    return { count, fallen };
  }

  function resetVisuals() {
    playing = false;
    fractionalPlayIdx = 0;
    lastTimestamp = 0;
    simFrames = [];
    ballGroup.visible = false;
    trailPts.length = 0;
    if (trailLine) { scene.remove(trailLine); trailLine = null; }
    pinMeshes.forEach((m, i) => {
      m.position.set(PIN_POS[i][0], PIN_H / 2, LANE_L + PIN_POS[i][1]);
      m.quaternion.identity();
    });

    // Reset playback speed
    timeScale = 1.0;

    // Reset HUD
    resetScoreHud();

    // Stop sounds
    stopRollingSound();
  }

  function launch() {
    if (playing) return;
    resetVisuals();

    // Resume audio context on user gesture
    ensureAudioCtx();

    const spd = parseFloat((document.getElementById('speed') as HTMLInputElement).value);
    const rev = parseInt((document.getElementById('revRate') as HTMLInputElement).value);
    const ang = parseFloat((document.getElementById('angle') as HTMLInputElement).value);
    const brd = parseInt((document.getElementById('board') as HTMLInputElement).value);
    const rg = parseFloat((document.getElementById('rg') as HTMLInputElement)?.value ?? '2.50');
    const diff = parseFloat((document.getElementById('diff') as HTMLInputElement)?.value ?? '0.040');
    const cover = (document.getElementById('cover') as HTMLSelectElement)?.value ?? 'solid';

    ballGroup.visible = true;
    const t0 = performance.now();
    simFrames = createAndRunSim(spd, rev, ang, brd, rg, diff, cover);
    const ms = (performance.now() - t0).toFixed(0);
    info.textContent = `Physics: ${ms}ms, ${simFrames.length} frames. Playing...`;
    setCamera((document.getElementById('cam') as HTMLSelectElement).value);
    playing = true;
    fractionalPlayIdx = 0;
    lastTimestamp = 0;

    // Show HUD
    scoreHud.style.display = 'block';

    // Start rolling sound
    startRollingSound();

    // Debug export
    (window as any).__simFrames = simFrames;
    (window as any).__jumpToEnd = () => {
      fractionalPlayIdx = simFrames.length - 1;
      const playIdx = simFrames.length - 1;
      const f = simFrames[playIdx];
      ballGroup.position.set(f.ball.x, f.ball.y, f.ball.z);
      ballGroup.quaternion.set(f.ball.qx, f.ball.qy, f.ball.qz, f.ball.qw);
      f.pins.forEach((p: any, i: number) => {
        pinMeshes[i].position.set(p.x, p.y, p.z);
        pinMeshes[i].quaternion.set(p.qx, p.qy, p.qz, p.qw);
      });
      playing = false;
      stopRollingSound();
      const { count: fallen, fallen: fallenArr } = countFallen(f);
      updateScoreHud(fallen, fallenArr, true);
      if (fallen === 10) playStrikeSound();
      const prePinFrame = getPrePinFrame();
      const ea = Math.abs(Math.atan2(prePinFrame.ball.vx, prePinFrame.ball.vz) * 180 / Math.PI);
      info.textContent = `FINAL: ${fallen === 10 ? 'STRIKE!' : `${fallen}/10 pins`} | Entry: ${ea.toFixed(1)}°`;
    };
  }

  // Controls
  for (const [id, valId] of [['speed', 'speedVal'], ['revRate', 'revVal'], ['angle', 'angleVal'], ['board', 'boardVal'], ['rg', 'rgVal'], ['diff', 'diffVal'], ['playSpeed', 'playSpeedVal']] as const) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => {
      const valEl = document.getElementById(valId);
      if (valEl) valEl.textContent = (e.target as HTMLInputElement).value;
    });
  }
  document.getElementById('launch')!.addEventListener('click', launch);
  document.getElementById('reset')!.addEventListener('click', () => { resetVisuals(); info.textContent = 'Ready.'; });
  document.getElementById('cam')!.addEventListener('change', (e) => setCamera((e.target as HTMLSelectElement).value));

  // Mute button
  const muteBtn = document.getElementById('mute')!;
  muteBtn.addEventListener('click', () => {
    audioMuted = !audioMuted;
    muteBtn.textContent = audioMuted ? '\u{1F507}' : '\u{1F50A}';
    if (audioMuted) stopRollingSound();
  });

  // ══════════════════════════════════════════════════════════════════════
  // RENDER LOOP (Item 1: time-based, Item 2: slow-motion)
  // ══════════════════════════════════════════════════════════════════════
  let impactCameraTriggered = false;
  let prevPinFallenCount = 0;
  let strikeTriggered = false;

  function animate(timestamp: number) {
    requestAnimationFrame(animate);

    if (playing && simFrames.length > 0) {
      // Item 1: Delta-time accumulator
      if (lastTimestamp === 0) lastTimestamp = timestamp;
      const deltaMs = Math.min(timestamp - lastTimestamp, 50); // cap at 50ms to avoid jumps
      lastTimestamp = timestamp;

      // Read playback speed from slider
      timeScale = parseFloat((document.getElementById('playSpeed') as HTMLInputElement)?.value ?? '1');

      // Advance fractional index based on delta time and time scale
      fractionalPlayIdx += (deltaMs / FRAME_DURATION) * timeScale;

      const currentIdx = Math.floor(fractionalPlayIdx);
      const nextIdx = Math.min(currentIdx + 1, simFrames.length - 1);
      const t = fractionalPlayIdx - currentIdx; // interpolation factor [0, 1)

      if (currentIdx >= simFrames.length) {
        // Playback finished
        playing = false;
        impactCameraTriggered = false;
        stopRollingSound();

        const lastFrame = simFrames[simFrames.length - 1];
        const { count: fallen, fallen: fallenArr } = countFallen(lastFrame);
        updateScoreHud(fallen, fallenArr, true);

        if (fallen === 10 && !strikeTriggered) {
          strikeTriggered = true;
          playStrikeSound();
        }

        const prePinFrame = getPrePinFrame();
        const ea = Math.abs(Math.atan2(prePinFrame.ball.vx, prePinFrame.ball.vz) * 180 / Math.PI);
        const result = fallen === 10 ? 'STRIKE!' : fallen >= 9 ? `${fallen} pins — almost!` : `${fallen}/10 pins`;
        info.textContent = `${result} | Entry: ${ea.toFixed(1)}° | ${simFrames.length} frames`;
      } else {
        const f = simFrames[currentIdx];
        const fNext = simFrames[nextIdx];

        // Interpolated ball position/rotation (no allocations)
        _interpPos.set(f.ball.x, f.ball.y, f.ball.z);
        if (currentIdx !== nextIdx) {
          _nextPos.set(fNext.ball.x, fNext.ball.y, fNext.ball.z);
          _interpPos.lerp(_nextPos, t);
        }
        ballGroup.position.copy(_interpPos);

        _interpQuat.set(f.ball.qx, f.ball.qy, f.ball.qz, f.ball.qw);
        if (currentIdx !== nextIdx) {
          _nextQuat.set(fNext.ball.qx, fNext.ball.qy, fNext.ball.qz, fNext.ball.qw);
          _interpQuat.slerp(_nextQuat, t);
        }
        ballGroup.quaternion.copy(_interpQuat);

        // Trail
        if (f.ball.z < LANE_L + 0.5 && f.ball.y > 0 && currentIdx % 6 === 0) {
          trailPts.push(new THREE.Vector3(f.ball.x, BALL_R * 0.3, f.ball.z));
          if (!trailLine) {
            trailLine = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(trailPts),
              new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.4 })
            );
            scene.add(trailLine);
          } else {
            (trailLine.geometry as THREE.BufferGeometry).setFromPoints(trailPts);
          }
        }

        // Interpolated pin positions (mesh pivot centered at PIN_H/2, matching physics body)
        f.pins.forEach((p, i) => {
          if (currentIdx !== nextIdx) {
            const pNext = fNext.pins[i];
            pinMeshes[i].position.set(
              p.x + (pNext.x - p.x) * t,
              p.y + (pNext.y - p.y) * t,
              p.z + (pNext.z - p.z) * t
            );
            _interpQuat.set(p.qx, p.qy, p.qz, p.qw);
            _nextQuat.set(pNext.qx, pNext.qy, pNext.qz, pNext.qw);
            _interpQuat.slerp(_nextQuat, t);
            pinMeshes[i].quaternion.copy(_interpQuat);
          } else {
            pinMeshes[i].position.set(p.x, p.y, p.z);
            pinMeshes[i].quaternion.set(p.qx, p.qy, p.qz, p.qw);
          }
        });

        // Auto camera cut
        const camMode = (document.getElementById('cam') as HTMLSelectElement).value;
        if (camMode === 'chase') {
          if (f.ball.z < LANE_L - 1) {
            camera.position.set(f.ball.x + 0.4, 1.2, f.ball.z - 1.5);
            camera.lookAt(f.ball.x, 0.1, f.ball.z + 4);
                  } else if (!impactCameraTriggered) {
            impactCameraTriggered = true;
            camera.position.set(1.2, 0.8, LANE_L - 2);
            camera.lookAt(0, 0.15, LANE_L + 0.4);
                  }
        }

        // Item 6: Update HUD
        const { count: fallen, fallen: fallenArr } = countFallen(f);
        updateScoreHud(fallen, fallenArr, false);

        // Item 7: Detect pin state changes for sound
        if (fallen > prevPinFallenCount) {
          const newlyFallen = fallen - prevPinFallenCount;
          playPinHitSound(Math.min(3, newlyFallen));
        }
        prevPinFallenCount = fallen;

        // Update rolling sound
        const ballSpeed = Math.sqrt(f.ball.vx * f.ball.vx + f.ball.vz * f.ball.vz);
        if (f.ball.z < LANE_L + 1) {
          updateRollingSound(ballSpeed);
        } else {
          stopRollingSound();
        }

        info.textContent = `Frame ${currentIdx}/${simFrames.length} | Pins: ${fallen}/10${timeScale < 0.9 ? ` | ${timeScale.toFixed(1)}x` : ''}`;
      }
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
  setCamera('bowler');

  window.addEventListener('resize', () => {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  });
}

main();
