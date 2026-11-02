import { describe, expect, it } from "vitest";
import { docx } from "../docx";
import { memoria } from "../memoria";
import { TEMPLATES } from "../templates";
import { crc32, zip } from "../zip";

describe("memoria descriptiva", () => {
  const p = TEMPLATES[1].build();
  p.info.client = "Familia Pérez"; p.info.author = "Arq. Ana López";
  const d = memoria(p);
  const text = JSON.stringify(d.blocks);
  it("trae los apartados con los datos del proyecto", () => {
    const hs = d.blocks.filter((b) => "h" in b && !b.level).map((b) => (b as { h: string }).h);
    expect(hs.slice(0, 9)).toEqual(["1. Datos generales", "2. Descripción del proyecto", "3. Cuadro de áreas", "4. Sistema constructivo", "5. Acabados interiores", "6. Puertas y ventanas", "7. Instalaciones", "8. Revisión de reglamento", "9. Reglamentos y normas aplicables"]);
    expect(text).toContain("Familia Pérez");
    expect(text).toContain("Recámara principal");
    expect(text).toContain("a cuatro aguas");
    expect(text).toMatch(/todas cumplen/);
  });
  it("crea un .docx válido (ZIP con el documento de Word)", () => {
    const b = docx(d), s = new TextDecoder().decode(b);
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(s).toContain("word/document.xml");
    expect(s).toContain("Memoria descriptiva");
    expect(s).toContain("Familia P");
  });
  it("calcula el CRC-32 estándar", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(zip([{ name: "a.txt", data: "hola" }]).length).toBe(30 + 5 + 4 + 46 + 5 + 22);
  });
});
