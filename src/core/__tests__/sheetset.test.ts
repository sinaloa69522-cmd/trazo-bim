import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { sheetSet } from "../../ui/SheetView";

describe("juego completo de láminas", () => {
  it("una planta por nivel a la misma escala, los alzados y las secciones", () => {
    const ed = new Editor();
    ed.addLevel(false);
    const set = sheetSet(ed);
    expect(set.map((s) => `${s.content}${s.level}`)).toEqual(["plan0", "plan1", "elev0", "sec0"]);
    expect(set[0].scale).toBe(set[1].scale);
  });

  it("sin secciones no hay lámina de secciones", () => {
    const ed = new Editor();
    ed.model.sections = [];
    expect(sheetSet(ed).map((s) => s.content)).toEqual(["plan", "elev"]);
  });
});
