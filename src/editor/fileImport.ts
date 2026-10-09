// Lectores de archivos para importar: se cargan solo cuando hacen falta (LibreDWG pesa unos 9 MB y pdf.js 1 MB).
// pdf.js va en su versión "legacy", que funciona también en navegadores de hace un par de años.
import type { CadImportResult } from "../core/cadImport";
import { dwgSegments, type DwgDatabaseLike } from "../core/cadImport";
import { pdfToMeters, pdfVectorSegments, type PdfOps } from "../core/pdfImport";

export type ImportKind = "dxf" | "dwg" | "pdf" | "image" | "trazo" | null;

export function importKind(name: string): ImportKind {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "dxf") return "dxf";
  if (ext === "dwg") return "dwg";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) return "image";
  if (ext === "trazo" || ext === "json") return "trazo";
  return null;
}

/** Lee un DWG (versiones R14 a 2018) con LibreDWG compilado a WebAssembly. */
export async function readDwg(buf: ArrayBuffer): Promise<CadImportResult> {
  const [{ LibreDwg, createModule, Dwg_File_Type }, { default: wasmUrl }] = await Promise.all([
    import("@mlightcad/libredwg-web"),
    // el paquete no exporta el .wasm: se toma de su carpeta
    import("../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm?url"),
  ]);
  let mod: Awaited<ReturnType<typeof createModule>>;
  try {
    mod = await createModule({ locateFile: () => wasmUrl });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/WebAssembly|unsafe-eval|Content Security Policy/i.test(msg))
      throw new Error("este navegador o esta página no permiten cargar el lector de DWG (WebAssembly bloqueado). Prueba en Chrome, Edge o Firefox actualizados, o guarda el plano como DXF desde AutoCAD.");
    throw new Error(`no se pudo cargar el lector de DWG (${msg}). Revisa la conexión y vuelve a intentarlo.`);
  }
  const lib = LibreDwg.createByWasmInstance(mod);
  const data = lib.dwg_read_data(buf, Dwg_File_Type.DWG);
  if (data === undefined) throw new Error("no se pudo leer: puede estar dañado o ser de una versión que LibreDWG aún no lee.");
  try {
    return dwgSegments(lib.convert(data) as unknown as DwgDatabaseLike);
  } finally {
    lib.dwg_free(data);
  }
}

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

async function pdfjs() {
  const [lib, { default: workerUrl }] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

export interface PdfPage {
  index: number;
  /** Tamaño de la página en puntos */
  w: number;
  h: number;
  /** Miniatura en data URL */
  thumb: string;
}

/** Abre un PDF y prepara una miniatura de cada página (hasta 12). */
export async function openPdf(buf: ArrayBuffer): Promise<{ doc: PdfDoc; pages: PdfPage[] }> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
    const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 });
    pages.push({ index: i, w: vp.width, h: vp.height, thumb: await renderPage(page, 180 / Math.max(vp.width, vp.height), "image/png") });
  }
  return { doc, pages };
}

async function renderPage(page: import("pdfjs-dist").PDFPageProxy, scale: number, type: string, quality?: number): Promise<string> {
  const vp = page.getViewport({ scale }), cv = document.createElement("canvas");
  cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise;
  return cv.toDataURL(type, quality);
}

/** Líneas de una página de PDF, en metros a escala 1:N. */
export async function pdfLines(doc: PdfDoc, index: number, scaleN: number): Promise<{ result: CadImportResult; note: string }> {
  const lib = await pdfjs(), page = await doc.getPage(index), ol = await page.getOperatorList();
  const r = pdfVectorSegments(ol.fnArray, ol.argsArray, lib.OPS as unknown as PdfOps, page.view as [number, number, number, number]);
  const note = r.segments.length < 20 ? "La página casi no tiene líneas: si es un plano escaneado, impórtalo como calco." : r.truncated ? "El dibujo es muy grande: se importaron las primeras 60 000 líneas." : "";
  return { result: { segments: pdfToMeters(r.segments, scaleN), scale: 1, unitsLabel: `PDF a 1:${scaleN}`, skipped: {} }, note };
}

/** Página de PDF como imagen para usarla de calco (JPEG, lado mayor de 3000 px como mucho). */
export async function pdfImage(doc: PdfDoc, index: number): Promise<{ url: string; w: number; h: number; pageW: number }> {
  const page = await doc.getPage(index), vp = page.getViewport({ scale: 1 });
  const k = Math.min(4, 3000 / Math.max(vp.width, vp.height));
  const url = await renderPage(page, k, "image/jpeg", 0.85);
  return { url, w: Math.ceil(vp.width * k), h: Math.ceil(vp.height * k), pageW: vp.width };
}

/** Lee una imagen; si es muy grande la reduce (lado mayor de 3000 px) para que quepa en el proyecto. */
export function readImage(file: Blob): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(src);
      resolve({ url: cv.toDataURL("image/jpeg", 0.85), w: cv.width, h: cv.height });
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("no es una imagen que el navegador pueda leer.")); };
    img.src = src;
  });
}
