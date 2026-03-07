import { useState, useCallback, useRef, useEffect } from "react";
import { useBag } from "../context/BagContext";

const OIL_OPTIONS = [
  "House Shot (38ft)",
  "Sport Shot — Badger (52ft)",
  "Sport Shot — Cheetah (33ft)",
  "Sport Shot — Chameleon (41ft)",
];

/**
 * SimulationView component provides a physics-based (simplified) lane
 * simulation to predict ball motion.
 *
 * Users can adjust delivery parameters (speed, rev rate, etc.) and oil
 * patterns to see how their balls might perform on the lane.
 *
 * The lane is drawn dynamically with board lines, oil/dry zones, labels,
 * and an animated trajectory + ball after launching.
 */
export function SimulationView() {
  const { bag } = useBag();
  const [speed, setSpeed] = useState(17);
  const [revRate, setRevRate] = useState(280);
  const [launchAngle, setLaunchAngle] = useState(3);
  const [board, setBoard] = useState(15);
  const [oilPattern, setOilPattern] = useState(OIL_OPTIONS[0]);
  const [selectedBallName, setSelectedBallName] = useState<string>("");
  const [phaseLabel, setPhaseLabel] = useState("READY");
  const [simRunning, setSimRunning] = useState(false);
  const [trajectory, setTrajectory] = useState<string | null>(null);
  const [results, setResults] = useState<{
    entryAngle: string;
    entryClass: "good" | "warn" | "bad";
    breakPt: string;
    skidFt: number;
    hookFt: number;
    outcome: string;
    outcomeClass: "good" | "warn" | "bad";
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const ballRef = useRef<SVGCircleElement>(null);
  const animFrameRef = useRef<number>(0);

  const ballOptions =
    bag.length > 0 ? bag.map((e) => e.ball.name) : ["No balls in bag"];
  const currentBall =
    selectedBallName ||
    (ballOptions[0] !== "No balls in bag" ? ballOptions[0] : "");

  // Draw the lane whenever the SVG mounts or trajectory changes
  const drawLane = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const W = svg.clientWidth;
    const H = svg.clientHeight;
    if (W === 0 || H === 0) return;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const laneW = 80;
    const pad = 20;
    const laneX = (W - laneW) / 2;

    // Clear dynamic elements (keep only the defs)
    const existing = svg.querySelectorAll(".lane-dynamic");
    existing.forEach((el) => el.remove());

    const ns = "http://www.w3.org/2000/svg";

    const makeEl = (
      tag: string,
      attrs: Record<string, string>
    ): SVGElement => {
      const el = document.createElementNS(ns, tag);
      el.classList.add("lane-dynamic");
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      return el;
    };

    // Background
    svg.appendChild(
      makeEl("rect", {
        width: String(W),
        height: String(H),
        fill: "var(--surface)",
      })
    );

    // Board lines
    for (let i = 0; i <= 39; i++) {
      const x = laneX + (i / 39) * laneW;
      const isMajor = i % 5 === 0;
      svg.appendChild(
        makeEl("line", {
          x1: String(x),
          x2: String(x),
          y1: String(pad),
          y2: String(H - pad),
          stroke: isMajor
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.02)",
          "stroke-width": isMajor ? "1" : "0.5",
        })
      );
    }

    // Oil zone (62% from foul line)
    const oilEnd = H - pad - (H - 2 * pad) * 0.62;
    svg.appendChild(
      makeEl("rect", {
        x: String(laneX),
        y: String(oilEnd),
        width: String(laneW),
        height: String(H - pad - oilEnd),
        fill: "rgba(56,201,255,0.06)",
      })
    );

    // Dry zone
    svg.appendChild(
      makeEl("rect", {
        x: String(laneX),
        y: String(pad),
        width: String(laneW),
        height: String(oilEnd - pad),
        fill: "rgba(255,255,255,0.02)",
      })
    );

    // Labels
    const addLabel = (
      x: number,
      y: number,
      text: string,
      fill: string,
      extra?: Record<string, string>
    ) => {
      svg.appendChild(
        makeEl("text", {
          x: String(x),
          y: String(y),
          fill,
          "font-size": "9",
          "font-family": "DM Mono, monospace",
          "text-anchor": "end",
          ...extra,
        })
      ).textContent = text;
    };

    addLabel(laneX - 8, H - pad - 4, "FOUL", "#6a6a8a");
    addLabel(laneX - 8, oilEnd + 4, "OIL END", "#38c9ff", {
      "letter-spacing": "1",
    });
    addLabel(laneX - 8, pad + 10, "PINS", "#6a6a8a");

    // Trajectory path
    if (trajectory) {
      // Cancel any in-progress animation
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      const pathEl = document.createElementNS(ns, "path");
      pathEl.classList.add("lane-dynamic");
      pathEl.setAttribute("d", trajectory);
      pathEl.setAttribute("fill", "none");
      pathEl.setAttribute("stroke", "var(--accent)");
      pathEl.setAttribute("stroke-width", "2.5");
      pathEl.setAttribute(
        "filter",
        "drop-shadow(0 0 8px rgba(232,255,60,0.7))"
      );
      svg.appendChild(pathEl);

      // Animate stroke dash
      const totalLength = pathEl.getTotalLength();
      pathEl.style.strokeDasharray = String(totalLength);
      pathEl.style.strokeDashoffset = String(totalLength);
      pathEl.style.transition = "stroke-dashoffset 1.8s ease-out";
      // Force reflow then animate
      void pathEl.getBoundingClientRect();
      pathEl.style.strokeDashoffset = "0";

      // Animated ball circle
      const ballEl = document.createElementNS(ns, "circle");
      ballEl.classList.add("lane-dynamic");
      ballEl.setAttribute("r", "7");
      ballEl.setAttribute("fill", "var(--accent)");
      ballEl.setAttribute(
        "filter",
        "drop-shadow(0 0 10px rgba(232,255,60,0.8))"
      );
      svg.appendChild(ballEl);

      let t = 0;
      const animateBall = () => {
        if (t > 1) return;
        const pt = pathEl.getPointAtLength(t * totalLength);
        ballEl.setAttribute("cx", String(pt.x));
        ballEl.setAttribute("cy", String(pt.y));
        t += 0.008;
        animFrameRef.current = requestAnimationFrame(animateBall);
      };
      animateBall();

      // Store refs for cleanup
      (pathRef as React.MutableRefObject<SVGPathElement | null>).current =
        pathEl;
      (ballRef as React.MutableRefObject<SVGCircleElement | null>).current =
        ballEl;
    }
  }, [trajectory]);

  // Draw lane on mount and resize
  useEffect(() => {
    drawLane();
    const onResize = () => drawLane();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [drawLane]);

  const runSimulation = useCallback(() => {
    if (simRunning) return;
    setSimRunning(true);
    setPhaseLabel("SIMULATING…");
    setResults(null);

    const svg = svgRef.current;
    if (!svg) return;
    const W = svg.clientWidth;
    const H = svg.clientHeight;
    const laneW = 80;
    const pad = 20;
    const laneX = (W - laneW) / 2;

    const boardX = laneX + (board / 39) * laneW;
    const startY = H - pad;
    const hookFactor = (revRate / speed) * 0.8;
    const skidLen = (speed / 20) * (H - 2 * pad) * 0.55;
    const hookAmt = Math.min(hookFactor * 18, 35);
    const endX = boardX - hookAmt;
    const endY = pad + 10;

    const cp1x = boardX + launchAngle * 2;
    const cp1y = startY - skidLen;
    const cp2x = boardX - hookAmt * 0.4;
    const cp2y = startY - skidLen * 1.5;

    const pathStr = `M${boardX},${startY} C${cp1x},${cp1y} ${cp2x},${cp2y} ${endX},${endY}`;
    setTrajectory(pathStr);

    // Results
    const entryAngle = 2.5 + hookFactor * 1.2;
    const entryAngleStr = entryAngle.toFixed(1);
    const entryClass: "good" | "warn" | "bad" =
      entryAngle >= 4.5 ? "good" : entryAngle >= 3 ? "warn" : "bad";
    const breakPt = `Board ${board - Math.round(hookAmt / 3)}`;
    const skidFt = Math.round(28 + (speed - 15) * 2);
    const hookFt = Math.round(22 - (speed - 15));
    const outcome =
      entryAngle >= 4.5
        ? "✓ POCKET HIT"
        : entryAngle >= 3
          ? "⚠ LIGHT POCKET"
          : "✗ CROSSOVER";
    const outcomeClass: "good" | "warn" | "bad" =
      entryAngle >= 4.5 ? "good" : entryAngle >= 3 ? "warn" : "bad";

    setTimeout(() => {
      setPhaseLabel(entryAngle >= 4 ? "STRIKE LINE ✓" : "LIGHT HIT");
      setResults({
        entryAngle: entryAngleStr + "°",
        entryClass,
        breakPt,
        skidFt,
        hookFt,
        outcome,
        outcomeClass,
      });
      setSimRunning(false);
    }, 2000);
  }, [speed, revRate, launchAngle, board, simRunning]);

  return (
    <div className="sim-layout">
      <div className="lane-container">
        <div className="panel-header">
          <div className="panel-title">3D Lane Simulation (Top View)</div>
          <div className="panel-badge" id="phase-label">
            {phaseLabel}
          </div>
        </div>
        <div className="lane-canvas">
          <svg
            ref={svgRef}
            className="lane-svg"
            preserveAspectRatio="xMidYMid meet"
          />
        </div>
        <div className="phase-bar">
          <span className="phase-label">SKID</span>
          <div className="phase-seg skid" style={{ flex: 3 }} />
          <span className="phase-label">HOOK</span>
          <div className="phase-seg hook" style={{ flex: 2 }} />
          <span className="phase-label">ROLL</span>
          <div className="phase-seg roll" style={{ flex: 1.5 }} />
        </div>
      </div>
      <div className="sim-panel">
        <div className="control-group">
          <label htmlFor="sim-ball-select">Select Ball</label>
          <select
            id="sim-ball-select"
            className="ball-select"
            value={currentBall}
            onChange={(e) => setSelectedBallName(e.target.value)}
          >
            {ballOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label>Delivery Parameters</label>
          <div className="slider-row">
            <div className="slider-label">Ball Speed</div>
            <input
              type="range"
              min={12}
              max={22}
              step={0.5}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
            />
            <div className="slider-val">{speed} mph</div>
          </div>
          <div className="slider-row">
            <div className="slider-label">Rev Rate</div>
            <input
              type="range"
              min={150}
              max={450}
              step={10}
              value={revRate}
              onChange={(e) => setRevRate(Number(e.target.value))}
            />
            <div className="slider-val">{revRate} rpm</div>
          </div>
          <div className="slider-row">
            <div className="slider-label">Launch Angle</div>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={launchAngle}
              onChange={(e) => setLaunchAngle(parseFloat(e.target.value))}
            />
            <div className="slider-val">{launchAngle}°</div>
          </div>
          <div className="slider-row">
            <div className="slider-label">Board #</div>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={board}
              onChange={(e) => setBoard(Number(e.target.value))}
            />
            <div className="slider-val">{board}</div>
          </div>
        </div>
        <div className="control-group">
          <label htmlFor="oil-pattern">Oil Pattern</label>
          <select
            id="oil-pattern"
            className="ball-select"
            value={oilPattern}
            onChange={(e) => setOilPattern(e.target.value)}
          >
            {OIL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="sim-btn"
          onClick={runSimulation}
          disabled={simRunning}
        >
          LAUNCH BALL
        </button>
        {results && (
          <div className="result-card">
            <div className="result-card-title">Simulation Results</div>
            <div className="result-row">
              <div className="result-key">Entry Angle</div>
              <div className={`result-val ${results.entryClass}`}>
                {results.entryAngle}
              </div>
            </div>
            <div className="result-row">
              <div className="result-key">Breakpoint</div>
              <div className="result-val">{results.breakPt}</div>
            </div>
            <div className="result-row">
              <div className="result-key">Skid Length</div>
              <div className="result-val">{results.skidFt} ft</div>
            </div>
            <div className="result-row">
              <div className="result-key">Hook Distance</div>
              <div className="result-val">{results.hookFt} ft</div>
            </div>
            <div className="result-row">
              <div className="result-key">Outcome</div>
              <div className={`result-val ${results.outcomeClass}`}>
                {results.outcome}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
