// Recorrido en primera persona: dónde empezar, a qué altura va el suelo y choques con los muros.
// Coordenadas de planta (x, y); el visor 3D las pasa a (x, z).
import { dir, pointInPolygon, type Pt } from "../core/geometry";
import type { Level } from "../core/model";

/** Altura de los ojos sobre el suelo. */
export const EYE = 1.6;
/** Radio del cuerpo para los choques. */
export const BODY = 0.25;

/** Huecos de paso (puertas que llegan al suelo) de un muro, como tramos [a, b] a lo largo de él. */
function doorGaps(lv: Level, wallId: number, L: number): [number, number][] {
  return lv.openings
    .filter((o) => o.wallId === wallId && o.kind === "door" && o.sill < 0.3 && o.height > 1.7)
    .map((o) => [o.t * L - o.width / 2 + BODY * 0.6, o.t * L + o.width / 2 - BODY * 0.6] as [number, number])
    .filter(([a, b]) => b > a);
}

/** Empuja p fuera de los muros (con su grosor y el radio del cuerpo); por las puertas se pasa. */
export function collide(lv: Level, p: Pt, r = BODY): Pt {
  let q = { ...p };
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const w of lv.walls) {
      const { ux, uy, L } = dir(w);
      const s = (q.x - w.x1) * ux + (q.y - w.y1) * uy, n = -(q.x - w.x1) * uy + (q.y - w.y1) * ux;
      const half = w.thick / 2 + r;
      if (s < -r || s > L + r || Math.abs(n) >= half) continue;
      if (doorGaps(lv, w.id, L).some(([a, b]) => s > a && s < b)) continue;
      // punto más cercano del eje (con los extremos redondeados)
      const sc = Math.max(0, Math.min(L, s)), cx = w.x1 + ux * sc, cy = w.y1 + uy * sc;
      const dx = q.x - cx, dy = q.y - cy, d = Math.hypot(dx, dy);
      if (d >= half) continue;
      if (d < 1e-6) q = { x: q.x - uy * half, y: q.y + ux * half };
      else q = { x: cx + (dx / d) * half, y: cy + (dy / d) * half };
      moved = true;
    }
    if (!moved) break;
  }
  return q;
}

/** Cota del suelo en p: la del nivel dentro de sus losas (o de sus muros si no tiene), si no el terreno. */
export function floorAt(lv: Level, p: Pt, grade: number, ground: boolean): number {
  if (!ground) return lv.elev;
  if (lv.slabs.length) return lv.slabs.some((s) => s.pts.length > 2 && pointInPolygon(p, s.pts) && !s.holes.some((h) => pointInPolygon(p, h))) ? lv.elev : grade;
  if (!lv.walls.length) return grade;
  const xs = lv.walls.flatMap((w) => [w.x1, w.x2]), ys = lv.walls.flatMap((w) => [w.y1, w.y2]);
  return p.x > Math.min(...xs) && p.x < Math.max(...xs) && p.y > Math.min(...ys) && p.y < Math.max(...ys) ? lv.elev : grade;
}

/**
 * Punto de partida: frente a la puerta de entrada (la primera que da al exterior), mirando hacia ella;
 * sin puertas, en medio de la casa. yaw: hacia dónde mira, en radianes desde +x hacia +y.
 */
export function walkStart(lv: Level, center: Pt): { p: Pt; yaw: number } {
  const doors = lv.openings.filter((o) => o.kind === "door");
  for (const o of doors) {
    const w = lv.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const { ux, uy, L } = dir(w), s = o.t * L, m = { x: w.x1 + ux * s, y: w.y1 + uy * s };
    let nx = -uy, ny = ux; // normal izquierda; se elige la que se aleja del centro
    if ((m.x - center.x) * nx + (m.y - center.y) * ny < 0) { nx = -nx; ny = -ny; }
    const out = { x: m.x + nx * 3, y: m.y + ny * 3 };
    // una puerta interior: desde fuera de ella todavía hay muros alrededor; se prefiere la que da al exterior
    const exterior = !lv.walls.some((x) => x !== w && segHits(out, m, x));
    if (exterior || o === doors[doors.length - 1]) return { p: out, yaw: Math.atan2(-ny, -nx) };
  }
  return { p: center, yaw: -Math.PI / 2 };
}

/** ¿Cruza el segmento a–b el eje del muro w? */
function segHits(a: Pt, b: Pt, w: { x1: number; y1: number; x2: number; y2: number }) {
  const d = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const P = { x: w.x1, y: w.y1 }, Q = { x: w.x2, y: w.y2 };
  return d(a, b, P) * d(a, b, Q) < 0 && d(P, Q, a) * d(P, Q, b) < 0;
}
