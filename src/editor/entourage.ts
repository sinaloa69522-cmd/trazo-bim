// Ambientación de fachadas, cortes y alzados: árboles detrás del edificio, personas y un auto delante,
// colocados solos a partir del dibujo y a escala real (persona de 1,70 m, auto de 4,40 m).
import type { Elevation } from "../core/elevation";

export type EntKind = "tree" | "person" | "car";
export interface EntItem {
  kind: EntKind;
  /** Posición en la vista: u del centro (del eje del tronco o de la persona; del auto, su centro) y z del suelo */
  u: number;
  z: number;
  /** Altura total (árbol y persona) */
  h: number;
  /** Mirar a la izquierda (auto y persona) */
  flip?: boolean;
  /** Figura de persona: 0 hombre, 1 mujer, 2 niño */
  variant?: number;
  /** "back": detrás del edificio; "front": delante */
  layer: "back" | "front";
}

export const CAR_L = 4.4;
const PERSON_H = 1.7;

/** ¿Es un corte? Los cortes llevan caras cortadas. */
const isCut = (el: Elevation) => el.faces.some((f) => f.cut);
const span = (pts: { u: number; z: number }[]) => {
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  return { u0, u1, z0, z1 };
};

/** Dónde va cada figura. Determinista: el mismo dibujo da siempre la misma ambientación. */
export function placeEntourage(el: Elevation): EntItem[] {
  const W = el.u1 - el.u0;
  if (!(W > 1) || !(el.z1 > el.z0)) return [];
  const out: EntItem[] = [], top = el.z1;
  // árboles detrás, asomando por los extremos y por encima de la cubierta
  const th = Math.min(9, top + 1.5, Math.max(4.5, top * 1.15));
  if (W >= 6) out.push({ kind: "tree", u: el.u0 + 0.6, z: 0, h: th * 0.9, layer: "back" });
  out.push({ kind: "tree", u: el.u1 - 0.6, z: 0, h: th, layer: "back" });

  if (isCut(el)) {
    // en el corte, una persona en el local más ancho de cada planta
    el.levels.forEach((lv, i) => {
      const zc = lv.elev + 1.2;
      const walls = el.faces.filter((f) => f.cut && f.kind === "cut").map((f) => span(f.pts)).filter((b) => b.z0 <= zc && b.z1 >= zc && b.u1 - b.u0 < 1.2).sort((a, b) => a.u0 - b.u0);
      let best: { a: number; b: number } | null = null;
      for (let k = 0; k + 1 < walls.length; k++) {
        const a = walls[k].u1, b = walls[k + 1].u0;
        if (b - a >= 1.2 && (!best || b - a > best.b - best.a)) best = { a, b };
      }
      if (best) out.push({ kind: "person", u: best.a + (best.b - best.a) * (i % 2 ? 0.62 : 0.4), z: lv.elev, h: PERSON_H, variant: i % 2, flip: i % 2 === 1, layer: "front" });
    });
    return out;
  }

  // en la fachada: una persona junto a la puerta, otra más allá y el auto en el extremo contrario
  // solo las puertas de la fachada (las de muros interiores quedan tapadas); depth crece hacia el observador
  const front = Math.max(...el.faces.filter((f) => !f.cut && (f.kind === "wall" || f.kind === "door" || f.kind === "glass")).map((f) => f.depth));
  const doors = el.faces.filter((f) => f.kind === "door" && !f.cut && f.depth >= front - 0.6).map((f) => span(f.pts)).filter((b) => b.z0 < 0.3);
  const mid = (el.u0 + el.u1) / 2;
  const door = doors.length ? doors.reduce((a, b) => (Math.abs((a.u0 + a.u1) / 2 - mid) <= Math.abs((b.u0 + b.u1) / 2 - mid) ? a : b)) : null;
  const doorU = door ? (door.u0 + door.u1) / 2 : el.u0 + W * 0.35;
  let car: { a: number; b: number } | null = null;
  if (W >= 9) {
    const left = doorU > mid;
    const a = left ? el.u0 + 0.4 : el.u1 - 0.4 - CAR_L;
    car = { a, b: a + CAR_L };
    out.push({ kind: "car", u: a + CAR_L / 2, z: 0, h: 1.45, flip: !left, layer: "front" });
  }
  // nadie delante de una puerta ni pegado al auto
  const free = (u: number) => u > el.u0 + 0.4 && u < el.u1 - 0.4 && (!car || u < car.a - 0.5 || u > car.b + 0.5) &&
    doors.every((d) => u < d.u0 - 0.3 || u > d.u1 + 0.3);
  const pa = [doorU + (door ? (door.u1 - door.u0) / 2 + 0.45 : 0), doorU - (door ? (door.u1 - door.u0) / 2 + 0.45 : 0)].find(free);
  if (pa !== undefined) out.push({ kind: "person", u: pa, z: 0, h: PERSON_H, variant: 0, flip: pa < doorU, layer: "front" });
  const pb = [0.5, 0.4, 0.6, 0.25, 0.75, 0.15, 0.85].map((t) => el.u0 + W * t).find((u) => free(u) && (pa === undefined || Math.abs(u - pa) >= 2.2));
  if (pb !== undefined) {
    out.push({ kind: "person", u: pb, z: 0, h: PERSON_H * 0.96, variant: 1, flip: true, layer: "front" });
    // un niño de la mano si hay sitio
    const pc = [pb + 0.55, pb - 0.55].find((u) => free(u) && (pa === undefined || Math.abs(u - pa) >= 0.8));
    if (pc !== undefined) out.push({ kind: "person", u: pc, z: 0, h: 1.1, variant: 2, flip: true, layer: "front" });
  }
  return out;
}

