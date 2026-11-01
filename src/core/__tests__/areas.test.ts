import { describe, expect, it } from "vitest";
import { emptyModel } from "../model";
import { areaTable, builtArea } from "../rooms";

describe("cuadro de áreas", () => {
  it("la superficie construida incluye el espesor de los muros", () => {
    const m = emptyModel();
    const W = (id: number, x1: number, y1: number, x2: number, y2: number) => ({ id, type: "", x1, y1, x2, y2, thick: 0.2, height: 2.6, attach: false });
    m.walls = [W(1, 0, 0, 10, 0), W(2, 10, 0, 10, 8), W(3, 10, 8, 0, 8), W(4, 0, 8, 0, 0), W(5, 5, 0, 5, 8)];
    m.openings = [{ id: 6, wallId: 1, t: 0.3, kind: "door", width: 1, height: 2.1, sill: 0, flip: false }];
    expect(builtArea(m)).toBeGreaterThan(10.2 * 8.2 - 1.5);
    expect(builtArea(m)).toBeLessThan(10.2 * 8.2 + 1.5);
    m.rooms = [{ id: 7, x: 2, y: 2, name: "Sala" }, { id: 8, x: 7, y: 2, name: "Recámara" }];
    const [t] = areaTable([{ ...m, name: "PB" }]);
    expect(t.rooms.map((r) => r.name)).toEqual(["Sala", "Recámara"]);
    expect(t.useful).toBeGreaterThan(70); expect(t.useful).toBeLessThan(t.built);
  });
});
