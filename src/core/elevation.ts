import { dir, endExt, loc, roofGeom, type Pt } from "./geometry";
import type { Project } from "./model";

/** Fachada vista desde ese punto cardinal (la planta tiene el norte arriba). */
export type Facade = "S" | "E" | "N" | "O";
export const FACADES: { id: Facade; label: string }[] = [
  { id: "S", label: "Alzado sur" }, { id: "E", label: "Alzado este" },
  { id: "N", label: "Alzado norte" }, { id: "O", label: "Alzado oeste" },
];

export type FaceKind = "wall" | "glass" | "door" | "roof" | "slab";
/** Polígono proyectado: u horizontal (de izquierda a derecha según se mira), z altura absoluta. */
export interface EFace { pts: { u: number; z: number }[]; depth: number; kind: FaceKind }

export interface Elevation {
  faces: EFace[];
  /** Extensión del dibujo */
  u0: number; u1: number; z0: number; z1: number;
  /** Cotas de los niveles para las líneas de referencia */
  levels: { name: string; elev: number }[];
}

type P3 = { x: number; y: number; z: number };

/**
 * Alzado por el algoritmo del pintor: se proyectan las caras de muros, carpinterías, losas
 * y cubiertas sobre el plano de la fachada y se ordenan de la más lejana a la más cercana.
 */
export function elevation(p: Project, side: Facade): Elevation {
  // u: eje horizontal visto por el observador; d: profundidad (mayor = más cerca del observador)
  const view = {
    S: (q: P3) => ({ u: q.x, d: q.y }),
    N: (q: P3) => ({ u: -q.x, d: -q.y }),
    E: (q: P3) => ({ u: -q.y, d: q.x }),
    O: (q: P3) => ({ u: q.y, d: -q.x }),
  }[side];
  const faces: EFace[] = [];
  /** nudge acerca la cara al observador para que gane a la que tiene justo detrás. */
  const face = (ps: P3[], kind: FaceKind, nudge = 0) => {
    const pr = ps.map(view), pts = pr.map((q, i) => ({ u: q.u, z: ps[i].z }));
    // las caras vistas de canto no aportan nada
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].u + pts[i].u) * (pts[j].z - pts[i].z);
    if (Math.abs(a) < 1e-6) return;
    faces.push({ pts, depth: pr.reduce((s, q) => s + q.d, 0) / pr.length + nudge, kind });
  };
  /** Prisma de base cuadrilátera (en planta) entre dos alturas: caras laterales. */
  const prism = (base: Pt[], z0: number, z1: number, kind: FaceKind) => {
    base.forEach((a, i) => {
      const b = base[(i + 1) % base.length];
      face([{ ...a, z: z0 }, { ...b, z: z0 }, { ...b, z: z1 }, { ...a, z: z1 }], kind);
    });
  };

  for (const lv of p.levels) {
    const e = lv.elev;
    for (const sl of lv.slabs) if (sl.pts.length >= 3) prism(sl.pts, e - sl.thick, e, "slab");
    for (const w of lv.walls) {
      // el muro entero, sin trocear por los huecos, para que no aparezcan juntas falsas en la fachada
      const h = w.thick / 2, H = w.height, { L } = dir(w), e0 = endExt(lv, w, 0), e1 = endExt(lv, w, 1), a = -e0, b = L + e1;
      const side = (n: number, kind: FaceKind, s0: number, s1: number, z0: number, z1: number, nudge = 0) => {
        const p0 = loc(w, s0, n), p1 = loc(w, s1, n);
        face([{ ...p0, z: z0 }, { ...p1, z: z0 }, { ...p1, z: z1 }, { ...p0, z: z1 }], kind, nudge);
      };
      side(-h, "wall", a, b, e, e + H); side(h, "wall", a, b, e, e + H);
      // los testeros solo se ven si el extremo está libre; si acomete a otro muro quedan dentro de él
      if (!e0) prism([loc(w, 0, -h), loc(w, 0, h)], e, e + H, "wall");
      if (!e1) prism([loc(w, L, -h), loc(w, L, h)], e, e + H, "wall");
      for (const o of lv.openings.filter((x) => x.wallId === w.id)) {
        const s0 = o.t * L - o.width / 2, s1 = o.t * L + o.width / 2, top = Math.min(H, o.sill + o.height);
        // la carpintería se pinta sobre las dos caras del muro, un poco por delante de cada una
        side(-h, o.kind === "door" ? "door" : "glass", s0, s1, e + o.sill, e + top, 1e-3);
        side(h, o.kind === "door" ? "door" : "glass", s0, s1, e + o.sill, e + top, 1e-3);
      }
    }
    for (const r of lv.roofs) {
      const g = roofGeom(r);
      for (const f of [...g.faces, ...g.gables]) face(f.map((q) => ({ ...q, z: e + q.z })), g.gables.includes(f) ? "wall" : "roof");
      // canto del alero
      prism(g.outline, e + g.faces[0][0].z - r.thick, e + g.faces[0][0].z, "roof");
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of faces) for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  if (!faces.length) { u0 = 0; u1 = 1; z0 = 0; z1 = 1; }
  return { faces, u0, u1, z0: Math.min(z0, 0), z1, levels: p.levels.map((l) => ({ name: l.name, elev: l.elev })) };
}
