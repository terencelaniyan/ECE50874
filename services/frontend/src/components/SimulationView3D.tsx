/**
 * 3D Lane Simulation View — Three.js + Rapier3D physics worker.
 *
 * Renders a USBC-spec bowling lane with LatheGeometry pins, maple/pine
 * wood textures, proper gutters, kickback walls, pit area, and warm
 * bowling-alley lighting. Animated ball trajectory from physics worker.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { useBag } from "../context/BagContext";
import { analyzeSimulation } from "../utils/decision-framework";
import { getRecommendationsV2 } from "../api/recommendations-v2";
import type { SimulationAdvice } from "../utils/decision-framework";
import type { Ball, RecommendV2Item } from "../types/ball";
import type {
  PhysicsWorkerMessage,
  PhysicsParams,
  TrajectoryFrame,
  SimulationSummary,
  FrictionZone,
} from "../types/simulation";
import {
  LANE_LENGTH_M,
  LANE_WIDTH_M,
  BALL_RADIUS_M,
  BALL_MASS_KG,
  PIN_HEIGHT_M,
  PIN_SPACING_M,
  PIN_R_BOT,
  PIN_R_MID,
  PIN_R_NECK,
  GUTTER_WIDTH_M,
  GUTTER_DEPTH_M,
  APPROACH_LENGTH_M,
  BOARDS,
} from "../types/simulation";

type CameraMode = "overhead" | "chase" | "pin" | "tv";

const SP = PIN_SPACING_M;
const PIN_H = PIN_HEIGHT_M;
const ARROW_Z = 4.572;   // arrows at 15 ft from foul line
const DOT_Z1 = 3.658;    // dots at 12 ft
const DOT_Z2 = 2.134;    // dots at 7 ft

// Pin profile points for LatheGeometry (USBC validated)
const PIN_PROFILE_PTS: [number, number][] = [
  [0, 0],
  [PIN_R_BOT, 0],
  [PIN_R_BOT, 0.02],
  [PIN_R_MID, 0.08],
  [PIN_R_MID, 0.114],
  [PIN_R_MID * 0.85, 0.19],
  [PIN_R_NECK * 1.3, 0.25],
  [PIN_R_NECK, 0.254],
  [PIN_R_NECK * 0.95, 0.32],
  [PIN_R_NECK * 0.75, 0.37],
  [0, PIN_H],
];

const PIN_POSITIONS = [
  [0, 0],
  [-SP/2, SP * 0.866], [SP/2, SP * 0.866],
  [-SP, SP * 1.732], [0, SP * 1.732], [SP, SP * 1.732],
  [-SP * 1.5, SP * 2.598], [-SP/2, SP * 2.598], [SP/2, SP * 2.598], [SP * 1.5, SP * 2.598],
];

const OIL_PATTERNS: { name: string; lengthFt: number; zones: FrictionZone[] }[] = [
  {
    name: "House Shot (38ft)",
    lengthFt: 38,
    zones: [
      { startFt: 0, endFt: 38, mu: 0.04 },
      { startFt: 38, endFt: 60, mu: 0.20 },
    ],
  },
  {
    name: "Sport Shot — Badger (52ft)",
    lengthFt: 52,
    zones: [
      { startFt: 0, endFt: 52, mu: 0.04 },
      { startFt: 52, endFt: 60, mu: 0.22 },
    ],
  },
  {
    name: "Sport Shot — Cheetah (33ft)",
    lengthFt: 33,
    zones: [
      { startFt: 0, endFt: 33, mu: 0.04 },
      { startFt: 33, endFt: 60, mu: 0.18 },
    ],
  },
  {
    name: "Sport Shot — Chameleon (41ft)",
    lengthFt: 41,
    zones: [
      { startFt: 0, endFt: 41, mu: 0.04 },
      { startFt: 41, endFt: 60, mu: 0.20 },
    ],
  },
];

interface Props {
  initialParams?: {
    speed: number;
    revRate: number;
    launchAngle: number;
  };
}

// ── Helper: create pin mesh group with geometry centered at PIN_H/2 ──
function makePinMesh(): THREE.Group {
  const pts = PIN_PROFILE_PTS.map(([r, y]) => new THREE.Vector2(r, y));
  const grp = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xf8f8f2, roughness: 0.18, metalness: 0.02,
      clearcoat: 0.4, clearcoatRoughness: 0.2,
    }),
  );
  // Shift geometry down so pivot is at PIN_H/2 (center of pin, matching physics body)
  body.position.y = -PIN_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  grp.add(body);

  // Red stripes
  for (const y of [0.10, 0.13]) {
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(PIN_R_MID + 0.001, PIN_R_MID + 0.001, 0.012, 16),
      new THREE.MeshStandardMaterial({ color: 0xcc2222 }),
    );
    stripe.position.y = y - PIN_H / 2;
    grp.add(stripe);
  }
  return grp;
}

// ── Helper: procedural pine texture (warm yellow, open grain) ──
function createPineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#9B7020";
  ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 39; i++) {
    const x = (i / 39) * 256;
    const shade = Math.random() * 15;
    ctx.fillStyle = `rgba(${140 + shade}, ${95 + shade}, ${25 + shade}, 0.15)`;
    ctx.fillRect(x, 0, 256 / 39, 1024);
    ctx.strokeStyle = `rgba(80,50,10,${i % 5 === 0 ? 0.15 : 0.05})`;
    ctx.lineWidth = i % 5 === 0 ? 1.5 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 40}, ${40 + Math.random() * 20}, ${5 + Math.random() * 15}, 0.08)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 1024, Math.random() * 12 + 2, 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 8);
  return tex;
}

// ── Helper: procedural maple texture (pale cream, tight grain) ──
function createMapleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#DDD0B8";
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 120; i++) {
    const x = (i / 120) * 256 + (Math.random() - 0.5) * 1.5;
    ctx.strokeStyle = `rgba(160,140,110,${0.08 + Math.random() * 0.06})`;
    ctx.lineWidth = 0.3 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y < 512; y += 32) {
      ctx.lineTo(x + (Math.random() - 0.5) * 0.8, y + 32);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(${180 + Math.random() * 30}, ${160 + Math.random() * 30}, ${130 + Math.random() * 20}, 0.05)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 512, Math.random() * 4 + 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

export function SimulationView3D({ initialParams }: Props) {
  const { bag, addToBag } = useBag();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const ballMeshRef = useRef<THREE.Group | null>(null);
  const pinMeshesRef = useRef<THREE.Group[]>([]);
  const trailRef = useRef<THREE.Line | null>(null);
  const animFrameRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);

  const [speed, setSpeed] = useState(initialParams?.speed ?? 17);
  const [revRate, setRevRate] = useState(initialParams?.revRate ?? 280);
  const [launchAngle, setLaunchAngle] = useState(initialParams?.launchAngle ?? 3);
  const [board, setBoard] = useState(15);
  const [oilPatternIdx, setOilPatternIdx] = useState(0);
  const [selectedBallName, setSelectedBallName] = useState("");
  const [cameraMode, setCameraMode] = useState<CameraMode>("overhead");
  const [simRunning, setSimRunning] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("READY");
  const [workerReady, setWorkerReady] = useState(false);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [advice, setAdvice] = useState<SimulationAdvice | null>(null);
  const [recBalls, setRecBalls] = useState<RecommendV2Item[]>([]);

  useEffect(() => {
    if (initialParams) {
      setSpeed(Math.round(initialParams.speed * 2) / 2);
      setRevRate(Math.round(initialParams.revRate / 10) * 10);
      setLaunchAngle(Math.round(initialParams.launchAngle * 2) / 2);
    }
  }, [initialParams]);

  const ballOptions = bag.length > 0 ? bag.map((e) => e.ball.name ?? "Custom") : ["No balls in bag"];
  const currentBall = selectedBallName || (ballOptions[0] !== "No balls in bag" ? ballOptions[0] : "");

  // ── Initialize Three.js scene ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1018);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 80);
    camera.position.set(0, 4, -2);
    camera.lookAt(0, 0, LANE_LENGTH_M * 0.6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    // ── Lighting (warm bowling alley atmosphere) ──
    scene.add(new THREE.AmbientLight(0x554040, 0.6));
    scene.add(new THREE.HemisphereLight(0x665555, 0x332222, 0.3));

    // Overhead fill light (ensures lane is visible from top camera)
    const overheadFill = new THREE.DirectionalLight(0xffe8d0, 0.4);
    overheadFill.position.set(0, 15, LANE_LENGTH_M / 2);
    overheadFill.target.position.set(0, 0, LANE_LENGTH_M / 2);
    scene.add(overheadFill);
    scene.add(overheadFill.target);

    // Overhead lane spots — warm white at regular intervals (no shadows for perf)
    for (let z = 2; z < LANE_LENGTH_M; z += 3.5) {
      const spot = new THREE.SpotLight(0xffd9b3, 1.4, 14, Math.PI / 5, 0.6, 1);
      spot.position.set(0, 4.5, z);
      spot.target.position.set(0, 0, z);
      scene.add(spot);
      scene.add(spot.target);
      // Light fixture housing
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.06, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3 }),
      );
      fixture.position.set(0, 4.5, z);
      scene.add(fixture);
    }

    // Blue accent LEDs along gutter edges
    for (const s of [-1, 1]) {
      const accentLight = new THREE.PointLight(0x4444aa, 0.3, 8);
      accentLight.position.set(s * (LANE_WIDTH_M / 2 + 0.1), 0.1, LANE_LENGTH_M / 2);
      scene.add(accentLight);
    }

    // Pin deck spotlight
    const pinLight = new THREE.SpotLight(0xfff5e0, 2.5, 10, Math.PI / 5, 0.3, 1);
    pinLight.position.set(0, 4, LANE_LENGTH_M + 0.3);
    pinLight.target.position.set(0, 0, LANE_LENGTH_M + 0.4);
    pinLight.castShadow = true;
    pinLight.shadow.mapSize.set(512, 512);
    scene.add(pinLight);
    scene.add(pinLight.target);

    // Side fill on pin deck
    const pinFill = new THREE.SpotLight(0xffeedd, 0.8, 8, Math.PI / 4, 0.5, 1);
    pinFill.position.set(1.5, 3, LANE_LENGTH_M + 0.5);
    pinFill.target.position.set(0, 0, LANE_LENGTH_M + 0.4);
    scene.add(pinFill);
    scene.add(pinFill.target);

    // ── Lane materials (maple vs pine) ──
    const pineMat = new THREE.MeshStandardMaterial({
      map: createPineTexture(), roughness: 0.25, metalness: 0.05,
    });
    const mapleMat = new THREE.MeshStandardMaterial({
      map: createMapleTexture(), roughness: 0.5, metalness: 0.02,
    });

    // Lane body (pine)
    const laneMesh = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH_M, 0.04, LANE_LENGTH_M), pineMat);
    laneMesh.position.set(0, -0.02, LANE_LENGTH_M / 2);
    laneMesh.receiveShadow = true;
    scene.add(laneMesh);

    // Approach area (maple)
    const approach = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH_M + 0.5, 0.04, APPROACH_LENGTH_M), mapleMat,
    );
    approach.position.set(0, -0.02, -APPROACH_LENGTH_M / 2);
    approach.receiveShadow = true;
    scene.add(approach);

    // Pin deck (maple — wider to cover side catching areas)
    const deckLen = SP * 2.6 + 0.6;
    const pinAreaVisualWidth = LANE_WIDTH_M / 2 + GUTTER_WIDTH_M + 0.3;
    const deckVisualW = LANE_WIDTH_M + GUTTER_WIDTH_M * 2 + 0.4;
    const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(deckVisualW, 0.04, deckLen), mapleMat);
    deckMesh.position.set(0, -0.02, LANE_LENGTH_M + deckLen / 2);
    deckMesh.receiveShadow = true;
    scene.add(deckMesh);

    // Foul line (glowing red)
    const foulLine = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH_M + 0.02, 0.006, 0.025),
      new THREE.MeshStandardMaterial({ color: 0xdd2222, emissive: 0xaa1111, emissiveIntensity: 0.6 }),
    );
    foulLine.position.set(0, 0.002, 0);
    scene.add(foulLine);

    // Approach dots (3 rows)
    const approachDotMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const approachDotGeo = new THREE.CircleGeometry(0.008, 8);
    const approachDotBoards = [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37];
    for (const z of [-0.08, -1.0, -2.5]) {
      for (const bd of approachDotBoards) {
        const x = (bd / BOARDS) * LANE_WIDTH_M - LANE_WIDTH_M / 2;
        const adot = new THREE.Mesh(approachDotGeo, approachDotMat);
        adot.rotation.x = -Math.PI / 2;
        adot.position.set(x, 0.002, z);
        scene.add(adot);
      }
    }

    // Arrows at 15ft
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    for (const bd of [5, 10, 15, 20, 25, 30, 35]) {
      const x = (bd / BOARDS) * LANE_WIDTH_M - LANE_WIDTH_M / 2;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.015);
      shape.lineTo(-0.008, -0.015);
      shape.lineTo(0.008, -0.015);
      shape.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(x, 0.002, ARROW_Z);
      scene.add(arrow);
    }

    // Guide dots
    const dotMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const dotGeo = new THREE.CircleGeometry(0.006, 8);
    for (const z of [DOT_Z1, DOT_Z2]) {
      for (const bd of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
        const x = (bd / BOARDS) * LANE_WIDTH_M - LANE_WIDTH_M / 2;
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(x, 0.002, z);
        scene.add(dot);
      }
    }

    // Oil pattern overlay (glossy sheen)
    const oilPattern = OIL_PATTERNS[oilPatternIdx];
    const oilLen = (oilPattern.lengthFt / 60) * LANE_LENGTH_M;
    const oilGeo = new THREE.PlaneGeometry(LANE_WIDTH_M - 0.04, oilLen);
    const oilMat = new THREE.MeshStandardMaterial({
      color: 0x8ab0d0, transparent: true, opacity: 0.08,
      roughness: 0.05, metalness: 0.4,
    });
    const oilOverlay = new THREE.Mesh(oilGeo, oilMat);
    oilOverlay.rotation.x = -Math.PI / 2;
    oilOverlay.position.set(0, 0.003, oilLen / 2);
    oilOverlay.name = "oilOverlay";
    scene.add(oilOverlay);

    // Oil pattern end marker
    const oilEndLine = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH_M - 0.04, 0.002, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x6688aa, transparent: true, opacity: 0.15 }),
    );
    oilEndLine.position.set(0, 0.003, oilLen);
    scene.add(oilEndLine);

    // ── Gutters (semi-elliptical cross-section) ──
    const gutterDarkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const gutterFullLen = LANE_LENGTH_M + APPROACH_LENGTH_M;
    for (const s of [-1, 1]) {
      const gutterShape = new THREE.Shape();
      const halfW = GUTTER_WIDTH_M / 2;
      gutterShape.moveTo(-halfW, 0);
      gutterShape.bezierCurveTo(-halfW, -GUTTER_DEPTH_M * 0.8, halfW, -GUTTER_DEPTH_M * 0.8, halfW, 0);
      gutterShape.lineTo(halfW, 0.005);
      gutterShape.lineTo(-halfW, 0.005);
      gutterShape.closePath();
      const gutterGeo = new THREE.ExtrudeGeometry(gutterShape, { depth: gutterFullLen, bevelEnabled: false });
      const gutter = new THREE.Mesh(gutterGeo, gutterDarkMat);
      gutter.rotation.x = -Math.PI / 2;
      gutter.position.set(s * (LANE_WIDTH_M / 2 + halfW), 0, -APPROACH_LENGTH_M);
      scene.add(gutter);

      // Raised lip between lane and gutter
      const lipGeo = new THREE.BoxGeometry(0.012, 0.018, gutterFullLen);
      const lipMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.1 });
      const lip = new THREE.Mesh(lipGeo, lipMat);
      lip.position.set(s * (LANE_WIDTH_M / 2 + 0.006), 0.005, (LANE_LENGTH_M - APPROACH_LENGTH_M) / 2);
      scene.add(lip);
    }

    // ── Sideboards, kickbacks, pit ──
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.7 });
    const paddedMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const kickbackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.2 });
    const pinAreaVisualEnd = LANE_LENGTH_M + SP * 2.6 + 1.5;

    // Sideboards (vertical panels flanking lane behind gutters)
    for (const s of [-1, 1]) {
      const sideGeo = new THREE.BoxGeometry(0.04, 0.3, gutterFullLen);
      const sideboard = new THREE.Mesh(sideGeo, darkWoodMat);
      sideboard.position.set(
        s * (LANE_WIDTH_M / 2 + GUTTER_WIDTH_M + 0.02), 0.13,
        (LANE_LENGTH_M - APPROACH_LENGTH_M) / 2,
      );
      scene.add(sideboard);
    }

    // Kickback plates
    for (const s of [-1, 1]) {
      const kickGeo = new THREE.BoxGeometry(0.06, 0.8, pinAreaVisualEnd - LANE_LENGTH_M + 0.5);
      const kickback = new THREE.Mesh(kickGeo, kickbackMat);
      kickback.position.set(s * pinAreaVisualWidth, 0.35, (LANE_LENGTH_M + pinAreaVisualEnd) / 2);
      scene.add(kickback);
    }

    // Side floors flanking pin deck
    for (const s of [-1, 1]) {
      const sideFloorGeo = new THREE.BoxGeometry(0.6, 0.04, pinAreaVisualEnd - LANE_LENGTH_M + 0.5);
      const sideFloorMesh = new THREE.Mesh(sideFloorGeo, paddedMat);
      sideFloorMesh.position.set(
        s * (pinAreaVisualWidth + 0.3), -0.02,
        (LANE_LENGTH_M + pinAreaVisualEnd) / 2,
      );
      scene.add(sideFloorMesh);
    }

    // Pit back wall
    const pitWallGeo = new THREE.BoxGeometry(pinAreaVisualWidth * 2 + 0.6, 1.0, 0.1);
    const pitWall = new THREE.Mesh(pitWallGeo, paddedMat);
    pitWall.position.set(0, 0.3, pinAreaVisualEnd);
    scene.add(pitWall);

    // Pit floor
    const pitFloorGeo = new THREE.BoxGeometry(
      pinAreaVisualWidth * 2 + 0.6, 0.04, pinAreaVisualEnd - LANE_LENGTH_M + 0.5,
    );
    const pitFloor = new THREE.Mesh(pitFloorGeo, paddedMat);
    pitFloor.position.set(0, -0.02, (LANE_LENGTH_M + pinAreaVisualEnd) / 2);
    scene.add(pitFloor);

    // Ball return tunnel opening
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
      housing.position.set(s * (LANE_WIDTH_M / 2 + 0.2), 0.05, -APPROACH_LENGTH_M + 0.3);
      scene.add(housing);
    }

    // Masking panel above pin deck
    const maskPanelGeo = new THREE.BoxGeometry(LANE_WIDTH_M + GUTTER_WIDTH_M * 2 + 0.8, 2.5, 0.08);
    const maskPanel = new THREE.Mesh(maskPanelGeo, new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    maskPanel.position.set(0, 3.5, LANE_LENGTH_M - 0.2);
    scene.add(maskPanel);

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(LANE_WIDTH_M * 5, LANE_LENGTH_M + APPROACH_LENGTH_M + 5);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x121018, side: THREE.BackSide });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5, (LANE_LENGTH_M - APPROACH_LENGTH_M) / 2);
    scene.add(ceiling);

    // Side walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1520, roughness: 0.8 });
    for (const s of [-1, 1]) {
      const wallGeo = new THREE.BoxGeometry(0.05, 5, LANE_LENGTH_M + APPROACH_LENGTH_M + 5);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(s * (LANE_WIDTH_M * 2), 2.5, (LANE_LENGTH_M - APPROACH_LENGTH_M) / 2);
      scene.add(wall);
    }

    // ── Pin meshes (LatheGeometry with centered pivot) ──
    const pinMeshes: THREE.Group[] = [];
    for (let i = 0; i < 10; i++) {
      const pin = makePinMesh();
      // Physics body is at PIN_H/2; mesh pivot is now also at PIN_H/2
      pin.position.set(PIN_POSITIONS[i][0], PIN_H / 2, LANE_LENGTH_M + PIN_POSITIONS[i][1]);
      scene.add(pin);
      pinMeshes.push(pin);
    }
    pinMeshesRef.current = pinMeshes;

    // ── Ball mesh with finger holes ──
    const ballGroup = new THREE.Group();
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS_M, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x2244aa, metalness: 0.15, roughness: 0.25,
        clearcoat: 1.0, clearcoatRoughness: 0.1,
      }),
    );
    ballMesh.castShadow = true;
    ballGroup.add(ballMesh);

    // Finger holes
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const [dx, dz, r] of [[0, 0.04, 0.012], [-0.015, 0.065, 0.010], [0.015, 0.065, 0.010]] as const) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 8), holeMat);
      hole.position.set(dx, BALL_RADIUS_M - 0.01, dz);
      hole.rotation.x = -0.2;
      ballGroup.add(hole);
    }
    ballGroup.visible = false;
    scene.add(ballGroup);
    ballMeshRef.current = ballGroup;

    // Trajectory trail
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xe8ff3c, transparent: true, opacity: 0.7,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);
    trailRef.current = trail;

    // Render loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, [oilPatternIdx]);

  // ── Initialize physics worker ─────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/physics-worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<PhysicsWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        setWorkerReady(true);
      }
    };

    worker.postMessage({ type: "init" } satisfies PhysicsWorkerMessage);

    return () => worker.terminate();
  }, []);

  // ── Camera mode ───────────────────────────────────────────────────────
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    switch (cameraMode) {
      case "overhead":
        cam.position.set(0, 4, -2);
        cam.lookAt(0, 0, LANE_LENGTH_M * 0.6);
        break;
      case "chase":
        cam.position.set(0, 2, -1);
        cam.lookAt(0, 0, 5);
        break;
      case "pin":
        cam.position.set(0, 1.4, -APPROACH_LENGTH_M + 0.5);
        cam.lookAt(0, 0.15, LANE_LENGTH_M);
        break;
      case "tv":
        cam.position.set(1.5, 1.0, LANE_LENGTH_M - 3);
        cam.lookAt(0, 0.2, LANE_LENGTH_M + 0.3);
        break;
    }
  }, [cameraMode]);

  // ── Run simulation ────────────────────────────────────────────────────
  const runSimulation = useCallback(() => {
    if (simRunning || !workerRef.current) return;
    setSimRunning(true);
    setPhaseLabel("SIMULATING\u2026");
    setSummary(null);
    setAdvice(null);

    const selectedEntry = bag.find((e) => (e.ball.name ?? "Custom") === currentBall);
    const ball = selectedEntry?.ball;
    const rg = ball ? parseFloat(String(ball.rg)) : 2.5;
    const diff = ball ? parseFloat(String(ball.diff)) : 0.04;
    const intDiff = ball ? parseFloat(String(ball.int_diff)) : 0.01;

    const oilPattern = OIL_PATTERNS[oilPatternIdx];

    const params: PhysicsParams = {
      speed,
      revRate,
      launchAngle,
      boardPosition: board,
      ballSpec: {
        rg,
        diff,
        intDiff,
        mass: BALL_MASS_KG,
        radius: BALL_RADIUS_M,
      },
      oilPattern,
    };

    const worker = workerRef.current;
    const handler = (e: MessageEvent<PhysicsWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "result") {
        worker.removeEventListener("message", handler);
        playTrajectory(msg.trajectory, msg.summary, selectedEntry);
      } else if (msg.type === "error") {
        worker.removeEventListener("message", handler);
        setPhaseLabel("ERROR");
        setSimRunning(false);
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "simulate", params } satisfies PhysicsWorkerMessage);
  }, [simRunning, bag, currentBall, speed, revRate, launchAngle, board, oilPatternIdx]);

  // ── Animate trajectory with physics-driven pin scatter ──────────────────
  const playTrajectory = useCallback(
    (trajectory: TrajectoryFrame[], sim: SimulationSummary, selectedEntry: any) => {
      const ball = ballMeshRef.current;
      const trail = trailRef.current;
      const camera = cameraRef.current;
      const pins = pinMeshesRef.current;
      if (!ball || !trail) {
        setSimRunning(false);
        return;
      }

      // Reset pins to standing position — physics body at PIN_H/2
      pins.forEach((pin, i) => {
        pin.position.set(PIN_POSITIONS[i][0], PIN_H / 2, LANE_LENGTH_M + PIN_POSITIONS[i][1]);
        pin.quaternion.set(0, 0, 0, 1);
        pin.visible = true;
      });

      ball.visible = true;
      // Pre-allocate trail buffer (max 500 points)
      const maxTrailPts = 500;
      const trailPositions = new Float32Array(maxTrailPts * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
      trailGeo.setDrawRange(0, 0);
      trail.geometry.dispose();
      trail.geometry = trailGeo;
      let trailCount = 0;
      let idx = 0;
      let cameraMovedForImpact = false;

      const animate = () => {
        try {
        if (idx >= trajectory.length) {
          setPhaseLabel(sim.pinsDown === 10 ? "STRIKE! \u2713" : `${sim.pinsDown} PINS`);
          setSummary(sim);

          const covType = selectedEntry?.type === "catalog"
            ? (selectedEntry.ball as Ball).coverstock_type ?? undefined
            : undefined;
          const simAdvice = analyzeSimulation(
            {
              entryAngle: sim.entryAngle,
              entryClass: sim.outcomeClass,
              breakPt: `Board ${sim.breakpointBoard}`,
              skidFt: sim.skidLengthFt,
              hookFt: sim.hookLengthFt,
              rollFt: sim.rollLengthFt,
              outcome: sim.outcome,
              outcomeClass: sim.outcomeClass,
              hookPotential: 0,
              patternLength: OIL_PATTERNS[oilPatternIdx].lengthFt,
            },
            {
              rg: selectedEntry?.ball?.rg ?? 2.5,
              diff: selectedEntry?.ball?.diff ?? 0.04,
              coverstockType: covType,
              gameCount: selectedEntry?.game_count,
            },
          );
          setAdvice(simAdvice);
          fetchRecommendations(simAdvice);
          setSimRunning(false);
          return;
        }

        const frame = trajectory[idx];

        // Update ball position and rotation from physics
        ball.position.set(frame.x, frame.y, frame.z);
        if (frame.qx !== undefined) {
          ball.quaternion.set(frame.qx, frame.qy, frame.qz, frame.qw);
        }

        // Trail (only while ball is on lane, using pre-allocated buffer)
        if (frame.z < LANE_LENGTH_M + 0.5 && trailCount < maxTrailPts) {
          const i3 = trailCount * 3;
          trailPositions[i3] = frame.x;
          trailPositions[i3 + 1] = BALL_RADIUS_M * 0.3;
          trailPositions[i3 + 2] = frame.z;
          trailCount++;
          trailGeo.setDrawRange(0, trailCount);
          (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

        // Camera: chase mode follows ball
        if (cameraMode === "chase" && camera) {
          camera.position.set(frame.x, 2, frame.z - 2);
          camera.lookAt(frame.x, 0, frame.z + 3);
        }

        // On ball impact: move camera to close-up pin view
        if (frame.z >= LANE_LENGTH_M - 0.5 && !cameraMovedForImpact && cameraMode !== "overhead" && cameraMode !== "tv") {
          cameraMovedForImpact = true;
          if (camera) {
            camera.position.set(0.6, 0.6, LANE_LENGTH_M - 0.8);
            camera.lookAt(0, 0.15, LANE_LENGTH_M + 0.4);
          }
        }

        // Update pin positions from physics data
        // Use position directly — geometry is centered at PIN_H/2 so NO offset needed
        if (frame.pins) {
          frame.pins.forEach((pt, i) => {
            const pin = pins[i];
            if (!pin) return;
            pin.position.set(pt.x, pt.y, pt.z);
            pin.quaternion.set(pt.qx, pt.qy, pt.qz, pt.qw);
          });
        }

        // Playback speed: faster on lane (skip 3), slower through pins (skip 1)
        idx += frame.z >= LANE_LENGTH_M - 0.5 ? 1 : 3;
        requestAnimationFrame(animate);
        } catch (err) {
          console.error(`[animate] CRASH at idx=${idx}:`, err);
          setSimRunning(false);
        }
      };
      animate();
    },
    [cameraMode, oilPatternIdx],
  );

  // ── Fetch ball recommendations after simulation ──
  const fetchRecommendations = useCallback(async (simAdvice: SimulationAdvice) => {
    const needsBallChange = simAdvice.actions.some(a => a.type === "change_ball");
    if (!needsBallChange && bag.length === 0) {
      setRecBalls([]);
      return;
    }

    try {
      const ballIds = bag.map(e => e.ball.ball_id).filter(id => !id.startsWith("custom-"));
      if (ballIds.length === 0) {
        setRecBalls([]);
        return;
      }
      const gameCounts: Record<string, number> = {};
      bag.forEach(e => { gameCounts[e.ball.ball_id] = e.game_count; });

      const res = await getRecommendationsV2({
        arsenal_ball_ids: ballIds,
        game_counts: gameCounts,
        k: 3,
        method: "knn",
        degradation_model: "v2",
      });
      setRecBalls(res.items ?? []);
    } catch {
      setRecBalls([]);
    }
  }, [bag]);

  return (
    <div className="sim3d-layout">
      <div className="sim3d-canvas-wrap">
        <div className="panel-header">
          <div className="panel-title">3D Lane Simulation</div>
          <div className="panel-badge" id="phase-label-3d">
            {phaseLabel}
          </div>
        </div>
        <canvas ref={canvasRef} className="sim3d-canvas" />
        <div className="sim3d-camera-btns">
          {(["overhead", "chase", "pin", "tv"] as CameraMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`cam-btn ${cameraMode === mode ? "active" : ""}`}
              onClick={() => setCameraMode(mode)}
            >
              {mode === "overhead" ? "TOP" : mode === "chase" ? "CHASE" : mode === "pin" ? "BOWLER" : "TV"}
            </button>
          ))}
        </div>
      </div>

      <div className="sim-panel">
        <div className="control-group">
          <label htmlFor="sim3d-ball-select">Select Ball</label>
          <select
            id="sim3d-ball-select"
            className="ball-select"
            value={currentBall}
            onChange={(e) => setSelectedBallName(e.target.value)}
          >
            {ballOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Delivery Parameters</label>
          <div className="slider-row">
            <div className="slider-label">Ball Speed</div>
            <input type="range" min={12} max={22} step={0.5} value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))} />
            <div className="slider-val">{speed} mph</div>
          </div>
          <div className="slider-row">
            <div className="slider-label">Rev Rate</div>
            <input type="range" min={150} max={450} step={10} value={revRate}
              onChange={(e) => setRevRate(Number(e.target.value))} />
            <div className="slider-val">{revRate} rpm</div>
          </div>
          <div className="slider-row">
            <div className="slider-label">Launch Angle</div>
            <input type="range" min={0} max={8} step={0.5} value={launchAngle}
              onChange={(e) => setLaunchAngle(parseFloat(e.target.value))} />
            <div className="slider-val">{launchAngle}&deg;</div>
          </div>
          <div className="slider-row">
            <div className="slider-label">Board #</div>
            <input type="range" min={5} max={25} step={1} value={board}
              onChange={(e) => setBoard(Number(e.target.value))} />
            <div className="slider-val">{board}</div>
          </div>
        </div>

        <div className="control-group">
          <label htmlFor="oil-pattern-3d">Oil Pattern</label>
          <select
            id="oil-pattern-3d"
            className="ball-select"
            value={oilPatternIdx}
            onChange={(e) => setOilPatternIdx(Number(e.target.value))}
          >
            {OIL_PATTERNS.map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="sim-btn"
          onClick={runSimulation}
          disabled={simRunning || !workerReady}
        >
          {workerReady ? "LAUNCH BALL" : "Loading physics\u2026"}
        </button>

        {summary && (
          <div className="result-card">
            <div className="result-card-title">Simulation Results</div>
            <div className="result-row">
              <div className="result-key">Oil Pattern</div>
              <div className="result-val">{OIL_PATTERNS[oilPatternIdx].lengthFt} ft</div>
            </div>
            <div className="result-row">
              <div className="result-key">Entry Angle</div>
              <div className={`result-val ${summary.outcomeClass}`}>{summary.entryAngle}&deg;</div>
            </div>
            <div className="result-row">
              <div className="result-key">Breakpoint</div>
              <div className="result-val">Board {summary.breakpointBoard}</div>
            </div>
            <div className="result-row">
              <div className="result-key">Skid Length</div>
              <div className="result-val">{summary.skidLengthFt} ft</div>
            </div>
            <div className="result-row">
              <div className="result-key">Hook Distance</div>
              <div className="result-val">{summary.hookLengthFt} ft</div>
            </div>
            <div className="result-row">
              <div className="result-key">Roll Distance</div>
              <div className="result-val">{summary.rollLengthFt} ft</div>
            </div>
            <div className="result-row">
              <div className="result-key">Total Time</div>
              <div className="result-val">{summary.totalTimeSec}s</div>
            </div>
            <div className="result-row">
              <div className="result-key">Outcome</div>
              <div className={`result-val ${summary.outcomeClass}`}>{summary.outcome}</div>
            </div>
          </div>
        )}

        {advice && (
          <div className={`advice-card advice-${summary?.outcomeClass ?? "warn"}`}>
            <div className="advice-summary">{advice.summary}</div>
            {advice.reasons.length > 0 && (
              <ul className="advice-reasons">
                {advice.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {advice.actions.length > 0 && (
              <div className="advice-actions">
                <div className="advice-actions-title">RECOMMENDED ACTIONS</div>
                {advice.actions.map((a, i) => (
                  <div key={i} className={`advice-action advice-action-${a.type}`}>
                    <div className="advice-action-label">{a.label}</div>
                    <div className="advice-action-detail">{a.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {recBalls.length > 0 && (
          <div className="result-card sim-rec-card">
            <div className="result-card-title">Suggested Balls from Catalog</div>
            {recBalls.map((item, i) => (
              <div key={item.ball.ball_id} className="sim-rec-item">
                <div className="sim-rec-rank">{i + 1}</div>
                <div className="sim-rec-info">
                  <div className="sim-rec-name">{item.ball.name}</div>
                  <div className="sim-rec-specs">
                    {item.ball.brand} &middot; RG {item.ball.rg} &middot; Diff {item.ball.diff}
                    {item.ball.coverstock_type && ` \u00B7 ${item.ball.coverstock_type}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="rec-add-btn"
                  onClick={() => addToBag(item.ball)}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
