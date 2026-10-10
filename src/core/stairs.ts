// Geometría de las escaleras: recta, recta con descanso, en L, en U (ida y vuelta) y de caracol.
// Todo sale de aquí como piezas (peldaños, descansos y el poste del caracol) con su planta y su cota,
// para que la planta, el 3D, las fachadas, los cortes, el DXF y el IFC dibujen lo mismo.
import { loc, type Pt } from "./geometry";
import type { Stair, StairKind } from "./model";
import { imperial } from "./units";

export const STAIR_TYPES: { id: StairKind; name: string; hint: string }[] = [
  { id: "recta", name: "Recta", hint: "Un solo tramo: clic en el arranque y en la llegada." },
  { id: "descanso", name: "Recta con descanso", hint: "Dos tramos seguidos con un descanso a media altura." },
  { id: "L", name: "En L", hint: "Primer tramo y descanso en la línea que dibujas; el segundo tramo gira 90°." },
  { id: "U", name: "En U", hint: "Ida y vuelta: sube, descansa y regresa en paralelo. Ocupa dos anchos." },
  { id: "caracol", name: "Caracol", hint: "Helicoidal alrededor de un poste: clic en el centro y en el radio exterior." },
];
export const stairTypeName = (k: StairKind | undefined) => STAIR_TYPES.find((t) => t.id === (k ?? "recta"))!.name;
/** Nombre en minúscula para una frase: "en L", "recta con descanso", "caracol". */
export const stairLabel = (k: StairKind | undefined) => { const s = stairTypeName(k); return s[0].toLowerCase() + s.slice(1); };
/** Huella cómoda: 28 cm (11" en EE.UU.). */
export const IDEAL_TREAD = () => (imperial() ? 11 * 0.0254 : 0.28);
/** Las de tramos con descanso se trazan con la huella dada: la línea dibujada solo marca la dirección. */
export const sizedByTread = (k: StairKind | undefined) => k === "descanso" || k === "L" || k === "U";

/** Longitud de la línea (primer tramo más descanso) para que la huella sea t. */
export function stairLenFor(s: Stair, t: number) {
  const n = riserCount(s.height), kind = s.kind ?? "recta", a = kind === "U" ? Math.ceil((n - 1) / 2) : Math.round((n - 1) / 2);
  if (kind === "descanso") return (n - 1) * t + s.width;
  if (kind === "L" || kind === "U") return a * t + s.width;
  return n * t;
}

/** Huella corta: menos de 25 cm, o de 18 cm en la línea de huella del caracol. */
export const shortTread = (s: Stair, tread: number) => tread < (s.kind === "caracol" ? 0.18 : 0.25);

const riserCount = (height: number) => Math.max(2, Math.round(height / (imperial() ? 0.1905 : 0.175)));

/** Radio del poste central del caracol. */
export const POST_R = 0.1;
/** Separación entre los dos tramos de la U (ojo de la escalera). */
const GAP = 0.1;

export interface StairPiece {
  pts: Pt[];
  /** Cota de la cara superior */
  z: number;
  /** Cota de la cara inferior (0 en los peldaños macizos) */
  z0: number;
  part: "step" | "landing" | "post";
}

export interface StairGeom {
  /** Número de contrahuellas */
  n: number;
  riser: number;
  /** Huella sobre la línea de huella */
  tread: number;
  /** Longitud de la línea de huella */
  L: number;
  pieces: StairPiece[];
  /** Línea de huella, del arranque a la llegada */
  path: Pt[];
  /** Contorno total en planta (para el hueco en la losa de arriba) */
  outline: Pt[];
}

const ccw = (ps: Pt[]) => {
  let a = 0;
  for (let i = 0; i < ps.length; i++) { const p = ps[i], q = ps[(i + 1) % ps.length]; a += p.x * q.y - q.x * p.y; }
  return a < 0 ? [...ps].reverse() : ps;
};
const pathLen = (ps: Pt[]) => ps.reduce((t, p, i) => (i ? t + Math.hypot(p.x - ps[i - 1].x, p.y - ps[i - 1].y) : 0), 0);

