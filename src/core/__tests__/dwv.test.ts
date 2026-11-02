import { describe, expect, it } from "vitest";
import { isoModel } from "../../editor/isoRenderer";
import { dwvLoad } from "../dwv";
import { TEMPLATES } from "../templates";

describe("riser diagram de EE.UU.", () => {
  const p = TEMPLATES.find((t) => t.id === "us3")!.build();
  it("suma las DFU y da el drenaje a ¼\"/ft", () => {
    const d = dwvLoad(p);
    expect(d.wcs).toBeGreaterThan(0);
    expect(d.total).toBe(d.rows.reduce((t, r) => t + r.count * r.dfu, 0));
    expect(d.drain).toBe('3"');
  });
  it("etiquetas en pulgadas y en inglés", () => {
    const m = isoModel(p, "san", true), w = isoModel(p, "hid", true);
    const labels = [...m.segs, ...w.segs].map((s) => s.label).filter(Boolean).join(" ");
    expect(labels).not.toMatch(/mm/);
    const tags = [...m.tags, ...w.tags].map((t) => t.text).join(" ");
    expect(tags).not.toMatch(/REG|FREG|TINA|BAP|MEDIDOR/);
  });
});
