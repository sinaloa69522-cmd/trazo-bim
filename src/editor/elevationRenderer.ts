import type { EFace, Elevation, FaceKind } from "../core/elevation";

const FILL: Record<FaceKind, string> = {
  wall: "#ffffff", glass: "#dfe8ee", door: "#efe7dc", roof: "#e6e6e6", slab: "#d4d4d4", stair: "#ece8e0", furn: "#f4f4f4", cut: "#2b2b2b",
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/**
 * Dibuja un alzado en papel: (ox, oy) es la esquina inferior izquierda del dibujo en píxeles
 * y s los píxeles por metro. Reserva a la derecha sitio para las cotas de nivel.
 */
export interface ElevOpts {
  /** Etiquetas de material con directriz sobre las caras vistas (láminas de fachada) */
  tags?: boolean;
  /** Cotas de altura a la izquierda: entre niveles y total hasta la cumbrera */
  heights?: boolean;
}

export function drawElevation(ctx: CanvasRenderingContext2D, el: Elevation, ox: number, oy: number, s: number, title: string, opts: ElevOpts = {}) {
  const X = (u: number) => ox + (u - el.u0) * s, Y = (z: number) => oy - (z - el.z0) * s;
  ctx.save();
  ctx.lineJoin = "round";
  const paint = (f: Elevation["faces"][number]) => {
    ctx.beginPath();
    f.pts.forEach((q, i) => (i ? ctx.lineTo(X(q.u), Y(q.z)) : ctx.moveTo(X(q.u), Y(q.z))));
    ctx.closePath();
    ctx.fillStyle = FILL[f.kind]; ctx.fill();
    // lo cortado se perfila con su propio color, para que no se vean juntas entre piezas
    if (f.mat && !f.cut) {
      texture(ctx, f, X, Y, s);
      // la trama deja su propio trazado: se vuelve a trazar el contorno para perfilarlo
      ctx.beginPath();
      f.pts.forEach((q, i) => (i ? ctx.lineTo(X(q.u), Y(q.z)) : ctx.moveTo(X(q.u), Y(q.z))));
      ctx.closePath();
    }
    ctx.strokeStyle = f.kind === "cut" ? FILL.cut : "#1a1a1a"; ctx.lineWidth = f.cut ? 0.9 : f.kind === "glass" || f.kind === "door" || f.kind === "furn" ? 0.5 : 0.7; ctx.stroke();
  };
  // primero lo que se ve más allá; lo cortado va encima del terreno
  for (const f of el.faces) if (!f.cut) paint(f);
  // terreno: tapa lo que queda bajo la rasante y se marca con línea gruesa
  const g0 = X(el.u0) - 0.8 * s, g1 = X(el.u1) + 0.8 * s, gy = Y(0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(g0, gy, g1 - g0, Math.max(0, Y(el.z0) - gy) + 2);
  for (const f of el.faces) if (f.cut) paint(f);
  ctx.beginPath(); ctx.moveTo(g0, gy); ctx.lineTo(g1, gy); ctx.strokeStyle = "#111"; ctx.lineWidth = 1.8; ctx.stroke();
  // cotas de nivel a la derecha
  ctx.font = `7px ${MONO}`; ctx.fillStyle = "#111";
  for (const l of el.levels) {
    const y = Y(l.elev), x0 = X(el.u1) + 0.3 * s, x1 = x0 + 34;
    ctx.beginPath(); ctx.setLineDash([6, 2, 1, 2]); ctx.moveTo(X(el.u1) + 0.05 * s, y); ctx.lineTo(x1, y);
    ctx.lineWidth = 0.4; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - 3, y - 4); ctx.lineTo(x0 + 3, y - 4); ctx.closePath(); ctx.fill();
    ctx.fillText(`${l.elev >= 0 ? "+" : ""}${l.elev.toFixed(2)}`, x0 + 5, y - 2);
    ctx.fillText(l.name, x0 + 5, y + 7);
  }
  if (opts.heights) heightDims(ctx, el, X, Y);
  if (opts.tags) materialTags(ctx, el, X, Y);
  // título de la vista
  ctx.font = `600 10px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`;
  ctx.fillText(title.toUpperCase(), X(el.u0), oy + 16);
  ctx.restore();
}

type Px = (v: number) => number;

/** Trama del acabado en coordenadas del dibujo, para que siga continua de una cara a otra. Usa el trazado actual como recorte. */
function texture(ctx: CanvasRenderingContext2D, f: EFace, X: Px, Y: Px, s: number) {
  const m = f.mat!;
  // [alto de hilada, largo de pieza, aparejo a matajunta]
  const P = { brick: [0.15, 0.3, true], block: [0.2, 0.4, true], concrete: [0.6, 1.2, false], tile: [0.25, 0, false] } as const;
  if (!(m.hatch in P)) return;
  const [rowH, len, bond] = P[m.hatch as keyof typeof P];
  if (rowH * s < 3) return;
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let i = Math.floor(z0 / rowH); i * rowH <= z1; i++) {
    const z = i * rowH, y = Y(z);
    ctx.moveTo(X(u0), y); ctx.lineTo(X(u1), y);
    // juntas verticales, desplazadas media pieza en hiladas alternas
    if (len && len * s >= 6) for (let u = Math.floor(u0 / len) * len + (bond && i % 2 ? len / 2 : 0); u <= u1; u += len) {
      ctx.moveTo(X(u), y); ctx.lineTo(X(u), Y(z + rowH));
    }
  }
  ctx.strokeStyle = m.hatch === "tile" ? "#8a6b5a" : "#9a9a9a"; ctx.lineWidth = 0.3; ctx.stroke();
  ctx.restore();
}

