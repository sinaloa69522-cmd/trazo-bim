// Capas de las láminas estructurales del juego en metros (México): ejes, zapatas corridas y aisladas,
// castillos, columnas, trabes y tableros de losa, en tinta negra sobre la planta a medio tono.
import { sheetBounds, type Pt } from "../core/geometry";
import { fmtDim } from "../core/units";
import { axes, beams, castillos, K1, padFootings, slabPanels, stripFootings } from "../core/mxStruct";
import type { Editor } from "./Editor";
import { label, poly } from "./permitRenderer";

const INK = "#111111";

export type MxPlan = "mxcim" | "mxest";

/** Ejes con su globo arriba y a la izquierda, línea de trazo y punto y cotas entre ejes. */
export function drawAxes(ctx: CanvasRenderingContext2D, ed: Editor) {
  const lv = ed.model, ax = axes(lv), b = sheetBounds(lv), m = 1.1, R = 7;
  const top = ed.toS(0, b.y0 - m).y, left = ed.toS(b.x0 - m, 0).x, bottom = ed.toS(0, b.y1 + 0.4).y, right = ed.toS(b.x1 + 0.4, 0).x;
  ctx.save();
  ctx.lineWidth = 0.45; ctx.strokeStyle = INK; ctx.setLineDash([12, 3, 2, 3]);
  ctx.beginPath();
  for (const a of ax.x) { const x = ed.toS(a.v, 0).x; ctx.moveTo(x, top + R); ctx.lineTo(x, bottom); }
  for (const a of ax.y) { const y = ed.toS(0, a.v).y; ctx.moveTo(left + R, y); ctx.lineTo(right, y); }
  ctx.stroke(); ctx.setLineDash([]);
  const bubble = (x: number, y: number, s: string) => {
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.7; ctx.stroke();
    label(ctx, s, x, y, 8);
  };
  for (const a of ax.x) bubble(ed.toS(a.v, 0).x, top, a.name);
  for (const a of ax.y) bubble(left, ed.toS(0, a.v).y, a.name);
  // cotas entre ejes, junto a los globos
  const dimRow = (vs: number[], horiz: boolean) => {
    for (let i = 0; i + 1 < vs.length; i++) {
      const p = horiz ? ed.toS(vs[i], 0).x : ed.toS(0, vs[i]).y, q = horiz ? ed.toS(vs[i + 1], 0).x : ed.toS(0, vs[i + 1]).y;
      const at = horiz ? top + R + 9 : left + R + 9;
      ctx.beginPath();
      if (horiz) { ctx.moveTo(p, at); ctx.lineTo(q, at); for (const r of [p, q]) { ctx.moveTo(r - 2, at + 2); ctx.lineTo(r + 2, at - 2); } }
      else { ctx.moveTo(at, p); ctx.lineTo(at, q); for (const r of [p, q]) { ctx.moveTo(at - 2, r + 2); ctx.lineTo(at + 2, r - 2); } }
      ctx.lineWidth = 0.45; ctx.stroke();
      const t = fmtDim(vs[i + 1] - vs[i]);
      if (horiz) label(ctx, t, (p + q) / 2, at - 5, 7); else label(ctx, t, at - 5, (p + q) / 2, 7, "center", -Math.PI / 2);
    }
  };
  dimRow(ax.x.map((a) => a.v), true);
  dimRow(ax.y.map((a) => a.v), false);
  ctx.restore();
}

const square = (ctx: CanvasRenderingContext2D, ed: Editor, p: Pt, w: number, d: number, fill: string | null, dash: number[] = [], lw = 0.7) => {
  const s = ed.toS(p.x, p.y), hw = Math.max(1.6, (w * ed.view.scale) / 2), hd = Math.max(1.6, (d * ed.view.scale) / 2);
  ctx.beginPath(); ctx.rect(s.x - hw, s.y - hd, 2 * hw, 2 * hd);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
};

