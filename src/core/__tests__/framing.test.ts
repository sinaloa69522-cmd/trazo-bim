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
    for (const k of ["footing", "plate", "stud", "header", "ceilingJoist", "blocking", "rafter", "collar", "ridge", "fascia"]) expect(kinds.has(k as never)).toBe(true);
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
  /** Cara inferior del primer cabio en la cara exterior de la solera del muro de alero (y = 0). */
  const heelBottom = (p: ReturnType<typeof sampleProject>) => {
    const r = p.levels[0].roofs[0], ms = framing(p), tan = Math.tan((r.pitch * Math.PI) / 180);
    const c = ms.find((m) => m.kind === "rafter" && Math.abs(m.a.y - (Math.min(r.y1, r.y2) - r.overhang)) < 1e-6)!;
    const plate = 5.5 * 0.0254, y = -plate / 2, half = c.h / 2 / Math.cos(Math.atan(tan));
    return { z: c.a.z + (y - c.a.y) * tan - half, plateTop: Math.max(...ms.filter((m) => m.kind === "plate").map((m) => m.a.z + m.h / 2)) };
  };

  it("el talón del cabio apoya en la cara superior de la solera, sin meterse en ella", () => {
    const { z, plateTop } = heelBottom(sampleProject());
    expect(z).toBeCloseTo(plateTop, 3);
  });

  it("si los muros son más altos que el arranque de la cubierta, los cabios suben con la solera", () => {
    const p = sampleProject();
    for (const w of p.levels[0].walls) w.height = 9 * 12 * 0.0254;
    const { z, plateTop } = heelBottom(p);
    expect(plateTop).toBeCloseTo(9 * 12 * 0.0254, 3);
    expect(z).toBeCloseTo(plateTop, 3);
  });
});

describe("pisos y techos", () => {
  it("con una planta encima, sobre la doble solera va el piso: floor joists, rim joists, bloqueo y subpiso", async () => {
    const { Editor } = await import("../../editor/Editor");
    const ed = new Editor();
    ed.addLevel(true);
    const ms = framing(ed.project), up = ed.project.levels[1].elev;
    const fj = ms.filter((m) => m.kind === "floorJoist" && m.a.z < up);
    expect(fj.length).toBeGreaterThan(10);
    // apoyadas sobre la doble solera de la planta baja, con el subpiso enrasado con la cota de la planta de arriba
    const plateTop = Math.max(...ms.filter((m) => m.kind === "plate" && m.a.z < up).map((m) => m.a.z + m.h / 2));
    for (const m of fj) expect(m.a.z - m.h / 2).toBeCloseTo(plateTop, 3);
    const sf = ms.filter((m) => m.kind === "subfloor" && m.a.z < up + 0.1);
    for (const m of sf) expect(m.a.z + m.h / 2).toBeCloseTo(up, 3);
    for (const k of ["rim", "blocking", "subfloor"]) expect(ms.some((m) => m.kind === k)).toBe(true);
    // los ceiling joists solo en la última planta
    expect(ms.filter((m) => m.kind === "ceilingJoist").every((m) => m.a.z > ed.project.levels[1].elev)).toBe(true);
  });

  it("las collar ties van entre cabios opuestos, a 48\"", () => {
    const ms = framing(sampleProject()), c = ms.filter((m) => m.kind === "collar");
    expect(c.length).toBeGreaterThan(5);
    for (const m of c) expect(m.a.z).toBeCloseTo(m.b.z, 6);
  });
});
