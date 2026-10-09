import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toIfc } from "../ifc";
import { normalizeProject, sampleProject } from "../model";
import { wallSchedule } from "../schedules";
import { GENERIC, typeForThick, wallTypeLabel } from "../wallTypes";

describe("tipos de muro", () => {
  it("la vivienda de ejemplo tiene fachada de ladrillo y tabiques", () => {
    const rows = wallSchedule(sampleProject());
    expect(rows.map((r) => r.type)).toEqual(["Fachada de ladrillo 25", "Tabique de ladrillo 12"]);
    const fachada = rows[0];
    expect(fachada.count).toBe(4);
    expect(fachada.length).toBeCloseTo(34);
    // 34 m × 2.7 m menos 5 ventanas de 1.2 m de alto y una puerta de 2.1 m
    expect(fachada.area).toBeCloseTo(34 * 2.7 - (1.6 + 1.2 + 2.0 + 1.0 + 1.5) * 1.2 - 1.0 * 2.1);
  });

  it("cambiar el tipo fija el espesor; el genérico conserva el suyo", () => {
    const ed = new Editor(), w = ed.model.walls[4];
    ed.setWallType([w.id], "muro-hormigon");
    expect(w.thick).toBe(0.3);
    ed.setWallType([w.id], GENERIC);
    expect(w.thick).toBe(0.3);
    expect(wallTypeLabel(w)).toBe("Muro genérico 30");
    ed.undo(); ed.undo();
    expect(ed.model.walls[4].thick).toBe(0.12);
  });

  it("los muros nuevos usan el tipo por defecto y los antiguos lo deducen del espesor", () => {
    const ed = new Editor();
    ed.defaults.wallType = "tabique-yeso"; ed.defaults.thick = 0.1;
    ed.setTool("wall"); ed.commitPoint({ x: 20, y: 0 }); ed.commitPoint({ x: 23, y: 0 });
    expect(ed.model.walls[ed.model.walls.length - 1].type).toBe("tabique-yeso");
    expect(typeForThick(0.25)).toBe("fachada-ladrillo");
    const p = normalizeProject({ levels: [{ name: "PB", elev: 0, walls: [{ id: 1, x1: 0, y1: 0, x2: 1, y2: 0, thick: 0.17, height: 2.5 }] }] });
    expect(p.levels[0].walls[0].type).toBe(GENERIC);
  });

  it("el IFC nombra los muros por su tipo y les asocia el material", () => {
    const ifc = toIfc(sampleProject());
    expect(ifc).toContain("'Fachada de ladrillo 25'");
    expect(ifc).toMatch(/IFCRELASSOCIATESMATERIAL\([^;]*IFCMATERIAL|IFCMATERIAL\('Ladrillo cer\\X2\\00E1\\X0\\mico'/);
  });
});
