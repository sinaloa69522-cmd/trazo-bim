import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { arcPoints, bulgePoints, dwgSegments, plainText, type DwgDatabaseLike } from "../cadImport";
import { pdfToMeters, pdfVectorSegments, type PdfOps } from "../pdfImport";
import { readProjectImages } from "../projectFile";

const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

describe("geometría de importación", () => {
  it("convierte el bulge de una polilínea en arco", () => {
    // medio círculo en sentido antihorario de (1,0) a (-1,0): pasa por (0,1)
    const pts = bulgePoints({ x: 1, y: 0 }, { x: -1, y: 0 }, 1);
    expect(pts[0]).toEqual({ x: 1, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: -1, y: 0 });
    expect(pts.every((p) => near(Math.hypot(p.x, p.y), 1))).toBe(true);
    expect(pts.some((p) => near(p.x, 0, 0.05) && p.y > 0.99)).toBe(true);
    // bulge negativo: por abajo
    expect(bulgePoints({ x: 1, y: 0 }, { x: -1, y: 0 }, -1).some((p) => p.y < -0.99)).toBe(true);
  });

  it("los arcos van en sentido antihorario y cruzan el ángulo 0", () => {
    const pts = arcPoints({ x: 0, y: 0 }, 2, (3 * Math.PI) / 2, Math.PI / 2);
    expect(pts.some((p) => near(p.x, 2, 1e-9) && near(p.y, 0, 1e-9))).toBe(true);
    expect(pts.every((p) => p.x >= -1e-9)).toBe(true);
  });
});

