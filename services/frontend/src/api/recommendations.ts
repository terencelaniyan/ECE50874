import { post } from "./client";
import type { RecommendResponse } from "../types/ball";

export interface RecommendRequest {
  arsenal_ball_ids?: string[];
  arsenal_id?: string | null;
  game_counts?: Record<string, number> | null;
  k?: number;
}

export function getRecommendations(
  body: RecommendRequest
): Promise<RecommendResponse> {
  return post<RecommendResponse>("/recommendations", body);
}
