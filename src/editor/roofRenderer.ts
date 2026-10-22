// Planta de azotea del juego en metros: losa con sus huecos (cubo de escalera), pretil con su chaflán,
// pendientes hacia las gárgolas, niveles y cotas, en tinta negra sobre la planta del nivel apagada.
import { parapet, roofGeom, type Pt } from "../core/geometry";
import { roofSummary } from "../core/roofPlan";
import { fmtDim, fmtElev } from "../core/units";
import type { Editor } from "./Editor";
import { callout, dimension, label, poly } from "./permitRenderer";

const INK = "#111111";

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const ring = (ctx: CanvasRenderingContext2D, ed: Editor, pts: Pt[]) => {
  pts.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  ctx.closePath();
};

/** Flecha de pendiente de a a b (en planta) con su rótulo. */
function slopeArrow(ctx: CanvasRenderingContext2D, ed: Editor, a: Pt, b: Pt, text: string) {
  const p = ed.toS(a.x, a.y), q = ed.toS(b.x, b.y), L = Math.hypot(q.x - p.x, q.y - p.y) || 1, ux = (q.x - p.x) / L, uy = (q.y - p.y) / L;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
  ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - ux * 7 - uy * 3, q.y - uy * 7 + ux * 3);
  ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - ux * 7 + uy * 3, q.y - uy * 7 - ux * 3);
  ctx.lineWidth = 0.7; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  let ang = Math.atan2(uy, ux);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  label(ctx, text, (p.x + q.x) / 2 + Math.sin(ang) * 7, (p.y + q.y) / 2 - Math.cos(ang) * 7, 7, "center", ang);
}

/** Marca de nivel: triángulo con la cota a un lado. */
function levelMark(ctx: CanvasRenderingContext2D, ed: Editor, at: Pt, text: string) {
  const s = ed.toS(at.x, at.y);
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 4, s.y - 6); ctx.lineTo(s.x + 4, s.y - 6); ctx.closePath();
  ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s.x - 4, s.y - 6); ctx.lineTo(s.x + 34, s.y - 6); ctx.stroke();
  label(ctx, text, s.x + 6, s.y - 11, 7, "left");
}

/** Recorta lo que se dibuje después a las cubiertas del nivel activo: en la planta de azotea no se ve nada fuera de ellas. */
export function clipToRoofs(ctx: CanvasRenderingContext2D, ed: Editor) {
  const rs = ed.project.levels[ed.active].roofs;
  if (!rs.length) return;
  ctx.beginPath();
  for (const r of rs) ring(ctx, ed, roofGeom(r).outline);
  ctx.clip();
}

