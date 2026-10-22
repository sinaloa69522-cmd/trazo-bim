import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { framing, stairFrame } from "../framing";
import type { Stair } from "../model";

const stair = (kind: Stair["kind"], x2 = 0, y2 = 4): Stair => ({ id: 1, x1: 0, y1: 0, x2, y2, width: 1, height: 2.8, kind });

describe("escalera en la estructura de madera", () => {
  it("recta: tres zancas de 2x12 que suben del piso a la llegada, una huella y una contrahuella por peldaño", () => {
    const ms = stairFrame(stair("recta"), 0), st = ms.filter((m) => m.kind === "stringer");
    expect(st).toHaveLength(3);
    for (const m of st) { expect(m.size).toBe("2x12"); expect(m.b.z).toBeGreaterThan(2.4); expect(m.a.z).toBeLessThan(0.3); expect(m.b.y).toBeGreaterThan(m.a.y); }
    const treads = ms.filter((m) => m.size === "2x12 TREAD"), risers = ms.filter((m) => m.size === "1x8 RISER");
    expect(treads.length).toBe(risers.length);
    expect(Math.max(...treads.map((m) => m.a.z))).toBeCloseTo(2.8 - 0.75 * 0.0254, 3);
  });

  it("en L y con descanso: plataforma con postes de 4x4 y zancas en los dos tramos", () => {
    for (const k of ["L", "descanso", "U"] as const) {
      const ms = stairFrame(stair(k), 0);
      expect(ms.filter((m) => m.size === "4x4 POST")).toHaveLength(4);
      expect(ms.filter((m) => m.size === "2x12").length).toBeGreaterThanOrEqual(6);
    }
  });

  it("caracol: poste y peldaños", () => {
    const ms = stairFrame({ ...stair("caracol"), x2: 1, y2: 0 }, 0);
    expect(ms.some((m) => m.size === "STEEL POST")).toBe(true);
    expect(ms.filter((m) => m.kind === "tread").length).toBeGreaterThan(8);
  });

  it("el piso de arriba deja el hueco: ninguna vigueta cruza la escalera y lleva brochales", () => {
    const ed = new Editor();
    ed.setTool("stair"); ed.runCommand("7;-1"); ed.runCommand("7;-5");
    ed.addLevel(false);
    const ms = framing(ed.project), s = ed.project.levels[0].stairs[0], e1 = ed.project.levels[1].elev;
    const x0 = Math.min(s.x1, s.x2) - s.width / 2 + 0.05, x1 = Math.max(s.x1, s.x2) + s.width / 2 - 0.05, y0 = Math.min(s.y1, s.y2) + 0.05, y1 = Math.max(s.y1, s.y2) - 0.05;
    const joists = ms.filter((m) => m.kind === "floorJoist" && m.a.z > e1 - 0.4 && m.a.z < e1);
    expect(joists.length).toBeGreaterThan(5);
    const crosses = joists.filter((m) => {
      const mx0 = Math.min(m.a.x, m.b.x), mx1 = Math.max(m.a.x, m.b.x), my0 = Math.min(m.a.y, m.b.y), my1 = Math.max(m.a.y, m.b.y);
      return mx1 > x0 && mx0 < x1 && my1 > y0 && my0 < y1;
    });
    expect(crosses).toHaveLength(0);
    expect(ms.filter((m) => m.kind === "header" && m.a.z > e1 - 0.4 && m.a.z < e1).length).toBeGreaterThanOrEqual(2);
    expect(ms.filter((m) => m.kind === "stringer").length).toBe(3);
  });
});
