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
import { BAG_CAPACITY } from "../constants/slots";
import { getBallPlaceholderImage } from "../constants/ballAssets";
import type { ArsenalSummary } from "../types/ball";
import { bagEntriesToArsenalBallInputs } from "../types/ball";

/**
 * VirtualBag component manages the user's current collection of balls.
 * 
 * It displays the list of balls in the bag, allows removing them, 
 * and provides functionality for saving and loading arsenals to/from the backend.
 */
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
      const res = await createArsenal({
        name: arsenalName || undefined,
        balls: bagEntriesToArsenalBallInputs(bag),
      });
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
        const catalogEntries = await Promise.all(
          res.balls.map(async (ab) => {
            const ball = await getBall(ab.ball_id);
            if (!ball) throw new Error(`Ball ${ab.ball_id} not found`);
            return { type: "catalog" as const, ball, game_count: ab.game_count };
          })
        );
        const customEntries = (res.custom_balls ?? []).map((cb) => ({
          type: "custom" as const,
          ball: {
            ball_id: `custom-${cb.id}`,
            name: cb.name ?? undefined,
            brand: cb.brand ?? undefined,
            rg: cb.rg,
            diff: cb.diff,
            int_diff: cb.int_diff,
            surface_grit: cb.surface_grit ?? undefined,
            surface_finish: cb.surface_finish ?? undefined,
          },
          game_count: cb.game_count,
        }));
        setBag([...catalogEntries, ...customEntries]);
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
        balls: bagEntriesToArsenalBallInputs(bag),
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
                <img src={getBallPlaceholderImage(e.ball.brand ?? "")} alt="" className="virtual-bag-thumb" />
              </div>
              <div className="virtual-bag-info">
                <span className="virtual-bag-name">{e.ball.name ?? "Custom"}</span>
                <span className="virtual-bag-status">{e.type === "custom" ? "Custom" : "15lb • Active"}</span>
              </div>
              <button
                type="button"
                onClick={() => removeFromBag(e.ball.ball_id)}
                className="virtual-bag-remove-icon"
                aria-label={`Remove ${e.ball.name ?? "Custom"}`}
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
