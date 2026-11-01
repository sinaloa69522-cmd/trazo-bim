import { describe, expect, it } from "vitest";
import { sampleProject } from "../model";
import { contours, earthwork, retainingWalls, terrainModel } from "../terrain";

describe("terreno con pendiente", () => {
  it("plano: sin modelo de terreno", () => {
    expect(terrainModel(sampleProject())).toBeNull();
  });
  it("10 % hacia el sur: el norte queda arriba, muros de contención y corte = relleno", () => {
    const p = { ...sampleProject(), terrain: { slope: 10, dir: 180, pad: 2, step: 0.5 } };
    const tm = terrainModel(p)!;
    // casa de 10 × 7 (y 0..7), plataforma 2 m más grande
    expect(tm.pad).toEqual({ x0: -2, y0: -2, x1: 12, y1: 9 });
    expect(tm.natural({ x: 5, y: -2 })).toBeCloseTo(0.55);   // norte, cuesta arriba
    expect(tm.natural({ x: 5, y: 9 })).toBeCloseTo(-0.55);   // sur, cuesta abajo
    expect(tm.at({ x: 5, y: 3 })).toBe(0);
    const ws = retainingWalls(tm);
    expect(ws.map((w) => w.side).sort()).toEqual(["este", "norte", "oeste", "sur"]);
    expect(ws.find((w) => w.side === "norte")!.max).toBeCloseTo(0.55);
    const e = earthwork(tm);
    expect(e.cut).toBeCloseTo(e.fill, 1);
    expect(e.cut).toBeCloseTo((14 * 11) / 2 * 0.55 / 2, 0);
    const cs = contours(tm, { x0: -10, y0: -10, x1: 20, y1: 17 });
    expect(cs.map((c) => c.z)).toEqual([-1, -0.5, 0.5, 1]);
    // ninguna curva pasa por dentro de la plataforma
    for (const c of cs) for (const [a, b] of c.segs) { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; expect(m.x > -2 && m.x < 12 && m.y > -2 && m.y < 9).toBe(false); }
  });
});
