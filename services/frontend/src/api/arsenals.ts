import { get, post, patch, del } from "./client";
import type {
  ArsenalResponse,
  ArsenalSummary,
  ArsenalBallInput,
} from "../types/ball";

/**
 * Fetch a paginated list of all saved arsenals.
 * 
 * @param params - Optional pagination limits.
 * @returns Promise resolving to an array of arsenal summaries.
 */
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

/**
 * Fetch full details for a specific arsenal.
 * 
 * @param arsenalId - UUID of the arsenal.
 * @returns Promise resolving to the arsenal details.
 */
export function getArsenal(arsenalId: string): Promise<ArsenalResponse> {
  return get<ArsenalResponse>(`/arsenals/${encodeURIComponent(arsenalId)}`);
}

/**
 * Save a new arsenal to the database.
 * 
 * @param body - Arsenal name and initial ball list.
 * @returns Promise resolving to the created arsenal.
 */
export function createArsenal(body: {
  name?: string | null;
  balls: ArsenalBallInput[];
}): Promise<ArsenalResponse> {
  return post<ArsenalResponse>("/arsenals", body);
}

/**
 * Update an existing arsenal's name or ball list.
 * 
 * @param arsenalId - UUID of the arsenal to update.
 * @param body - New name or ball list.
 * @returns Promise resolving to the updated arsenal.
 */
export function updateArsenal(
  arsenalId: string,
  body: { name?: string | null; balls?: ArsenalBallInput[] | null }
): Promise<ArsenalResponse> {
  return patch<ArsenalResponse>(`/arsenals/${encodeURIComponent(arsenalId)}`, body);
}

/**
 * Delete an arsenal by its ID.
 * 
 * @param arsenalId - UUID of the arsenal to delete.
 */
export function deleteArsenal(arsenalId: string): Promise<void> {
  return del(`/arsenals/${encodeURIComponent(arsenalId)}`);
}
