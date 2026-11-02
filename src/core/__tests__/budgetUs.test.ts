import { describe, expect, it } from "vitest";
import { budget } from "../budget";
import { TEMPLATES } from "../templates";

describe("presupuesto de EE.UU.", () => {
  const p = TEMPLATES.find((t) => t.id === "us3")!.build();
  const b = budget(p, p.budget);
  it("en pies usa partidas de EE.UU. en sq ft, LF y SQ", () => {
    expect(b.chapters.map((c) => c.code)).toEqual(["01", "02", "03", "04", "05", "06", "08", "09", "10", "11", "12", "13"]);
    const it = (code: string) => b.chapters.flatMap((c) => c.items).find((i) => i.code === code)!;
    expect(it("02.01").unit).toBe("sq ft");
    expect(it("02.01").qty).toBeGreaterThan(1400);
    expect(it("02.01").qty).toBeLessThan(1700);
    expect(it("04.01").unit).toBe("SQ");
    expect(it("06.02").qty).toBe(1);
  });
  it("da un costo por sq ft razonable para una casa nueva", () => {
    const perSf = b.total / 1536;
    expect(perSf).toBeGreaterThan(130);
    expect(perSf).toBeLessThan(300);
  });
});
