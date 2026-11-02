import { describe, expect, it } from "vitest";
import { program, workDate, WEEK } from "../obra";
import { TEMPLATES } from "../templates";
import { xlsx } from "../xlsx";

describe("programa de obra", () => {
  const p = TEMPLATES[1].build();
  const g = program(p);
  it("sigue el orden de obra y dura algunos meses", () => {
    const ids = g.acts.map((a) => a.id);
    const at = (id: string) => g.acts.find((a) => a.id === id)!;
    expect(ids[0]).toBe("pre");
    expect(at("cim").start).toBeGreaterThanOrEqual(at("pre").start + at("pre").days);
    expect(at("mur0").start).toBeGreaterThanOrEqual(at("cim").start + at("cim").days);
    expect(at("cub").start).toBeGreaterThanOrEqual(at("mur0").start + at("mur0").days);
    expect(at("lim").start).toBe(Math.max(...g.acts.filter((a) => a.id !== "lim").map((a) => a.start + a.days)));
    expect(g.weeks).toBeGreaterThan(8);
    expect(g.weeks).toBeLessThan(40);
  });
  it("reparte el importe por semana y llega al 100 %", () => {
    expect(g.weekly.length).toBe(g.weeks);
    expect(g.cumulative[g.weeks - 1]).toBeCloseTo(1, 6);
    expect(g.total).toBeGreaterThan(0);
  });
  it("un segundo nivel agrega muros y losa de entrepiso", () => {
    const q = TEMPLATES[1].build(), up = JSON.parse(JSON.stringify(q.levels[0]));
    up.name = "Planta alta"; up.elev = 3; q.levels.push(up);
    const g2 = program(q);
    expect(g2.acts.some((a) => a.id === "losa0")).toBe(true);
    expect(g2.acts.some((a) => a.id === "mur1")).toBe(true);
    expect(g2.days).toBeGreaterThan(g.days);
  });
  it("cuenta días hábiles de lunes a sábado", () => {
    expect(WEEK).toBe(6);
    expect(workDate("2026-11-02", 6).toISOString().slice(0, 10)).toBe("2026-11-09"); // lunes + 6 hábiles = lunes siguiente
  });
  it("escribe un .xlsx", () => {
    const b = xlsx([{ name: "Programa", rows: [["a", 1, { v: "x", s: 5 }]] }]);
    expect(new TextDecoder().decode(b)).toContain("xl/worksheets/sheet1.xml");
  });
});
