// Isométricos de instalaciones hidráulica y sanitaria, sin escala, como se piden en los planos de México:
// las tuberías del modelo en perspectiva isométrica (30°), con subidas a cada salida, diámetros,
// nombres de los muebles, sentido del flujo y pendiente del drenaje.

import { furnitureDef } from "../core/furniture";
import { mepDef } from "../core/mep";
import type { Project, RunSystem } from "../core/model";

type P3 = { x: number; y: number; z: number };
type Seg = { a: P3; b: P3; sys: RunSystem; label?: string };
type Tag = { at: P3; text: string; sys: RunSystem };

const COL: Record<string, string> = { af: "#1f5fd1", ac: "#d1352b", san: "#7a4a22" };
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
/** Profundidad del drenaje bajo el piso y altura de la red de agua sobre el piso */
const SAN_Z = -0.35, WATER_Z = 0.15, SLOPE = 0.02;

/** Nombre corto del mueble más cercano a una salida (WC, LAV, REG, FREG…). */
function muebleNear(p: Project, li: number, x: number, y: number): string | null {
  const SHORT: Record<string, string> = { wc: "WC", basin: "LAV", shower: "REG", bath: "TINA", kitchen: "FREG", sink: "FREG", washer: "LAVADORA" };
  let best: { d: number; t: string } | null = null;
  for (const f of p.levels[li].furniture) {
    const t = SHORT[f.kind] ?? (furnitureDef(f.kind).cat === "Baño" ? furnitureDef(f.kind).label : null);
    if (!t) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < 1.3 && (!best || d < best.d)) best = { d, t };
  }
  return best?.t ?? null;
}

/** Tramos y etiquetas de una disciplina: hidráulica (agua fría y caliente) o sanitaria. */
export function isoModel(p: Project, disc: "hid" | "san"): { segs: Seg[]; tags: Tag[] } {
  const segs: Seg[] = [], tags: Tag[] = [];
  const systems: RunSystem[] = disc === "hid" ? ["af", "ac"] : ["san"];
  p.levels.forEach((lv, li) => {
    const z0 = lv.elev;
    for (const r of lv.runs) {
      if (!systems.includes(r.system) || r.pts.length < 2) continue;
      // el drenaje baja con pendiente del 2 % en el sentido en que se dibujó (hacia la bajante)
      let s = 0;
      const zs = r.pts.map((q, i) => { if (i) s += Math.hypot(q.x - r.pts[i - 1].x, q.y - r.pts[i - 1].y); return r.system === "san" ? z0 + SAN_Z - s * SLOPE : z0 + WATER_Z; });
      // Ø 100 si el ramal arranca en un inodoro; Ø 50 en lavabos, regaderas y fregaderos
      const nearWc = r.system === "san" && lv.furniture.some((f) => f.kind === "wc" && Math.hypot(r.pts[0].x - f.x, r.pts[0].y - f.y) < 0.8);
      for (let i = 1; i < r.pts.length; i++) {
        const a = { ...r.pts[i - 1], z: zs[i - 1] }, b = { ...r.pts[i], z: zs[i] };
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
        segs.push({ a, b, sys: r.system, label: i === 1 ? (r.system === "san" ? (nearWc ? "Ø 100 mm" : "Ø 50 mm") : "Ø 13 mm") : undefined });
      }
    }
    // subidas y bajadas a cada salida desde el punto de la red que pasa por ella
    for (const f of lv.fixtures) {
      const d = mepDef(f.kind);
      if (!systems.includes(d.sys as RunSystem)) continue;
      const z = d.sys === "san" ? z0 + SAN_Z : z0 + WATER_Z, top = z0 + (d.sys === "san" ? 0 : f.h || d.h);
      if (Math.abs(top - z) > 1e-3) segs.push({ a: { x: f.x, y: f.y, z }, b: { x: f.x, y: f.y, z: top }, sys: d.sys as RunSystem });
      const name = f.kind === "bajante" ? "BAP" : f.kind === "contador" ? "MEDIDOR" : f.kind === "llave" ? "LLAVE DE PASO" : f.kind === "termo" ? "CALENTADOR" : muebleNear(p, li, f.x, f.y);
      if (name) tags.push({ at: { x: f.x, y: f.y, z: top }, text: name, sys: d.sys as RunSystem });
    }
    // la bajante sigue hasta el registro
    if (disc === "san") for (const f of lv.fixtures.filter((x) => x.kind === "bajante")) segs.push({ a: { x: f.x, y: f.y, z: z0 + SAN_Z }, b: { x: f.x, y: f.y, z: z0 + SAN_Z - 0.4 }, sys: "san", label: "Ø 100 mm" });
  });
  // un solo nombre por mueble (sus tomas de fría y caliente están a unos centímetros)
  const kept: Tag[] = [];
  for (const t of tags) if (!kept.some((k) => k.text === t.text && Math.hypot(k.at.x - t.at.x, k.at.y - t.at.y) < 0.5 && Math.abs(k.at.z - t.at.z) < 1)) kept.push(t);
  return { segs, tags: kept };
}

