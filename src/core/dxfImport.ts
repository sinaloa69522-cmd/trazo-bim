import type { Pt } from "./geometry";

export interface ImportedSegment { a: Pt; b: Pt; layer: string }

export interface DxfImportResult {
  segments: ImportedSegment[];
  /** Factor aplicado para pasar a metros */
  scale: number;
  unitsLabel: string;
  /** Entidades que no se importaron, por tipo */
  skipped: Record<string, number>;
}

// Códigos $INSUNITS: 1 pulgadas, 2 pies, 4 mm, 5 cm, 6 m
const UNITS: Record<number, [number, string]> = { 1: [0.0254, "pulgadas"], 2: [0.3048, "pies"], 4: [0.001, "mm"], 5: [0.01, "cm"], 6: [1, "m"] };

/**
 * Lee un DXF ASCII y devuelve sus segmentos rectos (LINE, LWPOLYLINE y POLYLINE),
 * en metros y con el eje Y hacia abajo como la planta.
 * Si el archivo no declara unidades y el dibujo mide más de 1000, se asume que está en mm.
 */
export function parseDxf(text: string): DxfImportResult {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) { i--; continue; }
    pairs.push([code, lines[i + 1].trim()]);
  }

  let insunits = 0;
  for (let i = 0; i < pairs.length - 1; i++)
    if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS" && pairs[i + 1][0] === 70) insunits = parseInt(pairs[i + 1][1], 10);

  const segs: ImportedSegment[] = [];
  const skipped: Record<string, number> = {};
  let inEntities = false, inBlock = false;

  // agrupa cada entidad (desde un código 0 hasta el siguiente)
  const entities: { type: string; data: [number, string][] }[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 2 && pairs[i - 1]?.[1] === "SECTION") inEntities = v === "ENTITIES";
    if (c !== 0) continue;
    if (v === "ENDSEC") { inEntities = false; continue; }
    if (v === "BLOCK") inBlock = true;
    if (v === "ENDBLK") { inBlock = false; continue; }
    if (!inEntities || inBlock) continue;
    const data: [number, string][] = [];
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) data.push(pairs[j++]);
    entities.push({ type: v, data });
  }

  const num = (d: [number, string][], code: number, def = 0) => { const p = d.find((x) => x[0] === code); return p ? parseFloat(p[1]) : def; };
  const layer = (d: [number, string][]) => d.find((x) => x[0] === 8)?.[1] ?? "0";
  const add = (a: Pt, b: Pt, lay: string) => { if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) segs.push({ a, b, layer: lay }); };

  for (let k = 0; k < entities.length; k++) {
    const { type, data } = entities[k];
    if (type === "LINE") add({ x: num(data, 10), y: num(data, 20) }, { x: num(data, 11), y: num(data, 21) }, layer(data));
    else if (type === "LWPOLYLINE") {
      const xs = data.filter((x) => x[0] === 10).map((x) => parseFloat(x[1]));
      const ys = data.filter((x) => x[0] === 20).map((x) => parseFloat(x[1]));
      const pts = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }));
      for (let i = 0; i + 1 < pts.length; i++) add(pts[i], pts[i + 1], layer(data));
      if (num(data, 70) % 2 === 1 && pts.length > 2) add(pts[pts.length - 1], pts[0], layer(data));
    } else if (type === "POLYLINE") {
      const pts: Pt[] = [], lay = layer(data), closed = num(data, 70) % 2 === 1;
      while (entities[k + 1]?.type === "VERTEX") { k++; pts.push({ x: num(entities[k].data, 10), y: num(entities[k].data, 20) }); }
      for (let i = 0; i + 1 < pts.length; i++) add(pts[i], pts[i + 1], lay);
      if (closed && pts.length > 2) add(pts[pts.length - 1], pts[0], lay);
    } else if (type !== "SEQEND") skipped[type] = (skipped[type] ?? 0) + 1;
  }

  let [scale, unitsLabel] = UNITS[insunits] ?? [1, "m"];
  if (!UNITS[insunits] && segs.length) {
    let ext = 0;
    for (const s of segs) ext = Math.max(ext, Math.abs(s.a.x), Math.abs(s.a.y), Math.abs(s.b.x), Math.abs(s.b.y));
    if (ext > 1000) [scale, unitsLabel] = [0.001, "mm (supuesto)"];
  }
  for (const s of segs) {
    s.a = { x: s.a.x * scale, y: -s.a.y * scale };
    s.b = { x: s.b.x * scale, y: -s.b.y * scale };
  }
  return { segments: segs, scale, unitsLabel, skipped };
}
