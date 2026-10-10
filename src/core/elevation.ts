import { furnitureSolids, furnitureToPlan } from "./furniture";
import { dir, endExt, loc, roofGeom, type Pt } from "./geometry";
import { stairGeom } from "./stairs";
import { wallType, type Hatch } from "./wallTypes";
import { finishName, gableWall, outward, roofFinish, finish as finishById, type Finish } from "./finishes";
import type { OpeningKind, Project, Section } from "./model";

/** Fachada vista desde ese punto cardinal (la planta tiene el norte arriba). */
export type Facade = "S" | "E" | "N" | "O";
export const FACADES: { id: Facade; label: string }[] = [
  { id: "S", label: "Alzado sur" }, { id: "E", label: "Alzado este" },
  { id: "N", label: "Alzado norte" }, { id: "O", label: "Alzado oeste" },
];

export type FaceKind = "wall" | "glass" | "door" | "roof" | "slab" | "stair" | "furn" | "cut";
/**
 * Polígono proyectado: u horizontal (de izquierda a derecha según se mira), z altura absoluta.
 * Las caras con cut están sobre el plano de corte de una sección y se dibujan encima de todo.
 */
export interface EFace {
  pts: { u: number; z: number }[]; depth: number; kind: FaceKind; cut?: boolean;
  /** Acabado de la cara vista (muros y faldones), para la trama y la etiqueta de material de las fachadas */
  mat?: { hatch: Hatch | "tile"; name: string; finish?: Finish };
  /** Puerta o ventana que llena la cara, para dibujar su despiece y cómo abre */
  op?: { kind: OpeningKind; style?: string };
}

export interface Elevation {
  faces: EFace[];
  /** Extensión del dibujo */
  u0: number; u1: number; z0: number; z1: number;
  /** Cotas de los niveles para las líneas de referencia */
  levels: { name: string; elev: number }[];
  /** Coronación: lecho alto de las azoteas y cumbreras, con su propio símbolo de nivel */
  tops: { tag: "N.L.A." | "Cumbrera"; elev: number }[];
}

type P3 = { x: number; y: number; z: number };

/**
 * Encuadre de la vista: o origen, r dirección hacia la derecha del observador y v dirección en la que mira
 * (ambas unitarias y en planta). Con cut, solo se ve lo que queda por delante del plano vertical que pasa por o.
 */
interface Frame { o: Pt; r: Pt; v: Pt; cut: boolean }

const FRAMES: Record<Facade, Frame> = {
  S: { o: { x: 0, y: 0 }, r: { x: 1, y: 0 }, v: { x: 0, y: -1 }, cut: false },
  N: { o: { x: 0, y: 0 }, r: { x: -1, y: 0 }, v: { x: 0, y: 1 }, cut: false },
  E: { o: { x: 0, y: 0 }, r: { x: 0, y: -1 }, v: { x: -1, y: 0 }, cut: false },
  O: { o: { x: 0, y: 0 }, r: { x: 0, y: 1 }, v: { x: 1, y: 0 }, cut: false },
};

/** Puertas que se ven de vidrio en los alzados. */
const GLAZED_DOORS = new Set(["french", "slider"]);

/** Alzado de una fachada por el algoritmo del pintor. */
export function elevation(p: Project, side: Facade): Elevation {
  return project(p, FRAMES[side]);
}

/** Sección por la línea de corte: lo cortado se rellena y se ve lo que queda a la izquierda de la línea. */
export function section(p: Project, s: Section): Elevation {
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, r = { x: (s.x2 - s.x1) / L, y: (s.y2 - s.y1) / L };
  return project(p, { o: { x: s.x1, y: s.y1 }, r, v: { x: r.y, y: -r.x }, cut: true });
}

