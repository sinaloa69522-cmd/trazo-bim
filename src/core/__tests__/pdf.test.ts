import { describe, expect, it } from "vitest";
import { jpegPdf } from "../pdf";

describe("PDF de láminas", () => {
  it("una página por imagen con su tabla de referencias correcta", () => {
    const fake = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const out = jpegPdf([{ jpeg: fake, w: 10, h: 7 }, { jpeg: fake, w: 10, h: 7 }], 1190.55, 841.89, "Casa (1)");
    const txt = new TextDecoder("latin1").decode(out);
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt).toContain("/Count 2");
    expect(txt).toContain("/MediaBox [0 0 1190.55 841.89]");
    expect(txt).toContain("/Title (Casa 1)");
    // cada entrada del xref apunta al inicio de su objeto
    const xref = Number(txt.match(/startxref\n(\d+)/)![1]);
    const rows = txt.slice(xref).split("\n").slice(3, 3 + 9);
    rows.forEach((r, i) => expect(txt.slice(Number(r.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});