const iso = (q: P3) => ({ u: (q.x - q.y) * C30, v: (q.x + q.y) * S30 - q.z });

/** Dibuja un isométrico dentro del rectángulo (x, y, w, h) en px. */
function drawIso(ctx: CanvasRenderingContext2D, m: ReturnType<typeof isoModel>, x: number, y: number, w: number, h: number, title: string, px: number) {
  ctx.save();
  ctx.fillStyle = "#111"; ctx.font = `600 ${4 * px}px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`; ctx.textAlign = "left";
  ctx.fillText(title, x + 4 * px, y + h - 6 * px);
  ctx.fillRect(x + 4 * px, y + h - 4.6 * px, ctx.measureText(title).width, 0.35 * px);
  ctx.font = `${2.6 * px}px 'IBM Plex Mono', monospace`; ctx.fillStyle = "#444";
  ctx.fillText("SIN ESCALA", x + 4 * px, y + h - 1.6 * px);
  if (!m.segs.length) {
    ctx.fillStyle = "#777"; ctx.textAlign = "center"; ctx.font = `${3.2 * px}px 'IBM Plex Sans', sans-serif`;
    ctx.fillText("Sin tuberías dibujadas: traza la red con la herramienta Tubería (TU)", x + w / 2, y + h / 2);
    ctx.restore(); return;
  }
  const pts = m.segs.flatMap((s) => [iso(s.a), iso(s.b)]).concat(m.tags.map((t) => iso(t.at)));
  const u0 = Math.min(...pts.map((q) => q.u)), u1 = Math.max(...pts.map((q) => q.u)), v0 = Math.min(...pts.map((q) => q.v)), v1 = Math.max(...pts.map((q) => q.v));
  const pad = 22 * px, k = Math.min((w - 2 * pad) / Math.max(1e-6, u1 - u0), (h - 2 * pad - 10 * px) / Math.max(1e-6, v1 - v0));
  const ox = x + (w - (u1 - u0) * k) / 2 - u0 * k, oy = y + pad + ((h - 2 * pad - 10 * px) - (v1 - v0) * k) / 2 - v0 * k;
  const S = (q: P3) => { const r = iso(q); return { x: ox + r.u * k, y: oy + r.v * k }; };
  // tuberías: el agua caliente se dibuja apenas desplazada para no taparse con la fría
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of m.segs) {
    const a = S(s.a), b = S(s.b), d = s.sys === "ac" ? 0.9 * px : 0;
    ctx.strokeStyle = COL[s.sys]; ctx.lineWidth = (s.sys === "san" ? 0.7 : 0.45) * px;
    ctx.setLineDash(s.sys === "ac" ? [2.2 * px, 0.8 * px] : []);
    ctx.beginPath(); ctx.moveTo(a.x + d, a.y - d); ctx.lineTo(b.x + d, b.y - d); ctx.stroke();
  }
  ctx.setLineDash([]);
  // diámetros y, en el drenaje, la flecha de la pendiente
  ctx.font = `${2.8 * px}px 'IBM Plex Mono', monospace`; ctx.textAlign = "center";
  for (const s of m.segs) {
    if (!s.label) continue;
    const a = S(s.a), b = S(s.b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 6 * px) continue;
    // en los tramos verticales el diámetro va al lado, en horizontal
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 1e-6) { ctx.fillStyle = COL[s.sys]; ctx.textAlign = "left"; ctx.fillText(s.label, mx + 1.5 * px, my + 1 * px); ctx.textAlign = "center"; continue; }
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
    ctx.fillStyle = COL[s.sys];
    const txt = s.sys === "san" && Math.abs(s.a.z - s.b.z) > 1e-4 && L > 30 * px ? `${s.label}  pend. 2 %` : s.label;
    ctx.fillText(txt, 0, -1.2 * px);
    ctx.restore();
    if (s.sys === "san" && Math.abs(s.a.z - s.b.z) > 1e-4 && L > 12 * px) {
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, tx = mx + ux * 3 * px, ty = my + uy * 3 * px;
      ctx.fillStyle = COL.san; ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * 2 * px - uy * 0.9 * px, ty - uy * 2 * px + ux * 0.9 * px); ctx.lineTo(tx - ux * 2 * px + uy * 0.9 * px, ty - uy * 2 * px - ux * 0.9 * px); ctx.fill();
    }
  }
  // salidas: punto y nombre del mueble con su línea de llamada
  ctx.font = `600 ${3 * px}px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`;
  m.tags.forEach((t, i) => {
    const s = S(t.at), dy = (i % 2 ? -7 : -5) * px;
    ctx.fillStyle = COL[t.sys]; ctx.beginPath(); ctx.arc(s.x, s.y, 0.7 * px, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#555"; ctx.lineWidth = 0.15 * px; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 3 * px, s.y + dy); ctx.lineTo(s.x + 3 * px + ctx.measureText(t.text).width + 1 * px, s.y + dy); ctx.stroke();
    ctx.fillStyle = "#111"; ctx.textAlign = "left"; ctx.fillText(t.text, s.x + 3.5 * px, s.y + dy - 0.7 * px);
  });
  // ejes isométricos de referencia
  const ax = x + w - 22 * px, ay = y + h - 10 * px, L = 6 * px;
  ctx.strokeStyle = "#888"; ctx.lineWidth = 0.2 * px; ctx.fillStyle = "#666"; ctx.font = `${2.2 * px}px 'IBM Plex Mono', monospace`; ctx.textAlign = "center";
  for (const [dx, dy, lab] of [[C30, S30, "X"], [-C30, S30, "Y"], [0, -1, "Z"]] as [number, number, string][]) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + dx * L, ay + dy * L); ctx.stroke();
    ctx.fillText(lab, ax + dx * (L + 2.2 * px), ay + dy * (L + 2.2 * px) + 0.8 * px);
  }
  ctx.restore();
}

/** Lámina de isométricos: hidráulico a la izquierda y sanitario a la derecha, separados por una línea. */
export function drawIsometrics(ctx: CanvasRenderingContext2D, p: Project, W: number, H: number, px: number) {
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  drawIso(ctx, isoModel(p, "hid"), 0, 0, W / 2, H, "ISOMÉTRICO HIDRÁULICO", px);
  drawIso(ctx, isoModel(p, "san"), W / 2, 0, W / 2, H, "ISOMÉTRICO SANITARIO", px);
  ctx.strokeStyle = "#111"; ctx.lineWidth = 0.25 * px; ctx.beginPath(); ctx.moveTo(W / 2, 4 * px); ctx.lineTo(W / 2, H - 4 * px); ctx.stroke();
}
