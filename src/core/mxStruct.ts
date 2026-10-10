// Estructura de concreto y mampostería al estilo de México (NTC de la CDMX y reglamentos locales):
// zapatas corridas bajo los muros, zapatas aisladas bajo las columnas, castillos, cadenas, trabes,
// losas macizas y ejes. Predimensionado de vivienda de uno a tres niveles; lo valida el estructurista.
import { dir, distSeg, loc, type Pt } from "./geometry";
import type { Column, Level, Project, Wall } from "./model";
import { isExterior } from "./permit";
import { computeRooms, RC } from "./rooms";

/** Niveles que cargan sobre la cimentación. */
const stories = (p: Project) => Math.max(1, p.levels.length);

// ---------- ejes ----------

export interface Axis { name: string; v: number }
/** Ejes de proyecto sobre los muros: numéricos en x (de izquierda a derecha) y con letra en y (de arriba abajo). */
export function axes(lv: Level): { x: Axis[]; y: Axis[] } {
  const xs: number[] = [], ys: number[] = [];
  for (const w of lv.walls) {
    const { L, ux, uy } = dir(w);
    if (L < 1) continue;
    if (Math.abs(ux) < 0.02) xs.push((w.x1 + w.x2) / 2);
    else if (Math.abs(uy) < 0.02) ys.push((w.y1 + w.y2) / 2);
  }
  for (const c of lv.columns ?? []) { xs.push(c.x); ys.push(c.y); }
  const cluster = (vs: number[]) => {
    const out: number[] = [];
    for (const v of [...vs].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 0.3) out.push(v);
    return out;
  };
  const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);
  return { x: cluster(xs).map((v, i) => ({ name: String(i + 1), v })), y: cluster(ys).map((v, i) => ({ name: letter(i), v })) };
}

// ---------- castillos ----------

export interface Castillo { x: number; y: number; mark: "K-1" }
/** Separación máxima entre castillos en un muro de carga (NTC mampostería: 3 m o 1.5 veces la altura). */
export const MAX_K = 3;

/**
 * Castillos: en los extremos, esquinas e intersecciones de muros, a cada 3 m como máximo en los tramos
 * y en los dos lados de los vanos grandes (más de 1/4 del muro o desde 1.80 m). Donde hay columna, no.
 */
export function castillos(lv: Level): Castillo[] {
  const out: Pt[] = [], near = (p: Pt, d = 0.25) => out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < d);
  const cols = lv.columns ?? [], onCol = (p: Pt) => cols.some((c) => Math.abs(p.x - c.x) < c.w / 2 + 0.2 && Math.abs(p.y - c.y) < c.d / 2 + 0.2);
  const add = (p: Pt) => { if (!near(p) && !onCol(p)) out.push(p); };
  const walls = lv.walls.filter((w) => w.thick >= 0.1 && dir(w).L > 0.3);
  for (const w of walls) { add({ x: w.x1, y: w.y1 }); add({ x: w.x2, y: w.y2 }); }
  for (const w of walls) {
    const { L } = dir(w), ops = lv.openings.filter((o) => o.wallId === w.id).map((o) => ({ a: o.t * L - o.width / 2, b: o.t * L + o.width / 2, w: o.width }));
    // vanos grandes: castillo en cada jamba
    for (const o of ops) if (o.w > L / 4 || o.w >= 1.8) { add(loc(w, Math.max(0, o.a - 0.08), 0)); add(loc(w, Math.min(L, o.b + 0.08), 0)); }
    // tramos: posiciones ya puestas sobre el muro, en orden; se repite por si un vano obliga a mover alguno
    for (let pass = 0; pass < 4; pass++) {
      const on = [...out, ...cols].map((p) => distSeg(p.x, p.y, w.x1, w.y1, w.x2, w.y2))
        .filter((r) => r.d < w.thick / 2 + 0.05).map((r) => r.t * L).sort((a, b) => a - b);
      let added = false;
      for (let i = 0; i + 1 < on.length; i++) {
        const gap = on[i + 1] - on[i];
        if (gap <= MAX_K + 0.05) continue;
        const n = Math.ceil(gap / MAX_K);
        for (let k = 1; k < n; k++) {
          const s = on[i] + (gap * k) / n, o = ops.find((q) => s > q.a - 0.1 && s < q.b + 0.1);
          // dentro de un vano: uno en cada jamba
          for (const t of o ? [o.a - 0.08, o.b + 0.08] : [s]) { const n0 = out.length; add(loc(w, Math.max(0, Math.min(L, t)), 0)); added ||= out.length > n0; }
        }
      }
      if (!added) break;
    }
  }
  return out.map((p) => ({ ...p, mark: "K-1" as const }));
}

