import { dimGeom, dir, loc, pieces, type Pt } from "./geometry";
import type { Model } from "./model";
import type { RoomGrid } from "./rooms";

/**
 * Exporta la planta a DXF ASCII (R12, solo sección ENTITIES), en metros.
 * El DXF tiene el eje Y hacia arriba, así que se invierte.
 */
export function toDxf(m: Model, rooms: RoomGrid | null): string {
  const out = ["0", "SECTION", "2", "ENTITIES"];
  const X = (v: number) => v.toFixed(4), Y = (v: number) => (-v).toFixed(4);
  const line = (lay: string, a: Pt, b: Pt) =>
    out.push("0", "LINE", "8", lay, "10", X(a.x), "20", Y(a.y), "30", "0", "11", X(b.x), "21", Y(b.y), "31", "0");
  const rect = (lay: string, p: Pt[]) => { for (let i = 0; i < 4; i++) line(lay, p[i], p[(i + 1) % 4]); };
  const text = (lay: string, p: Pt, h: number, s: string, rot = 0) =>
    out.push("0", "TEXT", "8", lay, "10", X(p.x), "20", Y(p.y), "30", "0", "40", String(h), "1", s,
      "50", rot.toFixed(2), "72", "1", "11", X(p.x), "21", Y(p.y), "31", "0");

  for (const w of m.walls) {
    const h = w.thick / 2;
    for (const [a, b] of pieces(m, w).solids) rect("A-MUROS", [loc(w, a, -h), loc(w, b, -h), loc(w, b, h), loc(w, a, h)]);
  }
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const { L, ux, uy } = dir(w), a = o.t * L - o.width / 2, b = o.t * L + o.width / 2, h = w.thick / 2;
    if (o.kind === "door") {
      const sd = o.flip ? -1 : 1, hg = loc(w, a, sd * h);
      line("A-PUERTAS", hg, loc(w, a, sd * (h + o.width)));
      const au = (Math.atan2(-uy, ux) * 180) / Math.PI;
      const [s, e] = sd > 0 ? [au - 90, au] : [au, au + 90];
      out.push("0", "ARC", "8", "A-PUERTAS", "10", X(hg.x), "20", Y(hg.y), "30", "0", "40", o.width.toFixed(4),
        "50", s.toFixed(3), "51", e.toFixed(3));
    } else {
      rect("A-VENTANAS", [loc(w, a, -h), loc(w, b, -h), loc(w, b, h), loc(w, a, h)]);
      line("A-VENTANAS", loc(w, a, -h / 3), loc(w, b, -h / 3));
      line("A-VENTANAS", loc(w, a, h / 3), loc(w, b, h / 3));
    }
  }
  for (const l of m.lines) line("A-ANOTACION", { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
  for (const d of m.dims) {
    const g = dimGeom(d), sg = Math.sign(d.off || 1);
    line("A-COTAS", { x: d.x1, y: d.y1 }, g.a);
    line("A-COTAS", { x: d.x2, y: d.y2 }, g.b);
    line("A-COTAS", g.a, g.b);
    const mid = { x: (g.a.x + g.b.x) / 2 + g.nx * 0.12 * sg, y: (g.a.y + g.b.y) / 2 + g.ny * 0.12 * sg };
    text("A-COTAS", mid, 0.15, g.L.toFixed(2), (Math.atan2(-(d.y2 - d.y1), d.x2 - d.x1) * 180) / Math.PI);
  }
  for (const r of m.rooms) {
    const c = rooms?.rooms.get(r.id);
    if (!c?.ok) continue;
    text("A-HABITACIONES", { x: c.cx, y: c.cy }, 0.25, r.name);
    text("A-HABITACIONES", { x: c.cx, y: c.cy + 0.4 }, 0.18, `${c.area.toFixed(2)} m2`);
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}