describe("importar DWG", () => {
  it("explota bloques con su giro y escala, y pasa de mm a m con la Y de la planta", () => {
    const db: DwgDatabaseLike = {
      header: { INSUNITS: 4 },
      tables: { BLOCK_RECORD: { entries: [
        { name: "*Model_Space", handle: "1F" },
        { name: "PUERTA", handle: "A0", basePoint: { x: 0, y: 0 }, entities: [{ type: "LINE", layer: "0", startPoint: { x: 0, y: 0 }, endPoint: { x: 1000, y: 0 } }] },
      ] } },
      entities: [
        { type: "LINE", layer: "MUROS", ownerBlockRecordSoftId: "1F", startPoint: { x: 0, y: 0 }, endPoint: { x: 5000, y: 0 } },
        // en el espacio papel: no se importa
        { type: "LINE", layer: "MARCO", ownerBlockRecordSoftId: "55", startPoint: { x: 0, y: 0 }, endPoint: { x: 400, y: 0 } },
        { type: "INSERT", layer: "PUERTAS", ownerBlockRecordSoftId: "1F", name: "PUERTA", insertionPoint: { x: 2000, y: 1000 }, xScale: 2, yScale: 2, rotation: Math.PI / 2 },
        { type: "TEXT", layer: "TEXTOS", ownerBlockRecordSoftId: "1F" },
      ],
    };
    const r = dwgSegments(db);
    expect(r.unitsLabel).toBe("mm");
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0].b).toEqual({ x: 5, y: -0 });
    // el bloque mide 1 m, a escala 2 y girado 90°: va de (2, 1) a (2, 3) en el dibujo, (2, -1)→(2, -3) en planta
    const d = r.segments[1];
    expect(near(d.a.x, 2) && near(d.a.y, -1) && near(d.b.x, 2) && near(d.b.y, -3)).toBe(true);
    // la capa 0 dentro del bloque toma la de la inserción
    expect(d.layer).toBe("PUERTAS");
    expect(r.skipped).toEqual({});
    expect(r.texts).toBeUndefined();
  });

  it("importa textos, atributos de los símbolos y cotas", () => {
    const db: DwgDatabaseLike = {
      header: { INSUNITS: 6 },
      tables: { BLOCK_RECORD: { entries: [
        { name: "*Model_Space", handle: "1F" },
        // símbolo con un texto fijo dentro, insertado girado 90°
        { name: "NORTE", handle: "B0", entities: [{ type: "TEXT", layer: "0", text: "N", startPoint: { x: 1, y: 0 }, textHeight: 0.2, rotation: 0 }] },
        // bloque anónimo de una cota: la línea y el texto con la medida
        { name: "*D1", handle: "B1", entities: [
          { type: "LINE", layer: "0", startPoint: { x: 0, y: 1 }, endPoint: { x: 4, y: 1 } },
          { type: "MTEXT", layer: "0", text: "\\A1;4.00", insertionPoint: { x: 2, y: 1.1 }, textHeight: 0.25, attachmentPoint: 8 },
        ] },
      ] } },
      entities: [
        { type: "TEXT", layer: "T", ownerBlockRecordSoftId: "1F", text: "%%c12", startPoint: { x: 0, y: 0 }, textHeight: 0.5, rotation: 0 },
        // centrado en (10, 0): empieza medio ancho a la izquierda
        { type: "TEXT", layer: "T", ownerBlockRecordSoftId: "1F", text: "AB", startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 }, textHeight: 1, halign: 1 },
        { type: "MTEXT", layer: "T", ownerBlockRecordSoftId: "1F", text: "{\\fArial|b1;Salón}\\Pcomedor", insertionPoint: { x: 0, y: 10 }, textHeight: 0.3, attachmentPoint: 1 },
        { type: "INSERT", layer: "S", ownerBlockRecordSoftId: "1F", name: "NORTE", insertionPoint: { x: 5, y: 5 }, rotation: Math.PI / 2,
          attribs: [{ type: "ATTRIB", layer: "0", text: { text: "PB-01", startPoint: { x: 5, y: 4 }, textHeight: 0.2, rotation: 0 } }] },
        { type: "DIMENSION", layer: "COTAS", ownerBlockRecordSoftId: "1F", name: "*D1" },
      ],
    };
    const r = dwgSegments(db), t = (s: string) => r.texts!.find((x) => x.text === s)!;
    expect(r.texts!.map((x) => x.text).sort()).toEqual(["4.00", "AB", "N", "PB-01", "Salón", "comedor", "Ø12"].sort());
    expect(r.segments).toHaveLength(1);
    expect(t("Ø12")).toMatchObject({ x: 0, size: 0.5, rot: 0 });
    expect(t("AB").x).toBeCloseTo(10 - 0.6);
    // el párrafo: primera línea bajo el punto de inserción (Y de la planta hacia abajo) y la segunda debajo
    expect(t("Salón").y).toBeCloseTo(-10 + 0.3);
    expect(t("comedor").y).toBeGreaterThan(t("Salón").y);
    // el texto del símbolo gira con él
    expect(t("N").rot).toBeCloseTo(90);
    expect(t("N").x).toBeCloseTo(5);
    expect(t("N").y).toBeCloseTo(-6);
    expect(t("PB-01").layer).toBe("S");
    expect(t("4.00").layer).toBe("COTAS");
  });

  it("limpia los códigos de formato de AutoCAD", () => {
    expect(plainText("{\\fArial|b0|i0;\\H0.7x;Planta} \\Pbaja")).toBe("Planta\nbaja");
    expect(plainText("1\\S1^2;")).toBe("11/2");
    expect(plainText("%%p0.00 %%d")).toBe("±0.00 °");
  });

  it("lee un DWG real con LibreDWG", async () => {
    const { LibreDwg, Dwg_File_Type } = await import("@mlightcad/libredwg-web");
    const lib = await LibreDwg.create(new URL("../../../node_modules/@mlightcad/libredwg-web/wasm", import.meta.url).pathname);
    const buf = fixture("muestra-libredwg-2018.dwg");
    const data = lib.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), Dwg_File_Type.DWG)!;
    const r = dwgSegments(lib.convert(data) as unknown as DwgDatabaseLike);
    lib.dwg_free(data);
    // muestra de LibreDWG: tres líneas, una polilínea, un círculo y un texto, en mm
    expect(r.unitsLabel).toBe("mm");
    expect(r.segments.length).toBeGreaterThan(36);
    expect(r.texts).toHaveLength(1);
    expect(r.skipped).toEqual({});
    expect(r.segments.every((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite))).toBe(true);
  }, 30000);
});

