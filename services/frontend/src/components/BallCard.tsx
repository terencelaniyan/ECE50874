import type { Ball } from "../types/ball";

interface BallCardProps {
  ball: Ball;
  onAddToBag: () => void;
  inBag: boolean;
}

export function BallCard({ ball, onAddToBag, inBag }: BallCardProps) {
  return (
    <div className="ball-card">
      <div className="ball-card-header">
        <strong>{ball.name}</strong>
        <span className="ball-card-brand">{ball.brand}</span>
      </div>
      <dl className="ball-card-specs">
        <dt>RG</dt>
        <dd>{ball.rg}</dd>
        <dt>Diff</dt>
        <dd>{ball.diff}</dd>
        <dt>Int diff</dt>
        <dd>{ball.int_diff}</dd>
      </dl>
      {ball.coverstock_type && (
        <p className="ball-card-coverstock">{ball.coverstock_type}</p>
      )}
      <button
        type="button"
        onClick={onAddToBag}
        disabled={inBag}
        className="ball-card-add"
      >
        {inBag ? "In bag" : "Add to bag"}
      </button>
    </div>
  );
}
