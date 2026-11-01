// Plano de acabados: cada espacio con el color de su piso y una etiqueta con las claves de piso, muros y plafón.
import { finishTable } from "../core/interiorFinishes";
import { computeRooms, RC } from "../core/rooms";
import type { Editor } from "./Editor";
import { label } from "./permitRenderer";

const INK = "#111111";

export function drawFinishPlan(ctx: CanvasRenderingContext2D, ed: Editor) {
  const lv = ed.project.levels[ed.active], g = computeRooms(lv), rows = finishTable(lv);
  if (!g) { label(ctx, "Marca las habitaciones (herramienta Habitación) para el plano de acabados.", ctx.canvas.width / 4, ctx.canvas.height / 4, 10); return; }
  ctx.save();
  for (const r of rows) {
    const c = g.rooms.get(r.room.id)!;
    // piso: las celdas del espacio con el color del acabado
    ctx.globalAlpha = 0.45; ctx.fillStyle = r.floor.color;
    for (const [j, i0, i1] of c.runs) {
      const a = ed.toS(g.x0 + i0 * RC, g.y0 + j * RC), b = ed.toS(g.x0 + i1 * RC, g.y0 + (j + 1) * RC);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y + 0.5);
    }
    ctx.globalAlpha = 1;
    // etiqueta: nombre y las tres claves en una caja dividida
    const s = ed.toS(c.cx, c.cy);
    label(ctx, r.name.toUpperCase(), s.x, s.y - 16, 8);
    const codes = [r.floor.code, r.wall.code, r.ceiling.code], w = 30, h = 12, x0 = s.x - (w * 3) / 2, y0 = s.y - 6;
    ctx.fillStyle = "#fff"; ctx.fillRect(x0, y0, w * 3, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.strokeRect(x0, y0, w * 3, h);
    codes.forEach((code, k) => {
      if (k) { ctx.beginPath(); ctx.moveTo(x0 + w * k, y0); ctx.lineTo(x0 + w * k, y0 + h); ctx.stroke(); }
      label(ctx, code, x0 + w * k + w / 2, y0 + h / 2, 7);
    });
    label(ctx, `${r.area.toFixed(2)} m²`, s.x, y0 + h + 9, 6.5);
  }
  ctx.restore();
}
