import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { elevation, section } from "../elevation";
import { levelText } from "../marks";
import { normalizeProject } from "../model";
import { transformElements, translation } from "../transform";

describe("símbolos de anotación", () => {
  it("el nivel en planta se pone de un clic y toma la cota del nivel más su desnivel", () => {
    const ed = new Editor();
    ed.runCommand("NV");
    expect(ed.tool).toBe("mark");
    expect(ed.prompt()).toMatch(/NIVEL.*N\.P\.T\. \+0\.00/);
    ed.commitPoint({ x: 2, y: 2 });
    const mk = ed.model.marks[0];
    expect(mk).toMatchObject({ kind: "nivel", x: 2, y: 2, label: "N.P.T." });
    expect(levelText(mk, ed.model.elev)).toBe("N.P.T. +0.00");
    expect(levelText({ ...mk, dz: -0.15 }, 2.7)).toBe("N.P.T. +2.55");
    ed.setTool("select");
    expect(ed.pick(2.2, 2.05)).toEqual({ type: "mark", id: mk.id });
    ed.undo();
    expect(ed.model.marks).toHaveLength(0);
  });

  it("la llamada de detalle va en tres clics y se numera sola, también al copiarla", () => {
    const ed = new Editor();
    ed.runCommand("LD");
    ed.commitPoint({ x: 1, y: 1 }); ed.commitPoint({ x: 1.8, y: 1 }); ed.commitPoint({ x: 3, y: -1 });
    ed.commitPoint({ x: 6, y: 1 }); ed.commitPoint({ x: 6.5, y: 1 }); ed.commitPoint({ x: 8, y: -1 });
    const [a, b] = ed.model.marks;
    expect(a).toMatchObject({ kind: "detalle", ax: 1, ay: 1, label: "1", x: 3, y: -1 });
    expect(a.r).toBeCloseTo(0.8);
    expect(b.label).toBe("2");
    // se elige por el globo o por el borde de la zona
    ed.setTool("select");
    expect(ed.pick(3, -1)).toEqual({ type: "mark", id: a.id });
    expect(ed.pick(1.8, 1)).toEqual({ type: "mark", id: a.id });
    const [c] = transformElements(ed.model, [{ type: "mark", id: a.id }], translation(0, 5), true);
    ed.sel = { type: "mark", id: a.id }; ed.setTool("copy");
    ed.commitPoint({ x: 0, y: 0 }); ed.commitPoint({ x: 0, y: 8 });
    const copied = ed.model.marks[ed.model.marks.length - 1];
    expect(copied.label).toBe("3");
    expect(copied).toMatchObject({ ax: 1, ay: 9, y: 7 });
    expect(ed.model.marks.find((m) => m.id === c.id)).toMatchObject({ ax: 1, ay: 6 });
  });

  it("la nota con flecha pide su texto en la línea de comandos", () => {
    const ed = new Editor();
    ed.runCommand("NT");
    ed.commitPoint({ x: 1, y: 1 }); ed.commitPoint({ x: 3, y: 0 });
    expect(ed.prompt()).toMatch(/Escribe el texto/);
    ed.runCommand("Impermeabilizar");
    expect(ed.model.marks[0]).toMatchObject({ kind: "nota", ax: 1, ay: 1, x: 3, y: 0, label: "Impermeabilizar" });
    // Esc cancela una nota a medias
    ed.commitPoint({ x: 1, y: 1 }); ed.commitPoint({ x: 3, y: 2 }); ed.escape();
    expect(ed.model.marks).toHaveLength(1);
  });

  it("se borran, se exportan al DXF y los proyectos antiguos se abren sin ellos", () => {
    const ed = new Editor();
    ed.runCommand("NV"); ed.commitPoint({ x: 2, y: 2 });
    ed.runCommand("LD"); ed.commitPoint({ x: 1, y: 1 }); ed.commitPoint({ x: 2, y: 1 }); ed.commitPoint({ x: 4, y: 0 });
    const dxf = toDxf(ed.model, null);
    expect(dxf).toContain("N.P.T. +0.00");
    expect(dxf).toMatch(/CIRCLE\n8\nA-ANOTACION/);
    ed.sels = ed.model.marks.map((m) => ({ type: "mark", id: m.id }));
    ed.deleteSel();
    expect(ed.model.marks).toHaveLength(0);
    const p = normalizeProject({ levels: [{ name: "PB", elev: 0, walls: [] }] });
    expect(p.levels[0].marks).toEqual([]);
  });

  it("cortes y fachadas marcan la coronación además del N.P.T. de cada planta", () => {
    const ed = new Editor();
    const el = elevation(ed.project, "S");
    expect(el.levels[0].elev).toBe(0);
    expect(el.tops).toHaveLength(1);
    expect(el.tops[0].tag).toBe("Cumbrera");
    expect(el.tops[0].elev).toBeGreaterThan(2.7);
    // el corte A-A' mira al norte desde antes de la cumbrera: no la ve
    const se = section(ed.project, ed.project.levels[0].sections[0]);
    expect(se.tops).toHaveLength(0);
    ed.flipSection(ed.project.levels[0].sections[0].id);
    expect(section(ed.project, ed.project.levels[0].sections[0]).tops[0].elev).toBeCloseTo(el.tops[0].elev);
  });
});
