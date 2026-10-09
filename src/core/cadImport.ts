import type { Pt } from "./geometry";

export interface ImportedSegment { a: Pt; b: Pt; layer: string }

export interface CadImportResult {
  segments: ImportedSegment[];
  /** Factor aplicado para pasar a metros */
  scale: number;
  unitsLabel: string;
  /** Entidades que no se importaron, por tipo */
  skipped: Record<string, number>;
  /** Desplazamiento aplicado (en metros) para traer al origen un dibujo con coordenadas muy grandes */
  moved?: Pt;
}

/** Códigos $INSUNITS: 1 pulgadas, 2 pies, 4 mm, 5 cm, 6 m */
export const INSUNITS: Record<number, [number, string]> = { 1: [0.0254, "pulgadas"], 2: [0.3048, "pies"], 4: [0.001, "mm"], 5: [0.01, "cm"], 6: [1, "m"] };

/** Tope de segmentos de una importación, para no bloquear el navegador con un dibujo enorme. */
export const MAX_SEGMENTS = 60000;

/**
 * Pasa a metros y a la planta (Y hacia abajo) los segmentos leídos en unidades de dibujo.
 * Sin unidades declaradas, si el dibujo mide más de 1000 se asume que está en mm.
 * Si queda a más de 1 km del origen (coordenadas UTM, por ejemplo) se trae junto al origen.
 */
export function finishSegments(segs: ImportedSegment[], insunits: number, skipped: Record<string, number>): CadImportResult {
  let [scale, unitsLabel] = INSUNITS[insunits] ?? [1, "m"];
  if (!INSUNITS[insunits] && segs.length) {
    let ext = 0;
    for (const s of segs) ext = Math.max(ext, Math.abs(s.a.x), Math.abs(s.a.y), Math.abs(s.b.x), Math.abs(s.b.y));
    if (ext > 1000) [scale, unitsLabel] = [0.001, "mm (supuesto)"];
  }
  for (const s of segs) {
    s.a = { x: s.a.x * scale, y: -s.a.y * scale };
    s.b = { x: s.b.x * scale, y: -s.b.y * scale };
  }
  const res: CadImportResult = { segments: segs, scale, unitsLabel, skipped };
  if (segs.length) {
    let x0 = Infinity, y0 = Infinity;
    for (const s of segs) { x0 = Math.min(x0, s.a.x, s.b.x); y0 = Math.min(y0, s.a.y, s.b.y); }
    if (Math.abs(x0) > 1000 || Math.abs(y0) > 1000) {
      const dx = Math.round(x0), dy = Math.round(y0);
      for (const s of segs) { s.a = { x: s.a.x - dx, y: s.a.y - dy }; s.b = { x: s.b.x - dx, y: s.b.y - dy }; }
      res.moved = { x: dx, y: dy };
    }
  }
  return res;
}

/** Puntos de un arco (ángulos en radianes, sentido antihorario de a0 a a1). */
export function arcPoints(c: Pt, r: number, a0: number, a1: number): Pt[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(2, Math.ceil(sweep / (Math.PI / 18)));
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (sweep * i) / n; return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }; });
}

/** Tramo de polilínea con curvatura (bulge = tan(ángulo/4), positivo en sentido antihorario). */
export function bulgePoints(a: Pt, b: Pt, bulge: number): Pt[] {
  if (!bulge || Math.abs(bulge) < 1e-9) return [a, b];
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-12) return [a, b];
  const theta = 4 * Math.atan(bulge), r = L / (2 * Math.sin(theta / 2));
  // centro: sobre la mediatriz, a la izquierda de a→b si el arco va en sentido antihorario
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = r * Math.cos(theta / 2);
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const c = { x: mx + nx * h, y: my + ny * h };
  const a0 = Math.atan2(a.y - c.y, a.x - c.x), n = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 18)));
  return Array.from({ length: n + 1 }, (_, i) => {
    if (i === n) return b;
    const t = a0 + (theta * i) / n;
    return { x: c.x + Math.abs(r) * Math.cos(t), y: c.y + Math.abs(r) * Math.sin(t) };
  });
}

// ---------- DWG (estructura que devuelve LibreDWG al convertir el archivo) ----------

interface P3 { x: number; y: number; z?: number }
/** Entidad de LibreDWG; solo se tipan los campos que se usan. */
export interface DwgEntity {
  type: string;
  layer?: string;
  ownerBlockRecordSoftId?: string;
  isVisible?: boolean;
  startPoint?: P3; endPoint?: P3;
  vertices?: (P3 & { bulge?: number })[];
  flag?: number;
  center?: P3; radius?: number; startAngle?: number; endAngle?: number;
  majorAxisEndPoint?: P3; axisRatio?: number;
  fitPoints?: P3[]; controlPoints?: P3[];
  name?: string; insertionPoint?: P3; xScale?: number; yScale?: number; rotation?: number;
  columnCount?: number; rowCount?: number; columnSpacing?: number; rowSpacing?: number;
  corner1?: P3; corner2?: P3; corner3?: P3; corner4?: P3;
}
export interface DwgDatabaseLike {
  header?: { INSUNITS?: number };
  entities: DwgEntity[];
  tables?: { BLOCK_RECORD?: { entries: { name: string; handle: string; basePoint?: P3; entities?: DwgEntity[] }[] } };
}