// ---------- cimentación ----------

export interface StripFooting { mark: "ZC-1" | "ZC-2"; wall: Wall; B: number; poly: Pt[] }

/** Ancho de las zapatas corridas según los niveles que cargan (terreno de 8 t/m² supuesto). */
export function stripSize(p: Project, mark: "ZC-1" | "ZC-2") {
  const n = stories(p), B = mark === "ZC-1" ? [0.6, 0.8, 1.0][Math.min(n, 3) - 1] : [0.5, 0.7, 0.9][Math.min(n, 3) - 1];
  return { B, h: n > 1 ? 0.2 : 0.15, bars: n > 1 ? "Vs #3 @ 15 cm transv. + 4 Vs #3 long." : "Vs #3 @ 20 cm transv. + 3 Vs #3 long." };
}

/** Zapatas corridas bajo todos los muros de la planta baja: ZC-1 los de fachada y carga, ZC-2 los interiores. */
export function stripFootings(p: Project): StripFooting[] {
  const lv = p.levels[0];
  if (!lv) return [];
  return lv.walls.filter((w) => w.thick >= 0.1 && dir(w).L > 0.3).map((w) => {
    const mark = isExterior(w) ? "ZC-1" : "ZC-2", { B } = stripSize(p, mark), { L } = dir(w), h = B / 2;
    // se prolonga medio ancho en los extremos para cerrar las esquinas
    return { mark, wall: w, B, poly: [loc(w, -h, -h), loc(w, L + h, -h), loc(w, L + h, h), loc(w, -h, h)] };
  });
}

export interface PadFooting { mark: "ZA-1"; col: Column; B: number; h: number; dado: number; poly: Pt[] }

export function padSize(p: Project) {
  const n = stories(p);
  return { B: [1.0, 1.2, 1.4][Math.min(n, 3) - 1], h: n > 1 ? 0.3 : 0.25, bars: n > 1 ? "Parrilla Vs #4 @ 15 cm a.s." : "Parrilla Vs #4 @ 20 cm a.s." };
}

/** Zapata aislada bajo cada columna de la planta baja, con su dado. */
export function padFootings(p: Project): PadFooting[] {
  const { B, h } = padSize(p);
  return (p.levels[0]?.columns ?? []).map((c) => {
    const b = Math.max(B, Math.max(c.w, c.d) + 0.5), r = b / 2;
    return { mark: "ZA-1" as const, col: c, B: b, h, dado: Math.max(c.w, c.d) + 0.1, poly: [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }] };
  });
}

// ---------- trabes ----------

export interface Beam { mark: string; a: Pt; b: Pt; span: number; bw: number; h: number; top: string; bottom: string; why: "column" | "opening" }

/** Sección de una trabe por su claro: peralte L/12 redondeado a 5 cm, mínimo 30 cm. */
export function beamSection(span: number) {
  const h = Math.max(0.3, Math.ceil((span / 12) * 20 - 1e-9) / 20), bw = h > 0.4 ? 0.25 : 0.2;
  const big = h >= 0.5;
  return { h, bw, top: big ? "2 Vs #5" : "2 Vs #4", bottom: big ? "3 Vs #5" : "3 Vs #4" };
}

/**
 * Trabes de un nivel (bajo la losa que lo cubre): de cada columna al apoyo más cercano en x e y
 * (otra columna o un muro, a menos de 6 m), y sobre los vanos de 1.80 m o más.
 */
