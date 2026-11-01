import { describe, expect, it } from "vitest";
import { emptyModel, type Level } from "../model";
import { collide, floorAt, walkStart } from "../../editor/walk";

/** Cuarto de 4 × 4 con una puerta de 0.9 en el muro de abajo (y = 0). */
function room(): Level {
  const m = emptyModel();
  const W = (id: number, x1: number, y1: number, x2: number, y2: number) => ({ id, type: "", x1, y1, x2, y2, thick: 0.15, height: 2.6, attach: false });
  m.walls = [W(1, 0, 0, 4, 0), W(2, 4, 0, 4, 4), W(3, 4, 4, 0, 4), W(4, 0, 4, 0, 0)];
  m.openings = [{ id: 5, wallId: 1, t: 0.5, kind: "door", width: 0.9, height: 2.1, sill: 0, flip: false }];
  return { ...m, name: "PB", elev: 0 };
}

describe("recorrido", () => {
  it("no deja atravesar un muro pero sí pasar por la puerta", () => {
    const lv = room();
    expect(collide(lv, { x: 1, y: 0.05 }).y).toBeGreaterThan(0.3);
    expect(collide(lv, { x: 1, y: -0.05 }).y).toBeLessThan(-0.3);
    const door = collide(lv, { x: 2, y: 0 });
    expect(door).toEqual({ x: 2, y: 0 });
  });
  it("empieza fuera, frente a la puerta, mirando hacia dentro", () => {
    const st = walkStart(room(), { x: 2, y: 2 });
    expect(st.p.x).toBeCloseTo(2); expect(st.p.y).toBeCloseTo(-3);
    expect(Math.sin(st.yaw)).toBeCloseTo(1);
  });
  it("el suelo es el del nivel dentro de la casa y el terreno fuera", () => {
    const lv = room();
    expect(floorAt(lv, { x: 2, y: 2 }, -0.3, true)).toBe(0);
    expect(floorAt(lv, { x: 2, y: -2 }, -0.3, true)).toBe(-0.3);
    expect(floorAt(lv, { x: 2, y: -2 }, -0.3, false)).toBe(0);
  });
});
