import { post } from "./client";
import type { RecommendResponse } from "../types/ball";

export interface RecommendRequest {
  arsenal_ball_ids?: string[];
  arsenal_id?: string | null;
  game_counts?: Record<string, number> | null;
  k?: number;
}

/**
 * Get bowling ball recommendations based on the user's current arsenal.
 * 
 * @param body - The arsenal IDs, game counts, and number of recommendations (k).
 * @returns Promise resolving to the ranked list of recommended balls.
 */
export function getRecommendations(
  body: RecommendRequest
): Promise<RecommendResponse> {
  return post<RecommendResponse>("/recommendations", body);
}
