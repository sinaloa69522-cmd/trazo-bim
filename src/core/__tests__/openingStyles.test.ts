import { describe, expect, it } from "vitest";
import { budget } from "../budget";
import { dir } from "../geometry";
import { toIfc } from "../ifc";
import { sampleProject } from "../model";
import { DOOR_STYLES, elevationLines, openingStyle, openingSymbol, WINDOW_STYLES } from "../openingStyles";
import { openingSchedule } from "../schedules";

describe("tipos de puertas y ventanas", () => {
  it("hay al menos 10 de cada uno, con ids únicos", () => {
    expect(DOOR_STYLES.length).toBeGreaterThanOrEqual(10);
    expect(WINDOW_STYLES.length).toBeGreaterThanOrEqual(10);
    for (const l of [DOOR_STYLES, WINDOW_STYLES]) expect(new Set(l.map((s) => s.id)).size).toBe(l.length);
  });

  it("sin tipo guardado son de una hoja y fijas", () => {
    expect(openingStyle({ kind: "door" }).id).toBe("single");
    expect(openingStyle({ kind: "window" }).id).toBe("fixed");
    expect(openingStyle({ kind: "window", style: "nada" }).id).toBe("fixed");
  });

  it("cada tipo tiene símbolo en planta dentro del muro o junto a él", () => {
    const p = sampleProject(), lv = p.levels[0];
    for (const kind of ["door", "window"] as const) {
      const o = lv.openings.find((x) => x.kind === kind)!, w = lv.walls.find((x) => x.id === o.wallId)!, L = dir(w).L;
      for (const st of kind === "door" ? DOOR_STYLES : WINDOW_STYLES) {
        const S = openingSymbol(w, { ...o, style: st.id }, L);
        expect(S.length).toBeGreaterThan(0);
        for (const k of S) for (const q of k.pts) expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true);
        // las líneas del alzado van en coordenadas del hueco
        for (const l of elevationLines({ kind, style: st.id })) for (const [u, v] of l.pts) expect(u >= -0.1 && u <= 1.7 && v >= 0 && v <= 1.1).toBe(true);
      }
    }
  });

  it("el tipo separa marcas en el cuadro, va al IFC y al presupuesto", () => {
    const p = sampleProject(), lv = p.levels[0];
    const ds = lv.openings.filter((o) => o.kind === "door");
    ds[0].style = "slider";
    const types = openingSchedule(p, "door").types;
    expect(types.some((t) => t.style === "slider")).toBe(true);
    expect(types.some((t) => t.style === "single")).toBe(true);
    const ifc = toIfc(p);
    expect(ifc).toContain(".SLIDING_TO_LEFT.");
    expect(ifc).toContain("Puerta corrediza de vidrio");
    const items = budget(p).chapters.flatMap((c) => c.items);
    expect(items.find((i) => i.desc.startsWith("Puerta corrediza de vidrio"))?.qty).toBe(1);
  });
});
