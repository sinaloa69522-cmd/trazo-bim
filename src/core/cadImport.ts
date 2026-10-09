import type { Pt } from "./geometry";

export interface ImportedSegment { a: Pt; b: Pt; layer: string }
/** Texto importado: (x, y) es el inicio de la línea base; rot en grados, antihorario. */
export interface ImportedText { x: number; y: number; text: string; size: number; rot: number; layer: string }

export interface CadImportResult {
  segments: ImportedSegment[];
  texts?: ImportedText[];
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
export function finishSegments(segs: ImportedSegment[], insunits: number, skipped: Record<string, number>, texts: ImportedText[] = []): CadImportResult {
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
  for (const t of texts) { t.x *= scale; t.y = -t.y * scale; t.size *= scale; }
  const res: CadImportResult = { segments: segs, scale, unitsLabel, skipped };
  if (texts.length) res.texts = texts;
  if (segs.length) {
    let x0 = Infinity, y0 = Infinity;
    for (const s of segs) { x0 = Math.min(x0, s.a.x, s.b.x); y0 = Math.min(y0, s.a.y, s.b.y); }
    if (Math.abs(x0) > 1000 || Math.abs(y0) > 1000) {
      const dx = Math.round(x0), dy = Math.round(y0);
      for (const s of segs) { s.a = { x: s.a.x - dx, y: s.a.y - dy }; s.b = { x: s.b.x - dx, y: s.b.y - dy }; }
      for (const t of texts) { t.x -= dx; t.y -= dy; }
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

/**
 * Texto plano a partir del de AutoCAD: quita los códigos de formato de MTEXT (\P salto de línea,
 * {\f…; \H…; \C…;} fuentes, tamaños y colores, \S apilados) y traduce %%c, %%d y %%p.
 */
export function plainText(raw: string): string {
  let t = raw
    .replace(/\\\\/g, "\u0000")
    .replace(/\\P/g, "\n").replace(/\\~/g, " ")
    .replace(/\\S([^;^#/]*)[\^#/]([^;]*);/g, "$1/$2")
    .replace(/\\[AaCcFfHhQqTtWwp][^;]*;/g, "")
    .replace(/\\[LlOoKkNn]/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoOkK]/g, "").replace(/%%%/g, "%")
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  t = t.replace(/\u0000/g, "\\");
  return t.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim();
}

/** Ancho aproximado de un texto (como el rectángulo de los textos de la planta: 0,6 de la altura por letra). */
const textWidth = (s: string, h: number) => s.length * h * 0.6;

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
  /** TEXT, MTEXT: el texto es una cadena; ATTRIB: va dentro de un objeto de texto */
  text?: string | DwgTextData;
  textHeight?: number; halign?: number; valign?: number;
  attachmentPoint?: number; direction?: P3; lineSpacing?: number;
  attribs?: DwgEntity[];
  alignmentPoint?: P3;
}
interface DwgTextData { text?: string; startPoint?: P3; endPoint?: P3; textHeight?: number; rotation?: number; halign?: number; valign?: number }
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
 * Segmentos y textos del espacio modelo de un DWG: líneas, polilíneas (con sus arcos), arcos, círculos,
 * elipses, splines (por sus puntos), textos y textos de párrafo, bloques insertados (explotados, con sus
 * atributos) y cotas (dibujadas con su bloque). Los sombreados no se importan.
 */
export function dwgSegments(db: DwgDatabaseLike): CadImportResult {
  const segs: ImportedSegment[] = [], texts: ImportedText[] = [], skipped: Record<string, number> = {};
  const blocks = new Map((db.tables?.BLOCK_RECORD?.entries ?? []).map((b) => [b.name.toLowerCase(), b]));
  const ms = blocks.get("*model_space");
  const skip = (t: string) => { skipped[t] = (skipped[t] ?? 0) + 1; };

  const emit = (pts: Pt[], m: M, layer: string) => {
    for (let i = 0; i + 1 < pts.length && segs.length < MAX_SEGMENTS; i++) {
      const a = apply(m, pts[i]), b = apply(m, pts[i + 1]);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) segs.push({ a, b, layer });
    }
  };

  /** Coloca un texto dado en el sistema de la entidad: p es el inicio de la línea base y a el giro (rad). */
  const emitText = (str: string, p: Pt, h: number, a: number, m: M, layer: string) => {
    if (!str || !(h > 0)) return;
    const q = apply(m, p), ax = Math.atan2(m[1], m[0]), sy = Math.hypot(m[2], m[3]);
    texts.push({ x: q.x, y: q.y, text: str, size: h * sy, rot: (((a + ax) * 180) / Math.PI + 360) % 360, layer });
  };
  /** TEXT y ATTRIB: alineación horizontal (0 izquierda, 1 centro, 2 derecha, 4 medio) y vertical (0 base, 1 abajo, 2 medio, 3 arriba). */
  const singleText = (d: DwgTextData, m: M, layer: string) => {
    const str = plainText(d.text ?? ""), h = d.textHeight ?? 0, a = d.rotation ?? 0, hal = d.halign ?? 0, val = d.valign ?? 0;
    if (!str || !d.startPoint) return;
    const aligned = (hal !== 0 || val !== 0) && hal !== 3 && hal !== 5 && d.endPoint;
    const base = aligned ? d.endPoint! : d.startPoint, w = textWidth(str, h);
    const u = !aligned ? 0 : hal === 1 || hal === 4 ? -w / 2 : hal === 2 ? -w : 0;
    const v = !aligned ? 0 : val === 2 || hal === 4 ? -h / 2 : val === 3 ? -h : 0;
    emitText(str, { x: base.x + u * Math.cos(a) - v * Math.sin(a), y: base.y + u * Math.sin(a) + v * Math.cos(a) }, h, a, m, layer);
  };
  /** MTEXT: un texto por línea; el punto de inserción es la esquina o el centro según attachmentPoint (1 a 9). */
  const multiText = (e: DwgEntity, m: M, layer: string) => {
    const lines = plainText(typeof e.text === "string" ? e.text : "").split("\n").filter((l, i, all) => l || i < all.length - 1);
    const h = e.textHeight ?? 0, p = e.insertionPoint;
    if (!lines.length || !p || !(h > 0)) return;
    const a = e.direction && Math.hypot(e.direction.x, e.direction.y) > 1e-9 ? Math.atan2(e.direction.y, e.direction.x) : e.rotation ?? 0;
    const ap = e.attachmentPoint ?? 1, row = Math.floor((ap - 1) / 3), col = (ap - 1) % 3;
    const ls = h * 1.667 * (e.lineSpacing || 1), H = h + (lines.length - 1) * ls;
    const v0 = row === 0 ? -h : row === 1 ? H / 2 - h : H - h;
    lines.forEach((l, i) => {
      if (!l.trim()) return;
      const w = textWidth(l, h), u = col === 0 ? 0 : col === 1 ? -w / 2 : -w, v = v0 - i * ls;
      emitText(l, { x: p.x + u * Math.cos(a) - v * Math.sin(a), y: p.y + u * Math.sin(a) + v * Math.cos(a) }, h, a, m, layer);
    });
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
        case "TEXT":
          singleText({ ...e, text: typeof e.text === "string" ? e.text : "" }, m, layer);
          break;
        case "MTEXT":
          multiText(e, m, layer);
          break;
        case "DIMENSION": {
          // la cota se dibuja con su bloque anónimo (*D…): líneas, flechas y el texto con la medida, ya en su sitio
          const b = blocks.get((e.name ?? "").toLowerCase());
          if (b?.entities && depth <= 8) walk(b.entities, m, depth + 1, layer); else skip("DIMENSION");
          break;
        }
        case "INSERT": {
          // los atributos (el texto variable de los símbolos) ya vienen colocados en el dibujo
          for (const at of e.attribs ?? []) if (at.isVisible !== false && typeof at.text === "object") singleText(at.text, m, !at.layer || at.layer === "0" ? layer : at.layer);
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
        // ATTDEF es la plantilla del atributo dentro del bloque; lo que se ve es el ATTRIB de cada inserción
        case "ATTRIB": case "ATTDEF": case "VIEWPORT": case "SEQEND": case "VERTEX_2D": case "VERTEX_3D": case "POINT":
          break;
        default:
          skip(e.type);
      }
    }
  };

  const top = ms ? db.entities.filter((e) => !e.ownerBlockRecordSoftId || e.ownerBlockRecordSoftId === ms.handle) : db.entities;
  walk(top, ID, 0, "0");
  return finishSegments(segs, db.header?.INSUNITS ?? 0, skipped, texts);
}
