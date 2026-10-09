import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { attachWalls, normalizeProject, sampleProject } from "../model";

describe("muros hasta la losa de arriba", () => {
  it("al crear una planta encima, los muros de abajo llegan a la cara inferior de su losa", () => {
    const ed = new Editor();
    ed.addLevel(true); // Planta 1 a 3.00 con losa de 0.20
    const pb = ed.project.levels[0];
    // las fachadas suben hasta el nivel; los tabiques interiores, hasta la cara inferior de la losa
    const facade = pb.walls.filter((w) => w.thick === 0.25), inner = pb.walls.filter((w) => w.thick < 0.25);
    expect(facade.every((w) => Math.abs(w.height - 3) < 1e-9)).toBe(true);
    expect(inner.every((w) => Math.abs(w.height - 2.8) < 1e-9)).toBe(true);
    // la planta de arriba es la última: conserva su altura
    expect(ed.project.levels[1].walls.every((w) => w.height === 2.7)).toBe(true);
    // si se sube la planta, los muros la siguen
    ed.setActiveLevel(1);
    ed.setLevelElevation(3.2);
    expect(inner[0].height).toBeCloseTo(3.0);
  });

  it("los muros desenlazados conservan su altura, y sin losa encima llegan al nivel", () => {
    const p = sampleProject();
    p.levels.push({ ...normalizeProject({}).levels[0], name: "P1", elev: 3 });
    p.levels[0].walls[0].attach = false;
    expect(attachWalls(p)).toBe(p.levels[0].walls.length - 1);
    expect(p.levels[0].walls[0].height).toBe(2.7);
    expect(p.levels[0].walls[1].height).toBe(3);
  });

  it("los proyectos guardados antes cargan los muros enlazados", () => {
    const p = normalizeProject({ levels: [{ name: "PB", elev: 0, walls: [{ id: 1, x1: 0, y1: 0, x2: 1, y2: 0, thick: 0.2, height: 2.5 }] }] });
    expect(p.levels[0].walls[0].attach).toBe(true);
  });
});
