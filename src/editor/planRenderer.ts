import { dimGeom, dimOffset, dir, loc, pieces, roofGeom, stairSteps, type Pt } from "../core/geometry";
import { furnitureStrokes, type Stroke } from "../core/furniture";
import type { Dim, Model, Roof, Section, Stair, Wall } from "../core/model";
import { RC } from "../core/rooms";
import type { Editor, SelType } from "./Editor";

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
    grid(0.1, C.grid);
    grid(1, C["grid-major"]);
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
    ctx.globalAlpha = hl ? 0.14 : 0.05;
    poly(sl.pts, hl ? C.accent : C.muted);
    ctx.globalAlpha = 1;
    ctx.setLineDash([8, 3, 2, 3]);
    poly(sl.pts, null, hl ? C.accent : C.muted, hl ? 2 : 1);
    ctx.setLineDash([]);
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

  // mobiliario, bajo los muros
  if (ed.vis.mobiliario) for (const f of m.furniture) {
    const hl = isSel("furniture", f.id) || (hover?.type === "furniture" && hover.id === f.id);
    strokes(furnitureStrokes(f), hl ? C.accent : C.anno, hl ? 1.6 : 0.9, C["plan-bg"]);
  }

  // muros
  if (ed.vis.muros) for (const w of m.walls) {
    const h = w.thick / 2, hl = isSel("wall", w.id) || (hover?.type === "wall" && hover.id === w.id);
    for (const [a, b] of pieces(m, w).solids) poly(quad(w, a, b, -h, h), C.wall, hl ? C.accent : C.wall, isSel("wall", w.id) ? 2.5 : 1);
  }

  // puertas y ventanas
  for (const op of m.openings) {
    const w = ed.wallById(op.wallId);
    if (!w) continue;
    const { L, ux, uy } = dir(w), a = op.t * L - op.width / 2, b = op.t * L + op.width / 2, h = w.thick / 2;
    if (op.kind === "door" && ed.vis.puertas) {
      const col = isSel("opening", op.id) ? C.accent : C.door, sd = op.flip ? -1 : 1;
      seg(loc(w, a, -h), loc(w, a, h), col, 1.2); seg(loc(w, b, -h), loc(w, b, h), col, 1.2);
      const hinge = loc(w, a, sd * h);
      seg(hinge, loc(w, a, sd * (h + op.width)), col, 2);
      const au = Math.atan2(uy, ux), hs = toS(hinge.x, hinge.y);
      ctx.beginPath(); ctx.setLineDash([4, 3]);
      if (sd > 0) ctx.arc(hs.x, hs.y, op.width * ed.view.scale, au, au + Math.PI / 2);
      else ctx.arc(hs.x, hs.y, op.width * ed.view.scale, au - Math.PI / 2, au);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    } else if (op.kind === "window" && ed.vis.ventanas) {
      const col = isSel("opening", op.id) ? C.accent : C.window;
      poly(quad(w, a, b, -h, h), null, col, 1.2);
      seg(loc(w, a, -h / 3), loc(w, b, -h / 3), col); seg(loc(w, a, h / 3), loc(w, b, h / 3), col);
    }
  }

  if (ed.vis.anot) for (const l of m.lines) {
    const hl = isSel("line", l.id) || (hover?.type === "line" && hover.id === l.id);
    seg({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, hl ? C.accent : C.anno, hl ? 2.5 : 1.2);
  }
  if (ed.vis.escaleras) for (const st of m.stairs) {
    const hl = isSel("stair", st.id) || (hover?.type === "stair" && hover.id === st.id);
    drawStair(ctx, ed, st, hl ? C.accent : C.fg, hl ? 2 : 1);
  }
  if (ed.vis.cubiertas) for (const r of m.roofs) {
    const hl = isSel("roof", r.id) || (hover?.type === "roof" && hover.id === r.id);
    drawRoof(ctx, ed, r, hl ? C.accent : C.door, hl ? 2 : 1);
  }
  if (ed.vis.secciones) for (const se of m.sections) {
    const hl = isSel("section", se.id) || (hover?.type === "section" && hover.id === se.id);
    drawSection(ctx, ed, se, hl ? C.accent : C.fg, hl ? 2 : 1);
  }
  if (ed.vis.cotas) for (const d of m.dims) drawDim(ctx, ed, d, isSel("dim", d.id) ? C.accent : C.dim);

  // rótulos de habitación
  if (ed.vis.hab && rg) for (const r of m.rooms) {
    const c = rg.rooms.get(r.id);
    if (!c) continue;
    const s = toS(c.cx, c.cy);
    ctx.textAlign = "center";
    ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif"; ctx.fillStyle = c.ok ? C.fg : C.danger; ctx.fillText(r.name, s.x, s.y - 2);
    ctx.font = MONO; ctx.fillStyle = c.ok ? C.muted : C.danger;
    ctx.fillText(c.ok ? `${c.area.toFixed(2)} m²` : "espacio sin cerrar", s.x, s.y + 13);
    ctx.textAlign = "left";
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
  const xf = ed.previewXform();
  if (xf && draft) {
    ctx.globalAlpha = 0.55;
    for (const r of ed.sels) {
      if (r.type === "opening") continue;
      if (r.type === "slab") {
        const sl = ed.model.slabs.find((x) => x.id === r.id);
        if (sl) poly(sl.pts.map(xf.map), null, C.accent, 1.5);
        continue;
      }
      if (r.type === "furniture") {
        const f = ed.model.furniture.find((x) => x.id === r.id);
        if (f) strokes(furnitureStrokes(f).map((k) => ({ ...k, pts: k.pts.map(xf.map) })), C.accent, 1.2);
        continue;
      }
      const list: { id: number }[] = ed.model[({ wall: "walls", line: "lines", dim: "dims", room: "rooms", roof: "roofs", stair: "stairs", section: "sections" } as const)[r.type]];
      const o = list.find((x) => x.id === r.id) as Wall | Model["lines"][number] | Model["rooms"][number] | undefined;
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
    if (ed.tool === "mirror") {
      // eje de simetría prolongado
      const dx = p.x - bp.x, dy = p.y - bp.y, k = 1000 / ed.view.scale / (Math.hypot(dx, dy) || 1);
      seg({ x: bp.x - dx * k, y: bp.y - dy * k }, { x: bp.x + dx * k, y: bp.y + dy * k }, C.accent, 1, [10, 4, 2, 4]);
    } else seg(bp, p, C.accent, 1, [5, 4]);
    lengthTag(ctx, ed, C, bp, p);
  } else if (draft?.pts.length) {
    const last = draft.pts[draft.pts.length - 1];
    if (ed.tool === "wall") {
      const w = { x1: last.x, y1: last.y, x2: p.x, y2: p.y }, h = ed.defaults.thick / 2, L = dir(w).L;
      if (L > 0.01) { ctx.globalAlpha = 0.45; poly(quad(w, 0, L, -h, h), C.accent); ctx.globalAlpha = 1; }
      seg(last, p, C.accent, 1, [5, 4]); lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "slab") {
      ctx.globalAlpha = 0.12; poly([...draft.pts, p], C.accent); ctx.globalAlpha = 1;
      for (let i = 0; i + 1 < draft.pts.length; i++) seg(draft.pts[i], draft.pts[i + 1], C.accent, 1.5);
      seg(last, p, C.accent, 1.2, [5, 4]);
      if (draft.pts.length >= 2) seg(p, draft.pts[0], C.accent, 1, [2, 4]);
      lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "roof") {
      const d = ed.defaults;
      drawRoof(ctx, ed, { id: 0, x1: last.x, y1: last.y, x2: p.x, y2: p.y, kind: d.roofKind, pitch: d.pitch, overhang: d.overhang, base: d.height, thick: 0.15 }, C.accent, 1.5);
      poly([last, { x: p.x, y: last.y }, p, { x: last.x, y: p.y }], null, C.accent, 1);
    } else if (ed.tool === "stair") {
      drawStair(ctx, ed, { id: 0, x1: last.x, y1: last.y, x2: p.x, y2: p.y, width: ed.defaults.stairW, height: ed.floorToFloor() }, C.accent, 1.5);
      lengthTag(ctx, ed, C, last, p);
    } else if (ed.tool === "section") {
      drawSection(ctx, ed, { id: 0, x1: last.x, y1: last.y, x2: p.x, y2: p.y, name: "?" }, C.accent, 1.5);
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
  const s = ed.toS(b.x, b.y), txt = `${L.toFixed(2)} m  ∠${ang.toFixed(0)}°`;
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
  ctx.font = MONO; ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(g.L.toFixed(2), 0, -5);
  ctx.restore();
}

function path(ctx: CanvasRenderingContext2D, ed: Editor, pts: Pt[], close = false) {
  ctx.beginPath();
  pts.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  if (close) ctx.closePath();
  ctx.stroke();
}

/** Cubierta en planta: alero discontinuo, cumbrera y limatesas. */
function drawRoof(ctx: CanvasRenderingContext2D, ed: Editor, r: Roof, col: string, lw: number) {
  const g = roofGeom(r);
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.setLineDash([10, 5]); path(ctx, ed, g.outline, true); ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1, lw - 0.5);
  for (const [a, b] of g.ridges) path(ctx, ed, [a, b]);
}

/** Escalera en planta: contorno, peldaños y flecha de subida. */
function drawStair(ctx: CanvasRenderingContext2D, ed: Editor, st: Stair, col: string, lw: number) {
  const k = stairSteps(st);
  if (k.L < 1e-6) return;
  const h = st.width / 2;
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  path(ctx, ed, [loc(st, 0, -h), loc(st, k.L, -h), loc(st, k.L, h), loc(st, 0, h)], true);
  ctx.lineWidth = 1;
  for (let i = 1; i < k.n; i++) path(ctx, ed, [loc(st, i * k.tread, -h), loc(st, i * k.tread, h)]);
  // flecha por el eje: de arranque a llegada
  const a = loc(st, k.tread / 2, 0), b = loc(st, k.L - 0.05, 0), ah = Math.min(0.25, h * 0.6);
  path(ctx, ed, [a, b]);
  path(ctx, ed, [loc(st, k.L - 0.05 - ah, -ah * 0.6), b, loc(st, k.L - 0.05 - ah, ah * 0.6)]);
  const s = ed.toS(a.x, a.y);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
  if (st.width * ed.view.scale > 40) {
    const t = ed.toS(loc(st, k.L / 2, 0).x, loc(st, k.L / 2, 0).y), { ux, uy } = dir(st);
    let ang = Math.atan2(uy, ux);
    if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(ang);
    ctx.font = MONO; ctx.textAlign = "center"; ctx.fillText(`SUBE ${k.n}`, 0, -6);
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
