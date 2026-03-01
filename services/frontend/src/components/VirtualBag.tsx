import { useState, useCallback } from "react";
import { useBag } from "../context/BagContext";
import {
  createArsenal,
  listArsenals,
  getArsenal,
  updateArsenal,
  deleteArsenal,
} from "../api/arsenals";
import { getBall } from "../api/balls";
import type { ArsenalSummary } from "../types/ball";

export function VirtualBag() {
  const {
    bag,
    savedArsenalId,
    removeFromBag,
    setBag,
    setSavedArsenalId,
  } = useBag();

  const [arsenalName, setArsenalName] = useState("");
  const [savedList, setSavedList] = useState<ArsenalSummary[]>([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = useCallback(async () => {
    if (!bag.length) {
      setError("Bag is empty");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const body = {
        name: arsenalName || undefined,
        balls: bag.map((e) => ({
          ball_id: e.ball.ball_id,
          game_count: e.game_count,
        })),
      };
      const res = await createArsenal(body);
      setSavedArsenalId(res.id);
      setSaveOpen(false);
      setArsenalName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }, [bag, arsenalName, setSavedArsenalId]);

  const openLoad = useCallback(async () => {
    setLoadOpen(true);
    setError(null);
    try {
      const list = await listArsenals({ limit: 50 });
      setSavedList(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load list failed");
    }
  }, []);

  const handleLoad = useCallback(
    async (id: string) => {
      setError(null);
      setLoading(true);
      try {
        const res = await getArsenal(id);
        const balls = await Promise.all(
          res.balls.map((ab) => getBall(ab.ball_id))
        );
        setBag(
          res.balls.map((ab, i) => ({
            ball: balls[i],
            game_count: ab.game_count,
          }))
        );
        setSavedArsenalId(id);
        setLoadOpen(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [setBag, setSavedArsenalId]
  );

  const handleUpdateSaved = useCallback(async () => {
    if (!savedArsenalId || !bag.length) return;
    setError(null);
    setLoading(true);
    try {
      await updateArsenal(savedArsenalId, {
        balls: bag.map((e) => ({
          ball_id: e.ball.ball_id,
          game_count: e.game_count,
        })),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }, [savedArsenalId, bag]);

  const handleDeleteSaved = useCallback(async () => {
    if (!savedArsenalId) return;
    setError(null);
    setLoading(true);
    try {
      await deleteArsenal(savedArsenalId);
      setSavedArsenalId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  }, [savedArsenalId, setSavedArsenalId]);

  const getImage = (brand: string) => {
    if (brand === "DV8") return "/ball_blue_gold.png";
    if (brand === "Motiv") return "/ball_black_orange.png";
    return "/ball_purple_pink.png";
  };

  const BAG_CAPACITY = 6;
  const progressPercent = Math.min((bag.length / BAG_CAPACITY) * 100, 100);

  return (
    <div className="virtual-bag">
      <div className="virtual-bag-header">
        <div className="bag-stat-row">
          <span className="bag-stat-label">MY BAG ({bag.length}/{BAG_CAPACITY})</span>
          <span className="bag-stat-percent">{Math.round(progressPercent)}%</span>
        </div>
        <div className="bag-progress-container">
          <div className="bag-progress-bar" style={{ width: `${progressPercent}%` }}></div>
        </div>
      </div>

      {error && (
        <p className="virtual-bag-error" role="alert">
          {error}
        </p>
      )}

      <ul className="virtual-bag-list">
        {bag.length === 0 ? (
          <li className="virtual-bag-empty-hint" aria-live="polite">
            Your bag is empty. Add balls from the catalog to get started.
          </li>
        ) : (
          bag.map((e) => (
            <li key={e.ball.ball_id} className="virtual-bag-item">
              <div className="virtual-bag-thumb-container">
                <img src={getImage(e.ball.brand)} alt="" className="virtual-bag-thumb" />
              </div>
              <div className="virtual-bag-info">
                <span className="virtual-bag-name">{e.ball.name}</span>
                <span className="virtual-bag-status">15lb • Active</span>
              </div>
              <button
                type="button"
                onClick={() => removeFromBag(e.ball.ball_id)}
                className="virtual-bag-remove-icon"
                aria-label={`Remove ${e.ball.name}`}
              >
                ⋮
              </button>
            </li>
          ))
        )}
      </ul>
      {savedArsenalId && (
        <p className="virtual-bag-saved">
          Saved arsenal loaded.
          <button
            type="button"
            onClick={handleUpdateSaved}
            disabled={loading}
            className="virtual-bag-btn"
          >
            Update
          </button>
          <button
            type="button"
            onClick={handleDeleteSaved}
            disabled={loading}
            className="virtual-bag-btn"
          >
            Unlink
          </button>
        </p>
      )}
      <div className="virtual-bag-actions">
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          disabled={!bag.length || loading}
          className="virtual-bag-btn"
        >
          Save arsenal
        </button>
        <button
          type="button"
          onClick={openLoad}
          disabled={loading}
          className="virtual-bag-btn"
        >
          Load arsenal
        </button>
      </div>
      {saveOpen && (
        <div className="virtual-bag-modal">
          <input
            type="text"
            placeholder="Arsenal name"
            value={arsenalName}
            onChange={(ev) => setArsenalName(ev.target.value)}
            className="virtual-bag-input"
          />
          <button type="button" onClick={handleSave} disabled={loading}>
            Save
          </button>
          <button type="button" onClick={() => setSaveOpen(false)}>
            Cancel
          </button>
        </div>
      )}
      {loadOpen && (
        <div className="virtual-bag-modal">
          <ul>
            {savedList.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => handleLoad(a.id)}
                  disabled={loading}
                >
                  {a.name || a.id} ({a.ball_count})
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setLoadOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
