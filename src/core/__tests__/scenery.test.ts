import { describe, expect, it } from "vitest";
import { treeSpots } from "../../editor/scenery";

describe("árboles de la vista realista", () => {
  it("quedan fuera del predio y despejan el frente que ve la cámara", () => {
    const s = treeSpots(0, 0, 14, 10);
    expect(s.length).toBeGreaterThanOrEqual(4);
    for (const t of s) {
      expect(t.x < 0 - 2.9 || t.x > 14 + 2.9 || t.z < 0 - 2.9 || t.z > 10 + 2.9).toBe(true);
      expect(t.h).toBeGreaterThanOrEqual(6);
      // nada entre la casa y la cámara inicial (lados +x y +z a la vez cerca de la casa)
      expect(t.x > 7 && t.z > 10 && t.z < 14).toBe(false);
    }
    expect(treeSpots(0, 0, 14, 10)).toEqual(s);
  });
});
