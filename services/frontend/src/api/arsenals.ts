import { get, post, patch, del } from "./client";
import type {
  ArsenalResponse,
  ArsenalSummary,
  ArsenalBallInput,
} from "../types/ball";

export function listArsenals(params?: {
  limit?: number;
  offset?: number;
}): Promise<ArsenalSummary[]> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return get<ArsenalSummary[]>(`/arsenals${qs ? `?${qs}` : ""}`);
}

export function getArsenal(arsenalId: string): Promise<ArsenalResponse> {
  return get<ArsenalResponse>(`/arsenals/${encodeURIComponent(arsenalId)}`);
}

export function createArsenal(body: {
  name?: string | null;
  balls: ArsenalBallInput[];
}): Promise<ArsenalResponse> {
  return post<ArsenalResponse>("/arsenals", body);
}

export function updateArsenal(
  arsenalId: string,
  body: { name?: string | null; balls?: ArsenalBallInput[] | null }
): Promise<ArsenalResponse> {
  return patch<ArsenalResponse>(`/arsenals/${encodeURIComponent(arsenalId)}`, body);
}

export function deleteArsenal(arsenalId: string): Promise<void> {
  return del(`/arsenals/${encodeURIComponent(arsenalId)}`);
}
