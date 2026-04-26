import { useState, useCallback, useRef, useEffect } from "react";
import { useBag } from "../context/BagContext";
import { computeTrajectoryPath } from "../utils/parametric-physics";
import { computePhaseRatios } from "../utils/phase-detector";
import { analyzeSimulation } from "../utils/decision-framework";
import type { SimulationAdvice } from "../utils/decision-framework";
import type { Ball } from "../types/ball";

const OIL_OPTIONS = [
  "House Shot (38ft)",
  "Sport Shot — Badger (52ft)",
  "Sport Shot — Cheetah (33ft)",
  "Sport Shot — Chameleon (41ft)",
];

interface SimulationViewProps {
  initialParams?: {
    speed: number;
    revRate: number;
    launchAngle: number;
  };
}

export function SimulationView({ initialParams }: SimulationViewProps = {}) {
  const { bag } = useBag();
  const [speed, setSpeed] = useState(initialParams?.speed ?? 17);
  const [revRate, setRevRate] = useState(initialParams?.revRate ?? 280);
  const [launchAngle, setLaunchAngle] = useState(initialParams?.launchAngle ?? 3);
  const [board, setBoard] = useState(15);
  const [oilPattern, setOilPattern] = useState(OIL_OPTIONS[0]);
  const [selectedBallName, setSelectedBallName] = useState<string>("");
  const [phaseLabel, setPhaseLabel] = useState("READY");
  const [simRunning, setSimRunning] = useState(false);
  const [trajectory, setTrajectory] = useState<string | null>(null);
  const [phaseRatios, setPhaseRatios] = useState({ skid: 3, hook: 2, roll: 1.5 });
  const [results, setResults] = useState<{
    entryAngle: string;
    entryClass: "good" | "warn" | "bad";
    breakPt: string;
    skidFt: number;
    hookFt: number;
    outcome: string;
    outcomeClass: "good" | "warn" | "bad";
    patternLength: number;
  } | null>(null);
  const [advice, setAdvice] = useState<SimulationAdvice | null>(null);

  // Update sliders when initialParams changes (from Analysis tab handoff)
  useEffect(() => {
    if (initialParams) {
      setSpeed(Math.round(initialParams.speed * 2) / 2);
      setRevRate(Math.round(initialParams.revRate / 10) * 10);
      setLaunchAngle(Math.round(initialParams.launchAngle * 2) / 2);
    }
  }, [initialParams]);

  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const ballRef = useRef<SVGCircleElement>(null);
  const animFrameRef = useRef<number>(0);

  const ballOptions =
    bag.length > 0 ? bag.map((e) => e.ball.name ?? "Custom") : ["No balls in bag"];
  const currentBall =
    selectedBallName ||
    (ballOptions[0] !== "No balls in bag" ? ballOptions[0] : "");

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

    svg.appendChild(
      makeEl("rect", {
        width: String(W),
        height: String(H),
        fill: "var(--surface)",
      })
    );

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

    // Compute oil zone from actual pattern length (lane = 60 ft)
    let patternFt = 40;
    if (oilPattern.includes("Badger")) patternFt = 52;
    else if (oilPattern.includes("Cheetah")) patternFt = 33;
    else if (oilPattern.includes("Chameleon")) patternFt = 41;
    else if (oilPattern.includes("House")) patternFt = 38;
    const oilRatio = patternFt / 60;
    const laneLen = H - 2 * pad;
    const oilEnd = H - pad - laneLen * oilRatio;

    // Oil zone (blue tint)
    svg.appendChild(
      makeEl("rect", {
        x: String(laneX),
        y: String(oilEnd),
        width: String(laneW),
        height: String(H - pad - oilEnd),
        fill: "rgba(56,201,255,0.08)",
      })
    );

    // Oil zone top edge line
    svg.appendChild(
      makeEl("line", {
        x1: String(laneX),
        x2: String(laneX + laneW),
        y1: String(oilEnd),
        y2: String(oilEnd),
        stroke: "rgba(56,201,255,0.35)",
        "stroke-width": "1",
        "stroke-dasharray": "4 3",
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
    addLabel(laneX - 8, oilEnd + 4, `OIL END ${patternFt}ft`, "#38c9ff", {
      "letter-spacing": "1",
    });
    addLabel(laneX - 8, pad + 10, "PINS", "#6a6a8a");

    if (trajectory) {
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

      const totalLength = pathEl.getTotalLength();
      pathEl.style.strokeDasharray = String(totalLength);
      pathEl.style.strokeDashoffset = String(totalLength);
      pathEl.style.transition = "stroke-dashoffset 1.8s ease-out";
      void pathEl.getBoundingClientRect();
      pathEl.style.strokeDashoffset = "0";

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

      (pathRef as React.MutableRefObject<SVGPathElement | null>).current =
        pathEl;
      (ballRef as React.MutableRefObject<SVGCircleElement | null>).current =
        ballEl;
    }
  }, [trajectory, oilPattern]);

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
    setPhaseLabel("SIMULATING\u2026");
    setResults(null);

    const svg = svgRef.current;
    if (!svg) return;
    const W = svg.clientWidth;
    const H = svg.clientHeight;
    const laneW = 80;
    const pad = 20;

    const selectedBall = bag.find((e) => (e.ball.name ?? "Custom") === selectedBallName)?.ball;
    const rg = selectedBall ? parseFloat(String(selectedBall.rg)) : 2.5;
    const diff = selectedBall ? parseFloat(String(selectedBall.diff)) : 0.04;

    const { pathStr, result } = computeTrajectoryPath(
      { rg, diff, speed, revRate, launchAngle, board, oilPattern },
      { W, H, laneW, pad }
    );

    setTrajectory(pathStr);

    const ratios = computePhaseRatios(result.skidFt, result.hookFt);
    setPhaseRatios(ratios);

    setTimeout(() => {
      setPhaseLabel(result.entryAngle >= 4 ? "STRIKE LINE \u2713" : "LIGHT HIT");
      setResults({
        entryAngle: result.entryAngle.toFixed(1) + "\u00B0",
        entryClass: result.entryClass,
        breakPt: result.breakPt,
        skidFt: result.skidFt,
        hookFt: result.hookFt,
        outcome: result.outcome,
        outcomeClass: result.outcomeClass,
        patternLength: result.patternLength,
      });

      // Decision Framework: analyze outcome and produce advice
      const selectedEntry = bag.find((e) => (e.ball.name ?? "Custom") === selectedBallName);
      const covType = selectedEntry?.type === "catalog"
        ? (selectedEntry.ball as Ball).coverstock_type ?? undefined
        : undefined;
      const simAdvice = analyzeSimulation(result, {
        rg, diff,
        coverstockType: covType,
        gameCount: selectedEntry?.game_count,
      });
      setAdvice(simAdvice);

      setSimRunning(false);
    }, 2000);
  }, [speed, revRate, launchAngle, board, simRunning, bag, selectedBallName, oilPattern]);

  return (
    <div className="sim-layout">
      <div className="lane-container">
        <div className="panel-header">
          <div className="panel-title">Lane Simulation (Top View)</div>
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
          <div className="phase-seg skid" style={{ flex: phaseRatios.skid }} />
          <span className="phase-label">HOOK</span>
          <div className="phase-seg hook" style={{ flex: phaseRatios.hook }} />
          <span className="phase-label">ROLL</span>
          <div className="phase-seg roll" style={{ flex: phaseRatios.roll }} />
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
          {bag.length === 0 && (
            <p className="sim-no-bag-hint">
              💡 Add balls in the <strong>Catalog</strong> tab to simulate with your actual specs. Using default values for now.
            </p>
          )}
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
              <div className="result-key">Oil Pattern</div>
              <div className="result-val">{results.patternLength} ft</div>
            </div>
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
        {advice && (
          <div className={`advice-card advice-${results?.entryClass ?? "warn"}`}>
            <div className="advice-summary">{advice.summary}</div>
            {advice.reasons.length > 0 && (
              <ul className="advice-reasons">
                {advice.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
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
      </div>
    </div>
  );
}