export function beams(lv: Level): Beam[] {
  const out: Omit<Beam, "mark">[] = [], cols = lv.columns ?? [];
  const push = (a: Pt, b: Pt, why: Beam["why"]) => {
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (span < 0.3) return;
    if (out.some((q) => (Math.hypot(q.a.x - b.x, q.a.y - b.y) < 0.05 && Math.hypot(q.b.x - a.x, q.b.y - a.y) < 0.05))) return;
    out.push({ a, b, span, why, ...beamSection(span) });
  };
  for (const c of cols) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let best: Pt | null = null, bd = 6;
    for (const o of cols) {
      if (o === c) continue;
      const along = (o.x - c.x) * dx + (o.y - c.y) * dy, side = Math.abs((o.x - c.x) * dy - (o.y - c.y) * dx);
      if (along > 0.2 && side < 0.2 && along < bd) { bd = along; best = { x: o.x, y: o.y }; }
    }
    for (const w of lv.walls) {
      // cruce del rayo con el eje del muro
      const ex = w.x2 - w.x1, ey = w.y2 - w.y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((w.x1 - c.x) * ey - (w.y1 - c.y) * ex) / den, u = ((w.x1 - c.x) * dy - (w.y1 - c.y) * dx) / den;
      if (t > 0.2 && t < bd && u >= -0.01 && u <= 1.01) { bd = t; best = { x: c.x + dx * t, y: c.y + dy * t }; }
    }
    if (best) push({ x: c.x, y: c.y }, best, "column");
  }
  for (const w of lv.walls) {
    const { L } = dir(w);
    for (const o of lv.openings) if (o.wallId === w.id && o.width >= 1.8)
      push(loc(w, Math.max(0, o.t * L - o.width / 2 - 0.2), 0), loc(w, Math.min(L, o.t * L + o.width / 2 + 0.2), 0), "opening");
  }
  // una marca por sección distinta, de la más grande a la más chica
  const keys = [...new Set(out.map((b) => `${b.bw}x${b.h}`))].sort((a, b) => Number(b.split("x")[1]) - Number(a.split("x")[1]));
  return out.map((b) => ({ ...b, mark: `T-${keys.indexOf(`${b.bw}x${b.h}`) + 1}` }));
}

// ---------- losas ----------

export interface SlabPanel { mark: string; room: string; cx: number; cy: number; a: number; b: number; e: number; bars: string }

/** Peralte de una losa maciza perimetralmente apoyada: perímetro / 180, mínimo 10 cm (NTC concreto). */
export const slabThickness = (a: number, b: number) => Math.max(0.1, Math.ceil((2 * (a + b) * 100) / 180) / 100);

/** Tableros de losa: uno por habitación del nivel, con sus claros y su espesor; marca por espesor. */
export function slabPanels(lv: Level): SlabPanel[] {
  const g = computeRooms(lv);
  if (!g) return [];
  const out: Omit<SlabPanel, "mark">[] = [];
  for (const r of lv.rooms) {
    const info = g.rooms.get(r.id);
    if (!info?.ok || !info.runs.length) continue;
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const [j, a, b] of info.runs) { j0 = Math.min(j0, j); j1 = Math.max(j1, j); i0 = Math.min(i0, a); i1 = Math.max(i1, b); }
    const wx = (i1 - i0) * RC, wy = (j1 - j0 + 1) * RC, a = Math.min(wx, wy), b = Math.max(wx, wy), e = slabThickness(a, b);
    out.push({ room: r.name, cx: info.cx, cy: info.cy, a, b, e, bars: e >= 0.12 ? "Vs #3 @ 15 cm a.s." : "Vs #3 @ 20 cm a.s." });
  }
  const es = [...new Set(out.map((s) => s.e))].sort((x, y) => x - y);
  return out.map((s) => ({ ...s, mark: `L-${es.indexOf(s.e) + 1}` }));
}

// ---------- cuadros fijos ----------

export const K1 = { mark: "K-1", size: "15 × 15 cm", bars: "4 Vs #3", ties: "E #2 @ 20 cm (@ 10 cm en 50 cm de los extremos)", fc: "f'c = 200 kg/cm²" };
export const columnSpec = (c: Pick<Column, "w" | "d">) => ({
  mark: "C-1", size: `${Math.round(c.w * 100)} × ${Math.round(c.d * 100)} cm`,
  bars: Math.max(c.w, c.d) >= 0.35 ? "8 Vs #5" : "6 Vs #4", ties: "E #3 @ 15 cm (@ 10 cm en los extremos)", fc: "f'c = 250 kg/cm²",
});
export const CADENAS = [
  { mark: "CD-1", name: "Cadena de desplante", size: "15 × 20 cm", bars: "4 Vs #3", ties: "E #2 @ 20 cm" },
  { mark: "CC-1", name: "Cadena de cerramiento", size: "15 × 20 cm", bars: "4 Vs #3", ties: "E #2 @ 20 cm" },
];
