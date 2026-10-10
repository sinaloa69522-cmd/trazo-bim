import type { Pt } from "./geometry";
import { mapLines } from "./hatch";
import { nextId, type Model } from "./model";

export type ElementType = "wall" | "opening" | "line" | "dim" | "room" | "slab" | "roof" | "stair" | "deck" | "column" | "furniture" | "section" | "text" | "mark" | "fixture" | "run" | "underlay" | "hatch";
export interface ElementRef { type: ElementType; id: number }

type Seg = { x1: number; y1: number; x2: number; y2: number };

/** Transformación de puntos y si invierte la orientación (simetría); rot: giro en grados (antihorario en pantalla). */
export interface Xform { map: (p: Pt) => Pt; reflects: boolean; rot?: number }

export const translation = (dx: number, dy: number): Xform => ({ map: (p) => ({ x: p.x + dx, y: p.y + dy }), reflects: false });

/** Escala uniforme con centro c. */
export const scaling = (c: Pt, k: number): Xform => ({ map: (p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }), reflects: false });

/**
 * Giro de deg grados alrededor de c, en sentido antihorario tal como se ve en pantalla
 * (en el modelo la y crece hacia abajo).
 */
export function rotation(c: Pt, deg: number): Xform {
  const a = (-deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  return { reflects: false, rot: deg, map: (p) => { const dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs }; } };
}

/** Ángulo en pantalla (grados, antihorario desde +x) del vector de a a b. */
export const screenAngle = (a: Pt, b: Pt) => (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;

/** Simetría respecto a la recta que pasa por a y b. */
export function reflection(a: Pt, b: Pt): Xform {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  return {
    reflects: true,
    map: (p) => {
      const dx = p.x - a.x, dy = p.y - a.y, d = dx * ux + dy * uy;
      return { x: a.x + 2 * d * ux - dx, y: a.y + 2 * d * uy - dy };
    },
  };
}

function applySeg(s: Seg, t: Xform) {
  const p = t.map({ x: s.x1, y: s.y1 }), q = t.map({ x: s.x2, y: s.y2 });
  s.x1 = p.x; s.y1 = p.y; s.x2 = q.x; s.y2 = q.y;
}

const listOf = (m: Model, type: ElementType) =>
  ({ wall: m.walls, opening: m.openings, line: m.lines, dim: m.dims, room: m.rooms, slab: m.slabs, roof: m.roofs, stair: m.stairs, deck: m.decks, column: m.columns, furniture: m.furniture, section: m.sections, text: m.texts, mark: m.marks, fixture: m.fixtures, run: m.runs, underlay: m.underlays, hatch: m.hatches })[type] as { id: number }[];

export function findElement(m: Model, r: ElementRef) {
  return listOf(m, r.type).find((o) => o.id === r.id) ?? null;
}

/**
 * Aplica la transformación a los elementos indicados.
 * Con copy=true crea copias (los muros se copian con sus huecos) y devuelve sus referencias.
 * Las puertas y ventanas sueltas no se transforman: siguen a su muro.
 */
export function transformElements(m: Model, refs: ElementRef[], t: Xform, copy: boolean): ElementRef[] {
  const out: ElementRef[] = [];
  for (const r of refs) {
    if (r.type === "opening") continue;
    const src = findElement(m, r);
    if (!src) continue;
    const el = copy ? JSON.parse(JSON.stringify(src)) : src;
    if (copy) el.id = nextId(m);
    if (r.type === "room") { const p = t.map(el); el.x = p.x; el.y = p.y; if (copy) el.name = `${el.name} (copia)`; }
    // el texto solo cambia de sitio (reflejado seguiría teniendo que leerse); al girar, gira con el dibujo
    // los símbolos se llevan por sus puntos y siguen leyéndose derechos; la zona del detalle escala con el dibujo
    else if (r.type === "mark") {
      const p = t.map(el);
      if (el.ax !== undefined) {
        const a = { x: el.ax, y: el.ay }, q = t.map(a);
        if (el.r) { const e = t.map({ x: a.x + el.r, y: a.y }); el.r = Math.hypot(e.x - q.x, e.y - q.y); }
        el.ax = q.x; el.ay = q.y;
      }
      el.x = p.x; el.y = p.y;
    }
    else if (r.type === "text") { const p = t.map(el); el.x = p.x; el.y = p.y; if (t.rot) el.rot = ((el.rot + t.rot) % 360 + 360) % 360; }
    // cubiertas y decks son rectángulos alineados: giran por cuartos de vuelta; con otro ángulo se lleva su centro
    else if (r.type === "roof" || r.type === "deck") {
      const exact = t.rot === undefined || Math.abs(t.rot - Math.round(t.rot / 90) * 90) < 1e-6;
      if (exact) {
        const a = t.map({ x: el.x1, y: el.y1 }), b = t.map({ x: el.x2, y: el.y2 });
        // los escalones del deck siguen a su lado (0 arriba, 1 derecha, 2 abajo, 3 izquierda)
        if (r.type === "deck" && el.stairSide != null) {
          const D = [[0, -1], [1, 0], [0, 1], [-1, 0]], c = { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 }, [dx, dy] = D[el.stairSide];
          const p0 = t.map(c), p1 = t.map({ x: c.x + dx, y: c.y + dy }), ux = p1.x - p0.x, uy = p1.y - p0.y;
          el.stairSide = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 1 : 3) : (uy > 0 ? 2 : 0);
        }
        el.x1 = Math.min(a.x, b.x); el.y1 = Math.min(a.y, b.y); el.x2 = Math.max(a.x, b.x); el.y2 = Math.max(a.y, b.y);
      } else {
        const c = t.map({ x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 }), hw = Math.abs(el.x2 - el.x1) / 2, hh = Math.abs(el.y2 - el.y1) / 2;
        el.x1 = c.x - hw; el.x2 = c.x + hw; el.y1 = c.y - hh; el.y2 = c.y + hh;
      }
    }
    // la columna se lleva por su centro; girada 90° cambia el lado en x por el lado en y
    else if (r.type === "column") {
      const p = t.map(el), q = t.map({ x: el.x + 1, y: el.y });
      el.x = p.x; el.y = p.y;
      if (Math.abs(q.y - p.y) > Math.abs(q.x - p.x)) [el.w, el.d] = [el.d, el.w];
    }
    else if (r.type === "run") el.pts = el.pts.map(t.map);
    // reflejada, la escalera gira hacia el otro lado
    else if (r.type === "stair") {
      const a = t.map({ x: el.x1, y: el.y1 }), b = t.map({ x: el.x2, y: el.y2 });
      el.x1 = a.x; el.y1 = a.y; el.x2 = b.x; el.y2 = b.y;
      if (t.reflects) el.turn = -(el.turn ?? 1);
    }
    // la trama de la biblioteca va referida al origen; la importada se lleva con el sombreado
    else if (r.type === "hatch") { el.loops = el.loops.map((q: Pt[]) => q.map(t.map)); if (el.lines) el.lines = mapLines(el.lines, t.map); }
    // el calco no gira ni se refleja: se lleva su centro
    else if (r.type === "underlay") { const c = t.map({ x: el.x + el.w / 2, y: el.y + el.h / 2 }); el.x = c.x - el.w / 2; el.y = c.y - el.h / 2; }
    else if (r.type === "furniture" || r.type === "fixture") {
      // el giro sale de transformar el frente de la pieza (+y local); las piezas son simétricas de izquierda a derecha
      const a = (el.rot * Math.PI) / 180, c = t.map(el), u = t.map({ x: el.x - Math.sin(a), y: el.y + Math.cos(a) });
      const deg = (Math.atan2(-(u.x - c.x), u.y - c.y) * 180) / Math.PI;
      el.x = c.x; el.y = c.y; el.rot = (Math.round(deg * 1000) / 1000 + 360) % 360;
    }
    else if (r.type === "slab") {
      el.pts = el.pts.map(t.map); el.holes = el.holes.map((h: Pt[]) => h.map(t.map));
      if (t.reflects) { el.pts.reverse(); for (const h of el.holes) h.reverse(); }
    }
    else {
      applySeg(el, t);
      // una sección reflejada mira al lado reflejado
      if (t.reflects && r.type === "section") [el.x1, el.y1, el.x2, el.y2] = [el.x2, el.y2, el.x1, el.y1];
    }
    // la simetría invierte el lado de la normal: la cota cambia de lado y las puertas abren al lado contrario
    if (t.reflects && r.type === "dim") el.off = -el.off;
    if (copy) listOf(m, r.type).push(el);
    if (r.type === "wall") {
      const ops = m.openings.filter((o) => o.wallId === src.id);
      for (const op of ops) {
        const o = copy ? { ...op, id: nextId(m), wallId: el.id } : op;
        if (t.reflects && o.kind === "door") o.flip = !o.flip;
        if (copy) m.openings.push(o);
      }
    }
    out.push({ type: r.type, id: el.id });
  }
  return out;
}