/** Todas las secciones del proyecto, en orden de nombre. */
export function allSections(p: Project): Section[] {
  return p.levels.flatMap((l) => l.sections).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

/**
 * Proyecta las caras de muros, carpinterías, losas y cubiertas (y en las secciones también escaleras
 * y mobiliario) sobre el plano de la vista y las ordena de la más lejana a la más cercana.
 */
function project(p: Project, fr: Frame): Elevation {
  // u: eje horizontal visto por el observador; d: profundidad (mayor = más cerca del observador)
  const view = (q: Pt) => { const x = q.x - fr.o.x, y = q.y - fr.o.y; return { u: x * fr.r.x + y * fr.r.y, d: -(x * fr.v.x + y * fr.v.y) }; };
  /** Distancia por delante del plano de corte. */
  const ahead = (q: Pt) => (q.x - fr.o.x) * fr.v.x + (q.y - fr.o.y) * fr.v.y;
  const faces: EFace[] = [];
  const tops: Elevation["tops"] = [];
  /** nudge acerca la cara al observador para que gane a la que tiene justo detrás. */
  const face = (ps: P3[], kind: FaceKind, nudge = 0, mat?: EFace["mat"], op?: EFace["op"]) => {
    if (fr.cut) ps = clip(ps, ahead);
    if (ps.length < 3) return;
    const pr = ps.map(view), pts = pr.map((q, i) => ({ u: q.u, z: ps[i].z }));
    // las caras vistas de canto no aportan nada
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].u + pts[i].u) * (pts[j].z - pts[i].z);
    if (Math.abs(a) < 1e-6) return;
    faces.push({ pts, depth: pr.reduce((s, q) => s + q.d, 0) / pr.length + nudge, kind, ...(mat ? { mat } : {}), ...(op ? { op } : {}) });
  };
  const rect = (ua: number, ub: number, z0: number, z1: number, kind: FaceKind = "cut") => {
    if (ub - ua > 1e-6 && z1 - z0 > 1e-6) faces.push({ pts: [{ u: ua, z: z0 }, { u: ub, z: z0 }, { u: ub, z: z1 }, { u: ua, z: z1 }], depth: 0, kind, cut: true });
  };
  /** Tramos (en u) en los que la línea de corte atraviesa el contorno en planta (y sus huecos, por paridad). */
  const cutSpans = (base: Pt[], holes: Pt[][] = []): [number, number][] => {
    if (!fr.cut) return [];
    const us: number[] = [];
    for (const ring of [base, ...holes]) ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length], fa = ahead(a), fb = ahead(b);
      if ((fa < 0) !== (fb < 0)) { const t = fa / (fa - fb); us.push(view({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }).u); }
    });
    us.sort((x, y) => x - y);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < us.length; i += 2) out.push([us[i], us[i + 1]]);
    return out;
  };
  /** Prisma de base poligonal (en planta) entre dos alturas: caras laterales y, si se corta, su sección. */
  const prism = (base: Pt[], z0: number, z1: number, kind: FaceKind, poche = true, holes: Pt[][] = []) => {
    for (const ring of [base, ...holes]) ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      face([{ ...a, z: z0 }, { ...b, z: z0 }, { ...b, z: z1 }, { ...a, z: z1 }], kind);
    });
    if (poche) for (const [ua, ub] of cutSpans(base, holes)) rect(ua, ub, z0, z1);
  };

  for (const lv of p.levels) {
    const e = lv.elev;
    for (const sl of lv.slabs) if (sl.pts.length >= 3) prism(sl.pts, e - sl.thick, e, "slab", true, sl.holes);
    /** Muros cortados de este nivel, para dar espesor a los hastiales que se apoyan en ellos. */
    const wallCuts: { ua: number; ub: number; top: number }[] = [];
    for (const w of lv.walls) {
      // el muro entero, sin trocear por los huecos, para que no aparezcan juntas falsas en la fachada
      const h = w.thick / 2, H = w.height, { L, ux, uy } = dir(w), e0 = endExt(lv, w, 0), e1 = endExt(lv, w, 1), a = -e0, b = L + e1;
      const wt = wallType(w.type), mat = { hatch: wt.hatch, name: wt.material };
      // el revestimiento va por la cara exterior; la interior, sin trama (es el acabado de dentro)
      const fin = finishById(w.finish), out = fin ? outward(lv.walls, w) : 0, ext = fin && { hatch: "solid" as const, name: finishName(fin), finish: fin };
      const side = (n: number, kind: FaceKind, s0: number, s1: number, z0: number, z1: number, nudge = 0, op?: EFace["op"]) => {
        const p0 = loc(w, s0, n), p1 = loc(w, s1, n);
        face([{ ...p0, z: z0 }, { ...p1, z: z0 }, { ...p1, z: z1 }, { ...p0, z: z1 }], kind, nudge, kind === "wall" ? (ext ? (Math.sign(n) === out ? ext : undefined) : mat) : undefined, op);
      };
      side(-h, "wall", a, b, e, e + H); side(h, "wall", a, b, e, e + H);
      // los testeros solo se ven si el extremo está libre; si acomete a otro muro quedan dentro de él
      const end = (s: number) => { const p0 = loc(w, s, -h), p1 = loc(w, s, h); face([{ ...p0, z: e }, { ...p1, z: e }, { ...p1, z: e + H }, { ...p0, z: e + H }], "wall", 0, ext || mat); };
      if (!e0) end(0);
      if (!e1) end(L);
      const ops = lv.openings.filter((x) => x.wallId === w.id);
      for (const o of ops) {
        const s0 = o.t * L - o.width / 2, s1 = o.t * L + o.width / 2, top = Math.min(H, o.sill + o.height);
        // la carpintería se pinta sobre las dos caras del muro, un poco por delante de cada una
        const op = { kind: o.kind, style: o.style }, fk = o.kind === "door" && !GLAZED_DOORS.has(o.style ?? "") ? "door" : "glass";
        side(-h, fk, s0, s1, e + o.sill, e + top, 1e-3, op);
        side(h, fk, s0, s1, e + o.sill, e + top, 1e-3, op);
      }
      // sección del muro: si el corte pasa por un hueco, queda el antepecho y el dintel
      for (const [ua, ub] of cutSpans([loc(w, a, -h), loc(w, b, -h), loc(w, b, h), loc(w, a, h)])) {
        wallCuts.push({ ua, ub, top: e + H });
        const um = (ua + ub) / 2, m = { x: fr.o.x + fr.r.x * um, y: fr.o.y + fr.r.y * um };
        const s = (m.x - w.x1) * ux + (m.y - w.y1) * uy;
        const o = ops.find((x) => Math.abs(s - x.t * L) < x.width / 2);
        if (!o) { rect(ua, ub, e, e + H); continue; }
        const top = Math.min(H, o.sill + o.height);
        rect(ua, ub, e, e + o.sill); rect(ua, ub, e + top, e + H);
        if (o.kind === "window") rect(ua, ub, e + o.sill, e + top, "glass");
      }
    }
    for (const r of lv.roofs) {
      const g = roofGeom(r);
      const rf = roofFinish(r), tile = rf && { hatch: "tile" as const, name: finishName(rf), finish: rf };
      for (const f of g.faces) face(f.map((q) => ({ ...q, z: e + q.z })), "roof", 0, tile);
      for (const f of g.gables) {
        // el hastial lleva el acabado del muro sobre el que se levanta
        const w = gableWall(lv.walls, f), fin = finishById(w?.finish);
        face(f.map((q) => ({ ...q, z: e + q.z })), "wall", 0, fin ? { hatch: "solid", name: finishName(fin), finish: fin } : w ? { hatch: wallType(w.type).hatch, name: wallType(w.type).material } : undefined);
      }
      // canto del alero
      const zt = e + g.faces[0][0].z;
      tops.push(r.kind === "flat" ? { tag: "N.L.A.", elev: zt } : { tag: "Cumbrera", elev: e + Math.max(...g.faces.flatMap((f) => f.map((q) => q.z))) });
      prism(g.outline, zt - r.thick, zt, "roof", false);
      if (!fr.cut) continue;
      // faldones cortados: la línea de corte sobre la cara superior, con el espesor medido en vertical
      const lift = r.kind === "flat" ? r.thick : r.thick / Math.cos((Math.max(0, Math.min(75, r.pitch)) * Math.PI) / 180);
      for (const f of g.faces) {
        const seg = cutPolygon(f.map((q) => ({ ...q, z: e + q.z })), ahead, view);
        if (seg) { const [A, B] = seg; faces.push({ pts: [A, B, { u: B.u, z: B.z - lift }, { u: A.u, z: A.z - lift }], depth: 0, kind: "cut", cut: true }); }
      }
      for (const f of g.gables) {
        const seg = cutPolygon(f.map((q) => ({ ...q, z: e + q.z })), ahead, view);
        if (!seg) continue;
        const u = (seg[0].u + seg[1].u) / 2, z0 = Math.min(seg[0].z, seg[1].z), z1 = Math.max(seg[0].z, seg[1].z);
        // el hastial tiene el espesor del muro sobre el que se levanta
        const w = wallCuts.find((c) => u > c.ua - 0.02 && u < c.ub + 0.02 && Math.abs(c.top - z0) < 0.05);
        rect(w ? w.ua : u - 0.1, w ? w.ub : u + 0.1, z0, z1);
      }
    }
    if (!fr.cut) continue;
    for (const st of lv.stairs) {
      // peldaños macizos, como en el 3D
      for (const pc of stairGeom(st).pieces) prism(pc.pts, e + pc.z0, e + pc.z, "stair");
    }
    for (const f of lv.furniture) for (const s of furnitureSolids(f.kind)) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => furnitureToPlan(f, { x: s.x + (i * s.w) / 2, y: s.y + (j * s.d) / 2 }));
      prism(c, e + s.z0, e + s.z0 + s.h, "furn", false);
    }
  }
  faces.sort((a, b) => (a.cut ? 1 : 0) - (b.cut ? 1 : 0) || a.depth - b.depth);
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of faces) for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  if (!faces.length) { u0 = 0; u1 = 1; z0 = 0; z1 = 1; }
  // una marca por altura (al centímetro)
  const seen = new Set<string>();
  // en un corte, la cumbrera que queda detrás del observador no se ve
  const top = tops.filter((t) => { const k = `${t.tag}${t.elev.toFixed(2)}`; if (seen.has(k) || t.elev > z1 + 0.01) return false; seen.add(k); return true; });
  return { faces, u0, u1, z0: Math.min(z0, 0), z1, levels: p.levels.map((l) => ({ name: l.name, elev: l.elev })), tops: top };
}

