import { describe, expect, it } from "vitest";
import { sheetBounds } from "../geometry";
import { emptyModel } from "../model";

describe("encuadre de las láminas", () => {
  it("encuadra lo construido aunque haya un DWG importado enorme de fondo", () => {
    const m = emptyModel();
    for (const [x1, y1, x2, y2] of [[0, 0, 12, 0], [12, 0, 12, 10], [12, 10, 0, 10], [0, 10, 0, 0]])
      m.walls.push({ type: "generico", id: m.nid++, x1, y1, x2, y2, thick: 0.15, height: 2.5, attach: true });
    m.lines.push({ id: m.nid++, x1: -300, y1: -200, x2: 300, y2: -200 }, { id: m.nid++, x1: 0, y1: 3000, x2: 1, y2: 3000 });
    m.dims.push({ id: m.nid++, x1: 0, y1: -1.2, x2: 12, y2: -1.2, off: 0 });
    const b = sheetBounds(m);
    expect(b.x0).toBeCloseTo(-1.5); expect(b.x1).toBeCloseTo(13.5);
    expect(b.y0).toBeCloseTo(-2.7); expect(b.y1).toBeCloseTo(11.5);
  });

  it("sin nada construido usa el dibujo sin los restos lejanos", () => {
    const m = emptyModel();
    m.lines.push({ id: 1, x1: 0, y1: 0, x2: 10, y2: 0 }, { id: 2, x1: 0, y1: 8, x2: 10, y2: 8 });
    const b = sheetBounds(m);
    expect(b.x1 - b.x0).toBeLessThan(13);
  });
});
