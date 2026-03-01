import type { Ball } from "../types/ball";

interface BallCardProps {
  ball: Ball;
  onAdd?: (ball: Ball) => void;
  onAddToBag?: () => void;
  inBag: boolean;
  gapScore?: number;
}

export function BallCard({ ball, onAdd, onAddToBag, inBag }: BallCardProps) {
  const handleAdd = () => {
    if (onAdd) onAdd(ball);
    else onAddToBag?.();
  };
  const getImage = (brand: string) => {
    if (brand === "DV8") return "/ball_blue_gold.png";
    if (brand === "Motiv") return "/ball_black_orange.png";
    return "/ball_purple_pink.png";
  };

  return (
    <li className="ball-card">
      <div className="ball-card-header">
        <strong>{ball.name}</strong>
        <span className="ball-card-brand">{ball.brand}</span>
      </div>
      
      <div className="ball-card-media">
        <img src={getImage(ball.brand)} alt={ball.name} className="ball-card-img" />
      </div>

      <dl className="ball-card-specs">
        <div>
          <dt>RG</dt>
          <dd>{ball.rg}</dd>
        </div>
        <div>
          <dt>Diff</dt>
          <dd>{ball.diff}</dd>
        </div>
        <div>
          <dt>Int diff</dt>
          <dd>{ball.int_diff}</dd>
        </div>
      </dl>
      
      <div className="ball-card-footer">
        <button className="ball-card-btn-secondary">View Details</button>
        <button
          className="ball-card-add"
          onClick={handleAdd}
          disabled={inBag}
        >
          {inBag ? "In bag" : "Add to bag"}
        </button>
      </div>
    </li>
  );
}