/** Dibuja las cubiertas del nivel activo como planta de azotea (la planta del nivel ya está dibujada debajo). */
export function drawRoofPlan(ctx: CanvasRenderingContext2D, ed: Editor, W: number, H: number) {
  const lv = ed.project.levels[ed.active];
  ctx.save();
  if (!lv.roofs.length) {
    label(ctx, "Este nivel no tiene azotea. Dibuja una cubierta plana con la herramienta Cubierta y vuelve a esta lámina.", W / 2, H / 2, 11);
    ctx.restore();
    return;
  }
  for (const r of lv.roofs) {
    const g = roofGeom(r), [o0, , o2] = g.outline, sum = roofSummary(lv, r);
    // losa: apaga los muros de abajo; los huecos dejan ver la escalera
    ctx.beginPath(); ring(ctx, ed, g.outline); for (const h of r.holes ?? []) ring(ctx, ed, h);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fill("evenodd");
    poly(ctx, ed, g.outline); ctx.lineWidth = 1.3; ctx.strokeStyle = INK; ctx.stroke();

    if (r.kind !== "flat") {
      ctx.lineWidth = 0.8;
      for (const [a, b] of g.ridges) { poly(ctx, ed, [a, b], false); ctx.stroke(); }
      const c = ed.toS((o0.x + o2.x) / 2, (o0.y + o2.y) / 2);
      label(ctx, `CUBIERTA ${r.kind === "gable" ? "A DOS AGUAS" : r.kind === "shed" ? "DE UN AGUA" : "A CUATRO AGUAS"}  ${r.pitch}°`, c.x, c.y + 14, 8);
    }

    const pp = parapet(r);
    if (pp) {
      // pretil visto desde arriba (gris claro) con el chaflán de 10 cm por dentro
      ctx.beginPath(); ring(ctx, ed, pp.outer); ring(ctx, ed, pp.inner);
      ctx.fillStyle = "#d4d4d4"; ctx.fill("evenodd");
      poly(ctx, ed, pp.inner); ctx.lineWidth = 0.9; ctx.stroke();
      const [i0, , i2] = pp.inner, ch = 0.1;
      poly(ctx, ed, rect(i0.x + ch, i0.y + ch, i2.x - ch, i2.y - ch)); ctx.lineWidth = 0.35; ctx.stroke();
      // parteaguas al centro y pendientes del 2 % hacia las gárgolas del lado de atrás
      const xm = (i0.x + i2.x) / 2, d = i2.y - i0.y;
      ctx.setLineDash([10, 3, 2, 3]); poly(ctx, ed, [{ x: xm, y: i0.y + ch }, { x: xm, y: i2.y - ch }], false); ctx.lineWidth = 0.5; ctx.stroke(); ctx.setLineDash([]);
      const pm = ed.toS(xm, i2.y - Math.min(1, d * 0.12));
      label(ctx, "PARTEAGUAS", pm.x, pm.y, 6.5, "center", -Math.PI / 2);
      const holes = sum.holes;
      for (const gp of sum.gargoyles) {
        // la flecha va por la mitad libre: si un hueco la corta, se corre al lado más ancho
        let x = gp.x;
        const half = gp.x < xm ? [i0.x + ch, xm] : [xm, i2.x - ch];
        const hit = holes.find((h) => { const xs = h.pts.map((p) => p.x); return x > Math.min(...xs) - 0.3 && x < Math.max(...xs) + 0.3; });
        if (hit) {
          const xs = hit.pts.map((p) => p.x), l = Math.min(...xs) - half[0], rr = half[1] - Math.max(...xs);
          x = l > rr ? (half[0] + Math.min(...xs)) / 2 : (Math.max(...xs) + half[1]) / 2;
        }
        slopeArrow(ctx, ed, { x, y: i2.y - Math.min(0.6, d * 0.1) }, { x, y: i0.y + Math.min(0.45, d * 0.08) }, "P = 2 %");
        // gárgola: sale 30 cm del paño del pretil
        poly(ctx, ed, rect(gp.x - 0.06, o0.y - 0.3, gp.x + 0.06, gp.y)); ctx.fillStyle = INK; ctx.fill();
      }
      sum.gargoyles.forEach((gp, i) => callout(ctx, ed, { x: gp.x, y: o0.y - 0.3 }, i ? 18 : -18, -14, `G-${i + 1} GÁRGOLA / B.A.P. Ø 100`));
      // rótulos del pretil y niveles
      callout(ctx, ed, { x: o2.x - pp.t / 2, y: (o0.y + o2.y) / 2 }, 22, -18, `PRETIL ${Math.round(pp.t * 100)} cm, h = ${pp.h.toFixed(2)} m`);
      levelMark(ctx, ed, { x: i0.x + ch + 0.4, y: i2.y - ch - 0.35 }, `N.L.A. ${fmtElev(sum.nla)}`);
      if (sum.coping != null) levelMark(ctx, ed, { x: o0.x + pp.t / 2, y: o2.y + 0.05 }, `N.T.P. ${fmtElev(sum.coping)}`);
    } else if (r.kind === "flat") {
      const c = ed.toS((o0.x + o2.x) / 2, (o0.y + o2.y) / 2);
      label(ctx, "AZOTEA SIN PRETIL", c.x, c.y + 14, 8);
      levelMark(ctx, ed, { x: o0.x + 0.5, y: o2.y - 0.4 }, `N.L.A. ${fmtElev(sum.nla)}`);
    }

    // huecos: contorno grueso y aspa, con su nombre y medida
    for (const h of sum.holes) {
      poly(ctx, ed, h.pts); ctx.lineWidth = 1.1; ctx.strokeStyle = INK; ctx.stroke();
      if (h.pts.length === 4) { ctx.beginPath(); for (const [a, b] of [[0, 2], [1, 3]]) { const p = ed.toS(h.pts[a].x, h.pts[a].y), q = ed.toS(h.pts[b].x, h.pts[b].y); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); } ctx.lineWidth = 0.45; ctx.stroke(); }
      // el rótulo sale por el lado con más azotea libre, para no tapar la escalera que se ve por el hueco
      const xs = h.pts.map((p) => p.x), ys = h.pts.map((p) => p.y), hx0 = Math.min(...xs), hx1 = Math.max(...xs), ym = (Math.min(...ys) + Math.max(...ys)) / 2;
      const left = hx0 - o0.x > o2.x - hx1, at = { x: left ? hx0 : hx1, y: ym };
      callout(ctx, ed, at, left ? -26 : 26, -16, `${h.stair ? "CUBO DE ESCALERA" : "HUECO EN LOSA"} ${fmtDim(h.w)} × ${fmtDim(h.d)}`);
    }

    // cotas: totales abajo y a la izquierda, con la cadena de los huecos por dentro
    const chain = (vs: number[], at: (v: number) => Pt, off: number) => {
      const s = [...new Set(vs.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
      for (let i = 0; i + 1 < s.length; i++) if (s[i + 1] - s[i] > 0.05) dimension(ctx, ed, at(s[i]), at(s[i + 1]), off, fmtDim(s[i + 1] - s[i]));
    };
    const hx = sum.holes.flatMap((h) => h.pts.map((p) => p.x)), hy = sum.holes.flatMap((h) => h.pts.map((p) => p.y));
    if (hx.length) {
      chain([o0.x, o2.x, Math.min(...hx), Math.max(...hx)], (x) => ({ x, y: o2.y }), -18);
      chain([o0.y, o2.y, Math.min(...hy), Math.max(...hy)], (y) => ({ x: o0.x, y }), -18);
    }
    dimension(ctx, ed, { x: o0.x, y: o2.y }, { x: o2.x, y: o2.y }, hx.length ? -34 : -20, fmtDim(sum.w));
    dimension(ctx, ed, { x: o0.x, y: o0.y }, { x: o0.x, y: o2.y }, hx.length ? -34 : -20, fmtDim(sum.d));
  }
  ctx.restore();
}
