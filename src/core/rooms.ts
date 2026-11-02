import { bounds, distSeg } from "./geometry";
import type { Model } from "./model";

/** Tamaño de celda del relleno, en metros. */
export const RC = 0.05;

export interface RoomInfo {
  ok: boolean;
  area: number;
  /** Tramos rellenos por fila: [fila, columna inicial, columna final) */
  runs: [number, number, number][];
  cx: number;
  cy: number;
  mask: Uint8Array | null;
}

export interface RoomGrid {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  rooms: Map<number, RoomInfo>;
}

/**
 * Calcula cada habitación rellenando celdas desde su punto semilla hasta los muros.
 * Las puertas y ventanas se tratan como cerradas, así el área es la superficie útil.
 * Si el relleno llega al borde, el espacio no está cerrado.
 */
export function computeRooms(m: Model): RoomGrid | null {
  if (!m.rooms.length) return null;
  const b = bounds(m);
  const nx = Math.ceil((b.x1 - b.x0) / RC), ny = Math.ceil((b.y1 - b.y0) / RC);
  const occ = new Uint8Array(nx * ny);
  for (const w of m.walls) {
    const h = w.thick / 2 + RC * 0.5;
    const i0 = Math.max(0, Math.floor((Math.min(w.x1, w.x2) - h - b.x0) / RC));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(w.x1, w.x2) + h - b.x0) / RC));
    const j0 = Math.max(0, Math.floor((Math.min(w.y1, w.y2) - h - b.y0) / RC));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(w.y1, w.y2) + h - b.y0) / RC));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        if (distSeg(b.x0 + (i + 0.5) * RC, b.y0 + (j + 0.5) * RC, w.x1, w.y1, w.x2, w.y2).d <= h) occ[j * nx + i] = 1;
  }
  const grid: RoomGrid = { x0: b.x0, y0: b.y0, nx, ny, rooms: new Map() };
  for (const r of m.rooms) {
    const res: RoomInfo = { ok: false, area: 0, runs: [], cx: r.x, cy: r.y, mask: null };
    grid.rooms.set(r.id, res);
    const si = Math.floor((r.x - b.x0) / RC), sj = Math.floor((r.y - b.y0) / RC);
    if (si < 0 || sj < 0 || si >= nx || sj >= ny || occ[sj * nx + si]) continue;
    const seen = new Uint8Array(nx * ny), q = new Int32Array(nx * ny);
    let qh = 0, qt = 0, open = false, cnt = 0, sx = 0, sy = 0;
    q[qt++] = sj * nx + si;
    seen[sj * nx + si] = 1;
    while (qh < qt) {
      const k = q[qh++], i = k % nx, j = (k - i) / nx;
      cnt++; sx += i; sy += j;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { open = true; break; }
      for (const n of [k - 1, k + 1, k - nx, k + nx]) if (!seen[n] && !occ[n]) { seen[n] = 1; q[qt++] = n; }
    }
    if (open) continue;
    for (let j = 0; j < ny; j++) {
      let st = -1;
      for (let i = 0; i <= nx; i++) {
        const v = i < nx && seen[j * nx + i];
        if (v && st < 0) st = i;
        if (!v && st >= 0) { res.runs.push([j, st, i]); st = -1; }
      }
    }
    Object.assign(res, {
      ok: true, area: cnt * RC * RC,
      cx: b.x0 + (sx / cnt + 0.5) * RC, cy: b.y0 + (sy / cnt + 0.5) * RC, mask: seen,
    });
  }
  return grid;
}

export function roomAt(m: Model, g: RoomGrid | null, x: number, y: number) {
  if (!g) return null;
  const i = Math.floor((x - g.x0) / RC), j = Math.floor((y - g.y0) / RC);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
  for (const r of m.rooms) {
    const c = g.rooms.get(r.id);
    if (c?.ok && c.mask![j * g.nx + i]) return r;
  }
  return null;
}

/**
 * Superficie construida de un nivel: lo cerrado por los muros, con su espesor (huecos de puertas y ventanas
 * cerrados). Se rellena el exterior desde el borde y se cuenta el resto.
 */
export function builtArea(m: Model): number {
  const g = outsideGrid(m);
  if (!g) return 0;
  let inside = 0;
  for (let k = 0; k < g.nx * g.ny; k++) if (!g.out[k]) inside++;
  return inside * g.C * g.C;
}

export interface OutsideGrid { x0: number; y0: number; C: number; nx: number; ny: number; out: Uint8Array; occ: Uint8Array }

