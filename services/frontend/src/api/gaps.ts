import { post } from "./client";
import type { GapResponse } from "../types/ball";

export interface GapRequest {
  arsenal_ball_ids?: string[];
  arsenal_id?: string | null;
  game_counts?: Record<string, number> | null;
  k?: number;
}

export function getGaps(body: GapRequest): Promise<GapResponse> {
  return post<GapResponse>("/gaps", body);
}
