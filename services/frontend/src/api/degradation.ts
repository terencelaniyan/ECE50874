import { post } from "./client";
import type { DegradationCompareResponse } from "../types/ball";

export interface DegradationCompareRequest {
  ball_id?: string;
  rg?: number;
  diff?: number;
  int_diff?: number;
  coverstock_type?: string;
  game_count: number;
}

/**
 * Compare v1 (linear) vs v2 (logarithmic, coverstock-dependent) degradation models.
 */
export function compareDegradation(
  body: DegradationCompareRequest
): Promise<DegradationCompareResponse> {
  return post<DegradationCompareResponse>("/degradation/compare", body);
}
