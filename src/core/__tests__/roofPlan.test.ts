import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { roofLevel, roofSummary } from "../roofPlan";

/** Vivienda de ejemplo con azotea plana y el hueco de la escalera abierto en ella. */
function flatWithStairHole() {
  const ed = new Editor();
  ed.setTool("stair"); ed.runCommand("7;-1"); ed.runCommand("7;-5");
  const r = ed.model.roofs[0];
  r.kind = "flat"; r.overhang = 0;
  ed.setTool("hole"); ed.runCommand("6.4;-0.8"); ed.runCommand("7.8;-5.2");
  return { ed, r };
}

describe("planta de azotea", () => {
  it("toma el nivel más alto que tiene cubierta", () => {
    const { ed } = flatWithStairHole();
    expect(roofLevel(ed.project)).toBe(0);
    ed.project.levels.push({ ...ed.project.levels[0], name: "Planta alta", roofs: [] });
    expect(roofLevel(ed.project)).toBe(0);
    ed.project.levels[1].roofs = [{ ...ed.project.levels[0].roofs[0] }];
    expect(roofLevel(ed.project)).toBe(1);
  });
  it("reconoce el cubo de escalera y descuenta pretil y hueco de la superficie", () => {
    const { ed, r } = flatWithStairHole();
    const s = roofSummary(ed.model as never, r);
    expect(s.holes).toHaveLength(1);
    expect(s.holes[0].stair).toBe(true);
    expect(s.parapet?.h).toBeCloseTo(0.6);
    expect(s.gargoyles).toHaveLength(2);
    const t = s.parapet!.t;
    expect(s.net).toBeCloseTo((s.w - 2 * t) * (s.d - 2 * t) - s.holes[0].area, 6);
    expect(s.coping).toBeCloseTo(s.nla + 0.65, 6);
  });
});
