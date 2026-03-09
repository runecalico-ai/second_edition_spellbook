import { describe, expect, it } from "vitest";
import type { SpellDetail } from "../types/spell";
import { clearDetailDirtyForFormOverrides, createDefaultDetailDirty } from "./detailDirty";

describe("clearDetailDirtyForFormOverrides", () => {
  it("clears a single serialized detail field and leaves others unchanged", () => {
    const prev = { ...createDefaultDetailDirty(), range: true, duration: true };
    const formOverrides: Partial<SpellDetail> = { range: "30 ft" };

    const next = clearDetailDirtyForFormOverrides(prev, formOverrides);

    expect(next.range).toBe(false);
    expect(next.duration).toBe(true);
  });

  it("clears multiple serialized detail fields", () => {
    const prev = { ...createDefaultDetailDirty(), duration: true, area: true, damage: true };
    const formOverrides: Partial<SpellDetail> = { duration: "1 round", area: "10 ft" };

    const next = clearDetailDirtyForFormOverrides(prev, formOverrides);

    expect(next.duration).toBe(false);
    expect(next.area).toBe(false);
    expect(next.damage).toBe(true);
  });

  it("clears both components and materialComponents when components is serialized", () => {
    const prev = { ...createDefaultDetailDirty(), components: true, materialComponents: true };
    const formOverrides: Partial<SpellDetail> = { components: "V, S, M" };

    const next = clearDetailDirtyForFormOverrides(prev, formOverrides);

    expect(next.components).toBe(false);
    expect(next.materialComponents).toBe(false);
  });

  it("clears both components and materialComponents when materialComponents is serialized", () => {
    const prev = { ...createDefaultDetailDirty(), components: true, materialComponents: true };
    const formOverrides: Partial<SpellDetail> = { materialComponents: "ruby dust" };

    const next = clearDetailDirtyForFormOverrides(prev, formOverrides);

    expect(next.components).toBe(false);
    expect(next.materialComponents).toBe(false);
  });

  it("clears both components and materialComponents when both are serialized", () => {
    const prev = { ...createDefaultDetailDirty(), components: true, materialComponents: true };
    const formOverrides: Partial<SpellDetail> = {
      components: "V, S, M",
      materialComponents: "ruby dust",
    };

    const next = clearDetailDirtyForFormOverrides(prev, formOverrides);

    expect(next.components).toBe(false);
    expect(next.materialComponents).toBe(false);
  });

  it("ignores non-detail keys in formOverrides", () => {
    const prev = { ...createDefaultDetailDirty(), range: true, duration: true };
    const formOverrides: Partial<SpellDetail> = { name: "Foo", range: "Touch" };

    const next = clearDetailDirtyForFormOverrides(prev, formOverrides);

    expect(next.range).toBe(false);
    expect(next.duration).toBe(true);
  });

  it("returns unchanged state for empty formOverrides", () => {
    const prev = { ...createDefaultDetailDirty(), damage: true };

    const next = clearDetailDirtyForFormOverrides(prev, {});

    expect(next).toEqual(prev);
  });
});
