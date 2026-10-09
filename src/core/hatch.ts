// Sombreados: tramas de líneas como las de AutoCAD (archivos .pat), recortadas por un contorno con islas.
import type { Pt } from "./geometry";

/**
 * Familia de líneas paralelas de una trama, en coordenadas de la planta (Y hacia abajo).
 * angle en grados; base es un punto de la primera línea; offset, el paso de una línea a la siguiente;
 * dashes, trazos (+) y huecos (-) que se repiten a lo largo de la línea desde base (vacío: continua; 0: punto).
 */
export interface PatLine { angle: number; base: Pt; offset: Pt; dashes: number[] }

/** Definición de la biblioteca como en un .pat (eje Y hacia arriba): [ángulo, x, y, avance, separación, ...trazos], en metros. */
type PatRow = [number, number, number, number, number, ...number[]];

export interface HatchPattern {
  id: string;
  label: string;
  /** Nombre de la trama equivalente de AutoCAD */
  acad: string;
  solid?: boolean;
  rows: PatRow[];
}

export const HATCH_PATTERNS: HatchPattern[] = [
  { id: "solido", label: "Sólido", acad: "SOLID", solid: true, rows: [] },
  { id: "diagonal", label: "Rayado 45°", acad: "ANSI31", rows: [[45, 0, 0, 0, 0.08]] },
  { id: "cruzado", label: "Rayado cruzado", acad: "ANSI37", rows: [[45, 0, 0, 0, 0.08], [135, 0, 0, 0, 0.08]] },
  { id: "ladrillo", label: "Fábrica", acad: "AR-B816", rows: [[0, 0, 0, 0, 0.2], [90, 0, 0, 0.2, 0.2, 0.2, -0.2]] },
  { id: "baldosa", label: "Baldosa 30×30", acad: "NET", rows: [[0, 0, 0, 0, 0.3], [90, 0, 0, 0, 0.3]] },
  {
    id: "hormigon", label: "Hormigón", acad: "AR-CONC",
    rows: [[50, 0, 0, 0.05, 0.12, 0.03, -0.09], [355, 0, 0, -0.04, 0.09, 0.02, -0.1], [100, 0.03, 0.02, 0.06, 0.15, 0.015, -0.12]],
  },
  {
    id: "tierra", label: "Terreno", acad: "EARTH",
    rows: [
      [0, 0, 0, 0.15, 0.15, 0.15, -0.15], [0, 0, 0.05625, 0.15, 0.15, 0.15, -0.15], [0, 0, 0.1125, 0.15, 0.15, 0.15, -0.15],
      [90, 0.01875, 0.13125, 0.15, 0.15, 0.15, -0.15], [90, 0.075, 0.13125, 0.15, 0.15, 0.15, -0.15], [90, 0.13125, 0.13125, 0.15, 0.15, 0.15, -0.15],
    ],
  },
];

/** Trama de un sombreado importado: lleva sus propias líneas. */
export const IMPORTED = "importado";

export const hatchPattern = (id: string) => HATCH_PATTERNS.find((p) => p.id === id) ?? null;

export interface HatchLike { pattern: string; scale: number; angle: number; lines?: PatLine[] }

const rot = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

/** Pasa una familia de líneas del sistema de AutoCAD (Y hacia arriba) a la planta (Y hacia abajo), o al revés. */
export const flipLine = (l: PatLine): PatLine => ({ angle: -l.angle, base: { x: l.base.x, y: -l.base.y }, offset: { x: l.offset.x, y: -l.offset.y }, dashes: l.dashes });

/** Líneas de trama de un sombreado: las de la biblioteca a su escala y giro, o las importadas. Vacío si es sólido. */
export function patternLines(h: HatchLike): PatLine[] {
  if (h.pattern === IMPORTED) return h.lines ?? [];
  const p = hatchPattern(h.pattern);
  if (!p || p.solid) return [];
  const k = h.scale > 0 ? h.scale : 1;
  return p.rows.map(([a, bx, by, dx, dy, ...dashes]) => flipLine({
    angle: a + h.angle,
    base: rot({ x: bx * k, y: by * k }, h.angle),
    // en el .pat el paso va en los ejes de la propia línea
    offset: rot(rot({ x: dx * k, y: dy * k }, a), h.angle),
    dashes: dashes.map((d) => d * k),
  }));
}

export const isSolid = (h: HatchLike) => h.pattern !== IMPORTED ? !!hatchPattern(h.pattern)?.solid : !(h.lines?.length);

/** Separación mínima entre líneas de la trama (para saber si a esa escala se ve como mancha). */
export function patternSpacing(lines: PatLine[]): number {
  let s = Infinity;
  for (const l of lines) {
    const a = (l.angle * Math.PI) / 180, d = Math.abs(-Math.sin(a) * l.offset.x + Math.cos(a) * l.offset.y);
    if (d > 1e-9) s = Math.min(s, d);
  }
  return s;
}

