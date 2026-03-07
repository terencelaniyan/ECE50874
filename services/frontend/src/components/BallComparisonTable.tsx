import type { Ball } from "../types/ball";

export interface ScoreEntry {
  label: string;
  value: number;
}

interface BallComparisonTableProps {
  balls: Ball[];
  scoreByBallId?: Record<string, ScoreEntry>;
}

/**
 * BallComparisonTable component renders a side-by-side comparison of multiple 
 * bowling balls' specifications.
 * 
 * It takes an array of balls and an optional mapping of additional scores 
 * (like gap or similarity scores) to display in the table.
 */
export function BallComparisonTable({ balls, scoreByBallId }: BallComparisonTableProps) {
  if (balls.length === 0) return null;

  const attrs: { key: string; label: string; get: (b: Ball) => string | number }[] = [
    { key: "name", label: "Name", get: (b) => b.name },
    { key: "brand", label: "Brand", get: (b) => b.brand },
    { key: "rg", label: "RG", get: (b) => b.rg },
    { key: "diff", label: "Diff", get: (b) => b.diff },
    { key: "int_diff", label: "Int diff", get: (b) => b.int_diff },
    { key: "coverstock", label: "Coverstock", get: (b) => b.coverstock_type ?? "—" },
  ];

  const hasScores = scoreByBallId && Object.keys(scoreByBallId).length > 0;
  const scoreLabel = hasScores && balls.length > 0 && scoreByBallId[balls[0].ball_id]?.label;

  return (
    <table
      className="ball-comparison-table"
      aria-label="Side-by-side comparison of selected balls"
    >
      <caption className="ball-comparison-table-caption">Compare selected balls</caption>
      <thead>
        <tr>
          <th scope="row" className="ball-comparison-table-row-header">
            —
          </th>
          {balls.map((b) => (
            <th key={b.ball_id} scope="col" className="ball-comparison-table-col-header">
              {b.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {attrs.map(({ key, label, get }) => (
          <tr key={key}>
            <th scope="row" className="ball-comparison-table-row-header">
              {label}
            </th>
            {balls.map((b) => (
              <td key={b.ball_id} className="ball-comparison-table-cell">
                {get(b)}
              </td>
            ))}
          </tr>
        ))}
        {hasScores && scoreLabel && (
          <tr>
            <th scope="row" className="ball-comparison-table-row-header">
              {scoreLabel}
            </th>
            {balls.map((b) => (
              <td key={b.ball_id} className="ball-comparison-table-cell">
                {scoreByBallId[b.ball_id]?.value.toFixed(4) ?? "—"}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}