/** Recorta un polígono 3D por el semiespacio f >= 0 (Sutherland–Hodgman). */
function clip(ps: P3[], f: (q: Pt) => number): P3[] {
  const out: P3[] = [];
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  });
  return out;
}

/** Segmento en el que el plano de corte (f = 0) atraviesa un polígono plano convexo, ya proyectado. */
function cutPolygon(ps: P3[], f: (q: Pt) => number, view: (q: Pt) => { u: number }): [{ u: number; z: number }, { u: number; z: number }] | null {
  const hits: { u: number; z: number }[] = [];
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length], fa = f(a), fb = f(b);
    if ((fa < 0) !== (fb < 0)) {
      const t = fa / (fa - fb), q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      hits.push({ u: view(q).u, z: a.z + (b.z - a.z) * t });
    }
  });
  if (hits.length < 2) return null;
  hits.sort((x, y) => x.u - y.u || x.z - y.z);
  return [hits[0], hits[hits.length - 1]];
}

/** ¿Está q dentro del polígono (u, z)? */
export function insideFace(q: { u: number; z: number }, pts: { u: number; z: number }[]) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > q.z) !== (b.z > q.z) && q.u < ((b.u - a.u) * (q.z - a.z)) / (b.z - a.z) + a.u) r = !r;
  }
  return r;
}

