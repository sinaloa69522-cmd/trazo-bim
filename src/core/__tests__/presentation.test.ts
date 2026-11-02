import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../templates";
import { presentationData } from "../../ui/Presentation";

describe("presentación para el cliente", () => {
  it("resume recámaras, baños, áreas y presupuesto de una plantilla", () => {
    const p = TEMPLATES[1].build();
    const d = presentationData(p);
    expect(d.beds).toBeGreaterThanOrEqual(2);
    expect(d.baths).toBeGreaterThanOrEqual(1);
    expect(d.built).toBeGreaterThan(d.useful);
    expect(d.budget.total).toBeGreaterThan(0);
    // los conceptos con indirectos suman el subtotal
    expect(d.chapters.reduce((s, c) => s + c.total, 0)).toBeCloseTo(d.budget.subtotal, -1);
    expect(d.weeks).toBeGreaterThan(4);
  });
});