/** Castillos y columnas de un nivel: cuadros rellenos con su marca. */
function verticals(ctx: CanvasRenderingContext2D, ed: Editor, tags = true) {
  for (const k of castillos(ed.model)) {
    square(ctx, ed, k, 0.15, 0.15, INK);
    if (tags) { const s = ed.toS(k.x, k.y); label(ctx, k.mark, s.x + 7, s.y - 6, 6, "left"); }
  }
  for (const c of ed.model.columns) {
    square(ctx, ed, c, c.w, c.d, "#555");
    const s = ed.toS(c.x, c.y);
    ctx.beginPath(); const hw = (c.w * ed.view.scale) / 2, hd = (c.d * ed.view.scale) / 2;
    ctx.moveTo(s.x - hw, s.y - hd); ctx.lineTo(s.x + hw, s.y + hd); ctx.moveTo(s.x + hw, s.y - hd); ctx.lineTo(s.x - hw, s.y + hd);
    ctx.lineWidth = 0.5; ctx.strokeStyle = "#fff"; ctx.stroke();
    label(ctx, "C-1", s.x + hw + 4, s.y + hd + 6, 7, "left");
  }
}

export function drawMxOverlay(ctx: CanvasRenderingContext2D, ed: Editor, kind: MxPlan) {
  ctx.save();
  drawAxes(ctx, ed);
  if (kind === "mxcim") {
    // zapatas corridas a trazos, con su marca al centro del muro (por fuera en las de fachada)
    for (const f of stripFootings(ed.project)) {
      poly(ctx, ed, f.poly); ctx.setLineDash([6, 3]); ctx.lineWidth = 0.7; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
    }
    for (const f of stripFootings(ed.project)) {
      const w = f.wall, L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), t = L > 4 ? 0.3 : 0.5;
      const s = ed.toS(w.x1 + (w.x2 - w.x1) * t, w.y1 + (w.y2 - w.y1) * t);
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 13, 6, 0, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
      label(ctx, f.mark, s.x, s.y, 7);
    }
    for (const z of padFootings(ed.project)) {
      poly(ctx, ed, z.poly); ctx.setLineDash([6, 3]); ctx.lineWidth = 0.7; ctx.stroke(); ctx.setLineDash([]);
      square(ctx, ed, z.col, z.dado, z.dado, null, [], 0.5);
      const s = ed.toS(z.col.x - z.B / 2, z.col.y - z.B / 2);
      label(ctx, z.mark, s.x - 2, s.y - 6, 7, "left");
    }
    verticals(ctx, ed);
  } else {
    // trabes: dos líneas a trazos con el ancho de la sección y su marca
    for (const b of beams(ed.model)) {
      const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, L = Math.hypot(dx, dy), nx = (-dy / L) * (b.bw / 2), ny = (dx / L) * (b.bw / 2);
      poly(ctx, ed, [{ x: b.a.x + nx, y: b.a.y + ny }, { x: b.b.x + nx, y: b.b.y + ny }, { x: b.b.x - nx, y: b.b.y - ny }, { x: b.a.x - nx, y: b.a.y - ny }]);
      ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fill();
      ctx.setLineDash([8, 3]); ctx.lineWidth = 0.9; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
      const m = ed.toS((b.a.x + b.b.x) / 2, (b.a.y + b.b.y) / 2), rot = Math.abs(dx) >= Math.abs(dy) ? 0 : -Math.PI / 2;
      label(ctx, `${b.mark} ${Math.round(b.bw * 100)}×${Math.round(b.h * 100)}`, m.x + (rot ? -9 : 0), m.y + (rot ? 0 : -9), 7, "center", rot);
    }
    // tableros de losa: armado en dos direcciones con su marca y espesor
    for (const s of slabPanels(ed.model)) {
      const c = ed.toS(s.cx, s.cy), r = Math.min(26, (Math.min(s.a, s.b) * ed.view.scale) / 3);
      ctx.beginPath();
      ctx.moveTo(c.x - r, c.y); ctx.lineTo(c.x + r, c.y); ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x, c.y + r);
      for (const [x, y, ux, uy] of [[c.x - r, c.y, 1, 0], [c.x + r, c.y, -1, 0], [c.x, c.y - r, 0, 1], [c.x, c.y + r, 0, -1]]) {
        ctx.moveTo(x, y); ctx.lineTo(x + ux * 4 - uy * 2.5, y + uy * 4 - ux * 2.5);
        ctx.moveTo(x, y); ctx.lineTo(x + ux * 4 + uy * 2.5, y + uy * 4 + ux * 2.5);
      }
      ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
      label(ctx, `${s.mark}  e = ${Math.round(s.e * 100)} cm`, c.x + 4, c.y - 7, 7.5, "left");
      label(ctx, s.bars, c.x + 4, c.y + 8, 6.5, "left");
    }
    verticals(ctx, ed, false);
  }
  ctx.restore();
}

/** Texto de una zapata o castillo para la tabla. */
export const k1Line = () => `${K1.size}, ${K1.bars}, ${K1.ties}`;
