import { useState, useEffect, useCallback, useRef } from "react";
import { listBalls, type ListBallsParams } from "../api/balls";
import { useBag } from "../context/BagContext";
import { BallCard } from "./BallCard";
import type { Ball } from "../types/ball";

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "brand", label: "Brand" },
  { value: "release_date", label: "Release date" },
  { value: "rg", label: "RG" },
  { value: "diff", label: "Differential" },
  { value: "coverstock_type", label: "Coverstock" },
  { value: "symmetry", label: "Symmetry" },
];

export function BallCatalog() {
  const { addToBag, arsenalBallIds } = useBag();
  const [items, setItems] = useState<Ball[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<string>("release_date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<ListBallsParams>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [debouncedFilters, setDebouncedFilters] = useState<ListBallsParams>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedFilters((prev) => ({
        ...prev,
        brand: filters.brand,
        coverstock_type: filters.coverstock_type,
        symmetry: filters.symmetry,
        q: filters.q,
      }));
    }, FILTER_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters.brand, filters.coverstock_type, filters.symmetry, filters.q]);

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
    const params: ListBallsParams = {
      limit: PAGE_SIZE,
      offset,
      sort,
      order,
      brand: (debouncedFilters.brand ?? "").trim() || undefined,
      coverstock_type: (debouncedFilters.coverstock_type ?? "").trim() || undefined,
      symmetry: (debouncedFilters.symmetry ?? "").trim() || undefined,
      q: (debouncedFilters.q ?? "").trim() || undefined,
    };
    fetchBalls(params, ac.signal);
    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [offset, debouncedFilters.brand, debouncedFilters.coverstock_type, debouncedFilters.symmetry, debouncedFilters.q, sort, order, fetchBalls]);

  const handlePageNext = () => {
    if (offset + PAGE_SIZE < count) setOffset((o) => o + PAGE_SIZE);
  };
  const handlePagePrev = () => {
    if (offset > 0) setOffset((o) => Math.max(0, o - PAGE_SIZE));
  };

  return (
    <div className="ball-catalog">
      <h2>Ball Catalog</h2>
      <div className="ball-catalog-filters">
        <input
          type="text"
          placeholder="Search name, brand, or coverstock"
          value={filters.q ?? ""}
          onChange={(ev) => {
            setOffset(0);
            setFilters((f) => ({ ...f, q: ev.target.value || undefined }));
          }}
          className="ball-catalog-input"
        />
        <input
          type="text"
          placeholder="Brand"
          value={filters.brand ?? ""}
          onChange={(ev) => {
            setOffset(0);
            setFilters((f) => ({ ...f, brand: ev.target.value || undefined }));
          }}
          className="ball-catalog-input"
        />
        <input
          type="text"
          placeholder="Coverstock"
          value={filters.coverstock_type ?? ""}
          onChange={(ev) => {
            setOffset(0);
            setFilters((f) => ({
              ...f,
              coverstock_type: ev.target.value || undefined,
            }));
          }}
          className="ball-catalog-input"
        />
        <input
          type="text"
          placeholder="Symmetry"
          value={filters.symmetry ?? ""}
          onChange={(ev) => {
            setOffset(0);
            setFilters((f) => ({
              ...f,
              symmetry: ev.target.value || undefined,
            }));
          }}
          className="ball-catalog-input"
        />
        <span className="ball-catalog-sort" role="group" aria-label="Sort options">
          <label htmlFor="catalog-sort-by">
            Sort by
          </label>
          <select
            id="catalog-sort-by"
            value={sort}
            onChange={(ev) => {
              setOffset(0);
              setSort(ev.target.value);
            }}
            className="ball-catalog-input ball-catalog-select"
            aria-label="Sort by field"
            tabIndex={0}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <label htmlFor="catalog-sort-order">
            Order
          </label>
          <select
            id="catalog-sort-order"
            value={order}
            onChange={(ev) => {
              setOffset(0);
              setOrder(ev.target.value as "asc" | "desc");
            }}
            className="ball-catalog-input ball-catalog-select"
            aria-label="Sort order"
            tabIndex={0}
          >
            <option value="asc">A–Z / Low–High</option>
            <option value="desc">Z–A / High–Low</option>
          </select>
        </span>
      </div>
      {error && (
        <p className="ball-catalog-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="ball-catalog-loading" aria-live="polite">
          Loading…
        </p>
      ) : (
        <>
          <p className="ball-catalog-count">
            {count} ball{count !== 1 ? "s" : ""}
          </p>
          <ul className="ball-catalog-list">
            {items.map((ball) => (
              <li key={ball.ball_id} className="ball-catalog-item">
                <BallCard
                  ball={ball}
                  onAddToBag={() => addToBag(ball)}
                  inBag={arsenalBallIds.includes(ball.ball_id)}
                />
              </li>
            ))}
          </ul>
          <div className="ball-catalog-pagination">
            <button
              type="button"
              onClick={handlePagePrev}
              disabled={offset === 0}
              className="ball-catalog-page-btn"
            >
              Previous
            </button>
            <span className="ball-catalog-page-info">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, count)} of {count}
            </span>
            <button
              type="button"
              onClick={handlePageNext}
              disabled={offset + PAGE_SIZE >= count}
              className="ball-catalog-page-btn"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
