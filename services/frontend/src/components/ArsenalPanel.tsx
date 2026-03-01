import { useState, useCallback } from "react";
import { useBag } from "../context/BagContext";
import {
  BAG_CAPACITY,
  MAX_GAMES,
  getSlotLabel,
} from "../constants/slots";
import {
  createArsenal,
  listArsenals,
  getArsenal,
} from "../api/arsenals";
import { getBall } from "../api/balls";
import type { BagEntry } from "../context/BagContext";
import type { ArsenalSummary } from "../types/ball";

function healthColor(healthPercent: number): string {
  if (healthPercent > 60) return "#4cff8a";
  if (healthPercent > 30) return "#e8ff3c";
  return "#ff5c38";
}

interface ArsenalCardProps {
  entry: BagEntry;
  slot: number;
}

function ArsenalCard({ entry, slot }: ArsenalCardProps) {
  const { ball, game_count } = entry;
  const healthPercent = Math.max(
    0,
    100 - (game_count / MAX_GAMES) * 100
  );
  const color = healthColor(healthPercent);
  const slotLabel = getSlotLabel(slot);

  return (
    <div className={`arsenal-card slot-${slot}`}>
      <div className="arsenal-card-name">{ball.name}</div>
      <div className="arsenal-card-meta">
        SLOT {slot}: {slotLabel} &nbsp;&middot;&nbsp;{" "}
        <span className="arsenal-card-brand">{ball.brand}</span>
      </div>
      <div className="arsenal-card-stats">
        <span className="stat-chip">
          RG <b>{ball.rg}</b>
        </span>
        <span className="stat-chip">
          Diff <b>{ball.diff}</b>
        </span>
        <span className="stat-chip">{ball.coverstock_type ?? "—"}</span>
      </div>
      <div className="health-bar-wrap">
        <div className="health-label">
          <span>Coverstock Health</span>
          <span style={{ color }}>{Math.round(healthPercent)}%</span>
        </div>
        <div className="health-bar">
          <div
            className="health-fill"
            style={{ width: `${healthPercent}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
}

export function ArsenalPanel() {
  const { bag, setBag, setSavedArsenalId } = useBag();
  const filledSlots = Math.min(bag.length, BAG_CAPACITY);

  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [arsenalName, setArsenalName] = useState("");
  const [savedList, setSavedList] = useState<ArsenalSummary[]>([]);
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
        balls: bag.map((e) => ({
          ball_id: e.ball.ball_id,
          game_count: e.game_count,
        })),
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

  return (
    <div className="arsenal-panel">
      <div className="panel-header arsenal-panel-header">
        <div className="panel-title">My Arsenal</div>
        <div className="arsenal-header-actions">
          <div className="panel-badge">
            {filledSlots} / {BAG_CAPACITY} SLOTS
          </div>
          <button
            type="button"
            className="arsenal-save-load-btn"
            onClick={() => setSaveOpen(true)}
            disabled={!bag.length || loading}
          >
            Save
          </button>
          <button
            type="button"
            className="arsenal-save-load-btn"
            onClick={openLoad}
            disabled={loading}
          >
            Load
          </button>
        </div>
      </div>
      {error && (
        <p className="arsenal-save-load-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel-body">
        {bag.length === 0 ? (
          <p className="arsenal-empty">Add balls from the catalog to build your arsenal.</p>
        ) : (
          bag.map((entry, i) => {
            const slot = Math.min(i + 1, 5);
            return (
              <ArsenalCard key={entry.ball.ball_id} entry={entry} slot={slot} />
            );
          })
        )}
      </div>
      {saveOpen && (
        <div className="virtual-bag-modal arsenal-modal">
          <input
            type="text"
            placeholder="Arsenal name"
            value={arsenalName}
            onChange={(e) => setArsenalName(e.target.value)}
            className="virtual-bag-input"
          />
          <div className="arsenal-modal-actions">
            <button type="button" onClick={handleSave} disabled={loading}>
              Save
            </button>
            <button type="button" onClick={() => setSaveOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {loadOpen && (
        <div className="virtual-bag-modal arsenal-modal">
          <ul className="arsenal-load-list">
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
