import { post } from "./client";
import type { RecommendV2Response } from "../types/ball";

export interface RecommendV2Request {
  arsenal_ball_ids?: string[];
  arsenal_id?: string | null;
  game_counts?: Record<string, number> | null;
  k?: number;
  method?: "knn" | "two_tower" | "hybrid";
  metric?: "l1" | "l2";
  normalize?: boolean;
  degradation_model?: "v1" | "v2";
  brand?: string;
  coverstock_type?: string;
  status?: string;
  diversity_min_distance?: number;
}

/**
 * Get v2 recommendations with model selection (KNN, two-tower, or hybrid).
 */
export function getRecommendationsV2(
  body: RecommendV2Request
): Promise<RecommendV2Response> {
  return post<RecommendV2Response>("/recommendations/v2", body);
}
