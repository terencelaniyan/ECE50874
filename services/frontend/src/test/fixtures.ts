import type { Ball, BagEntry } from "../types/ball";

export const minimalBall: Ball = {
  ball_id: "ball-1",
  name: "Test Ball",
  brand: "Test Brand",
  rg: 2.5,
  diff: 0.05,
  int_diff: 0.01,
  symmetry: "sym",
  coverstock_type: "reactive",
  surface_grit: null,
  surface_finish: null,
  release_date: null,
  status: "active",
};

export const minimalBall2: Ball = {
  ...minimalBall,
  ball_id: "ball-2",
  name: "Test Ball 2",
};

export function bagEntry(ball: Ball, game_count = 0): BagEntry {
  return { type: "catalog", ball, game_count };
}
