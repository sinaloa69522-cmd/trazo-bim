import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { FURNITURE, FURNITURE_CATS, furnitureOutline, furnitureSolids, furnitureToPlan } from "../furniture";
import { toIfc } from "../ifc";
import { emptyModel, sampleProject } from "../model";
import { reflection, transformElements, translation } from "../transform";

describe("mobiliario", () => {
  it("el catálogo tiene trazos dentro de su caja", () => {
    for (const f of FURNITURE) {
      const pts = f.draw().flatMap((s) => s.pts);
      expect(pts.every((p) => Math.abs(p.x) <= f.w / 2 + 1e-9 && Math.abs(p.y) <= f.d / 2 + 1e-9)).toBe(true);
    }
  });

  it("gira en sentido horario en planta", () => {
    const p = furnitureToPlan({ x: 1, y: 1, rot: 90 }, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(1); expect(p.y).toBeCloseTo(2);
  });

  it("se coloca con clic, gira con R y se selecciona", () => {
    const ed = new Editor();
    ed.clear();
    ed.pickFurniture("sofa");
    expect(ed.tool).toBe("furniture");
    ed.runCommand("R");
    ed.commitPoint({ x: 2, y: 3 });
    const f = ed.model.furniture[0];
    expect(f).toMatchObject({ kind: "sofa", x: 2, y: 3, rot: 90 });
    ed.setTool("select");
    expect(ed.pick(2, 3.8)).toEqual({ type: "furniture", id: f.id }); // girado: 2 m de largo en vertical
    expect(ed.pick(2.9, 3)).toBeNull();
  });

  it("mover y simetría conservan la pieza y ajustan el giro", () => {
    const m = emptyModel();
    m.furniture.push({ id: 1, kind: "bed1", x: 1, y: 1, rot: 0 });
    m.nid = 2;
    transformElements(m, [{ type: "furniture", id: 1 }], translation(2, 0), false);
    expect(m.furniture[0]).toMatchObject({ x: 3, y: 1, rot: 0 });
    // simetría respecto a una recta horizontal: la cama mira al otro lado
    const [c] = transformElements(m, [{ type: "furniture", id: 1 }], reflection({ x: 0, y: 2 }, { x: 10, y: 2 }), true);
    const copy = m.furniture.find((f) => f.id === c.id)!;
    expect(copy.y).toBeCloseTo(3);
    expect(furnitureOutline(copy).every((p) => p.y >= 1.99)).toBe(true);
    expect(copy.rot).toBeCloseTo(180); // el cabecero queda junto al eje, como en un espejo
  });

  it("sale en DXF (A-MOBILIARIO) y en IFC como mueble o aparato sanitario", () => {
    const p = sampleProject();
    expect(toDxf(p.levels[0], null)).toContain("A-MOBILIARIO");
    const ifc = toIfc(p);
    expect(ifc).toMatch(/=IFCFURNITURE\('[^']+',\$,'Cama doble'/);
    expect(ifc).toMatch(/=IFCSANITARYTERMINAL\('[^']+',\$,'Inodoro',.*\.TOILETPAN\.\)/);
  });

  it("catálogo por grupos, con vehículos, personas y vegetación", () => {
    expect(FURNITURE_CATS).toEqual(expect.arrayContaining(["Dormitorio", "Estar", "Baño", "Exterior y jardín", "Vehículos", "Personas", "Vegetación"]));
    expect(new Set(FURNITURE.map((f) => f.kind)).size).toBe(FURNITURE.length);
    expect(FURNITURE.length).toBeGreaterThanOrEqual(60);
    // el árbol tiene tronco y copa redonda de su color, por encima del suelo
    const [trunk, crown] = furnitureSolids("treeM");
    expect(trunk.shape).toBe("cyl");
    expect(crown).toMatchObject({ shape: "sphere", w: 4 });
    expect(crown.z0 + crown.h).toBeCloseTo(5.5);
  });

  it("árboles, coches y personas salen en IFC como elemento geográfico o genérico", () => {
    const p = sampleProject();
    p.levels[0].furniture.push({ id: 900, kind: "treeL", x: 15, y: 3, rot: 0 }, { id: 901, kind: "car", x: 15, y: 9, rot: 0 }, { id: 902, kind: "person", x: 12, y: 9, rot: 0 });
    const ifc = toIfc(p);
    expect(ifc).toMatch(/=IFCGEOGRAPHICELEMENT\('[^']+',\$,'[^']*rbol grande/);
    expect(ifc).toMatch(/=IFCBUILDINGELEMENTPROXY\('[^']+',\$,'Autom[^']*sed[^']*n'/);
    expect(ifc).toMatch(/=IFCBUILDINGELEMENTPROXY\('[^']+',\$,'Persona de pie'/);
  });
});
