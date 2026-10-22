import { describe, expect, it } from "vitest";
import { emptyModel, type Level, type Roof } from "../model";
import { pitchedSummary } from "../roofPlan";

const level = (r: Partial<Roof>): Level => {
  const m = emptyModel();
  m.roofs.push({ id: 1, x1: 0, y1: 0, x2: 10, y2: 6, kind: "gable", pitch: 45, overhang: 0.5, base: 2.7, thick: 0.15, ...r });
  return { ...m, name: "PB", elev: 0 };
};

describe("planta de techos", () => {
  it("a dos aguas: superficie real mayor que en planta, cumbrera, dos canalones y cuatro bajadas", () => {
    const lv = level({}), s = pitchedSummary(lv, lv.roofs[0]);
    expect(s.plan).toBeCloseTo(11 * 7);
    expect(s.slope).toBeCloseTo(77 * Math.SQRT2);
    expect(s.ratio).toBe("12:12"); expect(s.pct).toBe(100);
    expect(s.ridgeLen).toBeCloseTo(11);
    expect(s.gutters).toHaveLength(2);
    expect(s.gutterLen).toBeCloseTo(22);
    expect(s.downspouts).toHaveLength(4);
    // las bajadas quedan dentro del vuelo, junto al paño del muro
    for (const p of s.downspouts) expect(p.y < 0 ? -p.y : p.y - 6).toBeLessThan(0.2);
    expect(s.ridge).toBeGreaterThan(s.eave);
  });

  it("a cuatro aguas canalón perimetral; de un agua solo en el alero bajo", () => {
    const hip = level({ kind: "hip" }), sh = pitchedSummary(hip, hip.roofs[0]);
    expect(sh.gutters).toHaveLength(4);
    expect(sh.hipLen).toBeGreaterThan(0);
    expect(sh.downspouts).toHaveLength(4);
    const shed = level({ kind: "shed", drain: 2, pitch: 10 }), ss = pitchedSummary(shed, shed.roofs[0]);
    expect(ss.gutters).toHaveLength(1);
    expect(ss.gutters[0][0].y).toBeCloseTo(6.5);
    expect(ss.ridgeLen).toBe(0);
  });
});