export interface HatchSegments {
  segs: [Pt, Pt][];
  /** La trama es tan densa que no se ha generado: se dibuja como mancha */
  dense: boolean;
}

/**
 * Trazos de las líneas de trama dentro de los contornos (regla par-impar: un contorno dentro de otro es una isla).
 * Si salen más de max trazos, se abandona y se marca como densa.
 */
export function hatchSegments(loops: Pt[][], lines: PatLine[], max = 40000): HatchSegments {
  const segs: [Pt, Pt][] = [];
  const pts = loops.flat();
  if (!pts.length) return { segs, dense: false };
  for (const l of lines) {
    const a = (l.angle * Math.PI) / 180, d = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -d.y, y: d.x };
    const step = l.offset.x * n.x + l.offset.y * n.y, shift = l.offset.x * d.x + l.offset.y * d.y;
    if (Math.abs(step) < 1e-9) continue;
    let t0 = Infinity, t1 = -Infinity;
    for (const p of pts) { const t = (p.x - l.base.x) * n.x + (p.y - l.base.y) * n.y; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const k0 = Math.ceil(Math.min(t0 / step, t1 / step) - 1e-9), k1 = Math.floor(Math.max(t0 / step, t1 / step) + 1e-9);
    if (k1 - k0 > max) return { segs: [], dense: true };
    const period = l.dashes.reduce((s, x) => s + Math.abs(x), 0);
    for (let k = k0; k <= k1; k++) {
      const o = { x: l.base.x + l.offset.x * k, y: l.base.y + l.offset.y * k };
      // cortes de la recta con los contornos, como posición a lo largo de la línea
      const us: number[] = [];
      for (const loop of loops) for (let i = 0; i < loop.length; i++) {
        const p = loop[i], q = loop[(i + 1) % loop.length];
        const fp = (p.x - o.x) * n.x + (p.y - o.y) * n.y, fq = (q.x - o.x) * n.x + (q.y - o.y) * n.y;
        if ((fp > 0) === (fq > 0)) continue;
        const s = fp / (fp - fq), x = p.x + (q.x - p.x) * s, y = p.y + (q.y - p.y) * s;
        us.push((x - o.x) * d.x + (y - o.y) * d.y);
      }
      us.sort((u, v) => u - v);
      const at = (u: number): Pt => ({ x: o.x + d.x * u, y: o.y + d.y * u });
      for (let i = 0; i + 1 < us.length; i += 2) {
        const u0 = us[i], u1 = us[i + 1];
        if (u1 - u0 < 1e-9) continue;
        if (!(period > 1e-9)) { segs.push([at(u0), at(u1)]); }
        else {
          // el patrón de trazos arranca en base y avanza shift en cada línea
          const ph = shift * k;
          let u = ph + Math.floor((u0 - ph) / period) * period;
          if ((u1 - u0) / period > max) return { segs: [], dense: true };
          while (u < u1) {
            for (const dl of l.dashes) {
              const len = Math.abs(dl);
              if (dl >= 0) {
                const s0 = Math.max(u, u0), s1 = Math.min(u + len, u1);
                if (dl === 0 ? u >= u0 && u <= u1 : s1 > s0) segs.push([at(s0), at(dl === 0 ? s0 : s1)]);
              }
              u += len;
              if (u >= u1) break;
            }
          }
        }
        if (segs.length > max) return { segs: [], dense: true };
      }
    }
  }
  return { segs, dense: false };
}

/** ¿Está el punto dentro del sombreado (regla par-impar)? */
export function inHatch(p: Pt, loops: Pt[][]): boolean {
  let inside = false;
  for (const loop of loops) for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const signedArea = (q: Pt[]) => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };

/** Superficie sombreada: cada contorno suma o resta según cuántos lo rodean (par-impar). */
export function hatchArea(loops: Pt[][]): number {
  let s = 0;
  loops.forEach((q, i) => {
    const depth = loops.filter((o, j) => j !== i && q.length && inHatch(q[0], [o])).length;
    s += (depth % 2 ? -1 : 1) * Math.abs(signedArea(q));
  });
  return Math.max(0, s);
}

/**
 * Descompone el sombreado en trapecios horizontales (para exportarlo como SOLID en DXF R12).
 * Cada trapecio es [arriba-izquierda, arriba-derecha, abajo-izquierda, abajo-derecha].
 */
