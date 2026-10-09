import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { section } from "../elevation";
import { slabArea } from "../geometry";
import { toIfc } from "../ifc";
import { normalizeProject } from "../model";
import { reflection, transformElements } from "../transform";

/** Vivienda de ejemplo con una planta 1 encima (copia de la baja) y una escalera de 7,0 a 7,5. */
function twoStoreys() {
  const ed = new Editor();
  ed.addLevel(true);
  ed.setActiveLevel(0);
  ed.setTool("stair");
  ed.commitPoint({ x: 7, y: 1 });
  ed.commitPoint({ x: 7, y: 5.5 });
  return ed;
}

describe("huecos en losas", () => {
  it("la escalera abre su huella en la losa de arriba", () => {
    const ed = twoStoreys(), st = ed.model.stairs[0];
    ed.openAboveStair(st.id);
    const up = ed.project.levels[1].slabs[0];
    expect(up.holes).toHaveLength(1);
    expect(slabArea(up)).toBeCloseTo(70 - 4.5 * 1);
    ed.undo();
    expect(ed.project.levels[1].slabs[0].holes).toHaveLength(0);
  });

  it("el hueco se dibuja con dos esquinas y solo dentro de una losa", () => {
    const ed = new Editor();
    ed.setTool("hole");
    ed.commitPoint({ x: 12, y: 1 }); ed.commitPoint({ x: 13, y: 2 });
    expect(ed.model.slabs[0].holes).toHaveLength(0);
    ed.setTool("hole");
    ed.commitPoint({ x: 1, y: 1 }); ed.commitPoint({ x: 2, y: 3 });
    expect(ed.model.slabs[0].holes).toHaveLength(1);
    // dentro del hueco ya no se selecciona la losa
    expect(ed.pick(1.5, 2)?.type).not.toBe("slab");
  });

  it("la sección no rellena la losa en el hueco y el IFC lleva el perfil con vacíos", () => {
    const ed = twoStoreys();
    ed.openAboveStair(ed.model.stairs[0].id);
    const el = section(ed.project, { id: 0, x1: -1, y1: 3, x2: 11, y2: 3, name: "A" });
    // losa de arriba (cota 3): dos tramos, de x = 0 a 6.5 y de 7.5 a 10 (u = x + 1)
    const upper = el.faces.filter((f) => f.cut && f.kind === "cut" && Math.max(...f.pts.map((q) => q.z)) === ed.project.levels[1].elev && Math.min(...f.pts.map((q) => q.z)) < ed.project.levels[1].elev - 0.1);
    const spans = upper.filter((f) => Math.max(...f.pts.map((q) => q.u)) - Math.min(...f.pts.map((q) => q.u)) > 1).map((f) => [Math.min(...f.pts.map((q) => q.u)), Math.max(...f.pts.map((q) => q.u))]).sort((a, b) => a[0] - b[0]);
    expect(spans).toHaveLength(2);
    expect(spans[0][1]).toBeCloseTo(7.5); expect(spans[1][0]).toBeCloseTo(8.5);
    expect(toIfc(ed.project)).toContain("IFCARBITRARYPROFILEDEFWITHVOIDS");
  });

  it("los huecos se mueven y reflejan con la losa, y los proyectos antiguos se cargan sin ellos", () => {
    const ed = twoStoreys();
    ed.openAboveStair(ed.model.stairs[0].id);
    const m = ed.project.levels[1], sl = m.slabs[0];
    transformElements(m, [{ type: "slab", id: sl.id }], reflection({ x: 5, y: 0 }, { x: 5, y: 1 }), false);
    expect(Math.min(...sl.holes[0].map((q) => q.x))).toBeCloseTo(2.5);
    const old = normalizeProject({ levels: [{ name: "PB", elev: 0, slabs: [{ id: 1, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], thick: 0.2 }] }] });
    expect(old.levels[0].slabs[0].holes).toEqual([]);
  });
});

describe("duplicar la planta de arriba", () => {
  it("sube la cubierta a la copia", () => {
    const ed = new Editor();
    ed.addLevel(true);
    expect(ed.project.levels[0].roofs).toHaveLength(0);
    expect(ed.project.levels[1].roofs).toHaveLength(1);
    // la copia de una planta intermedia también va arriba del todo, y la cubierta sube con ella
    ed.setActiveLevel(0);
    ed.addLevel(true);
    expect(ed.project.levels[1].roofs).toHaveLength(0);
    expect(ed.project.levels[2].roofs).toHaveLength(1);
  });

  it("un nivel nuevo vacío también se lleva la cubierta", () => {
    const ed = new Editor();
    ed.addLevel(false);
    expect(ed.project.levels[0].roofs).toHaveLength(0);
    expect(ed.project.levels[1].roofs).toHaveLength(1);
  });

  it("una cubierta que quedó abajo se puede subir al nivel de arriba", () => {
    const ed = new Editor();
    ed.addLevel(true);
    const up = ed.project.levels[1], r = up.roofs.pop()!;
    ed.project.levels[0].roofs.push(r);
    ed.setActiveLevel(0);
    ed.moveRoofUp(r.id);
    expect(ed.project.levels[0].roofs).toHaveLength(0);
    expect(up.roofs).toHaveLength(1);
    expect(up.roofs[0].base).toBeCloseTo(Math.max(...up.walls.map((w) => w.height)));
  });
});
