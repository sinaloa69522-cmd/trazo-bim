import { drawEntourage, placeEntourage } from "./entourage";
import { fmtDim, fmtElev, imperial } from "../core/units";
import { elevationDims, type EFace, type Elevation, type FaceKind } from "../core/elevation";
import { elevationLines } from "../core/openingStyles";

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
  /** Cotas en cadena: horizontales bajo el terreno y verticales a la izquierda (elevationDims) */
  dims?: boolean;
  /** Personas, árboles y autos (entourage.ts) */
  entourage?: boolean;
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
    if (f.op && !f.cut) carpentry(ctx, f, X, Y);
  };
  const ent = opts.entourage ? placeEntourage(el) : [];
  // árboles detrás del edificio
  if (ent.length) drawEntourage(ctx, ent, "back", X, Y, s);
  // primero lo que se ve más allá; lo cortado va encima del terreno
  for (const f of el.faces) if (!f.cut) paint(f);
  // terreno: tapa lo que queda bajo la rasante y se marca con línea gruesa
  const g0 = X(el.u0) - 0.8 * s, g1 = X(el.u1) + 0.8 * s, gy = Y(0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(g0, gy, g1 - g0, Math.max(0, Y(el.z0) - gy) + 2);
  for (const f of el.faces) if (f.cut) paint(f);
  // personas y auto delante, de pie sobre el terreno o el piso
  if (ent.length) drawEntourage(ctx, ent, "front", X, Y, s);
  ctx.beginPath(); ctx.moveTo(g0, gy); ctx.lineTo(g1, gy); ctx.strokeStyle = "#111"; ctx.lineWidth = 1.8; ctx.stroke();
  // niveles a la derecha: N.P.T. de cada planta y la coronación (azotea o cumbrera)
  ctx.font = `7px ${MONO}`; ctx.fillStyle = "#111"; ctx.strokeStyle = "#111";
  const us = imperial(), placed: number[] = [];
  const mark = (z: number, label: string, name: string) => {
    const y = Y(z), x0 = X(el.u1) + 0.3 * s, x1 = x0 + 34;
    // una coronación pegada a un nivel taparía su rótulo
    if (placed.some((q) => Math.abs(q - y) < 10)) return;
    placed.push(y);
    ctx.beginPath(); ctx.setLineDash([6, 2, 1, 2]); ctx.moveTo(X(el.u1) + 0.05 * s, y); ctx.lineTo(x1, y);
    ctx.lineWidth = 0.4; ctx.stroke(); ctx.setLineDash([]);
    levelSymbol(ctx, x0, y);
    ctx.fillText(label, x0 + 5, y - 2);
    if (name) ctx.fillText(name, x0 + 5, y + 7);
  };
  for (const l of el.levels) mark(l.elev, us ? fmtElev(l.elev) : `N.P.T. ${fmtElev(l.elev)}`, l.name);
  for (const t of el.tops ?? []) mark(t.elev, `${us ? (t.tag === "N.L.A." ? "T.O. ROOF" : "RIDGE") : t.tag} ${fmtElev(t.elev)}`, "");
  const below = Math.max(oy, gy);
  let rows = 0;
  if (opts.dims) rows = chainDims(ctx, el, X, Y, below);
  if (opts.tags) materialTags(ctx, el, X, Y);
  // título de la vista, debajo de las cotas
  ctx.font = `600 10px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`; ctx.fillStyle = "#111";
  ctx.fillText(title.toUpperCase(), X(el.u0), (rows ? below + rows * 10 : oy) + 16);
  ctx.restore();
}

type Px = (v: number) => number;

/** Símbolo de nivel en corte y fachada: triángulo con la punta en la línea y la mitad izquierda rellena. */
function levelSymbol(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3.5, y - 5); ctx.lineTo(x + 3.5, y - 5); ctx.closePath();
  ctx.lineWidth = 0.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3.5, y - 5); ctx.lineTo(x, y - 5); ctx.closePath(); ctx.fill();
}

