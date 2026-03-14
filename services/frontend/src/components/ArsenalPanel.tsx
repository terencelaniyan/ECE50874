import { useState, useCallback, useEffect } from "react";
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
import { compareDegradation } from "../api/degradation";
import type { Ball, BagEntry, ArsenalSummary, DegradationCompareResponse } from "../types/ball";
import { bagEntriesToArsenalBallInputs } from "../types/ball";

type DegModel = "v1" | "v2";

function healthColor(healthPercent: number): string {
  if (healthPercent > 60) return "#4cff8a";
  if (healthPercent > 30) return "#e8ff3c";
  return "#ff5c38";
}

interface ArsenalCardProps {
  entry: BagEntry;
  slot: number;
  degModel: DegModel;
  v2Data: DegradationCompareResponse | null;
}

function ArsenalCard({ entry, slot, degModel, v2Data }: ArsenalCardProps) {
  const { ball, game_count } = entry;
  const slotLabel = getSlotLabel(slot);
  const displayName = ball.name ?? "Custom";
  const displayBrand = ball.brand ?? "—";
  const coverstock = entry.type === "catalog" ? ((ball as Ball).coverstock_type ?? "—") : (ball.surface_grit ?? ball.surface_finish ?? "—");

  let healthPercent: number;
  let lambdaIndicator: string | null = null;

  if (degModel === "v2" && v2Data) {
    healthPercent = Math.max(0, Math.min(100, v2Data.v2_logarithmic.factor * 100));
    lambdaIndicator = `λ=${v2Data.v2_lambda.toFixed(4)}`;
  } else {
    healthPercent = Math.max(0, 100 - (game_count / MAX_GAMES) * 100);
  }

  const color = healthColor(healthPercent);

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
          <span>
            Coverstock Health
            {degModel === "v2" && <span className="deg-model-indicator"> (LOG)</span>}
          </span>
          <span style={{ color }}>{Math.round(healthPercent)}%</span>
        </div>
        <div className="health-bar">
          <div
            className="health-fill"
            style={{ width: `${healthPercent}%`, background: color }}
          />
        </div>
        {lambdaIndicator && (
          <div className="lambda-indicator">{lambdaIndicator} &middot; {coverstock}</div>
        )}
      </div>
    </div>
  );
}

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
  const [degModel, setDegModel] = useState<DegModel>("v1");
  const [v2Results, setV2Results] = useState<Record<string, DegradationCompareResponse>>({});

  // Fetch V2 degradation data when model is switched to V2
  useEffect(() => {
    if (degModel !== "v2" || bag.length === 0) return;
    let cancelled = false;
    const fetchAll = async () => {
      const results: Record<string, DegradationCompareResponse> = {};
      await Promise.all(
        bag.map(async (entry) => {
          try {
            const b = entry.ball;
            const coverType = entry.type === "catalog" ? ((b as Ball).coverstock_type ?? undefined) : undefined;
            const res = await compareDegradation({
              ball_id: b.ball_id.startsWith("custom-") ? undefined : b.ball_id,
              rg: b.rg,
              diff: b.diff,
              int_diff: b.int_diff,
              coverstock_type: coverType,
              game_count: entry.game_count,
            });
            results[b.ball_id] = res;
          } catch {
            // skip failed fetches
          }
        })
      );
      if (!cancelled) setV2Results(results);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [degModel, bag]);

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
          <div className="deg-toggle">
            <button
              type="button"
              className={`deg-toggle-btn ${degModel === "v1" ? "active" : ""}`}
              onClick={() => setDegModel("v1")}
            >
              V1
            </button>
            <button
              type="button"
              className={`deg-toggle-btn ${degModel === "v2" ? "active" : ""}`}
              onClick={() => setDegModel("v2")}
            >
              V2
            </button>
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
              <ArsenalCard
                key={entry.ball.ball_id}
                entry={entry}
                slot={slot}
                degModel={degModel}
                v2Data={v2Results[entry.ball.ball_id] ?? null}
              />
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
