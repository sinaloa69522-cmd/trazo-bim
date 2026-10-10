// Capas que se dibujan encima de la planta en las láminas del juego de permiso de EE.UU.:
// cimentación, entramados, site plan y HVAC. Todo en tinta negra, la planta debajo a medio tono.
import type { Pt } from "../core/geometry";
import { anchorBolts, footings, headers, hvac, isExterior, joistBays, roofFraming, site, studs, type Seg2 } from "../core/permit";
import { feetInches } from "../core/units";
import { foundation, foundationType } from "../core/foundation";
import type { Member } from "../core/framing";
import type { Editor } from "./Editor";

export type PermitPlan = "site" | "found" | "floorfr" | "wallfr" | "rooffr" | "hvac";

const INK = "#111111";
const SANS = (px: number, w = 600) => `${w} ${px}px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`;

/** Texto con un halo blanco para que se lea sobre las líneas. */
export function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px = 8, align: CanvasTextAlign = "center", rot = 0, ink = INK, halo = "#fff") {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = SANS(px); ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.lineJoin = "round"; ctx.strokeText(s, 0, 0);
  ctx.fillStyle = ink; ctx.fillText(s, 0, 0);
  ctx.restore();
}

export function poly(ctx: CanvasRenderingContext2D, ed: Editor, pts: Pt[], close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => { const s = ed.toS(p.x, p.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  if (close) ctx.closePath();
}

function segs(ctx: CanvasRenderingContext2D, ed: Editor, ss: Seg2[], width: number, dash: number[] = []) {
  ctx.beginPath();
  for (const [a, b] of ss) { const p = ed.toS(a.x, a.y), q = ed.toS(b.x, b.y); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
  ctx.setLineDash(dash); ctx.lineWidth = width; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
}

/** Cota con su texto, desplazada off píxeles a la izquierda de a→b. */
export function dimension(ctx: CanvasRenderingContext2D, ed: Editor, a: Pt, b: Pt, off: number, text: string) {
  const p = ed.toS(a.x, a.y), q = ed.toS(b.x, b.y), L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = (q.y - p.y) / L * off, ny = -(q.x - p.x) / L * off;
  const P = { x: p.x + nx, y: p.y + ny }, Q = { x: q.x + nx, y: q.y + ny };
  ctx.beginPath();
  ctx.moveTo(p.x, p.y); ctx.lineTo(P.x, P.y); ctx.moveTo(q.x, q.y); ctx.lineTo(Q.x, Q.y); ctx.moveTo(P.x, P.y); ctx.lineTo(Q.x, Q.y);
  for (const R of [P, Q]) { ctx.moveTo(R.x - 2.5, R.y + 2.5); ctx.lineTo(R.x + 2.5, R.y - 2.5); }
  ctx.lineWidth = 0.5; ctx.strokeStyle = INK; ctx.stroke();
  let ang = Math.atan2(Q.y - P.y, Q.x - P.x);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  label(ctx, text, (P.x + Q.x) / 2 + Math.sign(off) * Math.sin(ang) * 6, (P.y + Q.y) / 2 - Math.sign(off) * Math.cos(ang) * 6, 7, "center", ang);
}

/** Etiqueta con línea de llamada desde el punto del elemento. */
export function callout(ctx: CanvasRenderingContext2D, ed: Editor, at: Pt, dx: number, dy: number, text: string) {
  const s = ed.toS(at.x, at.y);
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + dx, s.y + dy); ctx.lineTo(s.x + dx + Math.sign(dx || 1) * 6, s.y + dy);
  ctx.lineWidth = 0.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  label(ctx, text, s.x + dx + Math.sign(dx || 1) * 8, s.y + dy, 7, dx < 0 ? "right" : "left");
}

/** Planta de la cimentación a partir de sus piezas: zapatas a trazos, muros de block o concreto rayados, pilares y vigas. */
function foundationPlan(ctx: CanvasRenderingContext2D, ed: Editor, ms: Member[]) {
  const rect = (m: Member) => {
    const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y, L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * (m.w / 2), ny = (dx / L) * (m.w / 2);
    return [{ x: m.a.x + nx, y: m.a.y + ny }, { x: m.b.x + nx, y: m.b.y + ny }, { x: m.b.x - nx, y: m.b.y - ny }, { x: m.a.x - nx, y: m.a.y - ny }];
  };
  for (const m of ms.filter((x) => x.kind === "footing")) { poly(ctx, ed, rect(m)); ctx.setLineDash([5, 3]); ctx.lineWidth = 0.8; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]); }
  for (const m of ms.filter((x) => x.kind === "foundation")) {
    poly(ctx, ed, rect(m)); ctx.fillStyle = "#d9d9d9"; ctx.fill();
    ctx.save(); ctx.clip();
    // rayado cruzado del block / concreto
    const s = ed.toS(m.a.x, m.a.y), q = ed.toS(m.b.x, m.b.y), r = Math.hypot(q.x - s.x, q.y - s.y) + 20;
    ctx.beginPath();
    for (let k = -r; k < r; k += 4) { ctx.moveTo(s.x + k, s.y - r); ctx.lineTo(s.x + k + 2 * r, s.y + r); }
    ctx.lineWidth = 0.3; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    poly(ctx, ed, rect(m)); ctx.lineWidth = 0.9; ctx.strokeStyle = INK; ctx.stroke();
  }
  for (const m of ms.filter((x) => x.kind === "girder" && !x.along)) {
    const a = ed.toS(m.a.x, m.a.y), b = ed.toS(m.b.x, m.b.y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.setLineDash([10, 4]); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
  }
  // pilares y columnas: cuadro relleno (o círculo la columna de acero)
  for (const m of ms.filter((x) => x.along && (x.kind === "pier" || x.kind === "girder"))) {
    const s = ed.toS(m.a.x, m.a.y), h = Math.max(2.5, (m.w * ed.view.scale) / 2);
    ctx.beginPath();
    if (m.kind === "girder") ctx.arc(s.x, s.y, h, 0, Math.PI * 2); else ctx.rect(s.x - h, s.y - h, 2 * h, 2 * h);
    ctx.fillStyle = "#555"; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
  }
}

export function drawPermitOverlay(ctx: CanvasRenderingContext2D, ed: Editor, kind: PermitPlan, _W: number) {
  const m = ed.model;
  ctx.save();
  ctx.lineCap = "butt";
  if (kind === "found") {
    const fdn = foundationType(ed.project), ground = ed.active === 0;
    const fs = footings(m);
    if (ground && fdn.id !== "slab" && fdn.id !== "monolithic") foundationPlan(ctx, ed, foundation(ed.project));
    else for (const f of fs) { poly(ctx, ed, f.poly); ctx.setLineDash([5, 3]); ctx.lineWidth = 0.8; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]); }
    for (const p of anchorBolts(m)) {
      const s = ed.toS(p.x, p.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2); ctx.moveTo(s.x - 3.5, s.y); ctx.lineTo(s.x + 3.5, s.y); ctx.moveTo(s.x, s.y - 3.5); ctx.lineTo(s.x, s.y + 3.5);
      ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
    }
    // una marca por muro, en su punto medio (los interiores sin zapata corrida no la llevan)
    for (const f of fs) {
      if (f.mark === "F2" && (fdn.id === "crawl" || fdn.id === "basement")) continue;
      const w = f.wall, mid = { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }, s = ed.toS(mid.x, mid.y);
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 9, 5.5, 0, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
      label(ctx, fdn.id === "pier" ? "F1" : f.mark, s.x, s.y, 7);
    }
    const g = ed.rooms;
    const big = g ? m.rooms.map((r) => g.rooms.get(r.id)).filter((c) => c?.ok).sort((a, b) => b!.area - a!.area)[0] : null;
    const LBL: Record<string, [string, string]> = {
      slab: [`4" CONC. SLAB ON GRADE`, `OVER 6 MIL V.B. OVER 4" GRAVEL`],
      monolithic: [`4" MONOLITHIC SLAB`, `12" x 18" TURNED-DOWN EDGE`],
      stemwall: [`4" CONC. SLAB OVER COMPACTED FILL`, `8" CMU STEM WALL AT PERIMETER`],
      crawl: ["CRAWL SPACE", "6 MIL POLY GROUND COVER, 18\" MIN CLEAR"],
      basement: ["BASEMENT", `4" CONC. SLAB, 8'-0" CLEAR`],
      pier: ["CRAWL SPACE (PIER & BEAM)", "18\" MIN CLEAR TO JOISTS"],
    };
    if (big) { const s = ed.toS(big.cx, big.cy + 0.9), [a, b] = LBL[ground ? fdn.id : "slab"]; label(ctx, a, s.x, s.y, 8); label(ctx, b, s.x, s.y + 10, 7); }
    if (ground && (fdn.id === "crawl" || fdn.id === "pier")) {
      // acceso al crawl space en el muro exterior más largo y ventilaciones cerca de las esquinas
      const ext = m.walls.filter(isExterior).sort((a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1));
      if (ext[0]) { const w = ext[0], L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); callout(ctx, ed, { x: w.x1 + (w.x2 - w.x1) * 0.5, y: w.y1 + (w.y2 - w.y1) * 0.5 }, 18, 26, `18" x 24" CRAWL ACCESS`); void L; }
      for (const w of ext) {
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        if (L < 2) continue;
        for (const t of [0.9 / L, 1 - 0.9 / L]) {
          const s = ed.toS(w.x1 + (w.x2 - w.x1) * t, w.y1 + (w.y2 - w.y1) * t);
          ctx.beginPath(); ctx.rect(s.x - 4, s.y - 4, 8, 8); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke();
          label(ctx, "V", s.x, s.y, 6);
        }
      }
    }
  } else if (kind === "floorfr") {
    const above = ed.project.levels[ed.active + 1];
    for (const bay of joistBays(m, above ? "floor" : "ceiling", ed.rooms)) {
      segs(ctx, ed, bay.segs, 0.5);
      const s = ed.toS(bay.at.x, bay.at.y), vert = bay.angle === 90, half = Math.min(60, (bay.span * ed.view.scale) / 2 - 4);
      // flecha de luz en la dirección de las viguetas
      ctx.beginPath();
      if (vert) { ctx.moveTo(s.x, s.y - half); ctx.lineTo(s.x, s.y + half); } else { ctx.moveTo(s.x - half, s.y); ctx.lineTo(s.x + half, s.y); }
      ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke();
      for (const sg of [-1, 1]) {
        const tx = vert ? s.x : s.x + sg * half, ty = vert ? s.y + sg * half : s.y;
        ctx.beginPath(); ctx.moveTo(tx, ty);
        if (vert) { ctx.lineTo(tx - 3, ty - sg * 5); ctx.lineTo(tx + 3, ty - sg * 5); } else { ctx.lineTo(tx - sg * 5, ty - 3); ctx.lineTo(tx - sg * 5, ty + 3); }
        ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
      }
      label(ctx, bay.member, s.x + (vert ? 9 : 0), s.y + (vert ? 0 : -9), 8, "center", vert ? -Math.PI / 2 : 0);
      label(ctx, `SPAN ${feetInches(bay.span, 2)}`, s.x + (vert ? -9 : 0), s.y + (vert ? 0 : 9), 6.5, "center", vert ? -Math.PI / 2 : 0);
    }
  } else if (kind === "wallfr") {
    segs(ctx, ed, studs(m), 0.6);
    const hs = headers(m).list;
    for (const h of hs) {
      const a = ed.toS(h.a.x, h.a.y), b = ed.toS(h.b.x, h.b.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
      const s = ed.toS(h.at.x, h.at.y);
      ctx.beginPath(); ctx.rect(s.x - 8, s.y - 5, 16, 10); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke();
      label(ctx, h.mark, s.x, s.y, 7);
    }
    for (const w of m.walls) {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (L * ed.view.scale < 40) continue;
      const ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1), rot = ang > Math.PI / 2 || ang < -Math.PI / 2 ? ang + Math.PI : ang;
      const at = { x: w.x1 + (w.x2 - w.x1) * 0.25, y: w.y1 + (w.y2 - w.y1) * 0.25 }, s = ed.toS(at.x, at.y);
      const off = (w.thick / 2) * ed.view.scale + 6;
      label(ctx, isExterior(w) ? `2x6 @ 16" O.C.` : `2x4 @ 16" O.C.`, s.x + Math.sin(rot) * off, s.y - Math.cos(rot) * off, 6.5, "center", rot);
    }
  } else if (kind === "rooffr") {
    for (const r of roofFraming(m)) {
      poly(ctx, ed, r.outline); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
      segs(ctx, ed, r.rafters, 0.5);
      segs(ctx, ed, r.ridges, 2.2);
      const s = ed.toS(r.at.x, r.at.y);
      label(ctx, r.flat ? `ROOF JOISTS ${r.member}` : `RAFTERS ${r.member}`, s.x, s.y - 16, 8);
      if (r.ridge) label(ctx, r.ridge, s.x, s.y - 4, 7);
      label(ctx, `${r.flat ? "SPAN" : "RUN"} ${feetInches(r.run, 2)}`, s.x, s.y + 8, 6.5);
    }
  } else if (kind === "site") {
    const st = site(m);
    poly(ctx, ed, st.footprint); ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = INK; ctx.stroke();
    poly(ctx, ed, st.drive); ctx.lineWidth = 0.6; ctx.stroke();
    poly(ctx, ed, st.setback); ctx.setLineDash([4, 3]); ctx.lineWidth = 0.6; ctx.stroke();
    poly(ctx, ed, st.lot); ctx.setLineDash([14, 3, 2, 3]); ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    const [a, b, c, d] = st.lot, f = st.footprint;
    dimension(ctx, ed, d, c, -26, feetInches(st.w));
    dimension(ctx, ed, c, b, -26, feetInches(st.d));
    dimension(ctx, ed, { x: f[3].x - 1, y: f[3].y }, { x: f[3].x - 1, y: d.y }, 14, `${feetInches(st.sb.front)} FRONT SETBACK`);
    dimension(ctx, ed, { x: f[0].x - 1, y: a.y }, { x: f[0].x - 1, y: f[0].y }, 14, feetInches(st.sb.rear));
    const cS = ed.toS((f[0].x + f[2].x) / 2, (f[0].y + f[2].y) / 2);
    label(ctx, "PROPOSED RESIDENCE", cS.x, cS.y - 6, 9);
    label(ctx, "F.F.E. = 100.00' (ASSUMED)", cS.x, cS.y + 7, 7);
    const dr = ed.toS((st.drive[0].x + st.drive[2].x) / 2, (st.drive[0].y + st.drive[2].y) / 2);
    label(ctx, "CONC. DRIVEWAY", dr.x, dr.y, 6.5, "center", -Math.PI / 2);
    const st0 = ed.toS((d.x + c.x) / 2, d.y);
    label(ctx, "STREET", st0.x, st0.y + 44, 10);
    ctx.beginPath(); ctx.moveTo(ed.toS(d.x - 3, d.y).x, st0.y + 32); ctx.lineTo(ed.toS(c.x + 3, c.y).x, st0.y + 32); ctx.lineWidth = 0.6; ctx.stroke();
    for (const [p, txt] of [[a, "P.L."], [c, "P.L."]] as const) { const s = ed.toS(p.x, p.y); label(ctx, txt, s.x + (p === a ? 10 : -10), s.y + (p === a ? 8 : -8), 6.5); }
    // contadores en la fachada de la calle
    const em = ed.toS(f[2].x, f[2].y - 1.2), wm = ed.toS(f[3].x + 1.5, d.y - 1);
    callout(ctx, ed, ed.toW(em.x, em.y), 22, 10, "ELEC. METER");
    callout(ctx, ed, ed.toW(wm.x, wm.y), -22, -8, "WATER METER");
  } else if (kind === "hvac") {
    const h = hvac(m, ed.rooms);
    if (h) {
      for (const d of h.ducts) { poly(ctx, ed, d, false); ctx.lineWidth = 2.2; ctx.strokeStyle = "#555"; ctx.stroke(); }
      for (const [i, s] of h.supplies.entries()) {
        const p = ed.toS(s.at.x, s.at.y);
        ctx.beginPath(); ctx.rect(p.x - 5, p.y - 5, 10, 10); ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5); ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5);
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = INK; ctx.stroke();
        label(ctx, `S-${i + 1}  ${s.cfm} CFM`, p.x + 8, p.y - 8, 6.5, "left");
        label(ctx, `${s.duct}"Ø`, p.x + 8, p.y + 2, 6.5, "left");
      }
      const r = ed.toS(h.returnAt.x, h.returnAt.y);
      ctx.beginPath(); ctx.rect(r.x - 9, r.y - 5, 18, 10); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = INK; ctx.stroke();
      for (let k = -6; k <= 6; k += 3) { ctx.beginPath(); ctx.moveTo(r.x + k, r.y - 5); ctx.lineTo(r.x + k, r.y + 5); ctx.lineWidth = 0.4; ctx.stroke(); }
      label(ctx, `R-1 RETURN 20"x25"`, r.x + 12, r.y + 10, 6.5, "left");
      const u = ed.toS(h.ahu.x, h.ahu.y);
      ctx.beginPath(); ctx.rect(u.x - 12, u.y - 9, 24, 18); ctx.fillStyle = "#e5e5e5"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke();
      label(ctx, "AHU", u.x, u.y, 7);
      label(ctx, `FURNACE / AIR HANDLER ${h.tons} TON`, u.x, u.y + 16, 6.5);
      const c = ed.toS(h.cu.x, h.cu.y);
      ctx.beginPath(); ctx.rect(c.x - 10, c.y - 10, 20, 20); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.lineWidth = 0.6; ctx.stroke();
      label(ctx, `CU ${h.tons} TON CONDENSER`, c.x, c.y + 18, 6.5);
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(c.x, c.y); ctx.setLineDash([2, 2]); ctx.lineWidth = 0.6; ctx.stroke(); ctx.setLineDash([]);
      for (const e of h.exhausts) {
        const p = ed.toS(e.at.x, e.at.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 0.8; ctx.stroke();
        label(ctx, "EF", p.x, p.y, 5.5);
        label(ctx, "EXH. FAN 80 CFM TO EXT.", p.x + 8, p.y + 9, 6, "left");
      }
    }
  }
  ctx.restore();
}