/** Trama del acabado en coordenadas del dibujo, para que siga continua de una cara a otra. Usa el trazado actual como recorte. */
function texture(ctx: CanvasRenderingContext2D, f: EFace, X: Px, Y: Px, s: number) {
  const m = f.mat!;
  // [alto de hilada, largo de pieza, aparejo a matajunta]
  const P = { brick: [0.15, 0.3, true], block: [0.2, 0.4, true], concrete: [0.6, 1.2, false], tile: [0.25, 0, false] } as const;
  const fin = m.finish;
  if (!fin && !(m.hatch in P)) return;
  const [rowH, len, bond] = fin ? [fin.row ?? 0, fin.len ?? 0, !!fin.bond] : P[m.hatch as keyof typeof P];
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  if (rowH * s >= 3) for (let i = Math.floor(z0 / rowH); i * rowH <= z1; i++) {
    const z = i * rowH, y = Y(z);
    ctx.moveTo(X(u0), y); ctx.lineTo(X(u1), y);
    // juntas verticales, desplazadas media pieza en hiladas alternas (y algo irregulares en tejuelas y piedra)
    if (len && len * s >= 6) for (let u = Math.floor(u0 / len) * len + (bond && i % 2 ? len / 2 : 0), k = 0; u <= u1; u += len, k++) {
      const j = fin?.random ? (((i * 7 + k * 13) % 5) - 2) * len * 0.12 : 0;
      ctx.moveTo(X(u + j), y); ctx.lineTo(X(u + j), Y(z + rowH));
    }
  }
  // listones, ranuras y juntas alzadas
  if (fin?.col && fin.col * s >= 3) for (let u = Math.floor(u0 / fin.col) * fin.col; u <= u1; u += fin.col) {
    ctx.moveTo(X(u), Y(z0)); ctx.lineTo(X(u), Y(z1));
    if (fin.style === "batten" && 0.06 * s >= 1.5) { ctx.moveTo(X(u + 0.06), Y(z0)); ctx.lineTo(X(u + 0.06), Y(z1)); }
  }
  ctx.strokeStyle = m.hatch === "tile" && (!fin || fin.id === "clay") ? "#8a6b5a" : "#9a9a9a"; ctx.lineWidth = 0.3; ctx.stroke();
  // punteado del estuco y la cubierta vegetal
  if (fin?.dots) {
    ctx.fillStyle = "#8a8a8a";
    const step = Math.max(4, 0.12 * s);
    for (let y = Y(z1); y <= Y(z0); y += step) for (let x = X(u0), k = 0; x <= X(u1); x += step, k++) {
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, r = h - Math.floor(h);
      ctx.fillRect(x + r * step, y + ((r * 7) % 1) * step, 0.6, 0.6);
    }
  }
  ctx.restore();
}

/** Montantes, travesaños y el triángulo de apertura de una puerta o ventana vista en alzado. */
function carpentry(ctx: CanvasRenderingContext2D, f: EFace, X: Px, Y: Px) {
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of f.pts) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  ctx.save();
  ctx.lineWidth = 0.4; ctx.strokeStyle = "#333";
  for (const l of elevationLines(f.op!)) {
    ctx.beginPath(); ctx.setLineDash(l.dash ? [3, 2] : []);
    l.pts.forEach(([u, v], i) => { const x = X(u0 + u * (u1 - u0)), y = Y(z0 + v * (z1 - z0)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  }
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

/**
 * Cadenas de cotas: las horizontales bajo el terreno (huecos o muros cortados, y total) y las verticales
 * a la izquierda (antepechos y dinteles, niveles, total), de dentro hacia fuera. Devuelve las filas de abajo.
 */
function chainDims(ctx: CanvasRenderingContext2D, el: Elevation, X: Px, Y: Px, below: number) {
  const { h, v } = elevationDims(el);
  ctx.save();
  ctx.strokeStyle = "#111"; ctx.fillStyle = "#111"; ctx.lineWidth = 0.4; ctx.font = `6.5px ${MONO}`; ctx.textAlign = "center";
  const tick = (x: number, y: number) => { ctx.moveTo(x - 2.5, y + 2.5); ctx.lineTo(x + 2.5, y - 2.5); };
  h.forEach((c, k) => {
    const y = below + 9 + k * 10;
    ctx.beginPath(); ctx.moveTo(X(c[0]), y); ctx.lineTo(X(c[c.length - 1]), y);
    for (const u of c) { tick(X(u), y); ctx.moveTo(X(u), y + 2.5); ctx.lineTo(X(u), y - 3); }
    ctx.stroke();
    for (let i = 1; i < c.length; i++) {
      const a = X(c[i - 1]), b = X(c[i]), t = fmtDim(c[i] - c[i - 1]), tw = ctx.measureText(t).width;
      if (b - a < 8) continue;
      // si no cabe, sube un poco para no pisar a la vecina
      ctx.fillText(t, (a + b) / 2, y - 1.5 - (b - a < tw + 2 && i % 2 ? 6 : 0));
    }
  });
  v.forEach((c, k) => {
    const x = X(el.u0) - 12 - k * 11;
    ctx.beginPath(); ctx.moveTo(x, Y(c[0])); ctx.lineTo(x, Y(c[c.length - 1]));
    for (const z of c) { tick(x, Y(z)); ctx.moveTo(x - 3, Y(z)); ctx.lineTo(x + 3, Y(z)); }
    ctx.stroke();
    for (let i = 1; i < c.length; i++) {
      const ya = Y(c[i - 1]), yb = Y(c[i]);
      if (ya - yb < 8) continue;
      ctx.save(); ctx.translate(x - 2, (ya + yb) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(fmtDim(c[i] - c[i - 1]), 0, 0); ctx.restore();
    }
  });
  ctx.restore();
  return h.length;
}
