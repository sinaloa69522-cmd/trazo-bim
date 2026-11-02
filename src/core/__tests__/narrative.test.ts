import { describe, expect, it } from "vitest";
import { memoria } from "../memoria";
import { TEMPLATES } from "../templates";

describe("project narrative de EE.UU.", () => {
  it("sale en inglés, en sq ft y con el IRC", () => {
    const p = TEMPLATES.find((t) => t.id === "us3")!.build();
    const d = memoria(p);
    expect(d.title).toBe("Project narrative");
    const text = JSON.stringify(d.blocks);
    expect(text).toMatch(/sq ft/);
    expect(text).toMatch(/IRC/);
    expect(text).toMatch(/DFU/);
    expect(text).toMatch(/Primary Bedroom/);
    expect(text).not.toMatch(/ m²|Recámara|Cimentación/);
    expect(d.blocks.some((b) => "signs" in b)).toBe(true);
  });
  it("la casa en metros sigue con la memoria en español", () => {
    expect(memoria(TEMPLATES[0].build()).title).toBe("Memoria descriptiva");
  });
});
