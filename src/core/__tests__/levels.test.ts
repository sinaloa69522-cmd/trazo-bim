import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { polygonArea } from "../geometry";
import { normalizeProject, sampleModel } from "../model";

describe("niveles", () => {
  it("crea un nivel vacío encima y deja el de abajo como referencia", () => {
    const ed = new Editor();
    ed.addLevel(false);
    expect(ed.project.levels).toHaveLength(2);
    expect(ed.model.walls).toHaveLength(0);
    expect(ed.model.elev).toBeCloseTo(3); // muros de 2.7 + 0.3 de losa
    expect(ed.levelBelow()?.name).toBe("Planta baja");
  });

  it("duplica el nivel activo sin compartir objetos", () => {
    const ed = new Editor();
    const n = ed.model.walls.length;
    ed.addLevel(true);
    expect(ed.model.walls).toHaveLength(n);
    ed.model.walls[0].x1 = 99;
    expect(ed.project.levels[0].walls[0].x1).toBe(0);
  });

  it("deshacer recupera el proyecto completo y el nivel activo", () => {
    const ed = new Editor();
    ed.addLevel(false);
    ed.deleteLevel();
    expect(ed.project.levels).toHaveLength(1);
    ed.undo();
    expect(ed.project.levels).toHaveLength(2);
    expect(ed.model.name).toBe("Planta 1");
  });

  it("cambiar la cota reordena los niveles y mantiene el activo", () => {
    const ed = new Editor();
    ed.addLevel(false);
    ed.setLevelElevation(-3);
    expect(ed.project.levels[0].elev).toBe(-3);
    expect(ed.active).toBe(0);
    expect(ed.levelBelow()).toBeNull();
  });

  it("acepta dibujos guardados de una sola planta", () => {
    const old = sampleModel() as unknown as Record<string, unknown>;
    delete old.slabs;
    const p = normalizeProject(old);
    expect(p.levels).toHaveLength(1);
    expect(p.levels[0]).toMatchObject({ name: "Planta baja", elev: 0, slabs: [] });
  });
});

describe("losas", () => {
  it("dibuja una losa cerrando en el primer punto y la exporta a DXF", () => {
    const ed = new Editor();
    ed.clear();
    ed.setTool("slab");
    for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }]) ed.commitPoint(p);
    expect(ed.model.slabs).toHaveLength(1);
    expect(polygonArea(ed.model.slabs[0].pts)).toBeCloseTo(12);
    expect(ed.sels).toEqual([{ type: "slab", id: ed.model.slabs[0].id }]);
    expect(toDxf(ed.model, null).split("A-LOSAS")).toHaveLength(5);
  });

  it("se selecciona con un clic dentro", () => {
    const ed = new Editor();
    ed.clear();
    ed.setTool("slab");
    for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]) ed.commitPoint(p);
    ed.runCommand("");
    expect(ed.model.slabs).toHaveLength(1);
    expect(ed.pick(3, 1)).toMatchObject({ type: "slab" });
  });
});
