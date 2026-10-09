import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { normalizeProject, sampleModel, sampleProject } from "../model";
import { levelMarks, openingSchedule, roomSchedule } from "../schedules";

describe("tablas de planificación", () => {
  it("agrupa las puertas por medidas y las numera de menor a mayor", () => {
    const { types } = openingSchedule(sampleProject(), "door");
    expect(types.map((t) => [t.mark, t.width, t.count])).toEqual([["P1", 0.8, 2], ["P2", 1, 1]]);
  });

  it("cuenta los huecos de todos los niveles y da la marca de cada uno", () => {
    const ed = new Editor();
    ed.addLevel(true);
    const { types } = openingSchedule(ed.project, "window");
    expect(types.reduce((s, t) => s + t.count, 0)).toBe(10);
    expect(types[0].perLevel).toEqual([{ level: "Planta baja", count: 1 }, { level: "Planta 1", count: 1 }]);
    const marks = levelMarks(ed.project, 1);
    expect(marks.size).toBe(ed.model.openings.length);
    expect([...marks.values()]).toContain("P1");
  });

  it("suma las superficies útiles de los espacios cerrados", () => {
    const rows = roomSchedule(sampleProject());
    expect(rows.map((r) => r.name)).toEqual(["Dormitorio", "Baño", "Estar-comedor"]);
    expect(rows.reduce((s, r) => s + r.area, 0)).toBeGreaterThan(60);
  });

  it("los datos del cajetín se guardan y se recuperan con deshacer", () => {
    const ed = new Editor();
    ed.setInfo({ author: "Arq. Pérez" });
    expect(ed.project.info.author).toBe("Arq. Pérez");
    ed.undo();
    expect(ed.project.info.author).toBe("");
    expect(normalizeProject(sampleModel()).info.name).toBeTruthy();
  });
});
