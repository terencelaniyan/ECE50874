import { useState, useCallback } from "react";
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
  const [results, setResults] = useState<{
    entryAngle: string;
    entryClass: "good" | "warn" | "bad";
    breakPt: string;
    skidFt: number;
    hookFt: number;
    outcome: string;
    outcomeClass: "good" | "warn" | "bad";
  } | null>(null);

  const ballOptions = bag.length > 0 ? bag.map((e) => e.ball.name) : ["No balls in bag"];
  const currentBall = selectedBallName || (ballOptions[0] !== "No balls in bag" ? ballOptions[0] : "");

  const runSimulation = useCallback(() => {
    if (simRunning) return;
    setSimRunning(true);
    setPhaseLabel("SIMULATING…");
    setResults(null);

    const hookFactor = (revRate / speed) * 0.8;
    const hookAmt = Math.min(hookFactor * 18, 35);
    const entryAngle = 2.5 + hookFactor * 1.2;
    const entryAngleStr = entryAngle.toFixed(1);
    const entryClass: "good" | "warn" | "bad" =
      entryAngle >= 4.5 ? "good" : entryAngle >= 3 ? "warn" : "bad";
    const breakPt = `Board ${board - Math.round(hookAmt / 3)}`;
    const skidFt = Math.round(28 + (speed - 15) * 2);
    const hookFt = Math.round(22 - (speed - 15));
    const outcome =
      entryAngle >= 4.5 ? "POCKET HIT" : entryAngle >= 3 ? "LIGHT POCKET" : "CROSSOVER";
    const outcomeClass: "good" | "warn" | "bad" =
      entryAngle >= 4.5 ? "good" : entryAngle >= 3 ? "warn" : "bad";

    setTimeout(() => {
      setPhaseLabel(entryAngle >= 4 ? "STRIKE LINE" : "LIGHT HIT");
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
  }, [speed, revRate, board, simRunning]);

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
          <svg id="lane-svg" className="lane-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
            <rect width="100%" height="100%" fill="var(--surface)" />
            <rect x="160" y="20" width="80" height="260" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <rect x="160" y="20" width="80" height="160" fill="rgba(56,201,255,0.06)" />
            <text x="148" y="292" fill="var(--muted)" fontSize="9" textAnchor="end">
              FOUL
            </text>
            <text x="148" y="185" fill="var(--accent3)" fontSize="9" textAnchor="end">
              OIL END
            </text>
            <text x="148" y="28" fill="var(--muted)" fontSize="9" textAnchor="end">
              PINS
            </text>
          </svg>
        </div>
        <div className="phase-bar">
          <span className="phase-label">SKID</span>
          <div className="phase-seg skid" style={{ flex: 3 }} />
          <span className="phase-label">HOOK</span>
          <div className="phase-seg hook" style={{ flex: 2 }} />
          <span className="phase-label">ROLL</span>
          <div className="phase-seg roll" style={{ flex: 1.5 }} />
        </div>
        <div className="phase-labels">
          <span>Skid</span>
          <span>Hook</span>
          <span>Roll</span>
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
              <div className={`result-val ${results.entryClass}`}>{results.entryAngle}</div>
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
              <div className={`result-val ${results.outcomeClass}`}>{results.outcome}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
