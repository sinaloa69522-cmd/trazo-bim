import { describe, expect, it } from "vitest";
import { isoModel } from "../../editor/isoRenderer";
import { TEMPLATES } from "../templates";

describe("isométricos de instalaciones", () => {
  const p = TEMPLATES[1].build();
  it("las plantillas traen medidor, calentador y bajantes con su red", () => {
    const l = p.levels[0];
    expect(l.fixtures.some((f) => f.kind === "contador")).toBe(true);
    expect(l.fixtures.filter((f) => f.kind === "bajante").length).toBe(2);
    expect(l.runs.some((r) => r.system === "af") && l.runs.some((r) => r.system === "ac") && l.runs.some((r) => r.system === "san")).toBe(true);
  });
  it("el hidráulico sube a cada toma y nombra los muebles", () => {
    const m = isoModel(p, "hid");
    expect(m.segs.some((s) => s.sys === "af") && m.segs.some((s) => s.sys === "ac")).toBe(true);
    const names = m.tags.map((t) => t.text);
    expect(names).toEqual(expect.arrayContaining(["WC", "LAV", "REG", "FREG", "MEDIDOR", "CALENTADOR"]));
    expect(names.filter((n) => n === "MEDIDOR").length).toBe(1);
  });
  it("el drenaje baja con pendiente del 2 % hacia la bajante", () => {
    const m = isoModel(p, "san"), horiz = m.segs.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.01);
    for (const s of horiz) expect((s.a.z - s.b.z) / Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeCloseTo(0.02, 4);
    expect(m.segs.some((s) => s.label === "Ø 100 mm") && m.segs.some((s) => s.label === "Ø 50 mm")).toBe(true);
  });
});
