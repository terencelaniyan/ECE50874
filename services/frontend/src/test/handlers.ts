import { http, HttpResponse } from "msw";
import { minimalBall } from "./fixtures";

const defaultArsenal = {
  id: "arsenal-1",
  name: "My bag",
  balls: [{ ball_id: minimalBall.ball_id, game_count: 3 }],
  custom_balls: [],
};

const defaultCreatedArsenal = {
  id: "new-id",
  name: "Saved",
  balls: [],
  custom_balls: [],
};

export const handlers = [
  http.get("*/api/arsenals", () => {
    return HttpResponse.json([]);
  }),

  http.get("*/api/arsenals/:id", () => {
    return HttpResponse.json(defaultArsenal);
  }),

  http.post("*/api/arsenals", () => {
    return HttpResponse.json(defaultCreatedArsenal);
  }),

  http.get("*/api/balls/:id", () => {
    return HttpResponse.json(minimalBall);
  }),
];
