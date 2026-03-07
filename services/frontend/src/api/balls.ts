import { get } from "./client";
import type { Ball, BallsResponse } from "../types/ball";

export interface ListBallsParams {
  brand?: string;
  coverstock_type?: string;
  symmetry?: string;
  status?: string;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/**
 * Fetch a list of bowling balls with optional filtering and pagination.
 * 
 * @param params - Search and filter parameters.
 * @param options - Optional config (e.g., AbortSignal).
 * @returns Promise resolving to the paginated list of balls.
 */
export function listBalls(
  params: ListBallsParams = {},
  options?: { signal?: AbortSignal }
): Promise<BallsResponse> {
  const sp = new URLSearchParams();
  if (params.brand != null) sp.set("brand", params.brand);
  if (params.coverstock_type != null) sp.set("coverstock_type", params.coverstock_type);
  if (params.symmetry != null) sp.set("symmetry", params.symmetry);
  if (params.status != null) sp.set("status", params.status);
  if (params.q != null) sp.set("q", params.q);
  if (params.sort != null) sp.set("sort", params.sort);
  if (params.order != null) sp.set("order", params.order);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return get<BallsResponse>(`/balls${qs ? `?${qs}` : ""}`, options);
}

/**
 * Fetch specifications for a single bowling ball by its ID.
 * 
 * @param ballId - Unique identifier of the ball.
 * @returns Promise resolving to the ball data.
 */
export function getBall(ballId: string): Promise<Ball> {
  return get<Ball>(`/balls/${encodeURIComponent(ballId)}`);
}
