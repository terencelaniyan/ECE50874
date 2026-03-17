import type { BowlingKinematics } from "../../types/analysis";
import {
  SPEED_BASELINES,
  REV_RATE_BASELINES,
  LAUNCH_ANGLE_BASELINES,
  type BaselineRange,
} from "../../constants/baselines";

interface Props {
  kinematics: BowlingKinematics;
}

function RangeBar({
  label,
  value,
  ranges,
  domainMin,
  domainMax,
  unit,
}: {
  label: string;
  value: number;
  ranges: BaselineRange[];
  domainMin: number;
  domainMax: number;
  unit: string;
}) {
  const scale = (v: number) =>
    ((v - domainMin) / (domainMax - domainMin)) * 100;
  const valuePct = Math.min(100, Math.max(0, scale(value)));

  return (
    <div className="baseline-row">
      <div className="baseline-label">{label}</div>
      <div className="baseline-track">
        {ranges.map((r, i) => (
          <div
            key={i}
            className="baseline-range"
            style={{
              left: `${scale(r.min)}%`,
              width: `${scale(r.max) - scale(r.min)}%`,
            }}
            title={`${r.label}: ${r.min}–${r.max} ${r.unit}`}
          >
            <span className="baseline-range-label">{r.label}</span>
          </div>
        ))}
        <div
          className="baseline-marker"
          style={{ left: `${valuePct}%` }}
          title={`Your value: ${value} ${unit}`}
        />
      </div>
      <div className="baseline-value">
        {value} {unit}
      </div>
    </div>
  );
}

export function BaselineComparison({ kinematics }: Props) {
  return (
    <div className="baseline-comparison">
      <div className="result-card-title">vs. PBA / USBC Baselines</div>
      <RangeBar
        label="Speed"
        value={kinematics.ballSpeedMph}
        ranges={SPEED_BASELINES}
        domainMin={10}
        domainMax={25}
        unit="mph"
      />
      <RangeBar
        label="Rev Rate"
        value={kinematics.revRateRpm}
        ranges={REV_RATE_BASELINES}
        domainMin={100}
        domainMax={600}
        unit="rpm"
      />
      <RangeBar
        label="Angle"
        value={kinematics.launchAngleDeg}
        ranges={LAUNCH_ANGLE_BASELINES}
        domainMin={0}
        domainMax={10}
        unit="deg"
      />
    </div>
  );
}