export function deleteElements(m: Model, refs: ElementRef[]) {
  const ids = (type: ElementType) => new Set(refs.filter((r) => r.type === type).map((r) => r.id));
  const walls = ids("wall"), ops = ids("opening"), lines = ids("line"), dims = ids("dim"), rooms = ids("room"), slabs = ids("slab");
  m.walls = m.walls.filter((w) => !walls.has(w.id));
  m.openings = m.openings.filter((o) => !ops.has(o.id) && !walls.has(o.wallId));
  m.lines = m.lines.filter((l) => !lines.has(l.id));
  m.dims = m.dims.filter((d) => !dims.has(d.id));
  m.rooms = m.rooms.filter((r) => !rooms.has(r.id));
  m.slabs = m.slabs.filter((r) => !slabs.has(r.id));
  const roofs = ids("roof"), stairs = ids("stair"), decks = ids("deck");
  m.decks = m.decks.filter((r) => !decks.has(r.id));
  const cols = ids("column");
  m.columns = m.columns.filter((r) => !cols.has(r.id));
  m.roofs = m.roofs.filter((r) => !roofs.has(r.id));
  m.stairs = m.stairs.filter((r) => !stairs.has(r.id));
  const furn = ids("furniture");
  m.furniture = m.furniture.filter((r) => !furn.has(r.id));
  const secs = ids("section");
  m.sections = m.sections.filter((r) => !secs.has(r.id));
  const texts = ids("text");
  m.texts = m.texts.filter((r) => !texts.has(r.id));
  const marks = ids("mark");
  m.marks = m.marks.filter((r) => !marks.has(r.id));
  const fx = ids("fixture"), runs = ids("run");
  m.fixtures = m.fixtures.filter((r) => !fx.has(r.id));
  m.runs = m.runs.filter((r) => !runs.has(r.id));
  const und = ids("underlay");
  m.underlays = m.underlays.filter((r) => !und.has(r.id));
  const hat = ids("hatch");
  m.hatches = m.hatches.filter((r) => !hat.has(r.id));
}
