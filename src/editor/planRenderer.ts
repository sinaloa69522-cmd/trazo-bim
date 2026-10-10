import { fmtArea, fmtDim, fmtLen, imperial, FT, IN } from "../core/units";
import { deckGeom, deckType } from "../core/decks";
import { dimGeom, dimOffset, dir, loc, pieces, roofGeom, textBox, type Pt } from "../core/geometry";
import { stairGeom } from "../core/stairs";
import { furnitureStrokes, type Stroke } from "../core/furniture";
import { discOfSystem, fixtureStrokes, fixtureTextAt, mepDef, systemDef, type SymStroke } from "../core/mep";
import type { Column, Deck, Dim, Fixture, HatchRegion, Model, Roof, Run, Section, Stair, Wall } from "../core/model";
import { hatchSegments, isSolid, patternLines, patternSpacing, type HatchSegments } from "../core/hatch";
import { RC } from "../core/rooms";
import { openingSymbol } from "../core/openingStyles";
import { outward } from "../core/finishes";
import { wallType, type Hatch } from "../core/wallTypes";
import { DISC_LAYER, type Editor, type SelType } from "./Editor";

export type PlanColors = Record<
  "plan-bg" | "grid" | "grid-major" | "wall" | "door" | "window" | "dim" | "anno" | "accent" | "fg" | "muted" | "danger" | "panel",
  string
>;

const MONO = "11px 'IBM Plex Mono', ui-monospace, monospace";

export interface PlanOpts {
  /** Para la lámina: sin rejilla, origen, nivel de referencia, selección ni vistas previas. */
  print?: boolean;
  /** Marca de tipo de cada puerta o ventana (P1, V2…), por id del hueco. */
  marks?: Map<number, string>;
  /** Rotula el circuito junto a cada mecanismo eléctrico (láminas de electricidad). */
  circuits?: boolean;
  /** Baja el rótulo de las habitaciones (en metros) para que no tape el punto de luz del centro. */
  roomLabelDy?: number;
}

