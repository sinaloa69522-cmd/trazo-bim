import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { guid, str, toIfc } from "../ifc";
import { sampleProject } from "../model";

const count = (text: string, t: string) => (text.match(new RegExp(`=${t}\\(`, "g")) ?? []).length;

describe("exportación IFC", () => {
  it("escribe un IFC4 con la estructura espacial y los elementos del modelo", () => {
    const text = toIfc(sampleProject());
    expect(text.startsWith("ISO-10303-21;")).toBe(true);
    expect(text).toContain("FILE_SCHEMA(('IFC4'));");
    expect(text.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    for (const t of ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCROOF"]) expect(count(text, t)).toBe(1);
    expect(count(text, "IFCWALL")).toBe(6);
    expect(count(text, "IFCDOOR")).toBe(3);
    expect(count(text, "IFCWINDOW")).toBe(5);
    expect(count(text, "IFCOPENINGELEMENT")).toBe(8);
    expect(count(text, "IFCRELFILLSELEMENT")).toBe(8);
    expect(count(text, "IFCSLAB")).toBe(1);
    expect(count(text, "IFCSPACE")).toBe(3);
  });

  it("un nivel por planta, a su cota, y todas las referencias existen", () => {
    const ed = new Editor();
    ed.addLevel(true);
    ed.setTool("stair"); ed.commitPoint({ x: 7, y: 1 }); ed.commitPoint({ x: 7, y: 5 });
    const text = toIfc(ed.project);
    expect(text).toMatch(/IFCBUILDINGSTOREY\('[^']+',\$,'Planta 1',\$,\$,#\d+,\$,\$,\.ELEMENT\.,3\.\)/);
    expect(count(text, "IFCSTAIR")).toBe(1);
    const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => m[1]));
    const used = [...text.matchAll(/#(\d+)/g)].map((m) => m[1]);
    expect(used.every((n) => defined.has(n))).toBe(true);
  });

  it("invierte la Y de la planta (en IFC el eje Y apunta al norte)", () => {
    const p = sampleProject();
    p.levels[0].walls[1].y1 = 0; // muro (10,0)-(10,7)
    const text = toIfc(p);
    expect(text).toContain("IFCDIRECTION((0.,-1.,0.))");
  });

  it("codifica acentos y comillas como pide STEP", () => {
    expect(str("Baño d'Ana")).toBe("'Ba\\X2\\00F1\\X0\\o d''Ana'");
  });

  it("los GlobalId tienen 22 caracteres válidos y no se repiten", () => {
    const text = toIfc(sampleProject());
    const ids = [...text.matchAll(/\('([0-9A-Za-z_$]{22})',/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(30);
    expect(new Set(ids).size).toBe(ids.length);
    expect(guid(() => 0.999)).toMatch(/^3\${21}$/);
  });
});
