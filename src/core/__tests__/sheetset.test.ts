import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { sheetNumber, sheetSet } from "../../ui/SheetView";

describe("juego completo de láminas", () => {
  it("una planta por nivel a la misma escala, dos de fachadas, las secciones y las instalaciones", () => {
    const ed = new Editor();
    ed.addLevel(false);
    const set = sheetSet(ed);
    // el nivel nuevo está vacío: solo la planta baja lleva electricidad y plomería
    expect(set.map((s) => `${s.content}${s.level}`)).toEqual(["plan0", "plan1", "fach0", "fach1", "sec0", "elec0", "plum0"]);
    expect(set[0].scale).toBe(set[1].scale);
    expect(set[2].scale).toBe(set[3].scale);
    expect(set.find((s) => s.content === "elec")!.scale).toBe(set[0].scale);
  });

  it("sin secciones ni instalaciones solo quedan plantas y fachadas", () => {
    const ed = new Editor();
    ed.model.sections = []; ed.model.fixtures = []; ed.model.runs = [];
    expect(sheetSet(ed).map((s) => s.content)).toEqual(["plan", "fach", "fach"]);
  });

  it("numera las láminas por disciplina", () => {
    expect(sheetNumber(2, "plan", 1)).toBe("A-02");
    expect(sheetNumber(2, "fach", 0)).toBe("A-03");
    expect(sheetNumber(2, "fach", 1)).toBe("A-04");
    expect(sheetNumber(2, "sec", 0)).toBe("A-05");
    expect(sheetNumber(2, "elec", 0)).toBe("E-01");
    expect(sheetNumber(2, "plum", 1)).toBe("P-02");
  });
});