function inside(q: { u: number; z: number }, pts: { u: number; z: number }[]) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > q.z) !== (b.z > q.z) && q.u < ((b.u - a.u) * (q.z - a.z)) / (b.z - a.z) + a.u) r = !r;
  }
  return r;
}

/**
 * Una etiqueta por material: en la cara vista más grande de ese acabado, en un punto que no tape
 * ninguna cara que se pinte después (carpinterías, otros muros más cercanos).
 */
function materialTags(ctx: CanvasRenderingContext2D, el: Elevation, X: Px, Y: Px) {
  const faces = el.faces.filter((f) => !f.cut);
  const area = (f: EFace) => { let a = 0; f.pts.forEach((p, i) => { const q = f.pts[(i + 1) % f.pts.length]; a += p.u * q.z - q.u * p.z; }); return Math.abs(a / 2); };
  const best = new Map<string, { f: EFace; q: { u: number; z: number }; a: number }>();
  faces.forEach((f, i) => {
    if (!f.mat) return;
    const a = area(f), cur = best.get(f.mat.name);
    if (a < 0.5 || (cur && cur.a >= a)) return;
    let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const later = faces.slice(i + 1);
    for (const ty of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const tx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const q = { u: u0 + (u1 - u0) * tx, z: z0 + (z1 - z0) * ty };
      if (inside(q, f.pts) && q.z > 0.1 && !later.some((g) => inside(q, g.pts))) { best.set(f.mat!.name, { f, q, a }); return; }
    }
  });
  ctx.font = `7px 'IBM Plex Sans', system-ui, sans-serif`;
  [...best.values()].forEach(({ f, q }, k) => {
    const x = X(q.u), y = Y(q.z), tx = x + 14, ty = y - 12 - (k % 2) * 9, label = f.mat!.name;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "#111"; ctx.strokeStyle = "#111"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.lineTo(tx + tw + 4, ty); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(tx + 1, ty - 8, tw + 3, 7.5);
    ctx.fillStyle = "#111"; ctx.fillText(label, tx + 2, ty - 1.5);
  });
}

/** Cotas verticales a la izquierda: tramos entre niveles hasta la coronación y la altura total. */
function heightDims(ctx: CanvasRenderingContext2D, el: Elevation, X: Px, Y: Px) {
  const zs = [...new Set([0, ...el.levels.map((l) => l.elev).filter((z) => z > 0 && z < el.z1 - 0.05), el.z1].map((z) => Math.round(z * 100) / 100))].sort((a, b) => a - b);
  if (zs.length < 2) return;
  const x1 = X(el.u0) - 12, x2 = x1 - 12;
  const dim = (x: number, za: number, zb: number) => {
    const ya = Y(za), yb = Y(zb);
    ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, yb);
    for (const y of [ya, yb]) { ctx.moveTo(x - 2.5, y + 2.5); ctx.lineTo(x + 2.5, y - 2.5); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); }
    ctx.stroke();
    ctx.save(); ctx.translate(x - 2, (ya + yb) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.fillText((zb - za).toFixed(2), 0, 0); ctx.restore();
  };
  ctx.save();
  ctx.strokeStyle = "#111"; ctx.fillStyle = "#111"; ctx.lineWidth = 0.4; ctx.font = `6.5px ${MONO}`;
  for (let i = 1; i < zs.length; i++) dim(x1, zs[i - 1], zs[i]);
  if (zs.length > 2) dim(x2, zs[0], zs[zs.length - 1]);
  ctx.restore();
}
