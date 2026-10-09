import type { Elevation, FaceKind } from "../core/elevation";

const FILL: Record<FaceKind, string> = {
  wall: "#ffffff", glass: "#dfe8ee", door: "#efe7dc", roof: "#e6e6e6", slab: "#d4d4d4", stair: "#ece8e0", furn: "#f4f4f4", cut: "#2b2b2b",
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/**
 * Dibuja un alzado en papel: (ox, oy) es la esquina inferior izquierda del dibujo en píxeles
 * y s los píxeles por metro. Reserva a la derecha sitio para las cotas de nivel.
 */
export function drawElevation(ctx: CanvasRenderingContext2D, el: Elevation, ox: number, oy: number, s: number, title: string) {
  const X = (u: number) => ox + (u - el.u0) * s, Y = (z: number) => oy - (z - el.z0) * s;
  ctx.save();
  ctx.lineJoin = "round";
  const paint = (f: Elevation["faces"][number]) => {
    ctx.beginPath();
    f.pts.forEach((q, i) => (i ? ctx.lineTo(X(q.u), Y(q.z)) : ctx.moveTo(X(q.u), Y(q.z))));
    ctx.closePath();
    ctx.fillStyle = FILL[f.kind]; ctx.fill();
    // lo cortado se perfila con su propio color, para que no se vean juntas entre piezas
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
  // título de la vista
  ctx.font = `600 10px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif`;
  ctx.fillText(title.toUpperCase(), X(el.u0), oy + 16);
  ctx.restore();
}