describe("importar PDF", () => {
  it("lee las líneas de un plano vectorial a 1:100", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fixture("plano-1-100.pdf")) }).promise;
    const page = await doc.getPage(1), ol = await page.getOperatorList();
    const r = pdfVectorSegments(ol.fnArray, ol.argsArray, pdfjs.OPS as unknown as PdfOps, page.view as [number, number, number, number]);
    // el fondo blanco de la página no cuenta como dibujo
    expect(r.backgrounds).toBe(1);
    const segs = pdfToMeters(r.segments, 100);
    // rectángulo de 100 x 70 mm a 20 mm del borde: 10 x 7 m empezando en (2, 2)
    const xs = segs.flatMap((s) => [s.a.x, s.b.x]), ys = segs.flatMap((s) => [s.a.y, s.b.y]);
    expect(Math.min(...xs)).toBeCloseTo(2, 2);
    expect(Math.max(...xs)).toBeCloseTo(12, 2);
    expect(Math.min(...ys)).toBeCloseTo(2, 2);
    expect(Math.max(...ys)).toBeCloseTo(9, 2);
    // el tabique en x = 6 (60 mm)
    expect(segs.some((s) => near(s.a.x, 6, 0.01) && near(s.b.x, 6, 0.01) && Math.abs(s.b.y - s.a.y) > 6.9)).toBe(true);
  });
});

describe("calcos", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  it("se colocan, se calibran y se guardan con el proyecto", () => {
    const ed = new Editor();
    ed.addUnderlay(PNG, "plano.png", { w: 2000, h: 1000 }, 20);
    const u = ed.model.underlays[0];
    expect([u.w, u.h, u.opacity]).toEqual([20, 10, 0.5]);
    expect(ed.sels).toEqual([{ type: "underlay", id: u.id }]);
    // se elige por el marco, no por dentro
    ed.select(null);
    expect(ed.pick(20.001, 5)).toEqual({ type: "underlay", id: u.id });

    // una medida que en el calco vale 4 m resulta medir 2 m de verdad
    ed.select({ type: "underlay", id: u.id });
    ed.setTool("calibrate");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 4, y: 0 });
    expect(ed.prompt()).toContain("4.000");
    ed.runCommand("2");
    expect(ed.tool).toBe("select");
    expect(ed.model.underlays[0].w).toBeCloseTo(10);
    ed.undo();
    expect(ed.model.underlays[0].w).toBeCloseTo(20);

    const f = ed.saveFile();
    expect(Object.values(readProjectImages(f.text))).toEqual([PNG]);
    const other = new Editor();
    expect(other.openFile(f.text, f.name)).toBe(true);
    expect(other.images.get(other.model.underlays[0].img)).toBe(PNG);
  });

  it("se mueven y se borran como los demás elementos", () => {
    const ed = new Editor();
    ed.addUnderlay(PNG, "a.png", { w: 100, h: 100 }, 5, { x: 1, y: 1 });
    ed.setTool("move");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 2, y: 3 });
    expect([ed.model.underlays[0].x, ed.model.underlays[0].y]).toEqual([3, 4]);
    ed.select({ type: "underlay", id: ed.model.underlays[0].id });
    ed.deleteSel();
    expect(ed.model.underlays).toHaveLength(0);
  });
});

describe("LibreDWG sin eval", () => {
  it("el parche quita las funciones generadas con new Function del enlace de LibreDWG", async () => {
    const { patchEmbind } = await import("../../../build/noEvalEmbind");
    const glue = new TextDecoder().decode(readFileSync(new URL("../../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.js", import.meta.url)));
    expect(glue).toContain("newFunc(Function");
    expect(patchEmbind(glue)).not.toContain("newFunc(Function");
  });
});
