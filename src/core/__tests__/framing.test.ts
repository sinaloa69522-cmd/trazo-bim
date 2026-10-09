import { describe, expect, it } from "vitest";
import { actualDepth, framing, framingTakeoff } from "../framing";
import { sampleProject } from "../model";

describe("estructura de framing", () => {
  it("convierte escuadrías nominales en cantos reales", () => {
    expect(actualDepth("2x4")).toBeCloseTo(3.5 * 0.0254);
    expect(actualDepth("2x8 @ 16\" O.C.")).toBeCloseTo(7.25 * 0.0254);
    expect(actualDepth("11-7/8\" TJI")).toBeCloseTo(11.875 * 0.0254);
  });

  it("genera todas las piezas del ejemplo", () => {
    const p = sampleProject(), ms = framing(p), kinds = new Set(ms.map((m) => m.kind));
    for (const k of ["footing", "plate", "stud", "header", "joist", "rafter", "ridge"]) expect(kinds.has(k as never)).toBe(true);
    // un dintel por hueco y montantes a 16" en 47 m de muro
    expect(ms.filter((m) => m.kind === "header").length).toBe(p.levels[0].openings.length);
    expect(ms.filter((m) => m.kind === "stud").length).toBeGreaterThan(47 / 0.4064);
    for (const m of ms) for (const q of [m.a, m.b]) expect(Number.isFinite(q.x + q.y + q.z)).toBe(true);
  });

  it("los cabios suben del alero a la cumbrera", () => {
    const ms = framing(sampleProject()), rf = ms.filter((m) => m.kind === "rafter"), ridge = ms.find((m) => m.kind === "ridge")!;
    expect(rf.every((m) => m.b.z > m.a.z)).toBe(true);
    expect(Math.max(...rf.map((m) => m.b.z))).toBeLessThanOrEqual(ridge.a.z + ridge.h);
    const t = framingTakeoff(ms);
    expect(t.find((r) => r.kind === "stud")!.length).toBeGreaterThan(100);
  });
});

describe("cabios sobre la doble solera", () => {
  it("la cara inferior de los cabios en la línea del muro queda sobre la solera superior", () => {
    const p = sampleProject(), r = p.levels[0].roofs[0], ms = framing(p);
    const tan = Math.tan((r.pitch * Math.PI) / 180), rf = ms.filter((m) => m.kind === "rafter");
    const plateTop = Math.max(...ms.filter((m) => m.kind === "plate").map((m) => m.a.z + m.h / 2));
    // en la línea del muro (a un vuelo del alero) el eje del cabio está medio canto por encima de la solera
    const c = rf[0], dz = r.overhang * tan, half = c.h / 2 / Math.cos(Math.atan(tan));
    expect(c.a.z + dz - half).toBeCloseTo(plateTop, 3);
  });
});
