import { dir, type Pt } from "./geometry";
import { nextId, type Line, type Model, type Wall } from "./model";

type Seg = { x1: number; y1: number; x2: number; y2: number };
export type Linear = { type: "wall" | "line"; id: number };

const EPS = 1e-6;

function getSeg(m: Model, r: Linear): (Wall | Line) | undefined {
  return r.type === "wall" ? m.walls.find((w) => w.id === r.id) : m.lines.find((l) => l.id === r.id);
}

/** Muros y líneas que actúan como bordes de corte (sus ejes). */
function edges(m: Model, skip: Seg): Seg[] {
  return [...m.walls, ...m.lines].filter((s) => s !== skip);
}

/** Intersección de las rectas p y q: parámetros t (en p) y u (en q). */
function lineHit(p: Seg, q: Seg): { t: number; u: number } | null {
  const rx = p.x2 - p.x1, ry = p.y2 - p.y1, sx = q.x2 - q.x1, sy = q.y2 - q.y1;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = q.x1 - p.x1, qy = q.y1 - p.y1;
  return { t: (qx * sy - qy * sx) / den, u: (qx * ry - qy * rx) / den };
}

/** Parámetros (0..1) donde otros muros o líneas cortan al segmento. */
export function cutParams(m: Model, s: Seg): number[] {
  const ts: number[] = [];
  for (const e of edges(m, s)) {
    const h = lineHit(s, e);
    if (h && h.t > EPS && h.t < 1 - EPS && h.u >= -EPS && h.u <= 1 + EPS) ts.push(h.t);
  }
  return ts.sort((a, b) => a - b);
}

const project = (s: Seg, p: Pt) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  return ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / l2;
};
const at = (s: Seg, t: number): Pt => ({ x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t });

/**
 * Recorta el tramo de un muro o línea que queda entre los dos bordes más cercanos al punto pulsado
 * (o entre un borde y el extremo). Si el tramo queda en medio, el elemento se divide en dos.
 * Las puertas y ventanas del tramo borrado desaparecen; las demás pasan al trozo que las contiene.
 * Devuelve false si no hay ningún borde que lo corte.
 */
export function trim(m: Model, r: Linear, click: Pt): boolean {
  const s = getSeg(m, r);
  if (!s) return false;
  const ts = cutParams(m, s);
  if (!ts.length) return false;
  const tc = Math.max(0, Math.min(1, project(s, click)));
  const lo = Math.max(0, ...ts.filter((t) => t < tc)), hi = Math.min(1, ...ts.filter((t) => t > tc));
  const keep: [number, number][] = [];
  if (lo > EPS) keep.push([0, lo]);
  if (hi < 1 - EPS) keep.push([hi, 1]);
  const orig = { ...s }, L = Math.hypot(orig.x2 - orig.x1, orig.y2 - orig.y1);
  const ops = r.type === "wall" ? m.openings.filter((o) => o.wallId === s.id) : [];

  if (!keep.length) {
    if (r.type === "wall") { m.walls = m.walls.filter((w) => w !== s); m.openings = m.openings.filter((o) => o.wallId !== s.id); }
    else m.lines = m.lines.filter((l) => l !== s);
    return true;
  }
  const kept = new Set<number>();
  keep.forEach(([a, b], i) => {
    const pa = at(orig, a), pb = at(orig, b);
    const piece = i === 0 ? s : { ...s, id: nextId(m) };
    Object.assign(piece, { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
    if (i > 0) (r.type === "wall" ? m.walls : m.lines).push(piece as Wall & Line);
    const len = (b - a) * L;
    for (const o of ops) {
      const sc = (o.t - a) * L; // centro del hueco medido desde el inicio del trozo
      if (!kept.has(o.id) && sc - o.width / 2 >= -EPS && sc + o.width / 2 <= len + EPS) {
        o.wallId = piece.id; o.t = sc / len; kept.add(o.id);
      }
    }
  });
  if (ops.length) m.openings = m.openings.filter((o) => !ops.includes(o) || kept.has(o.id));
  return true;
}

/**
 * Alarga el extremo más cercano al punto pulsado hasta el primer muro o línea que encuentre en su dirección.
 * Los huecos conservan su distancia al extremo que no se mueve. Devuelve false si no hay nada que alcanzar.
 */
export function extend(m: Model, r: Linear, click: Pt): boolean {
  const s = getSeg(m, r);
  if (!s) return false;
  const end: 0 | 1 = project(s, click) < 0.5 ? 0 : 1;
  // rayo desde el extremo hacia fuera, expresado sobre la recta del segmento
  let best = Infinity;
  for (const e of edges(m, s)) {
    const h = lineHit(s, e);
    if (!h || h.u < -EPS || h.u > 1 + EPS) continue;
    const beyond = end === 1 ? h.t - 1 : -h.t; // distancia (en t) más allá del extremo
    if (beyond > EPS && beyond < best) best = beyond;
  }
  if (!isFinite(best)) return false;
  const Lold = dir(s).L;
  const p = at(s, end === 1 ? 1 + best : -best);
  if (end === 1) { s.x2 = p.x; s.y2 = p.y; } else { s.x1 = p.x; s.y1 = p.y; }
  if (r.type === "wall") {
    const Lnew = dir(s).L;
    for (const o of m.openings.filter((o) => o.wallId === s.id)) {
      const sAbs = o.t * Lold + (end === 0 ? Lnew - Lold : 0);
      o.t = sAbs / Lnew;
    }
  }
  return true;
}

/**
 * Copia paralela de un muro o línea a la distancia dada, hacia el lado del punto indicado.
 * Para muros la distancia es entre ejes; la copia no lleva puertas ni ventanas.
 */
export function offset(m: Model, r: Linear, dist: number, side: Pt): Linear | null {
  const s = getSeg(m, r);
  if (!s || dist <= 0) return null;
  const { ux, uy } = dir(s), nx = -uy, ny = ux;
  const sign = (side.x - s.x1) * nx + (side.y - s.y1) * ny >= 0 ? 1 : -1;
  const dx = nx * dist * sign, dy = ny * dist * sign;
  const c = { ...s, id: nextId(m), x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  if (r.type === "wall") m.walls.push(c as Wall); else m.lines.push(c as Line);
  return { type: r.type, id: c.id };
}
