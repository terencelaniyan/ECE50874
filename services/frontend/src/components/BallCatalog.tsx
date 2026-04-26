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

/**
 * BallCatalog component provides a searchable, filterable, and paginated list 
 * of bowling balls from the database.
 * 
 * Users can browse balls, filter by various specifications, and add them to their bag.
 */
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

  const retryFetch = useCallback(() => {
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
    fetchBalls(params);
  }, [offset, sort, order, debouncedFilters, fetchBalls]);

  return (
    <section
      className="ball-catalog"
      aria-labelledby="catalog-heading"
      aria-busy={loading}
    >
      <h2 id="catalog-heading">Ball Catalog</h2>
      <div className="ball-catalog-filters" role="search" aria-label="Filter catalog">
        <div className="filter-main">
          <svg className="filter-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            type="search"
            placeholder="Search balls, brands, specs..."
            value={filters.q ?? ""}
            onChange={(ev) => {
              setOffset(0);
              setFilters((f) => ({ ...f, q: ev.target.value || undefined }));
            }}
            className="ball-catalog-search-input"
            aria-label="Search balls"
          />
        </div>
        
        <div className="filter-group">
          <input
            type="text"
            placeholder="Brand"
            value={filters.brand ?? ""}
            onChange={(ev) => {
              setOffset(0);
              setFilters((f) => ({ ...f, brand: ev.target.value || undefined }));
            }}
            className="ball-catalog-input"
            aria-label="Filter by brand"
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
            aria-label="Filter by coverstock"
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
            aria-label="Filter by symmetry"
          />
        </div>

        <div className="filter-sort-group">
          <div className="sort-field">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(ev) => {
                setOffset(0);
                setSort(ev.target.value);
              }}
              className="ball-catalog-select"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sort-order">
            <span>Order</span>
            <select
              value={order}
              onChange={(ev) => {
                setOffset(0);
                setOrder(ev.target.value as "asc" | "desc");
              }}
              className="ball-catalog-select"
            >
              <option value="asc">Low to High</option>
              <option value="desc">High to Low</option>
            </select>
          </div>
        </div>
      </div>
      {error && (
        <p className="ball-catalog-error" role="alert">
          {error}
          <button
            type="button"
            onClick={retryFetch}
            className="ball-catalog-retry"
            aria-label="Retry loading catalog"
          >
            Try again
          </button>
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
                  onAdd={() => addToBag(ball)}
                  inBag={arsenalBallIds.includes(ball.ball_id)}
                />
              </li>
            ))}
          </ul>
          <nav
            className="ball-catalog-pagination"
            aria-label="Catalog pagination"
          >
            <button
              type="button"
              onClick={handlePagePrev}
              disabled={offset === 0}
              className="ball-catalog-page-btn"
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="ball-catalog-page-info" aria-live="polite">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, count)} of {count}
            </span>
            <button
              type="button"
              onClick={handlePageNext}
              disabled={offset + PAGE_SIZE >= count}
              className="ball-catalog-page-btn"
              aria-label="Next page"
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
