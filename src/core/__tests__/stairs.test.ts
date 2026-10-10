import { describe, expect, it } from "vitest";
import { pointInPolygon } from "../geometry";
import type { Stair, StairKind } from "../model";
import { stairGeom, stairLenFor } from "../stairs";

const st = (kind: StairKind, x2 = 4.5, turn: 1 | -1 = 1): Stair => ({ id: 1, x1: 0, y1: 0, x2, y2: 0, width: 1, height: 2.8, kind, turn });
const centroid = (ps: { x: number; y: number }[]) => ({ x: ps.reduce((t, p) => t + p.x, 0) / ps.length, y: ps.reduce((t, p) => t + p.y, 0) / ps.length });

describe("tipos de escalera", () => {
  for (const kind of ["recta", "descanso", "L", "U", "caracol"] as StairKind[]) {
    it(`${kind}: una pieza por contrahuella, llega al desnivel y cabe en su contorno`, () => {
      const g = stairGeom(st(kind, kind === "caracol" ? 1.1 : 4.5));
      const steps = g.pieces.filter((p) => p.part !== "post");
      expect(g.n).toBe(16);
      expect(steps.length).toBe(g.n);
      expect(Math.max(...steps.map((p) => p.z))).toBeCloseTo(2.8);
      steps.forEach((p, i) => expect(p.z).toBeCloseTo((i + 1) * g.riser));
      for (const p of steps) expect(pointInPolygon(centroid(p.pts), g.outline)).toBe(true);
      expect(g.L).toBeGreaterThan(0);
    });
  }

  it("con descanso, en L y en U llevan un descanso", () => {
    for (const k of ["descanso", "L", "U"] as StairKind[]) expect(stairGeom(st(k)).pieces.filter((p) => p.part === "landing").length).toBe(1);
    expect(stairGeom(st("recta")).pieces.some((p) => p.part === "landing")).toBe(false);
  });

  it("la L gira hacia el lado elegido y la U ocupa dos anchos", () => {
    const yr = Math.max(...stairGeom(st("L", 4.5, 1)).outline.map((p) => p.y)), yl = Math.min(...stairGeom(st("L", 4.5, -1)).outline.map((p) => p.y));
    expect(yr).toBeGreaterThan(1.5); expect(yl).toBeLessThan(-1.5);
    const u = stairGeom(st("U")).outline.map((p) => p.y);
    expect(Math.max(...u) - Math.min(...u)).toBeCloseTo(2.1);
  });

  it("el caracol tiene poste central y el radio es el poste más el ancho", () => {
    const g = stairGeom(st("caracol", 1.1));
    expect(g.pieces.filter((p) => p.part === "post").length).toBe(1);
    expect(Math.max(...g.outline.map((p) => Math.hypot(p.x, p.y)))).toBeCloseTo(1.1);
  });
});

describe("largo por huella", () => {
  it("stairLenFor da la línea con la que la huella queda justa", () => {
    for (const k of ["recta", "descanso", "L", "U"] as StairKind[]) {
      const s = st(k), L = stairLenFor(s, 0.28);
      expect(stairGeom({ ...s, x2: L }).tread).toBeCloseTo(0.28);
    }
  });
});
