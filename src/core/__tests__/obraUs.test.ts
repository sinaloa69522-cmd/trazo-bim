import { describe, expect, it } from "vitest";
import { budget } from "../budget";
import { insumoGroups, insumos } from "../insumos";
import { program, workDate } from "../obra";
import { TEMPLATES } from "../templates";

const us = () => TEMPLATES.find((t) => t.id === "us3")!.build();

describe("programa e insumos de EE.UU.", () => {
  it("programa en semanas de 5 días con importes que suman el subtotal", () => {
    const p = us(), g = program(p), b = budget(p, p.budget);
    expect(g.week).toBe(5);
    expect(g.acts.map((a) => a.id)).toEqual(expect.arrayContaining(["site", "found", "frame0", "rframe", "roof", "rough", "insul", "dw", "trim", "paint", "floor", "mept", "final"]));
    expect(g.total).toBeCloseTo(b.subtotal, -1);
    expect(g.weeks).toBeGreaterThan(14);
    expect(g.weeks).toBeLessThan(40);
    const a = (id: string) => g.acts.find((x) => x.id === id)!;
    expect(a("dw").start).toBeGreaterThanOrEqual(a("insul").start + a("insul").days);
    expect(a("insul").start).toBeGreaterThanOrEqual(a("rough").start + a("rough").days);
  });
  it("días hábiles de lunes a viernes", () => {
    // 2026-11-06 es viernes: el siguiente día hábil es el lunes 9
    expect(workDate("2026-11-06", 1, 5).getDate()).toBe(9);
    expect(workDate("2026-11-06", 1).getDate()).toBe(7);
  });
  it("insumos en inglés con unidades de EE.UU.", () => {
    const p = us(), l = insumos(p);
    expect(insumoGroups(p)[0]).toBe("Concrete & foundation");
    const f = (re: RegExp) => l.find((x) => re.test(x.name));
    expect(f(/Ready-mix/)!.unit).toBe("yd³");
    expect(f(/Ready-mix/)!.qty).toBeGreaterThan(15);
    expect(f(/2x6 stud/)!.qty).toBeGreaterThan(150);
    expect(f(/shingles/)!.unit).toBe("bundle");
    expect(f(/gypsum board 4×12/)!.qty).toBeGreaterThan(80);
    expect(l.every((x) => insumoGroups(p).includes(x.group))).toBe(true);
  });
});
