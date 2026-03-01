import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";
import { minimalBall } from "./test/fixtures";

const mockFetch = vi.fn();

describe("App integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [minimalBall],
          count: 1,
        }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("add ball from catalog to bag shows ball in arsenal on Grid View", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /catalog/i }));
    await waitFor(() => {
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });
    const addBtn = screen.getByRole("button", { name: /add to bag/i });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /in bag/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: /grid view/i }));
    await waitFor(() => {
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });
    const arsenalPanel = document.querySelector(".arsenal-panel");
    expect(arsenalPanel).toBeInTheDocument();
    expect(arsenalPanel!.querySelector(".arsenal-card-name")).toHaveTextContent(minimalBall.name);
  });
});
