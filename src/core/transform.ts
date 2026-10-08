import type { Pt } from "./geometry";
import { nextId, type Model } from "./model";

export type ElementType = "wall" | "opening" | "line" | "dim" | "room" | "slab" | "roof" | "stair";
export interface ElementRef { type: ElementType; id: number }

type Seg = { x1: number; y1: number; x2: number; y2: number };

/** Transformación de puntos y si invierte la orientación (simetría). */
export interface Xform { map: (p: Pt) => Pt; reflects: boolean }

export const translation = (dx: number, dy: number): Xform => ({ map: (p) => ({ x: p.x + dx, y: p.y + dy }), reflects: false });

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
  ({ wall: m.walls, opening: m.openings, line: m.lines, dim: m.dims, room: m.rooms, slab: m.slabs, roof: m.roofs, stair: m.stairs })[type] as { id: number }[];

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
    else if (r.type === "slab") { el.pts = el.pts.map(t.map); if (t.reflects) el.pts.reverse(); }
    else applySeg(el, t);
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
  const roofs = ids("roof"), stairs = ids("stair");
  m.roofs = m.roofs.filter((r) => !roofs.has(r.id));
  m.stairs = m.stairs.filter((r) => !stairs.has(r.id));
}