export function stairGeom(s: Stair): StairGeom {
  const kind = s.kind ?? "recta", sg = s.turn ?? 1, w = s.width, h = w / 2;
  const L0 = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  // contrahuella de unos 17,5 cm; en EE.UU. el código (IRC) pide 7 3/4" como máximo, se busca 7 1/2"
  const n = riserCount(s.height), r = s.height / n;
  const P = (a: number, b: number) => loc(s, a, b * sg);
  /** Rectángulo en coordenadas del eje: a lo largo [a0, a1], a través [b0, b1]. */
  const R = (a0: number, a1: number, b0: number, b1: number) => ccw([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)]);
  const pieces: StairPiece[] = [];
  const step = (pts: Pt[], i: number, part: StairPiece["part"] = "step") => pieces.push({ pts, z: (i + 1) * r, z0: 0, part });

  if (kind === "caracol") {
    // centro en (x1,y1); el radio exterior es el poste más el ancho
    const Ro = POST_R + w, walk = POST_R + w * 0.6, a0 = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const da = Math.min(Math.PI / 6, (imperial() ? 7.5 * 0.0254 : 0.2) / walk) * sg;
    const at = (rad: number, a: number) => ({ x: s.x1 + Math.cos(a) * rad, y: s.y1 + Math.sin(a) * rad });
    for (let i = 0; i < n; i++) {
      const a = a0 + i * da, b = a + da;
      // peldaño volado de 6 cm de espesor
      pieces.push({ pts: ccw([at(POST_R, a), at(Ro, a), at(Ro, a + da / 2), at(Ro, b), at(POST_R, b)]), z: (i + 1) * r, z0: (i + 1) * r - 0.06, part: "step" });
    }
    const circle = (rad: number, k = 24) => Array.from({ length: k }, (_, i) => at(rad, (i / k) * Math.PI * 2));
    pieces.push({ pts: circle(POST_R, 12), z: s.height, z0: 0, part: "post" });
    const path = Array.from({ length: n * 2 + 1 }, (_, i) => at(walk, a0 + (i * da) / 2));
    return { n, riser: r, tread: Math.abs(da) * walk, L: pathLen(path), pieces, path, outline: circle(Ro) };
  }

  if (kind === "recta" || L0 < w * 1.2) {
    const t = L0 / n;
    for (let i = 0; i < n; i++) step(R(i * t, (i + 1) * t, -h, h), i);
    const path = [P(0, 0), P(L0, 0)];
    return { n, riser: r, tread: t, L: L0, pieces, path, outline: R(0, L0, -h, h) };
  }

  // tramos con descanso: el descanso se lleva una contrahuella
  const D = w, a = kind === "U" ? Math.ceil((n - 1) / 2) : Math.round((n - 1) / 2), b = n - 1 - a;
  if (kind === "descanso") {
    const t = (L0 - D) / (n - 1);
    for (let i = 0; i < a; i++) step(R(i * t, (i + 1) * t, -h, h), i);
    step(R(a * t, a * t + D, -h, h), a, "landing");
    for (let j = 0; j < b; j++) step(R(a * t + D + j * t, a * t + D + (j + 1) * t, -h, h), a + 1 + j);
    const path = [P(0, 0), P(L0, 0)];
    return { n, riser: r, tread: t, L: L0, pieces, path, outline: R(0, L0, -h, h) };
  }

  const t = (L0 - D) / a, e = a * t;
  for (let i = 0; i < a; i++) step(R(i * t, (i + 1) * t, -h, h), i);
  if (kind === "L") {
    // descanso al final de la línea dibujada y segundo tramo hacia un lado
    step(R(e, e + D, -h, h), a, "landing");
    for (let j = 0; j < b; j++) step(R(e, e + D, h + j * t, h + (j + 1) * t), a + 1 + j);
    const path = [P(0, 0), P(e + h, 0), P(e + h, h + b * t)];
    const outline = ccw([P(0, -h), P(e + D, -h), P(e + D, h + b * t), P(e, h + b * t), P(e, h), P(0, h)]);
    return { n, riser: r, tread: t, L: pathLen(path), pieces, path, outline };
  }
  // U: el descanso cruza los dos anchos y el segundo tramo vuelve en paralelo
  const off = w + GAP, t2 = b ? e / b : t;
  step(R(e, e + D, -h, off + h), a, "landing");
  for (let j = 0; j < b; j++) step(R(e - (j + 1) * t2, e - j * t2, off - h, off + h), a + 1 + j);
  const path = [P(0, 0), P(e + h, 0), P(e + h, off), P(0, off)];
  return { n, riser: r, tread: t, L: pathLen(path), pieces, path, outline: R(0, e + D, -h, off + h) };
}

/** Peldaños: número, huella y contrahuella, y longitud de la línea de huella. */
export function stairSteps(s: Stair) {
  const g = stairGeom(s);
  return { n: g.n, L: g.L, tread: g.tread, riser: g.riser };
}