type Px = (v: number) => number;
const STROKE = "#5d6660", TREE_FILL = "#e3ebdd", BODY_FILL = "#ffffff";

/**
 * Dibuja las figuras de una capa. Se trazan primero con línea doble y se rellenan encima:
 * así solo queda el contorno exterior de la silueta, sin las juntas entre sus piezas.
 */
export function drawEntourage(ctx: CanvasRenderingContext2D, items: EntItem[], layer: "back" | "front", X: Px, Y: Px, s: number) {
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const lw = Math.max(0.5, Math.min(1, s * 0.012));
  for (const it of items) {
    if (it.layer !== layer) continue;
    const shapes: Path2D[] = [], lines: Path2D[] = [];
    if (it.kind === "tree") tree(it, X, Y, shapes, lines);
    else if (it.kind === "person") person(it, X, Y, shapes);
    else car(it, X, Y, s, shapes, lines);
    ctx.strokeStyle = STROKE; ctx.lineWidth = lw * 2;
    for (const p of shapes) ctx.stroke(p);
    ctx.fillStyle = it.kind === "tree" ? TREE_FILL : BODY_FILL;
    for (const p of shapes) ctx.fill(p);
    ctx.lineWidth = lw * 0.7;
    for (const p of lines) ctx.stroke(p);
  }
  ctx.restore();
}

