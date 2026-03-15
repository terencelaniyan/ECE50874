import { post } from "./client";
import type { SlotAssignResponse } from "../types/ball";

export interface SlotAssignRequest {
  arsenal_ball_ids?: string[];
  arsenal_id?: string | null;
  game_counts?: Record<string, number> | null;
}

/**
 * Assign arsenal balls to 6-ball slots using K-Means + silhouette.
 */
export function getSlotAssignments(
  body: SlotAssignRequest
): Promise<SlotAssignResponse> {
  return post<SlotAssignResponse>("/slots", body);
}
