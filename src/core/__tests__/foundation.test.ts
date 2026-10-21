import { describe, expect, it } from "vitest";
import { FOUNDATIONS, foundation, foundationType } from "../foundation";
import { normalizeProject, sampleProject } from "../model";

describe("tipos de cimentación", () => {
  it("cada tipo genera piezas válidas", () => {
    for (const f of FOUNDATIONS) {
      const p = { ...sampleProject(), foundation: f.id }, ms = foundation(p);
      expect(ms.length).toBeGreaterThan(0);
      for (const m of ms) for (const q of [m.a, m.b]) expect(Number.isFinite(q.x + q.y + q.z)).toBe(true);
    }
  });

  it("por defecto es losa con zapatas", () => {
    expect(foundationType(sampleProject()).id).toBe("slab");
  });

  it("crawl space y sótano llevan muros de cimentación y piso de madera bajo la cota 0", () => {
    for (const id of ["crawl", "basement"] as const) {
      const ms = foundation({ ...sampleProject(), foundation: id });
      expect(ms.some((m) => m.kind === "foundation")).toBe(true);
      expect(ms.some((m) => m.kind === "floorJoist" && m.a.z < 0)).toBe(true);
    }
    const bs = foundation({ ...sampleProject(), foundation: "basement" });
    expect(Math.min(...bs.map((m) => Math.min(m.a.z, m.b.z)))).toBeLessThan(-2);
  });

  it("pilares y vigas genera pilares y vigas portantes", () => {
    const ms = foundation({ ...sampleProject(), foundation: "pier" });
    expect(ms.some((m) => m.kind === "pier")).toBe(true);
    expect(ms.some((m) => m.kind === "girder")).toBe(true);
  });

  it("crawl space con muros delgados (2x4): muro de block corrido en el contorno y pilares solo dentro", () => {
    const p = sampleProject(), lv = p.levels[0], w0 = lv.walls[0];
    const mk = (id: number, x1: number, y1: number, x2: number, y2: number) => ({ ...w0, id, x1, y1, x2, y2, thick: 0.12 });
    lv.walls = [mk(1, 0, 0, 10, 0), mk(2, 10, 0, 10, 8), mk(3, 10, 8, 0, 8), mk(4, 0, 8, 0, 0), mk(5, 5, 0, 5, 8)];
    lv.openings = [];
    const ms = foundation({ ...p, foundation: "crawl" }), fw = ms.filter((m) => m.kind === "foundation");
    expect(fw).toHaveLength(4);
    expect(fw.reduce((s, m) => s + Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y), 0)).toBeGreaterThan(36);
    // los pilares quedan en el muro interior (x = 5), no en el contorno
    const piers = ms.filter((m) => m.kind === "pier");
    expect(piers.length).toBeGreaterThan(0);
    for (const m of piers) expect(Math.abs(m.a.x - 5)).toBeLessThan(1e-6);
  });

  it("el tipo se conserva al normalizar el proyecto", () => {
    const p = normalizeProject(JSON.parse(JSON.stringify({ ...sampleProject(), foundation: "crawl" })));
    expect(p.foundation).toBe("crawl");
  });
});
