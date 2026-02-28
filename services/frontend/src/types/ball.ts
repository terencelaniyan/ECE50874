/** Mirror of backend api_models for type-safe API usage. */

export interface Ball {
  ball_id: string;
  name: string;
  brand: string;
  rg: number;
  diff: number;
  int_diff: number;
  symmetry: string | null;
  coverstock_type: string | null;
  surface_grit: string | null;
  surface_finish: string | null;
  release_date: string | null;
  status: string | null;
}

export interface BallsResponse {
  items: Ball[];
  count: number;
}

export interface ArsenalBallInput {
  ball_id: string;
  game_count: number;
}

export interface ArsenalBallResponse {
  ball_id: string;
  game_count: number;
}

export interface ArsenalResponse {
  id: string;
  name: string | null;
  balls: ArsenalBallResponse[];
}

export interface ArsenalSummary {
  id: string;
  name: string | null;
  ball_count: number;
}

export interface RecommendationItem {
  ball: Ball;
  score: number;
}

export interface RecommendResponse {
  items: RecommendationItem[];
}

export interface GapItem {
  ball: Ball;
  gap_score: number;
}

export interface GapZone {
  center: [number, number];
  label: string;
  description: string;
  balls: GapItem[];
}

export interface GapResponse {
  zones: GapZone[];
}
