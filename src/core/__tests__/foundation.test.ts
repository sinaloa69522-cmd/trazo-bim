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
      expect(ms.some((m) => m.kind === "joist" && m.a.z < 0)).toBe(true);
    }
    const bs = foundation({ ...sampleProject(), foundation: "basement" });
    expect(Math.min(...bs.map((m) => Math.min(m.a.z, m.b.z)))).toBeLessThan(-2);
  });

  it("pilares y vigas genera pilares y vigas portantes", () => {
    const ms = foundation({ ...sampleProject(), foundation: "pier" });
    expect(ms.some((m) => m.kind === "pier")).toBe(true);
    expect(ms.some((m) => m.kind === "girder")).toBe(true);
  });

  it("el tipo se conserva al normalizar el proyecto", () => {
    const p = normalizeProject(JSON.parse(JSON.stringify({ ...sampleProject(), foundation: "crawl" })));
    expect(p.foundation).toBe("crawl");
  });
});
