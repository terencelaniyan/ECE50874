import type { FormEvaluation } from "../../types/analysis";

interface Props {
  evaluation: FormEvaluation;
}

export function FormFeedback({ evaluation }: Props) {
  const { checkpoints, overallScore } = evaluation;
  const scoreClass =
    overallScore >= 75 ? "good" : overallScore >= 50 ? "warn" : "bad";

  return (
    <div className="form-feedback">
      <div className="result-card-title">
        Form Evaluation
        <span className={`form-score ${scoreClass}`}>{overallScore}%</span>
      </div>
      <ul className="form-checklist">
        {checkpoints.map((cp, i) => (
          <li key={i} className={`form-check-item ${cp.passed ? "pass" : "fail"}`}>
            <span className="form-check-icon">
              {cp.passed ? "\u2713" : "\u2717"}
            </span>
            <div>
              <div className="form-check-name">{cp.name}</div>
              <div className="form-check-detail">{cp.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