export function solidTrapezoids(loops: Pt[][], max = 20000): [Pt, Pt, Pt, Pt][] {
  const edges: [Pt, Pt][] = [];
  for (const q of loops) for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; if (a.y !== b.y) edges.push(a.y < b.y ? [a, b] : [b, a]); }
  const ys = [...new Set(loops.flat().map((p) => p.y))].sort((a, b) => a - b);
  const out: [Pt, Pt, Pt, Pt][] = [];
  const xAt = (e: [Pt, Pt], y: number) => e[0].x + ((e[1].x - e[0].x) * (y - e[0].y)) / (e[1].y - e[0].y);
  for (let i = 0; i + 1 < ys.length && out.length < max; i++) {
    const ya = ys[i], yb = ys[i + 1], ym = (ya + yb) / 2;
    const cross = edges.filter((e) => e[0].y <= ym && e[1].y > ym).sort((e, f) => xAt(e, ym) - xAt(f, ym));
    for (let j = 0; j + 1 < cross.length; j += 2) {
      const l = cross[j], r = cross[j + 1];
      out.push([{ x: xAt(l, ya), y: ya }, { x: xAt(r, ya), y: ya }, { x: xAt(l, yb), y: yb }, { x: xAt(r, yb), y: yb }]);
    }
  }
  return out;
}

/**
 * Contornos de una máscara de celdas (relleno de una habitación): el exterior y los de las islas (pilares),
 * con los peldaños de las paredes inclinadas enderezados. El mayor va primero.
 */
export function maskLoops(mask: Uint8Array, nx: number, ny: number, x0: number, y0: number, cell: number): Pt[][] {
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && mask[j * nx + i] === 1;
  // aristas del borde, orientadas para dejar el interior a la derecha (en pantalla, sentido horario)
  const next = new Map<number, number[]>();
  const key = (i: number, j: number) => j * (nx + 1) + i;
  const add = (a: number, b: number) => { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!inside(i, j)) continue;
    if (!inside(i, j - 1)) add(key(i, j), key(i + 1, j));
    if (!inside(i + 1, j)) add(key(i + 1, j), key(i + 1, j + 1));
    if (!inside(i, j + 1)) add(key(i + 1, j + 1), key(i, j + 1));
    if (!inside(i - 1, j)) add(key(i, j + 1), key(i, j));
  }
  const loops: Pt[][] = [];
  for (const [start, outs] of next) {
    while (outs.length) {
      const ring: number[] = [start];
      let cur = outs.pop()!;
      while (cur !== start) {
        ring.push(cur);
        const o = next.get(cur);
        if (!o?.length) break;
        cur = o.pop()!;
      }
      const pts = ring.map((k) => ({ x: x0 + (k % (nx + 1)) * cell, y: y0 + Math.floor(k / (nx + 1)) * cell }));
      const s = simplifyLoop(pts, cell * 0.75);
      if (s.length >= 3) loops.push(s);
    }
  }
  return loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
}

/** Quita los vértices alineados y endereza los escalones menores que tol (Douglas-Peucker sobre el contorno cerrado). */
export function simplifyLoop(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts;
  // se parte el anillo por los dos puntos más alejados entre sí
  let ia = 0, ib = 0, best = -1;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d > best) { best = d; ib = i; } }
  best = -1;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[ib].x, pts[i].y - pts[ib].y); if (d > best) { best = d; ia = i; } }
  const [i0, i1] = ia < ib ? [ia, ib] : [ib, ia];
  const dp = (chain: Pt[]): Pt[] => {
    if (chain.length < 3) return chain;
    const a = chain[0], b = chain[chain.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let k = -1, dm = -1;
    for (let i = 1; i < chain.length - 1; i++) {
      const p = chain[i], d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
      if (d > dm) { dm = d; k = i; }
    }
    if (dm <= tol) return [a, b];
    return [...dp(chain.slice(0, k + 1)).slice(0, -1), ...dp(chain.slice(k))];
  };
  const c1 = pts.slice(i0, i1 + 1), c2 = [...pts.slice(i1), ...pts.slice(0, i0 + 1)];
  return [...dp(c1).slice(0, -1), ...dp(c2).slice(0, -1)];
}

/** Lleva las líneas de una trama importada con una transformación de puntos (mover, copiar, simetría, escalar). */
export function mapLines(lines: PatLine[], map: (p: Pt) => Pt): PatLine[] {
  return lines.map((l) => {
    const a = (l.angle * Math.PI) / 180, b = map(l.base), e = map({ x: l.base.x + Math.cos(a), y: l.base.y + Math.sin(a) });
    const o = map({ x: l.base.x + l.offset.x, y: l.base.y + l.offset.y }), k = Math.hypot(e.x - b.x, e.y - b.y) || 1;
    return { angle: (Math.atan2(e.y - b.y, e.x - b.x) * 180) / Math.PI, base: b, offset: { x: o.x - b.x, y: o.y - b.y }, dashes: l.dashes.map((x) => x * k) };
  });
}
