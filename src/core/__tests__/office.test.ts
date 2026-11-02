import { describe, expect, it } from "vitest";
import { memoria } from "../memoria";
import { emptyProject, normalizeProject } from "../model";
import { officeOf, responsibleLine } from "../office";

describe("datos del despacho", () => {
  it("sin datos no hay despacho; con responsable y cédula sale la línea de firma", () => {
    const p = emptyProject();
    expect(officeOf(p)).toBeNull();
    p.info.office = { name: "Taller Ruiz", responsible: "Arq. Ana Ruiz", license: "1234567" };
    expect(responsibleLine(officeOf(p))).toBe("Arq. Ana Ruiz · Céd. prof. 1234567");
    expect(responsibleLine(null, "Juan")).toBe("Juan");
  });

  it("la memoria firma con el responsable y su cédula", () => {
    const p = emptyProject();
    p.info.office = { name: "", responsible: "Arq. Ana Ruiz", license: "1234567", dro: "DRO-1234" };
    const signs = memoria(p).blocks.find((b) => "signs" in b) as { signs: { role: string; name: string }[] };
    expect(signs.signs[0]).toEqual({ role: "Proyectista · Céd. prof. 1234567", name: "Arq. Ana Ruiz" });
    expect(signs.signs[1].role).toContain("DRO-1234");
  });

  it("al abrir un proyecto se limpian los datos del despacho", () => {
    const p = normalizeProject({ levels: [{ walls: [] }], info: { name: "x", office: { name: 3, responsible: "A", license: "9", logo: "javascript:alert(1)", sign: "data:image/png;base64,AA" } } });
    expect(p.info.office).toEqual({ name: "", responsible: "A", license: "9", dro: undefined, contact: undefined, logo: undefined, sign: "data:image/png;base64,AA" });
  });
});
