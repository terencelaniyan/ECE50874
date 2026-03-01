import { useState, useEffect, useCallback, useRef } from "react";
import { listBalls, type ListBallsParams } from "../api/balls";
import type { Ball } from "../types/ball";

const PAGE_SIZE = 100;
const COVER_FILTERS = [
  { value: "all", label: "All" },
  { value: "solid", label: "Solid" },
  { value: "pearl", label: "Pearl" },
  { value: "hybrid", label: "Hybrid" },
  { value: "urethane", label: "Urethane" },
] as const;

function coverstockClass(cover: string | null): string {
  if (!cover) return "";
  const c = cover.toLowerCase();
  if (c.includes("solid")) return "cover-solid";
  if (c.includes("pearl")) return "cover-pearl";
  if (c.includes("hybrid")) return "cover-hybrid";
  if (c.includes("urethane")) return "cover-urethane";
  return "";
}

function yearFromDate(release_date: string | null): string {
  if (!release_date) return "—";
  const y = release_date.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : release_date;
}

export function BallDatabaseView() {
  const [items, setItems] = useState<Ball[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [coverFilter, setCoverFilter] = useState<string>("all");
  const abortRef = useRef<AbortController | null>(null);

  const fetchBalls = useCallback(
    async (params: ListBallsParams, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listBalls(params, { signal });
        if (signal?.aborted) return;
        setItems(res.items);
        setCount(res.count);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load balls");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const coverstock =
      coverFilter === "all"
        ? undefined
        : coverFilter.charAt(0).toUpperCase() + coverFilter.slice(1);
    const params: ListBallsParams = {
      limit: PAGE_SIZE,
      offset,
      q: q.trim() || undefined,
      coverstock_type: coverstock,
      sort: "name",
      order: "asc",
    };
    fetchBalls(params, ac.signal);
    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [offset, q, coverFilter, fetchBalls]);

  const rgNorm = (rg: number) =>
    Math.max(0, ((rg - 2.44) / (2.78 - 2.44)) * 100);
  const diffNorm = (diff: number) => Math.max(0, (diff / 0.065) * 100);

  return (
    <section
      className="db-view"
      aria-labelledby="db-heading"
      aria-busy={loading}
    >
      <h2 id="db-heading">Ball Database</h2>
      <div className="db-toolbar">
        <input
          type="search"
          className="search-input db-search"
          placeholder="Search balls, brands, specs..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          aria-label="Search balls"
        />
        <div className="db-filter-chips">
          {COVER_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`filter-btn ${coverFilter === f.value ? "active" : ""}`}
              onClick={() => {
                setCoverFilter(f.value);
                setOffset(0);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="db-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="db-loading" aria-live="polite">
          Loading…
        </p>
      )}
      {!loading && (
        <div className="db-table-wrap">
          <p className="db-count">
            {count} ball{count !== 1 ? "s" : ""}
          </p>
          <table className="db-table">
            <thead>
              <tr>
                <th>Ball Name</th>
                <th>Brand</th>
                <th>Cover Type</th>
                <th>RG</th>
                <th>Differential</th>
                <th>Mass Bias</th>
                <th>Year</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ball) => (
                <tr key={ball.ball_id}>
                  <td>{ball.name}</td>
                  <td className="db-muted">{ball.brand}</td>
                  <td>
                    <span
                      className={`cover-badge ${coverstockClass(
                        ball.coverstock_type
                      )}`}
                    >
                      {ball.coverstock_type ?? "—"}
                    </span>
                  </td>
                  <td>
                    <div className="rg-bar-cell">
                      <span>{ball.rg}</span>
                      <div className="mini-bar">
                        <div
                          className="mini-fill"
                          style={{ width: `${rgNorm(ball.rg)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="rg-bar-cell">
                      <span>{ball.diff}</span>
                      <div className="mini-bar">
                        <div
                          className="mini-fill mini-fill-diff"
                          style={{ width: `${diffNorm(ball.diff)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="db-muted">
                    {ball.int_diff != null ? ball.int_diff : "—"}
                  </td>
                  <td className="db-muted">
                    {yearFromDate(ball.release_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className="db-pagination" aria-label="Database pagination">
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
              className="db-page-btn"
            >
              Previous
            </button>
            <span className="db-page-info">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, count)} of {count}
            </span>
            <button
              type="button"
              onClick={() =>
                setOffset((o) =>
                  o + PAGE_SIZE < count ? o + PAGE_SIZE : o
                )
              }
              disabled={offset + PAGE_SIZE >= count}
              className="db-page-btn"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
