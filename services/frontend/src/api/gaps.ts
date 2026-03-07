import { post } from "./client";
import type { GapResponse } from "../types/ball";

export interface GapRequest {
  arsenal_ball_ids?: string[];
  arsenal_id?: string | null;
  game_counts?: Record<string, number> | null;
  k?: number;
  zone_threshold?: number;
}

/**
 * Perform a gap analysis on the user's arsenal.
 * 
 * @param body - The arsenal IDs, game counts, and analysis parameters (k, threshold).
 * @returns Promise resolving to the gap zones and recommended balls to fill them.
 */
export function getGaps(body: GapRequest): Promise<GapResponse> {
  return post<GapResponse>("/gaps", body);
}