const ext = (f: EFace) => {
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  return { u0, u1, z0, z1 };
};
const uniq = (vs: number[]) => [...new Set(vs.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.02);

/**
 * Cadenas de cotas de un alzado o una sección, de dentro hacia fuera:
 * horizontales bajo el terreno (huecos vistos o muros cortados, y el total)
 * y verticales a la izquierda (antepechos y dinteles, niveles y la altura total).
 */
export function elevationDims(el: Elevation): { h: number[][]; v: number[][] } {
  const cut = el.faces.some((f) => f.cut);
  // carpinterías que se ven: no las tapa ninguna cara pintada después
  const visible = el.faces.filter((f, i) => (f.kind === "glass" || f.kind === "door") && !f.cut && (() => {
    const e = ext(f), q = { u: (e.u0 + e.u1) / 2, z: (e.z0 + e.z1) / 2 };
    return !el.faces.slice(i + 1).some((g) => !g.cut && g.kind !== "glass" && g.kind !== "door" && insideFace(q, g.pts));
  })()).map(ext);
  const walls = el.faces.filter((f) => f.kind === "wall" || (f.cut && f.kind === "cut")).map(ext);
  if (!walls.length) return { h: [], v: [] };
  const lo = Math.min(...el.levels.map((l) => l.elev), 0);
  // muros de la planta más baja: los cortados (estrechos y altos) o las caras vistas que arrancan del suelo
  const base = walls.filter((w) => w.z0 < lo + 0.05 && w.z1 > lo + 1);
  const u0 = Math.min(...base.map((w) => w.u0)), u1 = Math.max(...base.map((w) => w.u1));
  const inner = cut
    ? el.faces.filter((f) => f.cut && f.kind === "cut").map(ext)
      // trozos de muro cortados en la planta baja (también antepechos y dinteles si el corte pasa por un hueco)
      .filter((w) => w.u1 - w.u0 < 0.8 && w.z0 < lo + 2.4 && w.z1 > lo + 0.3).flatMap((w) => [w.u0, w.u1])
    : visible.flatMap((o) => [o.u0, o.u1]);
  const clamp = (u: number) => Math.max(u0, Math.min(u1, u));
  const h: number[][] = [];
  if (isFinite(u0) && u1 - u0 > 0.1) {
    const chain = uniq([u0, ...inner.map(clamp), u1]);
    if (chain.length > 2) h.push(chain);
    h.push([u0, u1].map((u) => Math.round(u * 1000) / 1000));
  }
  // en vertical: los antepechos y dinteles vistos entre niveles, los niveles y el total
  // coronación de los muros de cada planta (el arranque del alero o de la azotea)
  const tops = el.levels.map((l) => Math.max(-Infinity, ...walls.filter((w) => Math.abs(w.z0 - l.elev) < 0.05 && w.z1 - w.z0 > 1).map((w) => w.z1))).filter((z) => isFinite(z));
  const lv = uniq([...el.levels.map((l) => l.elev).filter((z) => z < el.z1 - 0.05), ...tops.filter((z) => z < el.z1 - 0.05), 0, el.z1]).filter((z) => z >= lo - 1e-6);
  const v: number[][] = [];
  const ops = uniq([...lv, ...visible.flatMap((o) => [o.z0, o.z1])]);
  if (ops.length > lv.length) v.push(ops);
  if (lv.length > 2) v.push(lv);
  if (lv.length > 1) v.push([lv[0], lv[lv.length - 1]]);
  return { h, v };
}
