import { get } from "./client";
import type { Ball, BallsResponse } from "../types/ball";

export interface ListBallsParams {
  brand?: string;
  coverstock_type?: string;
  symmetry?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listBalls(params: ListBallsParams = {}): Promise<BallsResponse> {
  const sp = new URLSearchParams();
  if (params.brand != null) sp.set("brand", params.brand);
  if (params.coverstock_type != null) sp.set("coverstock_type", params.coverstock_type);
  if (params.symmetry != null) sp.set("symmetry", params.symmetry);
  if (params.status != null) sp.set("status", params.status);
  if (params.q != null) sp.set("q", params.q);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return get<BallsResponse>(`/balls${qs ? `?${qs}` : ""}`);
}

export function getBall(ballId: string): Promise<Ball> {
  return get<Ball>(`/balls/${encodeURIComponent(ballId)}`);
}
