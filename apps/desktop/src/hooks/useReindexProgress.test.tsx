// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReindexProgress } from "./useReindexProgress";

const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) => mockListen(event, handler),
}));

describe("useReindexProgress", () => {
  let handler: (e: { payload: { current: number; total: number } }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(async (event: string, next: typeof handler) => {
      if (event === "embeddings://reindex-progress") handler = next;
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("tracks reindex progress events while active", async () => {
    const { result } = renderHook(() => useReindexProgress(true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      handler({ payload: { current: 1, total: 4 } });
    });
    expect(result.current.current).toBe(1);
    expect(result.current.total).toBe(4);
    expect(result.current.fraction).toBeCloseTo(0.25);
  });

  it("active=false resets and ignores later events", async () => {
    const { result, rerender } = renderHook(({ active }) => useReindexProgress(active), {
      initialProps: { active: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      handler({ payload: { current: 2, total: 4 } });
    });
    rerender({ active: false });
    expect(result.current.current).toBe(0);
    expect(result.current.total).toBe(0);
    act(() => {
      handler({ payload: { current: 4, total: 4 } });
    });
    expect(result.current.current).toBe(0);
  });
});