/** Imágenes de los calcos ya decodificadas; al terminar de cargar una se vuelve a dibujar. */
const IMAGES = new Map<string, HTMLImageElement>();
function underlayImage(ed: Editor, key: string): HTMLImageElement | null {
  let img = IMAGES.get(key);
  if (!img) {
    const src = ed.images.get(key);
    if (!src) return null;
    img = new Image();
    img.onload = () => ed.emit();
    img.src = src;
    IMAGES.set(key, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Trazos de cada sombreado, que solo se recalculan si cambian su contorno o su trama. */
const HATCH_CACHE = new WeakMap<HatchRegion, { loops: HatchRegion["loops"]; key: string; r: HatchSegments; spacing: number }>();
function hatchCache(h: HatchRegion) {
  const key = `${h.pattern}|${h.scale}|${h.angle}|${h.lines?.length ?? 0}`;
  let c = HATCH_CACHE.get(h);
  if (!c || c.loops !== h.loops || c.key !== key) {
    const lines = patternLines(h);
    c = { loops: h.loops, key, r: hatchSegments(h.loops, lines), spacing: patternSpacing(lines) };
    HATCH_CACHE.set(h, c);
  }
  return c;
}

/** Sombreado: relleno sólido, o la trama recortada por el contorno; si a esta escala la trama es más fina que 2 px, una mancha. */
function drawHatch(ctx: CanvasRenderingContext2D, ed: Editor, h: HatchRegion, col: string, sel: boolean, print: boolean) {
  ctx.save();
  ctx.beginPath();
  for (const q of h.loops) { q.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); ctx.closePath(); }
  const c = isSolid(h) ? null : hatchCache(h);
  if (!c || c.r.dense || c.spacing * ed.view.scale < 2) {
    ctx.globalAlpha = !c ? (sel ? 0.55 : 0.4) : 0.18; ctx.fillStyle = col; ctx.fill("evenodd");
  } else {
    ctx.beginPath();
    for (const [a, b] of c.r.segs) {
      const p = ed.toS(a.x, a.y), q = ed.toS(b.x, b.y);
      ctx.moveTo(p.x, p.y);
      // los puntos de la trama (trazo de longitud 0) se ven como un punto
      if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 0.5) ctx.lineTo(p.x + 0.8, p.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.strokeStyle = col; ctx.lineWidth = print ? 0.5 : sel ? 1 : 0.7; ctx.stroke();
  }
  ctx.restore();
  if (sel) {
    ctx.save(); ctx.setLineDash([6, 3]); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (const q of h.loops) { ctx.beginPath(); q.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
  }
}

/** Dibuja la planta completa en un canvas 2D. W y H en píxeles CSS. */
export function drawPlan(ctx: CanvasRenderingContext2D, ed: Editor, C: PlanColors, W: number, H: number, opts: PlanOpts = {}) {
  const m = ed.model, P = !!opts.print, hover = P ? null : ed.hover;
  const toS = (x: number, y: number) => ed.toS(x, y);
  ctx.fillStyle = C["plan-bg"];
  ctx.fillRect(0, 0, W, H);

  // rejilla de 10 cm y 1 m
  const tl = ed.toW(0, 0), br = ed.toW(W, H);
  const grid = (step: number, col: string) => {
    if (step * ed.view.scale < 6) return;
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const s = Math.round(toS(x, 0).x) + 0.5; ctx.moveTo(s, 0); ctx.lineTo(s, H); }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) { const s = Math.round(toS(0, y).y) + 0.5; ctx.moveTo(0, s); ctx.lineTo(W, s); }
    ctx.stroke();
  };
  if (!P) {
    // métrico: 10 cm y 1 m; pies: 1' y 10'
    if (imperial()) { grid(FT, C.grid); grid(10 * FT, C["grid-major"]); }
    else { grid(0.1, C.grid); grid(1, C["grid-major"]); }
    // origen
    const o = toS(0, 0);
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + 28, o.y); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y + 28); ctx.stroke();
    ctx.font = MONO; ctx.fillStyle = C.muted; ctx.fillText("X", o.x + 31, o.y + 3); ctx.fillText("Y", o.x - 3, o.y + 39);
  }

  const poly = (pts: Pt[], fill?: string | null, stroke?: string, lw = 1) => {
    ctx.beginPath();
    pts.forEach((p, i) => { const s = toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  const seg = (a: Pt, b: Pt, col: string, lw = 1, dash: number[] = []) => {
    const p = toS(a.x, a.y), q = toS(b.x, b.y);
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
  };
  const quad = (w: Wall | { x1: number; y1: number; x2: number; y2: number }, a: number, b: number, n0: number, n1: number) =>
    [loc(w, a, n0), loc(w, b, n0), loc(w, b, n1), loc(w, a, n1)];
  const isSel = (type: SelType, id: number) => !P && ed.isSelected(type, id);
  /** Trazos del mobiliario; el primero (contorno) se rellena para tapar la trama de la habitación. */
  const strokes = (ks: Stroke[], col: string, lw: number, fill?: string) => ks.forEach((k, i) => {
    ctx.beginPath();
    k.pts.forEach((q, j) => { const s = toS(q.x, q.y); if (j) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    if (k.closed) ctx.closePath();
    if (fill && i === 0 && k.closed) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  });

  // calcos: imágenes de referencia bajo todo lo demás (solo en pantalla, no en las láminas)
  if (!P && ed.vis.calcos) for (const u of m.underlays) {
    const img = underlayImage(ed, u.img), a = toS(u.x, u.y), sel = isSel("underlay", u.id);
    if (img) { ctx.globalAlpha = u.opacity; ctx.drawImage(img, a.x, a.y, u.w * ed.view.scale, u.h * ed.view.scale); ctx.globalAlpha = 1; }
    ctx.setLineDash(sel ? [] : [6, 4]);
    ctx.strokeStyle = sel ? C.accent : C.muted; ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(a.x, a.y, u.w * ed.view.scale, u.h * ed.view.scale);
    ctx.setLineDash([]);
  }

  // nivel inferior como referencia (gris claro), como el subyacente de Revit
  const below = ed.levelBelow();
  if (below && ed.vis.muros && !P) {
    ctx.globalAlpha = 0.18;
    for (const w of below.walls) { const h = w.thick / 2, L = dir(w).L; poly(quad(w, 0, L, -h, h), C.muted); }
    ctx.globalAlpha = 1;
  }

  // losas: contorno discontinuo y trama suave
  if (ed.vis.losas) for (const sl of m.slabs) {
    const hl = isSel("slab", sl.id) || (hover?.type === "slab" && hover.id === sl.id);
    const col = hl ? C.accent : C.muted;
    // la trama no cubre los huecos (relleno par-impar)
    ctx.beginPath();
    for (const ring of [sl.pts, ...sl.holes]) {
      ring.forEach((p, i) => { const s = toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.closePath();
    }
    ctx.globalAlpha = hl ? 0.14 : 0.05; ctx.fillStyle = col; ctx.fill("evenodd"); ctx.globalAlpha = 1;
    ctx.setLineDash([8, 3, 2, 3]);
    poly(sl.pts, null, col, hl ? 2 : 1);
    ctx.setLineDash([]);
    // hueco: contorno continuo y aspa, como en los planos
    for (const h of sl.holes) {
      poly(h, null, col, hl ? 1.6 : 1);
      if (h.length === 4) { seg(h[0], h[2], col, 0.8); seg(h[1], h[3], col, 0.8); }
    }
  }

  // habitaciones (relleno)
  const rg = ed.rooms;
  if (ed.vis.hab && rg) for (const r of m.rooms) {
    const c = rg.rooms.get(r.id);
    if (!c?.ok) continue;
    ctx.fillStyle = C.accent; ctx.globalAlpha = isSel("room", r.id) ? 0.2 : 0.07;
    const px = RC * ed.view.scale;
    ctx.beginPath();
    for (const [j, i0, i1] of c.runs) { const s = toS(rg.x0 + i0 * RC, rg.y0 + j * RC); ctx.rect(s.x, s.y, (i1 - i0) * px + 0.6, px + 0.6); }
    ctx.fill(); ctx.globalAlpha = 1;
  }

  // sombreados, sobre los rellenos y bajo el mobiliario y los muros
  if (ed.vis.sombreados) for (const h of m.hatches) {
    const hl = isSel("hatch", h.id) || (hover?.type === "hatch" && hover.id === h.id);
    drawHatch(ctx, ed, h, hl ? C.accent : C.anno, hl, P);
  }

  // mobiliario, bajo los muros
  if (ed.vis.mobiliario) for (const f of m.furniture) {
    const hl = isSel("furniture", f.id) || (hover?.type === "furniture" && hover.id === f.id);
    strokes(furnitureStrokes(f), hl ? C.accent : C.anno, hl ? 1.6 : 0.9, C["plan-bg"]);
  }

  // muros
  // decks y porches debajo de los muros: el lado de la casa queda tapado por el muro
  if (ed.vis.decks) for (const dk of m.decks) {
    const hl = isSel("deck", dk.id) || (hover?.type === "deck" && hover.id === dk.id);
    drawDeck(ctx, ed, dk, m.walls, hl ? C.accent : C.fg, hl ? 2 : 1, !!opts.print);
  }
  if (ed.vis.muros) {
    const parts = m.walls.map((w) => { const h = w.thick / 2; return { w, polys: pieces(m, w).solids.map(([a, b]) => quad(w, a, b, -h, h)) }; });
    // primero el contorno grueso de todos y luego el relleno encima: así las juntas entre muros
    // quedan tapadas y solo se ve la mitad exterior del trazo
    for (const { polys } of parts) for (const q of polys) poly(q, null, C.wall, 2);
    for (const { w, polys } of parts) hatchWall(ctx, ed, polys, wallType(w.type).hatch, C);
    for (const { w, polys } of parts) {
      const hl = isSel("wall", w.id) || (hover?.type === "wall" && hover.id === w.id);
      if (hl) for (const q of polys) poly(q, null, C.accent, isSel("wall", w.id) ? 2.5 : 1.5);
    }
  }

  // puertas y ventanas
  for (const op of m.openings) {
    const w = ed.wallById(op.wallId);
    if (!w) continue;
    const { L } = dir(w);
    if (op.kind === "door" ? !ed.vis.puertas : !ed.vis.ventanas) continue;
    const col = isSel("opening", op.id) ? C.accent : op.kind === "door" ? C.door : C.window;
    for (const k of openingSymbol(w, op, L, op.kind === "window" ? outward(m.walls, w) : 1)) {
      ctx.beginPath();
      k.pts.forEach((q, i) => { const s = toS(q.x, q.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.setLineDash(k.kind === "swing" ? [4, 3] : []);
      ctx.strokeStyle = col; ctx.lineWidth = k.kind === "leaf" ? 2 : k.kind === "frame" ? 1.2 : 1; ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (ed.vis.anot) for (const l of m.lines) {
    const hl = isSel("line", l.id) || (hover?.type === "line" && hover.id === l.id);
    seg({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, hl ? C.accent : C.anno, hl ? 2.5 : 1.2);
  }
  if (ed.vis.escaleras) for (const st of m.stairs) {
    const hl = isSel("stair", st.id) || (hover?.type === "stair" && hover.id === st.id);
    drawStair(ctx, ed, st, hl ? C.accent : C.fg, hl ? 2 : 1);
  }
  // columnas: sección cortada, rellena como el muro
  if (ed.vis.columnas) for (const c of m.columns) {
    const hl = isSel("column", c.id) || (hover?.type === "column" && hover.id === c.id);
    drawColumn(ctx, ed, c, hl ? C.accent : C.wall, hl ? 2 : 1);
  }
  if (ed.vis.cubiertas) for (const r of m.roofs) {
    const hl = isSel("roof", r.id) || (hover?.type === "roof" && hover.id === r.id);
    drawRoof(ctx, ed, r, hl ? C.accent : C.door, hl ? 2 : 1);
  }
  // las secciones cortan todo el edificio: las de otros niveles también se marcan, sin poder seleccionarlas
  if (ed.vis.secciones) for (const lv of ed.project.levels) if (lv !== m) for (const se of lv.sections) drawSection(ctx, ed, se, C.fg, 1);
  if (ed.vis.secciones) for (const se of m.sections) {
    const hl = isSel("section", se.id) || (hover?.type === "section" && hover.id === se.id);
    drawSection(ctx, ed, se, hl ? C.accent : C.fg, hl ? 2 : 1);
  }
  // instalaciones: primero los recorridos y encima los símbolos
  for (const r of m.runs) {
    if (!ed.vis[DISC_LAYER[discOfSystem(r.system)]]) continue;
    const hl = isSel("run", r.id) || (hover?.type === "run" && hover.id === r.id);
    drawRun(ctx, ed, r.pts, r.system, hl ? C.accent : null, hl ? 1.6 : 1);
  }
  for (const f of m.fixtures) {
    if (!ed.fixtureVisible(f)) continue;
    const hl = isSel("fixture", f.id) || (hover?.type === "fixture" && hover.id === f.id);
    drawFixture(ctx, ed, f, hl ? C.accent : systemDef(mepDef(f.kind).sys).color, C["plan-bg"], hl ? 1.8 : 1.1);
    if (opts.circuits && f.circuit) {
      const s = toS(f.x, f.y);
      ctx.font = "600 7px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = C.fg; ctx.textAlign = "left";
      ctx.fillText(f.circuit, s.x + 0.16 * ed.view.scale + 1, s.y - 0.12 * ed.view.scale);
    }
  }
  if (ed.vis.cotas) for (const d of m.dims) drawDim(ctx, ed, d, isSel("dim", d.id) ? C.accent : C.dim);

  // rótulos de habitación
  if (ed.vis.hab && rg) for (const r of m.rooms) {
    const c = rg.rooms.get(r.id);
    if (!c) continue;
    const s = toS(c.cx, c.cy + (opts.roomLabelDy ?? 0));
    ctx.textAlign = "center";
    ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.fillStyle = c.ok ? C.fg : C.danger; ctx.fillText(r.name, s.x, s.y - 2);
    ctx.font = MONO; ctx.fillStyle = c.ok ? C.muted : C.danger;
    ctx.fillText(c.ok ? fmtArea(c.area) : "espacio sin cerrar", s.x, s.y + 13);
    ctx.textAlign = "left";
  }

  // textos de anotación, a su tamaño en el modelo
  if (ed.vis.anot) for (const t of m.texts) {
    const hl = isSel("text", t.id) || (hover?.type === "text" && hover.id === t.id), s = toS(t.x, t.y);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate((-t.rot * Math.PI) / 180);
    ctx.font = `${Math.max(1, t.size * ed.view.scale)}px 'IBM Plex Sans', system-ui, sans-serif`;
    ctx.fillStyle = hl ? C.accent : C.fg; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
    if (hl) poly(textBox(t), null, C.accent, 0.8);
  }

  // marcas de tipo de puertas y ventanas
  if (opts.marks) for (const op of m.openings) {
    const w = ed.wallById(op.wallId), mk = opts.marks.get(op.id);
    if (!w || !mk || (op.kind === "door" ? !ed.vis.puertas : !ed.vis.ventanas)) continue;
    const sd = op.kind === "door" ? (op.flip ? 1 : -1) : -1, c = loc(w, op.t * dir(w).L, sd * (w.thick / 2 + 0.32)), s = toS(c.x, c.y);
    ctx.font = "600 9px 'IBM Plex Mono', ui-monospace, monospace"; ctx.textAlign = "center";
    const tw = ctx.measureText(mk).width + 6;
    ctx.fillStyle = C["plan-bg"]; ctx.fillRect(s.x - tw / 2, s.y - 7, tw, 13);
    ctx.strokeStyle = op.kind === "door" ? C.door : C.window; ctx.lineWidth = 0.8; ctx.strokeRect(s.x - tw / 2, s.y - 7, tw, 13);
    ctx.fillStyle = C.fg; ctx.fillText(mk, s.x, s.y + 3); ctx.textAlign = "left";
  }
  if (P) return;

  // pinzamientos
  if (ed.tool === "select") for (const g of ed.grips()) {
    const s = toS(g.x, g.y);
    ctx.fillStyle = C.accent; ctx.fillRect(s.x - 4.5, s.y - 4.5, 9, 9);
    ctx.strokeStyle = C.panel; ctx.lineWidth = 1; ctx.strokeRect(s.x - 4.5, s.y - 4.5, 9, 9);
  }

  // vistas previas
  const p: Pt = ed.snap ?? ed.mouse, draft = ed.draft;
  if (ed.textAt) {
    const s = toS(ed.textAt.x, ed.textAt.y), hgt = ed.defaults.textSize * ed.view.scale;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y); ctx.stroke();
  }
  if (ed.tool === "calibrate" && draft?.pts.length) {
    const a = draft.pts[0], b = draft.pts[1] ?? p;
    seg(a, b, C.danger, 2, [8, 4]);
    for (const q of [a, b]) { const s = toS(q.x, q.y); ctx.strokeStyle = C.danger; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x - 6, s.y - 6); ctx.lineTo(s.x + 6, s.y + 6); ctx.moveTo(s.x + 6, s.y - 6); ctx.lineTo(s.x - 6, s.y + 6); ctx.stroke(); }
    const mid = toS((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.font = MONO; ctx.fillStyle = C.danger; ctx.fillText(fmtLen(Math.hypot(b.x - a.x, b.y - a.y)), mid.x + 8, mid.y - 8);
  }
  const xfs = ed.previewXforms();
  if (xfs.length && draft) {
    ctx.globalAlpha = 0.55;
    for (const xf of xfs) for (const r of ed.sels) {
      if (r.type === "opening") continue;
      if (r.type === "slab") {
        const sl = ed.model.slabs.find((x) => x.id === r.id);
        if (sl) for (const ring of [sl.pts, ...sl.holes]) poly(ring.map(xf.map), null, C.accent, 1.5);
        continue;
      }
      if (r.type === "fixture") {
        const f = ed.model.fixtures.find((x) => x.id === r.id);
        if (f) { const q = xf.map(f); drawFixture(ctx, ed, { ...f, x: q.x, y: q.y }, C.accent, null, 1.2); }
        continue;
      }
      if (r.type === "run") {
        const rn = ed.model.runs.find((x) => x.id === r.id);
        if (rn) drawRun(ctx, ed, rn.pts.map(xf.map), rn.system, C.accent, 1.2);
        continue;
      }
      if (r.type === "furniture") {
        const f = ed.model.furniture.find((x) => x.id === r.id);
        if (f) strokes(furnitureStrokes(f).map((k) => ({ ...k, pts: k.pts.map(xf.map) })), C.accent, 1.2);
        continue;
      }
      if (r.type === "hatch") {
        const h = ed.model.hatches.find((x) => x.id === r.id);
        if (h) for (const q of h.loops) poly(q.map(xf.map), null, C.accent, 1.5);
        continue;
      }
      if (r.type === "underlay") {
        const u = ed.model.underlays.find((x) => x.id === r.id);
        if (u) { const q = xf.map(u); poly([q, { x: q.x + u.w, y: q.y }, { x: q.x + u.w, y: q.y + u.h }, { x: q.x, y: q.y + u.h }], null, C.accent, 1.5); }
        continue;
      }
      const list: { id: number }[] = ed.model[({ wall: "walls", line: "lines", dim: "dims", room: "rooms", roof: "roofs", stair: "stairs", deck: "decks", column: "columns", section: "sections", text: "texts" } as const)[r.type as "wall"]];
      const o = list?.find((x) => x.id === r.id) as Wall | Model["lines"][number] | Model["rooms"][number] | undefined;
      if (!o) continue;
      if ("x1" in o) {
        const a = xf.map({ x: o.x1, y: o.y1 }), b = xf.map({ x: o.x2, y: o.y2 });
        seg(a, b, C.accent, r.type === "wall" ? Math.max(2, (o as Wall).thick * ed.view.scale) : 1.5);
      } else {
        const c = ed.rooms?.rooms.get(o.id), q = xf.map(c?.ok ? { x: c.cx, y: c.cy } : o), s = toS(q.x, q.y);
        ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    const bp = draft.pts[0];
    if (ed.tool === "rotate") {
      // radio de referencia horizontal, radio al cursor y arco del giro
      const r = Math.hypot(p.x - bp.x, p.y - bp.y), a = xfs[0].rot ?? 0, s0 = toS(bp.x, bp.y);
      seg(bp, { x: bp.x + r, y: bp.y }, C.accent, 1, [2, 4]); seg(bp, p, C.accent, 1, [5, 4]);
      ctx.beginPath(); ctx.arc(s0.x, s0.y, Math.min(40, r * ed.view.scale), 0, (-a * Math.PI) / 180, a > 0); ctx.strokeStyle = C.accent; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.accent; ctx.font = "11px 'IBM Plex Mono', monospace"; ctx.fillText(`${Math.round(a * 10) / 10}°`, s0.x + 8, s0.y - 8);
    } else if (ed.tool === "scale" && draft.pts.length > 1) {
      seg(bp, draft.pts[1], C.accent, 1, [2, 4]); seg(bp, p, C.accent, 1, [5, 4]);
    } else if (ed.tool === "mirror") {
      // eje de simetría prolongado
      const dx = p.x - bp.x, dy = p.y - bp.y, k = 1000 / ed.view.scale / (Math.hypot(dx, dy) || 1);
      seg({ x: bp.x - dx * k, y: bp.y - dy * k }, { x: bp.x + dx * k, y: bp.y + dy * k }, C.accent, 1, [10, 4, 2, 4]);
    } else seg(bp, p, C.accent, 1, [5, 4]);
    if (ed.tool !== "rotate") lengthTag(ctx, ed, C, bp, p);
  } else if (draft?.pts.length) {
    const last = draft.pts[draft.pts.length - 1];
    if (ed.tool === "wall") {
      const w = { x1: last.x, y1: last.y, x2: p.x, y2: p.y }, h = ed.defaults.thick / 2, L = dir(w).L;
      if (L > 0.01) { ctx.globalAlpha = 0.45; poly(quad(w, 0, L, -h, h), C.accent); ctx.globalAlpha = 1; }
      seg(last, p, C.accent, 1, [5, 4]); lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "slab" || ed.tool === "hatch") {
      ctx.globalAlpha = 0.12; poly([...draft.pts, p], C.accent); ctx.globalAlpha = 1;
      for (let i = 0; i + 1 < draft.pts.length; i++) seg(draft.pts[i], draft.pts[i + 1], C.accent, 1.5);
      seg(last, p, C.accent, 1.2, [5, 4]);
      if (draft.pts.length >= 2) seg(p, draft.pts[0], C.accent, 1, [2, 4]);
      lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "roof") {
      const d = ed.defaults;
      drawRoof(ctx, ed, { id: 0, x1: last.x, y1: last.y, x2: p.x, y2: p.y, kind: d.roofKind, pitch: d.pitch, overhang: d.overhang, base: d.height, thick: 0.15 }, C.accent, 1.5);
      poly([last, { x: p.x, y: last.y }, p, { x: last.x, y: p.y }], null, C.accent, 1);
    } else if (ed.tool === "deck") {
      const t = deckType(ed.defaults.deckKind);
      drawDeck(ctx, ed, { id: 0, x1: last.x, y1: last.y, x2: p.x, y2: p.y, kind: t.id, height: t.height, rail: t.rail }, ed.model.walls, C.accent, 1.5, false);
      lengthTag(ctx, ed, C, last, { x: p.x, y: last.y }); lengthTag(ctx, ed, C, { x: p.x, y: last.y }, p);
    } else if (ed.tool === "stair") {
      drawStair(ctx, ed, ed.newStair(last, p, 0), C.accent, 1.5);
      lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "hole") {
      const r = [last, { x: p.x, y: last.y }, p, { x: last.x, y: p.y }];
      poly(r, null, C.accent, 1.5); seg(r[0], r[2], C.accent, 1); seg(r[1], r[3], C.accent, 1);
    } else if (ed.tool === "section") {
      drawSection(ctx, ed, { id: 0, x1: last.x, y1: last.y, x2: p.x, y2: p.y, name: "?" }, C.accent, 1.5);
      lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "run") {
      drawRun(ctx, ed, [...draft.pts, p], ed.defaults.runSys, null, 1.2);
      lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "line") {
      seg(last, p, C.accent, 1.2, [5, 4]); lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "dim") {
      if (draft.pts.length === 1) { seg(last, p, C.accent, 1, [5, 4]); lengthTag(ctx, ed, C, last, p); }
      else { const [a, b] = draft.pts; drawDim(ctx, ed, { id: 0, x1: a.x, y1: a.y, x2: b.x, y2: b.y, off: dimOffset(a, b, p) }, C.accent); }
    }
  }
  // pieza de mobiliario que se va a colocar
  if (ed.tool === "furniture" && ed.mouse.in) {
    ctx.globalAlpha = 0.7;
    strokes(furnitureStrokes({ kind: ed.defaults.furnKind, x: p.x, y: p.y, rot: ed.defaults.furnRot }), C.accent, 1.2);
    ctx.globalAlpha = 1;
  }
  if (ed.tool === "column" && ed.mouse.in) {
    ctx.globalAlpha = 0.6;
    drawColumn(ctx, ed, { id: 0, x: p.x, y: p.y, w: ed.defaults.colW, d: ed.defaults.colW }, C.accent, 1.2);
    ctx.globalAlpha = 1;
  }
  // mecanismo o punto que se va a colocar
  if (ed.tool === "fixture" && ed.mouse.in) {
    const c = ed.fixtureCandidate(p);
    ctx.globalAlpha = 0.75;
    drawFixture(ctx, ed, { kind: ed.defaults.mepKind, ...c }, C.accent, null, 1.2);
    ctx.globalAlpha = 1;
  }
  // desfase: copia fantasma en el lado del cursor
  if (ed.tool === "offset" && ed.offsetTarget && ed.mouse.in) {
    const t = ed.offsetTarget, o = t.type === "wall" ? ed.wallById(t.id) : m.lines.find((l) => l.id === t.id);
    if (o) {
      const { ux, uy } = dir(o), nx = -uy, ny = ux;
      const sg = (ed.mouse.x - o.x1) * nx + (ed.mouse.y - o.y1) * ny >= 0 ? 1 : -1, d = ed.offsetDist * sg;
      ctx.globalAlpha = 0.55;
      seg({ x: o.x1 + nx * d, y: o.y1 + ny * d }, { x: o.x2 + nx * d, y: o.y2 + ny * d }, C.accent,
        t.type === "wall" ? Math.max(2, (o as Wall).thick * ed.view.scale) : 1.5, [6, 4]);
      ctx.globalAlpha = 1;
    }
  }
  if (ed.openCand && ed.mouse.in) {
    const { w, t, ok } = ed.openCand, { L } = dir(w), width = ed.tool === "door" ? ed.defaults.doorW : ed.defaults.winW, h = w.thick / 2;
    ctx.globalAlpha = 0.55; poly(quad(w, t * L - width / 2, t * L + width / 2, -h - 0.03, h + 0.03), ok ? C.accent : C.danger); ctx.globalAlpha = 1;
  }

  // ventana de selección: azul continua (dentro) o verde discontinua (captura)
  if (ed.box) {
    const a = toS(ed.box.a.x, ed.box.a.y), b = toS(ed.box.b.x, ed.box.b.y), crossing = b.x < a.x;
    const col = crossing ? C.window : C.accent;
    ctx.fillStyle = col; ctx.globalAlpha = 0.08; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(crossing ? [6, 4] : []);
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
  }

  // marcador de referencia a objetos y cursor en cruz
  if (ed.snap?.kind && ed.mouse.in && (ed.tool !== "select" || ed.grip)) {
    const s = toS(ed.snap.x, ed.snap.y);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
    if (ed.snap.kind === "end") ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
    else { ctx.beginPath(); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x + 6, s.y + 5); ctx.lineTo(s.x - 6, s.y + 5); ctx.closePath(); ctx.stroke(); }
  }
  if (ed.mouse.in && !["select", "door", "window", "room"].includes(ed.tool)) {
    const s = toS(p.x, p.y);
    ctx.strokeStyle = C.fg; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
    ctx.moveTo(s.x - 14, s.y); ctx.lineTo(s.x + 14, s.y); ctx.moveTo(s.x, s.y - 14); ctx.lineTo(s.x, s.y + 14); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function lengthTag(ctx: CanvasRenderingContext2D, ed: Editor, C: PlanColors, a: Pt, b: Pt) {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  let ang = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  const s = ed.toS(b.x, b.y), txt = `${fmtLen(L)}  ∠${ang.toFixed(0)}°`;
  ctx.font = MONO;
  const tw = ctx.measureText(txt).width;
  ctx.fillStyle = C.panel; ctx.fillRect(s.x + 12, s.y + 10, tw + 10, 18);
  ctx.strokeStyle = C.accent; ctx.lineWidth = 1; ctx.strokeRect(s.x + 12.5, s.y + 10.5, tw + 9, 17);
  ctx.fillStyle = C.fg; ctx.fillText(txt, s.x + 17, s.y + 23);
}

function drawDim(ctx: CanvasRenderingContext2D, ed: Editor, d: Dim, col: string) {
  const g = dimGeom(d), sg = Math.sign(d.off) || 1, ext = 0.15 * sg;
  const line = (p: Pt, q: Pt, lw = 1) => {
    const s = ed.toS(p.x, p.y), t = ed.toS(q.x, q.y);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  };
  line({ x: d.x1 + g.nx * 0.08 * sg, y: d.y1 + g.ny * 0.08 * sg }, { x: g.a.x + g.nx * ext, y: g.a.y + g.ny * ext });
  line({ x: d.x2 + g.nx * 0.08 * sg, y: d.y2 + g.ny * 0.08 * sg }, { x: g.b.x + g.nx * ext, y: g.b.y + g.ny * ext });
  const ux = (d.x2 - d.x1) / g.L, uy = (d.y2 - d.y1) / g.L, e = 0.12;
  line({ x: g.a.x - ux * e, y: g.a.y - uy * e }, { x: g.b.x + ux * e, y: g.b.y + uy * e });
  for (const p of [g.a, g.b]) {
    const k = 0.09;
    line({ x: p.x - (ux + g.nx) * k, y: p.y - (uy + g.ny) * k }, { x: p.x + (ux + g.nx) * k, y: p.y + (uy + g.ny) * k }, 1.6);
  }
  const mid = ed.toS((g.a.x + g.b.x) / 2, (g.a.y + g.b.y) / 2);
  let ang = Math.atan2(uy, ux);
  if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
  ctx.save(); ctx.translate(mid.x, mid.y); ctx.rotate(ang);
  ctx.font = MONO; ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(fmtDim(g.L), 0, -5);
  ctx.restore();
}

function path(ctx: CanvasRenderingContext2D, ed: Editor, pts: Pt[], close = false) {
  ctx.beginPath();
  pts.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  if (close) ctx.closePath();
  ctx.stroke();
}

/** Columna en planta: sección cortada rellena con su contorno. */
export function drawColumn(ctx: CanvasRenderingContext2D, ed: Editor, c: Column, col: string, lw: number) {
  const s = ed.toS(c.x, c.y), w = c.w * ed.view.scale, d = c.d * ed.view.scale;
  ctx.beginPath(); ctx.rect(s.x - w / 2, s.y - d / 2, w, d);
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
}

/** Deck o porche en planta: tablas, barandal doble, escalones con flecha de bajada, columnas y alero del porche. */
function drawDeck(ctx: CanvasRenderingContext2D, ed: Editor, dk: Deck, walls: Wall[], col: string, lw: number, print: boolean) {
  const g = deckGeom(dk, walls), t = deckType(dk.kind), sc = ed.view.scale;
  const box = [g.edges[0][0], g.edges[1][0], g.edges[2][0], g.edges[3][0]];
  ctx.save();
  // relleno del color del material
  ctx.beginPath(); box.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); ctx.closePath();
  ctx.globalAlpha = print ? 0.12 : 0.22; ctx.fillStyle = t.color; ctx.fill(); ctx.globalAlpha = 1;
  // tablas paralelas a la casa (a 5 1/2"), o rayado de concreto
  ctx.strokeStyle = col; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.45;
  const alongX = g.house === null ? g.x1 - g.x0 >= g.y1 - g.y0 : g.house % 2 === 0;
  const step = t.concrete ? 0 : Math.max(5.5 * IN, 4 / sc);
  if (step) {
    if (alongX) for (let y = g.y0 + step; y < g.y1 - 1e-6; y += step) path(ctx, ed, [{ x: g.x0, y }, { x: g.x1, y }]);
    else for (let x = g.x0 + step; x < g.x1 - 1e-6; x += step) path(ctx, ed, [{ x, y: g.y0 }, { x, y: g.y1 }]);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  path(ctx, ed, box, true);
  // barandal: dos líneas a 2" y 4" del borde hacia dentro
  ctx.lineWidth = Math.max(1, lw);
  const inside = (p: Pt, k: number) => ({ x: Math.min(Math.max(p.x, g.x0 + k), g.x1 - k), y: Math.min(Math.max(p.y, g.y0 + k), g.y1 - k) });
  for (const [a, b] of g.guards) for (const k of [1 * IN, 3.5 * IN]) path(ctx, ed, [inside(a, k), inside(b, k)]);
  // escalones
  if (g.steps) {
    const s = g.steps;
    ctx.lineWidth = 1;
    s.treads.slice(0, -1).forEach((q) => path(ctx, ed, q, true));
    for (const [hi, lo] of g.handrails) path(ctx, ed, [hi, lo]);
    const m0 = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, r = Math.max(0, s.run - s.tread * 0.5);
    const m1 = { x: m0.x + s.out.x * r, y: m0.y + s.out.y * r }, ah = Math.min(0.2, s.width * 0.2);
    path(ctx, ed, [m0, m1]);
    path(ctx, ed, [{ x: m1.x - s.out.x * ah + s.along.x * ah * 0.6, y: m1.y - s.out.y * ah + s.along.y * ah * 0.6 }, m1, { x: m1.x - s.out.x * ah - s.along.x * ah * 0.6, y: m1.y - s.out.y * ah - s.along.y * ah * 0.6 }]);
  }
  // porche: columnas y alero discontinuo de la cubierta
  if (t.roof) {
    const os = (((g.house ?? 0) + 2) % 4), [a, b] = g.edges[os], L = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const o = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][os], k = 4 * IN, c = 3.5 * IN;
    const n = Math.max(1, Math.ceil(L / (8 * FT) - 1e-9));
    for (let i = 0; i <= n; i++) {
      const s = k + ((L - 2 * k) * i) / n, p = { x: a.x + u.x * s - o.x * k, y: a.y + u.y * s - o.y * k };
      path(ctx, ed, [{ x: p.x - c, y: p.y - c }, { x: p.x + c, y: p.y - c }, { x: p.x + c, y: p.y + c }, { x: p.x - c, y: p.y + c }], true);
    }
    const ov = 12 * IN;
    const eb = { x0: g.x0 - (g.house === 3 ? 0 : ov), x1: g.x1 + (g.house === 1 ? 0 : ov), y0: g.y0 - (g.house === 0 ? 0 : ov), y1: g.y1 + (g.house === 2 ? 0 : ov) };
    ctx.setLineDash([10, 5]);
    path(ctx, ed, [{ x: eb.x0, y: eb.y0 }, { x: eb.x1, y: eb.y0 }, { x: eb.x1, y: eb.y1 }, { x: eb.x0, y: eb.y1 }], true);
    ctx.setLineDash([]);
  }
  // rótulo
  const cw = (g.x1 - g.x0) * sc;
  if (cw > 70) {
    const c = ed.toS((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2);
    ctx.fillStyle = col; ctx.font = MONO; ctx.textAlign = "center";
    ctx.fillText(t.en.toUpperCase(), c.x, c.y - 3);
    ctx.fillText(`T.O. ${fmtLen(dk.height)}${g.steps ? ` · ${g.steps.n}R` : ""}`, c.x, c.y + 10);
  }
  ctx.restore();
}

/** Cubierta en planta: alero discontinuo, cumbrera y limatesas. */
function drawRoof(ctx: CanvasRenderingContext2D, ed: Editor, r: Roof, col: string, lw: number) {
  const g = roofGeom(r);
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.setLineDash([10, 5]); path(ctx, ed, g.outline, true); ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1, lw - 0.5);
  for (const [a, b] of g.ridges) path(ctx, ed, [a, b]);
}

/** Escalera en planta: peldaños y descansos, poste del caracol y línea de huella con la flecha de subida. */
function drawStair(ctx: CanvasRenderingContext2D, ed: Editor, st: Stair, col: string, lw: number) {
  const g = stairGeom(st);
  if (g.L < 1e-6) return;
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  path(ctx, ed, g.outline, true);
  ctx.lineWidth = 1;
  for (const pc of g.pieces) path(ctx, ed, pc.pts, true);
  // línea de huella: de arranque a llegada, con punto al inicio y flecha al final
  const ps = g.path, a = ps[0], b = ps[ps.length - 1], c = ps[ps.length - 2];
  path(ctx, ed, ps);
  const L = Math.hypot(b.x - c.x, b.y - c.y) || 1, ux = (b.x - c.x) / L, uy = (b.y - c.y) / L, ah = Math.min(0.25, st.width * 0.3);
  path(ctx, ed, [{ x: b.x - ux * ah - uy * ah * 0.6, y: b.y - uy * ah + ux * ah * 0.6 }, b, { x: b.x - ux * ah + uy * ah * 0.6, y: b.y - uy * ah - ux * ah * 0.6 }]);
  const s = ed.toS(a.x, a.y);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
  if (st.width * ed.view.scale > 40) {
    // el rótulo en el tramo más largo de la línea de huella
    let k = 0;
    for (let i = 1; i + 1 < ps.length; i++) if (Math.hypot(ps[i + 1].x - ps[i].x, ps[i + 1].y - ps[i].y) > Math.hypot(ps[k + 1].x - ps[k].x, ps[k + 1].y - ps[k].y)) k = i;
    const p = ps[k], q = ps[k + 1], t = ed.toS((p.x + q.x) / 2, (p.y + q.y) / 2);
    let ang = Math.atan2(q.y - p.y, q.x - p.x);
    if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(ang);
    ctx.font = MONO; ctx.textAlign = "center"; ctx.fillText(`SUBE ${g.n}`, 0, -6);
    ctx.restore();
  }
}

/** Línea de corte: trazo y punto fino, extremos gruesos, flechas hacia el lado que se ve y la letra. */
function drawSection(ctx: CanvasRenderingContext2D, ed: Editor, se: Section, col: string, lw: number) {
  const a = ed.toS(se.x1, se.y1), b = ed.toS(se.x2, se.y2), L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1) return;
  // en pantalla el eje y va hacia abajo igual que en planta, así que la normal es la misma
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, vx = uy, vy = -ux, k = Math.min(16, L / 3);
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.setLineDash([12, 3, 2, 3]); ctx.lineWidth = lw * 0.7; ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = lw * 2.4; ctx.lineCap = "butt";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + ux * k, a.y + uy * k);
  ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * k, b.y - uy * k); ctx.stroke();
  ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const [p, sg, label] of [[a, 1, se.name], [b, -1, `${se.name}'`]] as const) {
    // flecha perpendicular desde el extremo, hacia donde se mira
    const q = { x: p.x + ux * sg * 4, y: p.y + uy * sg * 4 }, t = { x: q.x + vx * 14, y: q.y + vy * 14 };
    ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.x + vx * 6, t.y + vy * 6); ctx.lineTo(t.x + ux * 4, t.y + uy * 4); ctx.lineTo(t.x - ux * 4, t.y - uy * 4); ctx.closePath(); ctx.fill();
    ctx.fillText(label, p.x - ux * sg * 10 + vx * 8, p.y - uy * sg * 10 + vy * 8);
  }
  ctx.restore();
}

/** Relleno de la sección del muro según su tipo: ladrillo rayado, bloque cruzado, hormigón, yeso o macizo. */
function hatchWall(ctx: CanvasRenderingContext2D, ed: Editor, polys: Pt[][], hatch: Hatch, C: PlanColors) {
  if (!polys.length) return;
  ctx.save();
  ctx.beginPath();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of polys) q.forEach((p, i) => {
    const s = ed.toS(p.x, p.y);
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
    if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
    if (i === q.length - 1) ctx.closePath();
  });
  if (hatch === "solid") { ctx.fillStyle = C.wall; ctx.fill(); ctx.restore(); return; }
  ctx.fillStyle = C["plan-bg"]; ctx.fill();
  if (hatch === "concrete" || hatch === "drywall") { ctx.globalAlpha = hatch === "concrete" ? 0.3 : 0.16; ctx.fillStyle = C.wall; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.clip();
  // solo la parte visible: con mucho zoom un muro mide cientos de miles de píxeles
  x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, ctx.canvas.width); y1 = Math.min(y1, ctx.canvas.height);
  if (x0 > x1 || y0 > y1) { ctx.restore(); return; }
  // rayado en coordenadas de pantalla para que siga continuo de un muro a otro
  const lines = (step: number, dirn: 1 | -1, dash: number[] = []) => {
    ctx.beginPath(); ctx.setLineDash(dash);
    for (let k = Math.floor((dirn > 0 ? x0 + y0 : x0 - y1) / step) * step; k <= (dirn > 0 ? x1 + y1 : x1 - y0); k += step) {
      if (dirn > 0) { ctx.moveTo(k - y0, y0); ctx.lineTo(k - y1, y1); } else { ctx.moveTo(k + y0, y0); ctx.lineTo(k + y1, y1); }
    }
    ctx.strokeStyle = C.wall; ctx.lineWidth = 0.6; ctx.stroke(); ctx.setLineDash([]);
  };
  if (hatch === "brick") lines(4, 1);
  else if (hatch === "block") { lines(6, 1); lines(6, -1); }
  else if (hatch === "concrete") lines(7, 1, [3, 2, 1, 2]);
  ctx.restore();
}

/** Tubería o canalización con el trazo de su red; col sustituye al color propio (selección, vista previa). */
function drawRun(ctx: CanvasRenderingContext2D, ed: Editor, pts: Pt[], system: Run["system"], col: string | null, k: number) {
  if (pts.length < 2) return;
  const d = systemDef(system);
  ctx.save();
  ctx.strokeStyle = col ?? d.color; ctx.lineWidth = d.width * k; ctx.lineJoin = "round"; ctx.setLineDash(d.dash);
  path(ctx, ed, pts);
  ctx.restore();
}

/** Símbolo de instalaciones, con los rellenos de su color y el rótulo (CGMP, ACS…) si lo tiene. */
function drawFixture(ctx: CanvasRenderingContext2D, ed: Editor, f: Pick<Fixture, "kind" | "x" | "y" | "rot">, col: string, bg: string | null, lw: number) {
  const ks: SymStroke[] = fixtureStrokes(f), def = mepDef(f.kind);
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
  for (const k of ks) {
    ctx.beginPath();
    k.pts.forEach((q, j) => { const s = ed.toS(q.x, q.y); if (j) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    if (k.closed) ctx.closePath();
    // los símbolos cerrados tapan lo que pasa por debajo (la tubería que llega al punto)
    if (k.fill) ctx.fill();
    else if (k.closed && bg) { ctx.fillStyle = bg; ctx.fill(); ctx.fillStyle = col; }
    ctx.stroke();
  }
  if (def.text) {
    const c = fixtureTextAt(f), s = ed.toS(c.x, c.y);
    ctx.font = `600 ${Math.max(6, 0.09 * ed.view.scale)}px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // el cuadro tiene medio símbolo relleno: el rótulo va encima con el color del papel detrás
    if (f.kind === "cuadro") { const tw = ctx.measureText(def.text).width + 2; ctx.fillStyle = bg ?? "#fff"; ctx.fillRect(s.x - tw / 2, s.y - 4, tw, 8); ctx.fillStyle = col; }
    ctx.fillText(def.text, s.x, s.y);
  }
  ctx.restore();
}