type M = [number, number, number, number, number, number]; // x' = a x + c y + e ; y' = b x + d y + f
const apply = (m: M, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const ID: M = [1, 0, 0, 1, 0, 0];

/**
 * Segmentos del espacio modelo de un DWG: líneas, polilíneas (con sus arcos), arcos, círculos,
 * elipses, splines (por sus puntos) y bloques insertados (explotados). Textos, cotas y sombreados no se importan.
 */
export function dwgSegments(db: DwgDatabaseLike): CadImportResult {
  const segs: ImportedSegment[] = [], skipped: Record<string, number> = {};
  const blocks = new Map((db.tables?.BLOCK_RECORD?.entries ?? []).map((b) => [b.name.toLowerCase(), b]));
  const ms = blocks.get("*model_space");
  const skip = (t: string) => { skipped[t] = (skipped[t] ?? 0) + 1; };

  const emit = (pts: Pt[], m: M, layer: string) => {
    for (let i = 0; i + 1 < pts.length && segs.length < MAX_SEGMENTS; i++) {
      const a = apply(m, pts[i]), b = apply(m, pts[i + 1]);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) segs.push({ a, b, layer });
    }
  };

  const walk = (list: DwgEntity[], m: M, depth: number, parentLayer: string) => {
    for (const e of list) {
      if (segs.length >= MAX_SEGMENTS) { skip("(límite de segmentos)"); return; }
      if (e.isVisible === false) continue;
      // las entidades de un bloque en la capa 0 toman la capa de la inserción
      const layer = !e.layer || e.layer === "0" ? parentLayer : e.layer;
      switch (e.type) {
        case "LINE":
          if (e.startPoint && e.endPoint) emit([e.startPoint, e.endPoint], m, layer);
          break;
        case "LWPOLYLINE": case "POLYLINE2D": case "POLYLINE3D": {
          const v = e.vertices ?? [], closed = ((e.flag ?? 0) & 1) === 1 && v.length > 2;
          const pts: Pt[] = [];
          const n = closed ? v.length : v.length - 1;
          for (let i = 0; i < n; i++) {
            const a = v[i], b = v[(i + 1) % v.length], piece = bulgePoints(a, b, e.type === "POLYLINE3D" ? 0 : a.bulge ?? 0);
            pts.push(...(i ? piece.slice(1) : piece));
          }
          emit(pts, m, layer);
          break;
        }
        case "ARC":
          if (e.center && e.radius) emit(arcPoints(e.center, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2), m, layer);
          break;
        case "CIRCLE":
          if (e.center && e.radius) emit(arcPoints(e.center, e.radius, 0, Math.PI * 2), m, layer);
          break;
        case "ELLIPSE": {
          const c = e.center, mj = e.majorAxisEndPoint;
          if (!c || !mj) break;
          const r = e.axisRatio ?? 1, t0 = e.startAngle ?? 0;
          let t1 = e.endAngle ?? Math.PI * 2;
          if (t1 <= t0) t1 += Math.PI * 2;
          const n = Math.max(8, Math.ceil((t1 - t0) / (Math.PI / 24)));
          const pts = Array.from({ length: n + 1 }, (_, i) => {
            const t = t0 + ((t1 - t0) * i) / n, cs = Math.cos(t), sn = Math.sin(t) * r;
            return { x: c.x + mj.x * cs - mj.y * sn, y: c.y + mj.y * cs + mj.x * sn };
          });
          emit(pts, m, layer);
          break;
        }
        case "SPLINE": {
          // aproximación por la poligonal de sus puntos de paso (o de control)
          const pts = e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? [];
          if (pts.length > 1) emit(pts, m, layer); else skip(e.type);
          break;
        }
        case "SOLID": case "3DFACE": case "TRACE": {
          const q = [e.corner1, e.corner2, e.corner4 ?? e.corner3, e.corner3].filter(Boolean) as P3[];
          if (q.length > 2) emit([...q, q[0]], m, layer); else skip(e.type);
          break;
        }
        case "INSERT": {
          const b = blocks.get((e.name ?? "").toLowerCase());
          if (!b?.entities || depth > 8) { skip("INSERT"); break; }
          const ins = e.insertionPoint ?? { x: 0, y: 0 }, base = b.basePoint ?? { x: 0, y: 0 };
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, a = e.rotation ?? 0, c = Math.cos(a), s = Math.sin(a);
          const cols = Math.max(1, e.columnCount ?? 1), rows = Math.max(1, e.rowCount ?? 1);
          for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
            // desplazamiento de la matriz de inserción en los ejes girados del bloque
            const ox = i * (e.columnSpacing ?? 0), oy = j * (e.rowSpacing ?? 0);
            const local: M = [c * sx, s * sx, -s * sy, c * sy, ins.x + c * ox - s * oy, ins.y + s * ox + c * oy];
            const toBase: M = [1, 0, 0, 1, -base.x, -base.y];
            walk(b.entities, mul(m, mul(local, toBase)), depth + 1, layer);
          }
          break;
        }
        case "ATTRIB": case "ATTDEF": case "VIEWPORT": case "SEQEND": case "VERTEX_2D": case "VERTEX_3D":
          break;
        default:
          skip(e.type);
      }
    }
  };

  const top = ms ? db.entities.filter((e) => !e.ownerBlockRecordSoftId || e.ownerBlockRecordSoftId === ms.handle) : db.entities;
  walk(top, ID, 0, "0");
  return finishSegments(segs, db.header?.INSUNITS ?? 0, skipped);
}
