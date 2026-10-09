import { MAX_SEGMENTS, type ImportedSegment } from "./cadImport";
import type { Pt } from "./geometry";

/** Códigos de operación de pdf.js que se usan (pdfjs.OPS); se pasan para no depender de la librería aquí. */
export interface PdfOps {
  save: number; restore: number; transform: number; constructPath: number;
  stroke: number; closeStroke: number; fill: number; eoFill: number;
  fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number;
  paintFormXObjectBegin: number; paintFormXObjectEnd: number;
}

// subórdenes de un trazado en pdf.js (DrawOPS)
const MOVE = 0, LINE = 1, CURVE = 2, QUAD = 3, CLOSE = 4;

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

export interface PdfVectorResult {
  /** En puntos (1/72 de pulgada), con el origen arriba a la izquierda de la página y Y hacia abajo */
  segments: ImportedSegment[];
  /** Trazados rellenos que se descartaron por ser fondos (más de media página) */
  backgrounds: number;
  truncated: boolean;
}

/**
 * Segmentos de los trazados de una página de PDF a partir de su lista de operaciones (page.getOperatorList()).
 * viewport: [x0, y0, x1, y1] de la página en unidades PDF. Las curvas se aproximan con tramos rectos.
 */
export function pdfVectorSegments(fnArray: ArrayLike<number>, argsArray: unknown[], OPS: PdfOps, viewport: [number, number, number, number]): PdfVectorResult {
  const [vx0, vy0, vx1, vy1] = viewport, pageArea = Math.abs((vx1 - vx0) * (vy1 - vy0));
  const segs: ImportedSegment[] = [], seen = new Set<string>();
  let ctm: M = [1, 0, 0, 1, 0, 0], backgrounds = 0, truncated = false;
  const stack: M[] = [];
  // a coordenadas de página con Y hacia abajo
  const toPage = (x: number, y: number): Pt => {
    const px = ctm[0] * x + ctm[2] * y + ctm[4], py = ctm[1] * x + ctm[3] * y + ctm[5];
    return { x: px - vx0, y: vy1 - py };
  };
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill]);

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as M);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args?.[0])) ctm = mul(ctm, args[0] as M); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) {
      const paint = args[0] as number, data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data || (!strokeOps.has(paint) && !fillOps.has(paint))) continue;
      const pts: Pt[][] = [];
      let cur: Pt[] = [], start: Pt | null = null, last: Pt | null = null;
      for (let k = 0; k < data.length;) {
        const op = data[k++];
        if (op === MOVE) { if (cur.length > 1) pts.push(cur); last = start = toPage(data[k++], data[k++]); cur = [last]; }
        else if (op === LINE) { last = toPage(data[k++], data[k++]); cur.push(last); }
        else if (op === CURVE || op === QUAD) {
          const n = op === CURVE ? 3 : 2, c = Array.from({ length: n }, () => toPage(data[k++], data[k++]));
          const p0 = last ?? c[0], ctrl = [p0, ...c];
          for (let s = 1; s <= 6; s++) {
            const t = s / 6, u = 1 - t;
            cur.push(n === 3
              ? { x: u * u * u * ctrl[0].x + 3 * u * u * t * ctrl[1].x + 3 * u * t * t * ctrl[2].x + t * t * t * ctrl[3].x, y: u * u * u * ctrl[0].y + 3 * u * u * t * ctrl[1].y + 3 * u * t * t * ctrl[2].y + t * t * t * ctrl[3].y }
              : { x: u * u * ctrl[0].x + 2 * u * t * ctrl[1].x + t * t * ctrl[2].x, y: u * u * ctrl[0].y + 2 * u * t * ctrl[1].y + t * t * ctrl[2].y });
          }
          last = c[n - 1];
        } else if (op === CLOSE) { if (start && last && cur.length > 1) cur.push(start); last = start; }
        else break;
      }
      if (cur.length > 1) pts.push(cur);
      if (fillOps.has(paint)) {
        // un relleno que ocupa media página es un fondo, no dibujo
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of pts.flat()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        if ((x1 - x0) * (y1 - y0) > pageArea / 2) { backgrounds++; continue; }
      }
      for (const line of pts) for (let j = 0; j + 1 < line.length; j++) {
        const a = line[j], b = line[j + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) continue;
        // un relleno con contorno repite el mismo trazo: se cuenta una vez
        const k1 = `${a.x.toFixed(2)},${a.y.toFixed(2)},${b.x.toFixed(2)},${b.y.toFixed(2)}`, k2 = `${b.x.toFixed(2)},${b.y.toFixed(2)},${a.x.toFixed(2)},${a.y.toFixed(2)}`;
        if (seen.has(k1) || seen.has(k2)) continue;
        seen.add(k1);
        if (segs.length >= MAX_SEGMENTS) { truncated = true; break; }
        segs.push({ a, b, layer: "PDF" });
      }
    }
  }
  return { segments: segs, backgrounds, truncated };
}

/** Metros de obra por punto de PDF a una escala 1:N (1 pt = 1/72 de pulgada en el papel). */
export const metersPerPoint = (scaleN: number) => (0.0254 / 72) * scaleN;

/** Escalas habituales de planos de arquitectura. */
export const PDF_SCALES = [20, 25, 50, 75, 100, 125, 200, 250, 500, 1000];

/** Pasa a metros los segmentos de la página, con la esquina superior izquierda de la página en el origen. */
export function pdfToMeters(segs: ImportedSegment[], scaleN: number): ImportedSegment[] {
  const k = metersPerPoint(scaleN);
  return segs.map((s) => ({ a: { x: s.a.x * k, y: s.a.y * k }, b: { x: s.b.x * k, y: s.b.y * k }, layer: s.layer }));
}
