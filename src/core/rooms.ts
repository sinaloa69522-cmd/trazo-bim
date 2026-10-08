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
