import { describe, expect, it } from "vitest";
import { finishesFor, ROOFINGS, SIDINGS } from "../finishes";
import { TEMPLATES } from "../templates";
import { wallTypesFor } from "../wallTypes";

describe("México y EE.UU. separados", () => {
  it("cada país con sus tipos de muro", () => {
    const mx = wallTypesFor(false).map((t) => t.id), us = wallTypesFor(true).map((t) => t.id);
    expect(mx).toContain("block-15");
    expect(mx.some((id) => id.startsWith("us-"))).toBe(false);
    expect(us).toEqual(expect.arrayContaining(["us-2x6", "us-2x4", "us-cmu8"]));
    expect(us).not.toContain("block-15");
  });
  it("sin siding de madera ni teja asfáltica en México", () => {
    const ids = [...finishesFor(SIDINGS, false), ...finishesFor(ROOFINGS, false)].map((f) => f.id);
    expect(ids).not.toContain("vinyl-lap");
    expect(ids).not.toContain("asphalt-arch");
    expect(ids).toContain("clay");
    expect(finishesFor(ROOFINGS, true).map((f) => f.id)).toContain("asphalt-arch");
  });
  it("plantillas por país", () => {
    expect(TEMPLATES.filter((t) => t.us).every((t) => t.build().units === "imperial")).toBe(true);
    expect(TEMPLATES.filter((t) => !t.us).every((t) => t.build().units !== "imperial")).toBe(true);
  });
});
