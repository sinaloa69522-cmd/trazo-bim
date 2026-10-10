import { describe, expect, it } from "vitest";
import { dir } from "../geometry";
import { normalizeProject, sampleProject } from "../model";
import { axes, beams, beamSection, castillos, MAX_K, padFootings, slabPanels, slabThickness, stripFootings } from "../mxStruct";
import { transformElements, translation } from "../transform";

describe("estructura en metros (México)", () => {
  it("castillos en las esquinas y a no más de 3 m sobre cada muro", () => {
    const lv = sampleProject().levels[0], ks = castillos(lv);
    for (const w of lv.walls) for (const p of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) expect(ks.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < 0.3)).toBe(true);
    for (const w of lv.walls) {
      const { L, ux, uy } = dir(w);
      const s = ks.filter((k) => Math.abs((k.x - w.x1) * uy - (k.y - w.y1) * ux) < w.thick / 2 + 0.05)
        .map((k) => (k.x - w.x1) * ux + (k.y - w.y1) * uy).filter((t) => t > -0.3 && t < L + 0.3).sort((a, b) => a - b);
      for (let i = 0; i + 1 < s.length; i++) expect(s[i + 1] - s[i]).toBeLessThanOrEqual(MAX_K + 0.1);
    }
  });

  it("zapata corrida bajo cada muro y más ancha con dos niveles", () => {
    const p = sampleProject(), one = stripFootings(p);
    expect(one).toHaveLength(p.levels[0].walls.length);
    expect(one.find((z) => z.mark === "ZC-1")!.B).toBeCloseTo(0.6);
    const two = { ...p, levels: [p.levels[0], { ...p.levels[0], name: "Alta", elev: 3 }] };
    expect(stripFootings(two).find((z) => z.mark === "ZC-1")!.B).toBeGreaterThan(0.6);
  });

  it("cada columna lleva zapata aislada, sus trabes y un eje", () => {
    const p = sampleProject(), lv = p.levels[0];
    lv.columns = [{ id: 900, x: 2, y: 9.5, w: 0.3, d: 0.3 }, { id: 901, x: 5, y: 9.5, w: 0.3, d: 0.3 }];
    expect(padFootings(p)).toHaveLength(2);
    const bs = beams(lv).filter((b) => b.why === "column");
    // entre las dos columnas y de cada una al muro de fachada
    expect(bs.some((b) => Math.abs(b.span - 3) < 0.01)).toBe(true);
    expect(bs.filter((b) => Math.abs(b.span - 2.5) < 0.01)).toHaveLength(2);
    expect(axes(lv).y.some((a) => Math.abs(a.v - 9.5) < 1e-6)).toBe(true);
  });

  it("trabe con peralte de L/12 y losa de perímetro / 180", () => {
    expect(beamSection(4).h).toBeCloseTo(0.35);
    expect(beamSection(2).h).toBeCloseTo(0.3);
    expect(slabThickness(4, 5)).toBeCloseTo(0.1);
    expect(slabThickness(5, 6)).toBeCloseTo(0.13);
    const ps = slabPanels(sampleProject().levels[0]);
    expect(ps.length).toBe(3);
    for (const s of ps) expect(s.e).toBeGreaterThanOrEqual(0.1);
  });

  it("las columnas se guardan, se mueven y se borran", () => {
    const p = sampleProject();
    p.levels[0].columns = [{ id: 900, x: 1, y: 1, w: 0.3, d: 0.4 }];
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(n.levels[0].columns).toHaveLength(1);
    transformElements(n.levels[0], [{ type: "column", id: 900 }], translation(2, 0), false);
    expect(n.levels[0].columns[0].x).toBeCloseTo(3);
    const old = JSON.parse(JSON.stringify(sampleProject()));
    delete old.levels[0].columns;
    expect(normalizeProject(old).levels[0].columns).toEqual([]);
  });
});
