import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { CAR_L, placeEntourage } from "../../editor/entourage";
import { elevation, section } from "../elevation";

describe("ambientación de fachadas y cortes", () => {
  it("la fachada lleva árboles detrás, personas junto a la puerta y un auto que no tapa a nadie", () => {
    const ed = new Editor(), el = elevation(ed.project, "S");
    const it = placeEntourage(el);
    const trees = it.filter((i) => i.kind === "tree"), people = it.filter((i) => i.kind === "person"), car = it.find((i) => i.kind === "car");
    expect(trees.length).toBe(2);
    expect(trees.every((t) => t.layer === "back" && t.h >= 5)).toBe(true);
    expect(people.length).toBeGreaterThanOrEqual(2);
    expect(people.every((p) => p.z === 0 && p.u > el.u0 && p.u < el.u1)).toBe(true);
    expect(car).toBeDefined();
    for (const p of people) expect(Math.abs(p.u - car!.u)).toBeGreaterThan(CAR_L / 2 + 0.4);
    // nadie tapa la puerta
    const doors = el.faces.filter((f) => f.kind === "door" && !f.cut && f.depth > Math.max(...el.faces.map((g) => g.depth)) - 0.6).map((f) => [Math.min(...f.pts.map((q) => q.u)), Math.max(...f.pts.map((q) => q.u))]);
    expect(doors.length).toBeGreaterThan(0);
    for (const p of people) for (const [a, b] of doors) expect(p.u < a - 0.25 || p.u > b + 0.25).toBe(true);
    // siempre igual para el mismo dibujo
    expect(placeEntourage(el)).toEqual(it);
  });
  it("en el corte, la persona está dentro de un local, sobre el piso de su planta", () => {
    const ed = new Editor(), se = section(ed.project, ed.project.levels[0].sections[0]);
    const people = placeEntourage(se).filter((i) => i.kind === "person");
    expect(people).toHaveLength(1);
    expect(people[0].z).toBe(0);
    expect(placeEntourage(se).some((i) => i.kind === "car")).toBe(false);
  });
  it("se puede quitar", () => {
    const ed = new Editor();
    ed.setEntourage(false);
    expect(ed.project.entourage).toBe(false);
  });
});
