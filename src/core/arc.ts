// Arcos por tres puntos (inicio, fin y un punto por el que pasa) para muros curvos.
import type { Pt } from "./geometry";

export interface Arc { cx: number; cy: number; r: number; a0: number; sweep: number }

/** Arco que va de a a b pasando por c; null si los puntos están alineados. */
export function arcThrough(a: Pt, b: Pt, c: Pt): Arc | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const ang = (p: Pt) => Math.atan2(p.y - cy, p.x - cx);
  const a0 = ang(a), norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // sentido positivo si c está entre a y b yendo en ese sentido
  const toB = norm(ang(b) - a0), toC = norm(ang(c) - a0);
  const sweep = toC < toB ? toB : toB - 2 * Math.PI;
  return { cx, cy, r, a0, sweep };
}

/** Puntos del arco, de a a b, en tramos de como mucho maxLen metros y 10°. */
export function arcPoints(arc: Arc, maxLen = 0.4): Pt[] {
  const len = Math.abs(arc.sweep) * arc.r;
  const n = Math.max(3, Math.ceil(len / maxLen), Math.ceil(Math.abs(arc.sweep) / (Math.PI / 18)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = arc.a0 + (arc.sweep * i) / n;
    return { x: arc.cx + arc.r * Math.cos(t), y: arc.cy + arc.r * Math.sin(t) };
  });
}

/** Punto medio del arco que pasa por a y b con flecha (sagita) s a la izquierda de a→b. */
export function bulgePoint(a: Pt, b: Pt, s: number): Pt {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (a.x + b.x) / 2 + (-(b.y - a.y) / L) * s, y: (a.y + b.y) / 2 + ((b.x - a.x) / L) * s };
}
