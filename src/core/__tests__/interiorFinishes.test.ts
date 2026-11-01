import { describe, expect, it } from "vitest";
import { sampleProject } from "../model";
import { defaultFinish, finishTable } from "../interiorFinishes";

describe("plano de acabados", () => {
  it("propone acabados según el espacio y respeta los elegidos", () => {
    expect(defaultFinish("Baño 2", "floor")).toBe("antiderrapante");
    expect(defaultFinish("Cocina", "wall")).toBe("azulejo");
    expect(defaultFinish("Recámara principal", "floor")).toBe("laminado");
    const lv = sampleProject().levels[0];
    lv.rooms[0].finishes = { floor: "marmol" };
    const rows = finishTable(lv);
    expect(rows).toHaveLength(3);
    expect(rows[0].floor.code).toBe("P-6");
    const bath = rows.find((r) => r.name === "Baño")!;
    expect(bath.floor.id).toBe("antiderrapante");
    // baño de 5.82 × ~2.82 m libres: perímetro ≈ 17.3 m y muros ≈ perímetro × 2.7 menos sus cuatro vanos
    expect(bath.perimeter).toBeGreaterThan(16.5); expect(bath.perimeter).toBeLessThan(18);
    expect(bath.wallArea).toBeLessThan(bath.perimeter * 2.7);
    expect(bath.wallArea).toBeGreaterThan(bath.perimeter * 2.7 - 7);
  });
});
