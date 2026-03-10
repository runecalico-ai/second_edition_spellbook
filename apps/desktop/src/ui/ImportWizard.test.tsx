import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithImportActivity } from "./ImportWizard";
import { useImportActivity } from "../store/useImportActivity";

describe("runWithImportActivity", () => {
  beforeEach(() => {
    useImportActivity.getState().reset();
  });

  it("marks import as active while work is pending", async () => {
    let resolveWork: (() => void) | undefined;
    const work = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const pending = runWithImportActivity(async () => {
      expect(useImportActivity.getState().isImportInProgress).toBe(true);
      await work;
    });

    expect(useImportActivity.getState().isImportInProgress).toBe(true);

    resolveWork?.();
    await pending;

    expect(useImportActivity.getState().isImportInProgress).toBe(false);
  });

  it("clears import activity when work throws", async () => {
    await expect(
      runWithImportActivity(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(useImportActivity.getState().isImportInProgress).toBe(false);
  });

  it("keeps import activity active until all overlapping work completes", async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    const firstRun = runWithImportActivity(async () => {
      await first;
    });
    const secondRun = runWithImportActivity(async () => {
      await second;
    });

    expect(useImportActivity.getState().isImportInProgress).toBe(true);

    resolveFirst?.();
    await firstRun;

    expect(useImportActivity.getState().isImportInProgress).toBe(true);

    resolveSecond?.();
    await secondRun;

    expect(useImportActivity.getState().isImportInProgress).toBe(false);
  });
});