/** Rejilla con lo que queda fuera del edificio (relleno desde el borde, sin cruzar muros ni vanos). */
export function outsideGrid(m: Model): OutsideGrid | null {
  if (!m.walls.length) return null;
  const xs = m.walls.flatMap((w) => [w.x1, w.x2]), ys = m.walls.flatMap((w) => [w.y1, w.y2]);
  const C = 0.04, pad = 0.5, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const nx = Math.ceil((Math.max(...xs) + pad - x0) / C), ny = Math.ceil((Math.max(...ys) + pad - y0) / C);
  if (nx * ny > 6e6) return null;
  const occ = new Uint8Array(nx * ny);
  for (const w of m.walls) {
    const h = w.thick / 2 + C * 0.5;
    const i0 = Math.max(0, Math.floor((Math.min(w.x1, w.x2) - h - x0) / C)), i1 = Math.min(nx - 1, Math.ceil((Math.max(w.x1, w.x2) + h - x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(w.y1, w.y2) - h - y0) / C)), j1 = Math.min(ny - 1, Math.ceil((Math.max(w.y1, w.y2) + h - y0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
      if (distSeg(x0 + (i + 0.5) * C, y0 + (j + 0.5) * C, w.x1, w.y1, w.x2, w.y2).d <= w.thick / 2) occ[j * nx + i] = 1;
  }
  const out = new Uint8Array(nx * ny), q = new Int32Array(nx * ny);
  let qt = 0, qh = 0;
  for (let i = 0; i < nx; i++) for (const j of [0, ny - 1]) { const k = j * nx + i; if (!occ[k] && !out[k]) { out[k] = 1; q[qt++] = k; } }
  for (let j = 0; j < ny; j++) for (const i of [0, nx - 1]) { const k = j * nx + i; if (!occ[k] && !out[k]) { out[k] = 1; q[qt++] = k; } }
  while (qh < qt) {
    const k = q[qh++], i = k % nx;
    for (const n of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k - nx, k + nx]) if (n >= 0 && n < nx * ny && !out[n] && !occ[n]) { out[n] = 1; q[qt++] = n; }
  }
  return { x0, y0, C, nx, ny, out, occ };
}

/** ¿El punto queda fuera del edificio? (fuera de la rejilla también cuenta como fuera) */
export function isOutside(g: OutsideGrid, x: number, y: number) {
  const i = Math.floor((x - g.x0) / g.C), j = Math.floor((y - g.y0) / g.C);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny || g.out[j * g.nx + i] === 1;
}

/** ¿El punto cae dentro del espacio calculado? */
export function inRoom(g: RoomGrid, c: RoomInfo, x: number, y: number) {
  const i = Math.floor((x - g.x0) / RC), j = Math.floor((y - g.y0) / RC);
  return !!c.mask && i >= 0 && j >= 0 && i < g.nx && j < g.ny && c.mask[j * g.nx + i] === 1;
}

/** Puntos a uno y otro lado del centro de un vano, justo fuera del espesor del muro. */
export function openingSides(m: Model, o: Model["openings"][number], extra = RC * 1.5): [{ x: number; y: number }, { x: number; y: number }] | null {
  const w = m.walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, s = o.t * L, off = w.thick / 2 + extra;
  const cx = w.x1 + ux * s, cy = w.y1 + uy * s;
  return [{ x: cx - uy * off, y: cy + ux * off }, { x: cx + uy * off, y: cy - ux * off }];
}

/**
 * Lado libre mínimo de un espacio: el lado del mayor cuadrado que cabe dentro (distancia de tablero
 * a la orilla). En un rectángulo es su lado corto.
 */
export function minSide(g: RoomGrid, c: RoomInfo): number {
  if (!c.mask) return 0;
  const { nx, ny } = g, m = c.mask, d = new Int32Array(nx * ny);
  const big = nx + ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (!m[k]) { d[k] = 0; continue; }
    let v = big;
    if (i > 0) v = Math.min(v, d[k - 1] + 1); else v = 1;
    if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + 1); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + 1); } else v = 1;
    d[k] = v;
  }
  let best = 0;
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    if (!m[k]) continue;
    let v = d[k];
    if (i === nx - 1 || j === ny - 1) v = 1;
    else {
      v = Math.min(v, d[k + 1] + 1, d[k + nx] + 1, d[k + nx + 1] + 1);
      if (i > 0) v = Math.min(v, d[k + nx - 1] + 1);
    }
    d[k] = v;
    best = Math.max(best, v);
  }
  // un cuadrado de lado n celdas tiene distancia máxima ceil(n/2); el relleno ya pierde media celda en cada muro
  return 2 * best * RC;
}

export interface LevelAreas { level: string; rooms: { name: string; area: number }[]; useful: number; built: number }

/** Cuadro de áreas: espacios de cada nivel, superficie útil (suma de espacios) y construida. */
export function areaTable(levels: (Model & { name: string })[]): LevelAreas[] {
  return levels.map((lv) => {
    const g = computeRooms(lv);
    const rooms = lv.rooms.map((r) => ({ name: r.name, area: g?.rooms.get(r.id)?.ok ? g.rooms.get(r.id)!.area : 0 })).filter((r) => r.area > 0);
    return { level: lv.name, rooms, useful: rooms.reduce((s, r) => s + r.area, 0), built: builtArea(lv) };
  });
}
