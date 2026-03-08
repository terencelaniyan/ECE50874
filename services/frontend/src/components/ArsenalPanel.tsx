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
import type { BagEntry, ArsenalSummary } from "../types/ball";
import { bagEntriesToArsenalBallInputs } from "../types/ball";

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
  const displayName = ball.name ?? "Custom";
  const displayBrand = ball.brand ?? "—";
  const coverstock = entry.type === "catalog" ? (ball.coverstock_type ?? "—") : (ball.surface_grit ?? ball.surface_finish ?? "—");

  return (
    <div className={`arsenal-card slot-${slot}`}>
      <div className="arsenal-card-name">{displayName}</div>
      <div className="arsenal-card-meta">
        SLOT {slot}: {slotLabel} &nbsp;&middot;&nbsp;{" "}
        <span className="arsenal-card-brand">{displayBrand}</span>
        {entry.type === "custom" && (
          <span className="arsenal-card-custom-badge"> Custom</span>
        )}
      </div>
      <div className="arsenal-card-stats">
        <span className="stat-chip">
          RG <b>{ball.rg}</b>
        </span>
        <span className="stat-chip">
          Diff <b>{ball.diff}</b>
        </span>
        <span className="stat-chip">{coverstock}</span>
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

/**
 * ArsenalPanel component displays the user's current bag with detailed health 
 * (wear) metrics and provides save/load functionality.
 */
const INITIAL_CUSTOM_FORM = {
  name: "",
  brand: "",
  rg: "2.50",
  diff: "0.050",
  int_diff: "0.015",
  surface: "",
  game_count: "0",
};

export function ArsenalPanel() {
  const { bag, setBag, setSavedArsenalId, addCustomToBag } = useBag();
  const filledSlots = Math.min(bag.length, BAG_CAPACITY);

  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [customForm, setCustomForm] = useState(INITIAL_CUSTOM_FORM);
  const [arsenalName, setArsenalName] = useState("");
  const [savedList, setSavedList] = useState<ArsenalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAddCustomBall = useCallback(() => {
    const rg = parseFloat(customForm.rg);
    const diff = parseFloat(customForm.diff);
    const intDiff = parseFloat(customForm.int_diff);
    const games = Math.max(0, parseInt(customForm.game_count, 10) || 0);
    if (Number.isNaN(rg) || rg < 2 || rg > 3) {
      setError("RG must be between 2 and 3");
      return;
    }
    if (Number.isNaN(diff) || diff < 0 || diff > 0.1) {
      setError("Differential must be between 0 and 0.1");
      return;
    }
    if (Number.isNaN(intDiff) || intDiff < 0 || intDiff > 0.1) {
      setError("Mass bias must be between 0 and 0.1");
      return;
    }
    if (bag.length >= BAG_CAPACITY) {
      setError(`Bag is full (max ${BAG_CAPACITY} balls)`);
      return;
    }
    setError(null);
    const ball = {
      ball_id: `custom-${crypto.randomUUID()}`,
      name: customForm.name.trim() || undefined,
      brand: customForm.brand.trim() || undefined,
      rg,
      diff,
      int_diff: intDiff,
      surface_grit: customForm.surface.trim() || undefined,
      surface_finish: customForm.surface.trim() || undefined,
    };
    addCustomToBag(ball, games);
    setCustomForm(INITIAL_CUSTOM_FORM);
    setCustomFormOpen(false);
  }, [customForm, addCustomToBag, bag.length]);

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
        const catalogEntries: BagEntry[] = await Promise.all(
          res.balls.map(async (ab) => {
            const ball = await getBall(ab.ball_id);
            if (!ball) throw new Error(`Ball ${ab.ball_id} not found`);
            return { type: "catalog" as const, ball, game_count: ab.game_count };
          })
        );
        const customEntries: BagEntry[] = (res.custom_balls ?? []).map((cb) => ({
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
          <button
            type="button"
            className="arsenal-save-load-btn"
            onClick={() => { setCustomFormOpen(true); setError(null); }}
            disabled={bag.length >= BAG_CAPACITY || loading}
          >
            Add custom ball
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
            const slot = i + 1;
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
      {customFormOpen && (
        <div className="virtual-bag-modal arsenal-modal" role="dialog" aria-labelledby="custom-ball-title">
          <h3 id="custom-ball-title" className="arsenal-modal-title">Add custom ball</h3>
          <p className="arsenal-modal-hint">Enter specs (RG, Differential, Mass Bias). Name and surface optional.</p>
          <label className="arsenal-form-label">
            Name (optional)
            <input
              type="text"
              value={customForm.name}
              onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. My spare ball"
              className="arsenal-form-input"
            />
          </label>
          <label className="arsenal-form-label">
            Brand (optional)
            <input
              type="text"
              value={customForm.brand}
              onChange={(e) => setCustomForm((f) => ({ ...f, brand: e.target.value }))}
              placeholder="e.g. Storm"
              className="arsenal-form-input"
            />
          </label>
          <label className="arsenal-form-label">
            RG (required)
            <input
              type="number"
              step="0.01"
              min="2"
              max="3"
              value={customForm.rg}
              onChange={(e) => setCustomForm((f) => ({ ...f, rg: e.target.value }))}
              className="arsenal-form-input"
            />
          </label>
          <label className="arsenal-form-label">
            Differential (required)
            <input
              type="number"
              step="0.001"
              min="0"
              max="0.1"
              value={customForm.diff}
              onChange={(e) => setCustomForm((f) => ({ ...f, diff: e.target.value }))}
              className="arsenal-form-input"
            />
          </label>
          <label className="arsenal-form-label">
            Mass bias / Int diff (required)
            <input
              type="number"
              step="0.001"
              min="0"
              max="0.1"
              value={customForm.int_diff}
              onChange={(e) => setCustomForm((f) => ({ ...f, int_diff: e.target.value }))}
              className="arsenal-form-input"
            />
          </label>
          <label className="arsenal-form-label">
            Box surface / grit (optional)
            <input
              type="text"
              value={customForm.surface}
              onChange={(e) => setCustomForm((f) => ({ ...f, surface: e.target.value }))}
              placeholder="e.g. 2000 Grit"
              className="arsenal-form-input"
            />
          </label>
          <label className="arsenal-form-label">
            Games bowled (optional)
            <input
              type="number"
              min="0"
              value={customForm.game_count}
              onChange={(e) => setCustomForm((f) => ({ ...f, game_count: e.target.value }))}
              className="arsenal-form-input"
            />
          </label>
          <div className="arsenal-modal-actions">
            <button type="button" onClick={handleAddCustomBall}>
              Add to bag
            </button>
            <button type="button" onClick={() => { setCustomFormOpen(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
