import { getBallPlaceholderImage } from "../constants/ballAssets";
import type { Ball } from "../types/ball";

interface BallCardProps {
  ball: Ball;
  onAdd?: (ball: Ball) => void;
  onAddToBag?: () => void;
  inBag: boolean;
  gapScore?: number;
}

/**
 * BallCard component displays summary information for a single bowling ball.
 * 
 * Includes an image, name, brand, key specifications (RG/Diff), and 
 * an "Add to Bag" action.
 */
export function BallCard({ ball, onAdd, onAddToBag, inBag }: BallCardProps) {
  const handleAdd = () => {
    if (onAdd) onAdd(ball);
    else onAddToBag?.();
  };

  return (
    <article className="ball-card">
      <div className="ball-card-header">
        <strong>{ball.name}</strong>
        <span className="ball-card-brand">{ball.brand}</span>
      </div>
      
      <div className="ball-card-media">
        <img src={getBallPlaceholderImage(ball.brand)} alt={ball.name} className="ball-card-img" />
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
    </article>
  );
}