function tree(it: EntItem, X: Px, Y: Px, shapes: Path2D[], lines: Path2D[]) {
  const h = it.h, r = Math.max(1.2, Math.min(2.3, h * 0.27)), cz = it.z + h - r, u = it.u;
  const trunk = new Path2D();
  trunk.moveTo(X(u - 0.13), Y(it.z)); trunk.lineTo(X(u - 0.09), Y(cz - r * 0.3)); trunk.lineTo(X(u + 0.09), Y(cz - r * 0.3)); trunk.lineTo(X(u + 0.13), Y(it.z)); trunk.closePath();
  shapes.push(trunk);
  // copa: corona de lóbulos alrededor de una elipse, con una semilla fija por posición
  const crown = new Path2D(), n = 11, seed = Math.abs(Math.sin(u * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = 0.86 + 0.14 * Math.sin(i * 2.3 + seed * 6);
    const pu = u + Math.cos(a) * r * k, pz = cz + Math.sin(a) * r * 0.92 * k;
    if (!i) crown.moveTo(X(pu), Y(pz));
    else {
      const am = ((i - 0.5) / n) * Math.PI * 2, kk = k * 1.16;
      crown.quadraticCurveTo(X(u + Math.cos(am) * r * kk), Y(cz + Math.sin(am) * r * 0.92 * kk), X(pu), Y(pz));
    }
  }
  crown.closePath();
  shapes.push(crown);
  // ramas dentro de la copa
  const br = new Path2D();
  br.moveTo(X(u), Y(cz - r * 0.3)); br.lineTo(X(u), Y(cz + r * 0.25));
  br.moveTo(X(u), Y(cz - r * 0.05)); br.lineTo(X(u - r * 0.45), Y(cz + r * 0.35));
  br.moveTo(X(u), Y(cz + 0.05 * r)); br.lineTo(X(u + r * 0.4), Y(cz + r * 0.45));
  lines.push(br);
}

/** Silueta de persona de pie, en metros a partir de los pies (altura de referencia 1,70). */
function person(it: EntItem, X: Px, Y: Px, shapes: Path2D[]) {
  const k = it.h / PERSON_H, d = it.flip ? -1 : 1, v = it.variant ?? 0;
  const P = (du: number, dz: number) => [X(it.u + du * k * d), Y(it.z + dz * k)] as const;
  const poly = (pts: [number, number][]) => { const p = new Path2D(); pts.forEach(([a, b], i) => { const [x, y] = P(a, b); if (i) p.lineTo(x, y); else p.moveTo(x, y); }); p.closePath(); shapes.push(p); };
  // cabeza
  const head = new Path2D(), [hx, hy] = P(0.01, 1.585), [rx] = P(0.115, 0);
  head.arc(hx, hy, Math.abs(rx - X(it.u)), 0, Math.PI * 2); shapes.push(head);
  // cuello y torso
  if (v === 1) {
    // mujer: falda hasta la rodilla
    poly([[-0.17, 1.43], [0.17, 1.43], [0.15, 1.05], [0.25, 0.52], [-0.25, 0.52], [-0.14, 1.05]]);
    poly([[-0.1, 0.55], [-0.04, 0.55], [-0.05, 0.02], [-0.11, 0]]);
    poly([[0.04, 0.55], [0.1, 0.55], [0.13, 0], [0.06, 0.02]]);
  } else {
    poly([[-0.2, 1.43], [0.2, 1.43], [0.17, 0.9], [-0.17, 0.9]]);
    // piernas, una adelantada
    poly([[-0.16, 0.92], [0.0, 0.92], [-0.06, 0.02], [-0.15, 0]]);
    poly([[0.0, 0.92], [0.16, 0.92], [0.2, 0], [0.09, 0.02]]);
  }
  poly([[-0.05, 1.5], [0.05, 1.5], [0.05, 1.4], [-0.05, 1.4]]);
  // brazos
  poly([[-0.2, 1.42], [-0.12, 1.4], [-0.15, 0.82], [-0.22, 0.84]]);
  poly([[0.12, 1.4], [0.2, 1.42], [0.27, 0.86], [0.2, 0.83]]);
}

function car(it: EntItem, X: Px, Y: Px, s: number, shapes: Path2D[], lines: Path2D[]) {
  const d = it.flip ? -1 : 1, u0 = it.u - (CAR_L / 2) * d;
  const P = (du: number, z: number) => [X(u0 + du * d), Y(it.z + z)] as const;
  const body = new Path2D();
  // perfil de un sedán: de la trasera (0) al frente (4,4)
  ([[0.02, 0.38], [0, 0.82], [0.2, 0.96], [1.05, 1.0], [1.65, 1.42], [2.95, 1.45], [3.55, 1.0], [4.28, 0.9], [4.4, 0.62], [4.36, 0.38]] as [number, number][])
    .forEach(([a, b], i) => { const [x, y] = P(a, b); if (i) body.lineTo(x, y); else body.moveTo(x, y); });
  body.closePath();
  shapes.push(body);
  const r = 0.33 * s;
  for (const a of [0.88, 3.52]) { const w = new Path2D(), [x, y] = P(a, 0.33); w.arc(x, y, r, 0, Math.PI * 2); shapes.push(w); }
  const det = new Path2D();
  // ventanas y pilar, puertas, rines
  for (const [a, b] of [[[1.78, 1.03], [1.95, 1.34]], [[1.95, 1.34], [2.88, 1.36]], [[2.88, 1.36], [3.36, 1.03]], [[3.36, 1.03], [1.78, 1.03]], [[2.42, 1.03], [2.42, 1.35]], [[2.42, 1.0], [2.42, 0.42]], [[1.55, 0.95], [1.55, 0.42]], [[3.4, 0.95], [3.4, 0.5]]] as [number, number][][]) {
    const [x0, y0] = P(a[0], a[1]), [x1, y1] = P(b[0], b[1]);
    det.moveTo(x0, y0); det.lineTo(x1, y1);
  }
  for (const a of [0.88, 3.52]) { const [x, y] = P(a, 0.33); det.moveTo(x + r, y); det.arc(x, y, r, 0, Math.PI * 2); det.moveTo(x + r * 0.55, y); det.arc(x, y, r * 0.55, 0, Math.PI * 2); }
  lines.push(det);
}
