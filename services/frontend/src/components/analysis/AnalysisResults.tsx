import type { BowlingKinematics } from "../../types/analysis";

interface Props {
  kinematics: BowlingKinematics;
}

export function AnalysisResults({ kinematics }: Props) {
  const confidenceClass =
    kinematics.confidence >= 0.8
      ? "good"
      : kinematics.confidence >= 0.5
        ? "warn"
        : "bad";

  return (
    <div className="analysis-results">
      <div className="result-card-title">Extracted Parameters</div>
      <div className="analysis-param-grid">
        <div className="analysis-param">
          <div className="param-value">{kinematics.ballSpeedMph}</div>
          <div className="param-unit">mph</div>
          <div className="param-label">Ball Speed</div>
        </div>
        <div className="analysis-param">
          <div className="param-value">{kinematics.launchAngleDeg}</div>
          <div className="param-unit">deg</div>
          <div className="param-label">Launch Angle</div>
        </div>
        <div className="analysis-param">
          <div className="param-value">{kinematics.revRateRpm}</div>
          <div className="param-unit">rpm</div>
          <div className="param-label">
            Rev Rate
            <span className="param-estimate" title="Estimated from forearm angular velocity — true rev rate requires ball-mounted sensors">
              (est.)
            </span>
          </div>
        </div>
        <div className="analysis-param">
          <div className={`param-value ${confidenceClass}`}>
            {Math.round(kinematics.confidence * 100)}%
          </div>
          <div className="param-unit">&nbsp;</div>
          <div className="param-label">Confidence</div>
        </div>
      </div>
    </div>
  );
}
