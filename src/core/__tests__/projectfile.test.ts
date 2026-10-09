import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { parseProjectFile, projectFileName, serializeProject } from "../projectFile";
import { sampleProject } from "../model";

describe("archivo de proyecto", () => {
  it("guarda y vuelve a abrir el proyecto completo", () => {
    const ed = new Editor();
    ed.addLevel(true);
    ed.setPrice("04.01", 6000);
    ed.setInfo({ name: "Casa Peña" });
    expect(ed.dirty).toBe(true);
    const f = ed.saveFile();
    expect(f.name).toBe("casa-pena.trazo");
    expect(ed.dirty).toBe(false);
    const other = new Editor();
    expect(other.openFile(f.text, f.name)).toBe(true);
    expect(other.project).toEqual(ed.project);
    expect(other.dirty).toBe(false);
    // abrir se puede deshacer
    other.undo();
    expect(other.project.levels.length).toBe(1);
  });

  it("lleva cabecera con formato y versión", () => {
    const j = JSON.parse(serializeProject(sampleProject(), new Date("2026-01-02T03:04:05Z")));
    expect(j).toMatchObject({ format: "trazo-bim", version: 1, savedAt: "2026-01-02T03:04:05.000Z" });
    expect(j.project.levels[0].walls.length).toBe(6);
  });

  it("acepta el JSON del proyecto sin cabecera y modelos de una planta", () => {
    expect(parseProjectFile(JSON.stringify(sampleProject())).levels.length).toBe(1);
    const p = parseProjectFile(JSON.stringify({ walls: [], openings: [] }));
    expect(p.levels[0].name).toBe("Planta baja");
    expect(p.budget.currency).toBe("MXN");
  });

  it("rechaza archivos que no son proyectos sin tocar el actual", () => {
    expect(() => parseProjectFile("hola")).toThrow(/JSON/);
    expect(() => parseProjectFile('{"format":"otro"}')).toThrow(/desconocido/);
    expect(() => parseProjectFile('{"format":"trazo-bim","version":99,"project":{"levels":[]}}')).toThrow(/más nueva/);
    expect(() => parseProjectFile('{"a":1}')).toThrow(/nivel/);
    const ed = new Editor(), before = JSON.stringify(ed.project);
    expect(ed.openFile("no", "x.trazo")).toBe(false);
    expect(JSON.stringify(ed.project)).toBe(before);
    expect(ed.message).toContain("x.trazo");
  });

  it("el nombre del archivo sale del nombre del proyecto", () => {
    expect(projectFileName("Vivienda Ñuñoa / Fase 2")).toBe("vivienda-nunoa-fase-2.trazo");
    expect(projectFileName("")).toBe("proyecto.trazo");
  });
});
