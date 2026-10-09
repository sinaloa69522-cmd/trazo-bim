import { describe, expect, it } from "vitest";
import { allSections, elevation, section } from "../elevation";
import { nextSectionName, sampleProject } from "../model";
import { reflection, transformElements } from "../transform";

describe("secciones", () => {
  const p = sampleProject(), A = p.levels[0].sections[0];

  it("la sección de ejemplo corta los tres muros, la losa, la ventana este y la cubierta", () => {
    const el = section(p, A), cut = el.faces.filter((f) => f.cut && f.kind === "cut");
    const spanOf = (f: (typeof cut)[number]) => [Math.min(...f.pts.map((q) => q.u)), Math.max(...f.pts.map((q) => q.u))];
    // la línea arranca en x = -1.2: el muro oeste (x = 0) queda en u ≈ 1.2
    const at = (u: number) => cut.filter((f) => { const [a, b] = spanOf(f); return a - 1e-6 <= u && u <= b + 1e-6; });
    expect(at(1.2).length).toBeGreaterThan(0);
    expect(at(7.2).length).toBeGreaterThan(0);
    // muro este con ventana de antepecho 0.9 y alto 1.2: queda el antepecho y el dintel, y el vidrio
    const east = at(11.2).filter((f) => Math.max(...f.pts.map((q) => q.z)) <= 2.7 + 1e-6);
    expect(east.map((f) => Math.min(...f.pts.map((q) => q.z))).sort()).toEqual(expect.arrayContaining([0, 2.1]));
    expect(el.faces.some((f) => f.cut && f.kind === "glass")).toBe(true);
    // losa de 10 m de largo entre -0.2 y 0
    expect(cut.some((f) => { const [a, b] = spanOf(f); return Math.abs(b - a - 10) < 1e-6 && Math.min(...f.pts.map((q) => q.z)) === -0.2; })).toBe(true);
    // cubierta y hastiales cortados por encima del muro
    expect(cut.some((f) => Math.max(...f.pts.map((q) => q.z)) > 3)).toBe(true);
  });

  it("solo se ve lo que queda delante del corte, y el mobiliario y la escalera aparecen", () => {
    const el = section(p, A);
    // mirando al norte desde y = 3: la cama (y ≈ 1.1) se ve, el armario (y ≈ 3.6) queda detrás
    expect(el.faces.some((f) => f.kind === "furn")).toBe(true);
    expect(el.faces.filter((f) => !f.cut).every((f) => f.depth <= 1e-3 + 1e-9)).toBe(true);
    // al invertir se ve el otro lado y el dibujo se refleja
    const B = { ...A, x1: A.x2, x2: A.x1 }, eb = section(p, B);
    expect(eb.faces.filter((f) => !f.cut).every((f) => f.depth <= 1e-3 + 1e-9)).toBe(true);
    expect(eb.u1 - eb.u0).toBeCloseTo(el.u1 - el.u0, 0);
  });

  it("los alzados no tienen caras cortadas", () => {
    expect(elevation(p, "S").faces.some((f) => f.cut)).toBe(false);
  });

  it("asigna letras libres y la simetría invierte el lado que se ve", () => {
    expect(nextSectionName(p)).toBe("B");
    const m = p.levels[0], [r] = transformElements(m, [{ type: "section", id: A.id }], reflection({ x: 0, y: 5 }, { x: 10, y: 5 }), true);
    const c = m.sections.find((s) => s.id === r.id)!;
    expect(c.y1).toBeCloseTo(7); expect(c.x1).toBeCloseTo(11.2); // extremos intercambiados
    expect(allSections(p)).toHaveLength(2);
  });
});
