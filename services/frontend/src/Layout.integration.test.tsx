import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { minimalBall, minimalBall2 } from "./test/fixtures";

type JsonValue = Record<string, unknown>;

function okJson(body: JsonValue) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    statusText: "error",
    json: () => Promise.resolve({ detail: message }),
    text: () => Promise.resolve(message),
  };
}

describe("Layout integration", () => {
  beforeEach(() => {
    const slotCallCount = { value: 0 };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.includes("/api/balls") && method === "GET") {
          return okJson({
            items: [minimalBall, minimalBall2],
            count: 2,
          });
        }

        if (url.includes("/api/gaps") && method === "POST") {
          return okJson({ zones: [] });
        }

        if (url.includes("/api/recommendations") && method === "POST") {
          return okJson({
            items: [{ ball: minimalBall2, score: 0.2451 }],
          });
        }

        if (url.includes("/api/slots") && method === "POST") {
          slotCallCount.value += 1;
          if (slotCallCount.value === 1) {
            return errorResponse(500, "slot assignment failed");
          }
          return okJson({
            assignments: [
              {
                ball_id: minimalBall.ball_id,
                slot: 3,
                slot_name: "Benchmark",
                slot_description: "Benchmark shape",
                rg: minimalBall.rg,
                diff: minimalBall.diff,
              },
            ],
            best_k: 3,
            silhouette_score: 0.421,
            slot_coverage: [
              { slot: 1, name: "Heavy Oil", covered: false },
              { slot: 2, name: "Medium Heavy", covered: false },
              { slot: 3, name: "Benchmark", covered: true },
              { slot: 4, name: "Medium Light", covered: false },
              { slot: 5, name: "Spare", covered: false },
              { slot: 6, name: "Control", covered: false },
            ],
          });
        }

        return errorResponse(404, `unhandled route: ${method} ${url}`);
      })
    );
  });

  it("orchestrates recs and slots panels with slot retry path", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /catalog/i }));
    await waitFor(() => {
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /add to bag/i })[0]);
    fireEvent.click(screen.getByRole("tab", { name: /grid view/i }));

    await waitFor(() => {
      expect(screen.getByText(minimalBall2.name)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Recs" }).className.includes("active")
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Slots" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("slot assignment failed");
    });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(screen.getByText("SILHOUETTE SCORE")).toBeInTheDocument();
    });
    expect(screen.getByText("Benchmark")).toBeInTheDocument();
  });
});
