import { openingSymbol } from "./openingStyles";
import { outward } from "./finishes";
import { fmtArea, fmtDim, IN, unitSystem, type UnitSystem } from "./units";
import { furnitureStrokes } from "./furniture";
import { fixtureStrokes, fixtureTextAt, mepDef } from "./mep";
import { dimGeom, dir, loc, pieces, roofGeom, stairSteps, type Pt } from "./geometry";
import { deckGeom } from "./decks";
import { hatchSegments, isSolid, patternLines, solidTrapezoids } from "./hatch";
import type { Model } from "./model";
import type { RoomGrid } from "./rooms";

/**
 * Exporta la planta a DXF ASCII (R12), en metros, o en pulgadas si el proyecto va en pies y pulgadas
 * (como los dibujos de AutoCAD en EE.UU.). El DXF tiene el eje Y hacia arriba, así que se invierte.
 */
export function toDxf(m: Model, rooms: RoomGrid | null, u: UnitSystem = unitSystem()): string {
  const k = u === "imperial" ? 1 / IN : 1, S = (v: number) => String(+(v * k).toFixed(4));
  const out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", u === "imperial" ? "1" : "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const X = (v: number) => (v * k).toFixed(4), Y = (v: number) => (-v * k).toFixed(4);
  const line = (lay: string, a: Pt, b: Pt) =>
    out.push("0", "LINE", "8", lay, "10", X(a.x), "20", Y(a.y), "30", "0", "11", X(b.x), "21", Y(b.y), "31", "0");
  const rect = (lay: string, p: Pt[]) => { for (let i = 0; i < 4; i++) line(lay, p[i], p[(i + 1) % 4]); };
  const text = (lay: string, p: Pt, h: number, s: string, rot = 0) =>
    out.push("0", "TEXT", "8", lay, "10", X(p.x), "20", Y(p.y), "30", "0", "40", S(h), "1", s,
      "50", rot.toFixed(2), "72", "1", "11", X(p.x), "21", Y(p.y), "31", "0");

  for (const w of m.walls) {
    const h = w.thick / 2;
    for (const [a, b] of pieces(m, w).solids) rect("A-MUROS", [loc(w, a, -h), loc(w, b, -h), loc(w, b, h), loc(w, a, h)]);
  }
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    // el mismo símbolo que en pantalla, explotado en líneas
    const lay = o.kind === "door" ? "A-PUERTAS" : "A-VENTANAS";
    for (const k of openingSymbol(w, o, dir(w).L, o.kind === "window" ? outward(m.walls, w) : 1))
      for (let i = 1; i < k.pts.length; i++) line(lay, k.pts[i - 1], k.pts[i]);
  }
  // sombreados explotados (el R12 no tiene HATCH): la trama en líneas y los sólidos en trapecios SOLID
  for (const h of m.hatches ?? []) {
    if (isSolid(h)) {
      for (const [a, b, c, d] of solidTrapezoids(h.loops))
        out.push("0", "SOLID", "8", "A-SOMBREADOS", "10", X(a.x), "20", Y(a.y), "30", "0", "11", X(b.x), "21", Y(b.y), "31", "0",
          "12", X(c.x), "22", Y(c.y), "32", "0", "13", X(d.x), "23", Y(d.y), "33", "0");
    } else {
      const r = hatchSegments(h.loops, patternLines(h));
      for (const [a, b] of r.segs) line("A-SOMBREADOS", a, b);
      if (r.dense) for (const q of h.loops) q.forEach((p, i) => line("A-SOMBREADOS", p, q[(i + 1) % q.length]));
    }
  }
  for (const sl of m.slabs ?? []) for (const ring of [sl.pts, ...(sl.holes ?? [])]) ring.forEach((p, i) => line("A-LOSAS", p, ring[(i + 1) % ring.length]));
  for (const r of m.roofs ?? []) {
    const g = roofGeom(r);
    rect("A-CUBIERTAS", g.outline);
    for (const [a, b] of g.ridges) line("A-CUBIERTAS", a, b);
  }
  for (const st of m.stairs ?? []) {
    const k = stairSteps(st), h = st.width / 2;
    rect("A-ESCALERAS", [loc(st, 0, -h), loc(st, k.L, -h), loc(st, k.L, h), loc(st, 0, h)]);
    for (let i = 1; i < k.n; i++) line("A-ESCALERAS", loc(st, i * k.tread, -h), loc(st, i * k.tread, h));
    line("A-ESCALERAS", loc(st, 0, 0), loc(st, k.L, 0));
  }
  for (const dk of m.decks ?? []) {
    const g = deckGeom(dk, m.walls);
    for (const [a, b] of g.edges) line("A-DECKS", a, b);
    for (const [a, b] of g.guards) line("A-DECKS", a, b);
    for (const t of g.steps?.treads ?? []) for (let i = 0; i < t.length; i++) line("A-DECKS", t[i], t[(i + 1) % t.length]);
  }
  for (const fu of m.furniture ?? []) for (const k of furnitureStrokes(fu)) {
    const n = k.closed ? k.pts.length : k.pts.length - 1;
    for (let i = 0; i < n; i++) line("A-MOBILIARIO", k.pts[i], k.pts[(i + 1) % k.pts.length]);
  }
  for (const se of m.sections ?? []) {
    const a = { x: se.x1, y: se.y1 }, b = { x: se.x2, y: se.y2 }, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, v = { x: uy, y: -ux };
    line("A-SECCIONES", a, b);
    for (const [p, sg, label] of [[a, 1, se.name], [b, -1, `${se.name}'`]] as const) {
      line("A-SECCIONES", p, { x: p.x + v.x * 0.5, y: p.y + v.y * 0.5 });
      text("A-SECCIONES", { x: p.x - ux * sg * 0.35 + v.x * 0.3, y: p.y - uy * sg * 0.35 + v.y * 0.3 }, 0.3, label);
    }
  }
  // instalaciones: cada red en su capa
  const RUN_LAYER = { elec: "E-ELECTRICIDAD", af: "P-AGUA-FRIA", ac: "P-AGUA-CALIENTE", san: "P-SANEAMIENTO" } as const;
  for (const r of m.runs ?? []) for (let i = 1; i < r.pts.length; i++) line(RUN_LAYER[r.system], r.pts[i - 1], r.pts[i]);
  for (const fx of m.fixtures ?? []) {
    const d = mepDef(fx.kind), lay = d.disc === "elec" ? "E-ELECTRICIDAD" : "P-FONTANERIA";
    for (const k of fixtureStrokes(fx)) {
      const n = k.closed ? k.pts.length : k.pts.length - 1;
      for (let i = 0; i < n; i++) line(lay, k.pts[i], k.pts[(i + 1) % k.pts.length]);
    }
    if (d.text) text(lay, fixtureTextAt(fx), 0.08, d.text);
    if (fx.circuit && d.disc === "elec") text(lay, { x: fx.x + 0.18, y: fx.y - 0.12 }, 0.08, fx.circuit);
  }
  // textos alineados a la izquierda por su punto de inserción
  for (const t of m.texts ?? [])
    out.push("0", "TEXT", "8", "A-ANOTACION", "10", X(t.x), "20", Y(t.y), "30", "0", "40", S(t.size), "1", t.text, "50", t.rot.toFixed(2));
  for (const l of m.lines) line("A-ANOTACION", { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
  for (const d of m.dims) {
    const g = dimGeom(d), sg = Math.sign(d.off || 1);
    line("A-COTAS", { x: d.x1, y: d.y1 }, g.a);
    line("A-COTAS", { x: d.x2, y: d.y2 }, g.b);
    line("A-COTAS", g.a, g.b);
    const mid = { x: (g.a.x + g.b.x) / 2 + g.nx * 0.12 * sg, y: (g.a.y + g.b.y) / 2 + g.ny * 0.12 * sg };
    text("A-COTAS", mid, 0.15, fmtDim(g.L, u), (Math.atan2(-(d.y2 - d.y1), d.x2 - d.x1) * 180) / Math.PI);
  }
  for (const r of m.rooms) {
    const c = rooms?.rooms.get(r.id);
    if (!c?.ok) continue;
    text("A-HABITACIONES", { x: c.cx, y: c.cy }, 0.25, r.name);
    text("A-HABITACIONES", { x: c.cx, y: c.cy + 0.4 }, 0.18, fmtArea(c.area, u).replace("²", "2"));
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}
