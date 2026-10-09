// Catálogo ampliado: más muebles por estancia, exterior y jardín, vehículos, personas y vegetación.
// Igual que el resto del mobiliario: trazos de planta en metros con el origen en el centro, el lado -y
// es el fondo (pared, respaldo, trasera del coche) y el +y el frente.
import type { Pt } from "./geometry";
import type { FurnitureDef, Solid, Stroke } from "./furniture";

const P = (x: number, y: number): Pt => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Stroke => ({ pts: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], closed: true });
const box = (w: number, d: number, cx = 0, cy = 0) => rect(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2);
const line = (x0: number, y0: number, x1: number, y1: number): Stroke => ({ pts: [P(x0, y0), P(x1, y1)] });
const poly = (pts: [number, number][], closed = true): Stroke => ({ pts: pts.map(([x, y]) => P(x, y)), closed });
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 24): Stroke =>
  ({ pts: Array.from({ length: n }, (_, i) => P(cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2))), closed: true });
const circle = (cx: number, cy: number, r: number, n = 24) => ellipse(cx, cy, r, r, n);

/** Rectángulo de esquinas redondeadas. */
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, n = 5): Stroke {
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); pts.push(P(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
  };
  corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI); corner(x1 - r, y0 + r, (3 * Math.PI) / 2);
  return { pts, closed: true };
}

/** Contorno lobulado de una copa de árbol o arbusto, de radio máximo R. */
function scallop(R: number, lobes: number, cx = 0, cy = 0, phase = 0): Stroke {
  const n = lobes * 10;
  return {
    pts: Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + phase, r = R * (0.84 + 0.16 * Math.abs(Math.sin((lobes * (a - phase)) / 2)));
      return P(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }),
    closed: true,
  };
}

/** Contorno dentado (copa de conífera vista desde arriba). */
function star(R: number, r: number, spikes: number): Stroke {
  return { pts: Array.from({ length: spikes * 2 }, (_, i) => { const a = (i / (spikes * 2)) * Math.PI * 2, k = i % 2 ? r : R; return P(k * Math.cos(a), k * Math.sin(a)); }), closed: true };
}

/** Hoja estrecha de palmera a lo largo del ángulo a, entre los radios r0 y r1. */
function frond(a: number, r0: number, r1: number, wid: number): Stroke {
  const c = Math.cos(a), s = Math.sin(a), n = -s, m = c, pts: Pt[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) { const t = i / steps, r = r0 + (r1 - r0) * t, w = wid * Math.sin(Math.PI * Math.min(1, t * 1.15)); pts.push(P(c * r + n * w, s * r + m * w)); }
  for (let i = steps; i >= 0; i--) { const t = i / steps, r = r0 + (r1 - r0) * t, w = wid * Math.sin(Math.PI * Math.min(1, t * 1.15)); pts.push(P(c * r - n * w, s * r - m * w)); }
  return { pts, closed: true };
}

/** Rayas radiales de ramas dentro de una copa. */
const branches = (r0: number, r1: number, k: number, phase = 0.3) =>
  Array.from({ length: k }, (_, i) => { const a = phase + (i / k) * Math.PI * 2; return line(r0 * Math.cos(a), r0 * Math.sin(a), r1 * Math.cos(a + 0.15), r1 * Math.sin(a + 0.15)); });

// colores del 3D
const GREEN = "#6f9a5b", DGREEN = "#4f7a45", TRUNK = "#7a5a3c", WATER = "#7cc3dd", DARK = "#2f3437", SKIN = "#d7b49a";

const F = (d: Omit<FurnitureDef, "ifc"> & { ifc?: FurnitureDef["ifc"] }): FurnitureDef => ({ ifc: { cls: "IFCFURNITURE", type: "NOTDEFINED" }, ...d });
const S = (x: number, y: number, w: number, d: number, z0: number, h: number, more: Partial<Solid> = {}): Solid => ({ x, y, w, d, z0, h, ...more });

// ---------- vegetación ----------

function tree(kind: string, label: string, D: number, H: number): FurnitureDef {
  const R = D / 2;
  return F({
    kind, cat: "Vegetación", label, w: D, d: D, h: H, ifc: { cls: "IFCGEOGRAPHICELEMENT", type: "NOTDEFINED" },
    draw: () => [scallop(R, Math.round(8 + D * 1.5)), scallop(R * 0.62, Math.round(6 + D), 0, 0, 0.4), circle(0, 0, Math.max(0.12, D * 0.04), 12), ...branches(D * 0.06, R * 0.75, 6)],
    solids: () => [S(0, 0, D * 0.07, D * 0.07, 0, H * 0.45, { shape: "cyl", color: TRUNK }), S(0, 0, D, D, H * 0.32, H * 0.68, { shape: "sphere", color: GREEN })],
  });
}

export const MORE: FurnitureDef[] = [
  // ---------- dormitorio ----------
  F({ kind: "nightstand", cat: "Dormitorio", label: "Buró / mesa de noche", w: 0.5, d: 0.4, h: 0.55, draw: () => [box(0.5, 0.4), circle(0, 0.02, 0.1, 16), line(-0.25, 0.14, 0.25, 0.14)] }),
  F({ kind: "dresser", cat: "Dormitorio", label: "Cómoda", w: 1.2, d: 0.5, h: 0.85, draw: () => [box(1.2, 0.5), line(-0.2, -0.25, -0.2, 0.25), line(0.2, -0.25, 0.2, 0.25), line(-0.6, 0.18, 0.6, 0.18)] }),
  F({
    kind: "crib", cat: "Dormitorio", label: "Cuna", w: 0.75, d: 1.35, h: 0.95, ifc: { cls: "IFCFURNITURE", type: "BED" },
    draw: () => [box(0.75, 1.35), box(0.63, 1.23), ...[-0.45, -0.15, 0.15, 0.45].map((y) => line(-0.375, y, -0.315, y)), ...[-0.45, -0.15, 0.15, 0.45].map((y) => line(0.315, y, 0.375, y))],
  }),
  F({
    kind: "bunk", cat: "Dormitorio", label: "Litera", w: 1.0, d: 2.0, h: 1.7, ifc: { cls: "IFCFURNITURE", type: "BED" },
    draw: () => [box(1.0, 2.0), rect(-0.38, -0.92, 0.38, -0.62), line(-0.5, -0.4, 0.5, -0.4), line(0.5, 0.3, 0.5, 0.9), line(-0.5, -1, 0.5, 1)],
  }),
  // ---------- estar ----------
  F({
    kind: "sofa3", cat: "Estar", label: "Sofá de 3 plazas", w: 2.2, d: 0.95, h: 0.85, ifc: { cls: "IFCFURNITURE", type: "SOFA" },
    draw: () => [roundRect(-1.1, -0.475, 1.1, 0.475, 0.08), rect(-1.1, -0.475, 1.1, -0.22), rect(-1.1, -0.22, -0.9, 0.475), rect(0.9, -0.22, 1.1, 0.475), line(-0.3, -0.22, -0.3, 0.475), line(0.3, -0.22, 0.3, 0.475)],
    solids: () => [S(0, 0.12, 1.8, 0.7, 0, 0.42), S(0, -0.35, 2.2, 0.25, 0, 0.85), S(-1, 0.12, 0.2, 0.7, 0, 0.62), S(1, 0.12, 0.2, 0.7, 0, 0.62)],
  }),
  F({
    kind: "sofaL", cat: "Estar", label: "Sofá esquinero en L", w: 2.6, d: 1.9, h: 0.85, ifc: { cls: "IFCFURNITURE", type: "SOFA" },
    draw: () => [poly([[-1.3, -0.95], [1.3, -0.95], [1.3, 0.95], [0.4, 0.95], [0.4, -0.05], [-1.3, -0.05]]), line(-1.3, -0.7, 1.05, -0.7), line(1.05, -0.7, 1.05, 0.95), line(-0.45, -0.7, -0.45, -0.05), line(0.4, -0.7, 0.4, -0.05), line(0.4, 0.15, 1.05, 0.15)],
    solids: () => [S(-0.3, -0.38, 2.0, 0.65, 0, 0.42), S(0.72, 0.45, 0.65, 1.0, 0, 0.42), S(-0.13, -0.83, 2.35, 0.25, 0, 0.85), S(1.18, 0, 0.25, 1.9, 0, 0.85)],
  }),
  F({
    kind: "armchair", cat: "Estar", label: "Sillón", w: 0.85, d: 0.85, h: 0.85, ifc: { cls: "IFCFURNITURE", type: "CHAIR" },
    draw: () => [roundRect(-0.425, -0.425, 0.425, 0.425, 0.08), rect(-0.425, -0.425, 0.425, -0.2), rect(-0.425, -0.2, -0.28, 0.425), rect(0.28, -0.2, 0.425, 0.425)],
    solids: () => [S(0, 0.1, 0.6, 0.65, 0, 0.42), S(0, -0.31, 0.85, 0.23, 0, 0.85), S(-0.35, 0.1, 0.15, 0.65, 0, 0.62), S(0.35, 0.1, 0.15, 0.65, 0, 0.62)],
  }),
  F({ kind: "coffeetable", cat: "Estar", label: "Mesa de centro", w: 1.1, d: 0.6, h: 0.42, ifc: { cls: "IFCFURNITURE", type: "TABLE" }, draw: () => [roundRect(-0.55, -0.3, 0.55, 0.3, 0.05), roundRect(-0.48, -0.23, 0.48, 0.23, 0.03)] }),
  F({
    kind: "tvunit", cat: "Estar", label: "Mueble de TV", w: 1.8, d: 0.45, h: 0.5,
    draw: () => [box(1.8, 0.45), rect(-0.6, -0.2, 0.6, -0.14), line(-0.3, -0.05, 0.3, -0.05), line(0, -0.14, 0, -0.05)],
    solids: () => [S(0, 0, 1.8, 0.45, 0, 0.5), S(0, -0.17, 1.2, 0.06, 0.55, 0.7, { color: DARK })],
  }),
  F({ kind: "bookshelf", cat: "Estar", label: "Librero", w: 1.0, d: 0.35, h: 2.0, ifc: { cls: "IFCFURNITURE", type: "SHELF" }, draw: () => [box(1.0, 0.35), line(-0.5, 0.05, 0.5, 0.05), ...[-0.25, 0, 0.25].map((x) => line(x, -0.175, x, 0.05))] }),
  F({
    kind: "piano", cat: "Estar", label: "Piano vertical", w: 1.5, d: 0.62, h: 1.25,
    draw: () => [box(1.5, 0.62), rect(-0.7, 0.05, 0.7, 0.31), ...Array.from({ length: 13 }, (_, i) => line(-0.7 + (i + 1) * 0.1, 0.05, -0.7 + (i + 1) * 0.1, 0.31)), ...Array.from({ length: 9 }, (_, i) => rect(-0.62 + i * 0.15, 0.05, -0.57 + i * 0.15, 0.2))],
    solids: () => [S(0, -0.16, 1.5, 0.3, 0, 1.25), S(0, 0.15, 1.5, 0.32, 0.65, 0.12)],
  }),
  F({
    kind: "pottedplant", cat: "Estar", label: "Planta en maceta", w: 0.6, d: 0.6, h: 1.1,
    draw: () => [circle(0, 0, 0.18, 18), scallop(0.3, 7), ...branches(0.05, 0.26, 5)],
    solids: () => [S(0, 0, 0.36, 0.36, 0, 0.4, { shape: "cyl", color: "#b0714d" }), S(0, 0, 0.6, 0.6, 0.35, 0.75, { shape: "sphere", color: GREEN })],
  }),
  // ---------- comedor ----------
  F({
    kind: "dining4", cat: "Comedor", label: "Mesa y 4 sillas", w: 1.2, d: 1.7, h: 0.75, ifc: { cls: "IFCFURNITURE", type: "TABLE" },
    draw: () => [rect(-0.6, -0.4, 0.6, 0.4), ...[-0.3, 0.3].flatMap((x) => [rect(x - 0.21, -0.85, x + 0.21, -0.45), rect(x - 0.21, 0.45, x + 0.21, 0.85)])],
    solids: () => [S(0, 0, 1.2, 0.8, 0.7, 0.05), S(0, 0, 1.0, 0.6, 0, 0.7), ...[-0.3, 0.3].flatMap((x) => [S(x, -0.65, 0.42, 0.4, 0, 0.45), S(x, 0.65, 0.42, 0.4, 0, 0.45)])],
  }),
  F({
    kind: "dininground", cat: "Comedor", label: "Mesa redonda y 4 sillas", w: 1.9, d: 1.9, h: 0.75, ifc: { cls: "IFCFURNITURE", type: "TABLE" },
    draw: () => [circle(0, 0, 0.55, 32), ...[0, 90, 180, 270].map((a) => { const r = (a * Math.PI) / 180, c = Math.cos(r) * 0.75, s = Math.sin(r) * 0.75; return Math.abs(c) > 0.1 ? rect(c - 0.2, -0.21, c + 0.2, 0.21) : rect(-0.21, s - 0.2, 0.21, s + 0.2); })],
    solids: () => [S(0, 0, 1.1, 1.1, 0.7, 0.05, { shape: "cyl" }), S(0, 0, 0.2, 0.2, 0, 0.7, { shape: "cyl" }), S(0.75, 0, 0.4, 0.42, 0, 0.45), S(-0.75, 0, 0.4, 0.42, 0, 0.45), S(0, 0.75, 0.42, 0.4, 0, 0.45), S(0, -0.75, 0.42, 0.4, 0, 0.45)],
  }),
  F({
    kind: "dining8", cat: "Comedor", label: "Mesa y 8 sillas", w: 2.6, d: 1.9, h: 0.75, ifc: { cls: "IFCFURNITURE", type: "TABLE" },
    draw: () => [rect(-1.1, -0.5, 1.1, 0.5), ...[-0.7, 0, 0.7].flatMap((x) => [rect(x - 0.21, -0.95, x + 0.21, -0.55), rect(x - 0.21, 0.55, x + 0.21, 0.95)]), rect(-1.3, -0.21, -1.15, 0.21), rect(1.15, -0.21, 1.3, 0.21)],
    solids: () => [S(0, 0, 2.2, 1.0, 0.7, 0.05), S(0, 0, 1.9, 0.7, 0, 0.7), ...[-0.7, 0, 0.7].flatMap((x) => [S(x, -0.75, 0.42, 0.4, 0, 0.45), S(x, 0.75, 0.42, 0.4, 0, 0.45)]), S(-1.22, 0, 0.16, 0.42, 0, 0.45), S(1.22, 0, 0.16, 0.42, 0, 0.45)],
  }),
  // ---------- cocina y lavado ----------
  F({ kind: "range", cat: "Cocina y lavado", label: "Estufa / cocina", w: 0.76, d: 0.66, h: 0.92, draw: () => [box(0.76, 0.66), line(-0.38, -0.22, 0.38, -0.22), circle(-0.18, -0.02, 0.1, 16), circle(0.18, -0.02, 0.1, 16), circle(-0.18, 0.2, 0.08, 16), circle(0.18, 0.2, 0.08, 16)] }),
  F({
    kind: "island", cat: "Cocina y lavado", label: "Isla de cocina con 3 bancos", w: 2.0, d: 1.45, h: 0.92,
    draw: () => [rect(-1, -0.725, 1, 0.275), rect(-0.35, -0.55, 0.35, -0.15), line(-1, 0.075, 1, 0.075), ...[-0.6, 0, 0.6].map((x) => circle(x, 0.5, 0.18, 18))],
    solids: () => [S(0, -0.225, 2.0, 1.0, 0, 0.92), ...[-0.6, 0, 0.6].map((x) => S(x, 0.5, 0.36, 0.36, 0, 0.75, { shape: "cyl" }))],
  }),
  F({ kind: "dishwasher", cat: "Cocina y lavado", label: "Lavavajillas", w: 0.6, d: 0.6, h: 0.85, draw: () => [box(0.6, 0.6), line(-0.3, 0.22, 0.3, 0.22), rect(-0.15, 0.24, 0.15, 0.28)] }),
  F({ kind: "washer", cat: "Cocina y lavado", label: "Lavadora", w: 0.68, d: 0.7, h: 0.95, draw: () => [box(0.68, 0.7), circle(0, 0.03, 0.22, 24), line(-0.34, -0.25, 0.34, -0.25)] }),
  F({ kind: "dryer", cat: "Cocina y lavado", label: "Secadora", w: 0.68, d: 0.7, h: 0.95, draw: () => [box(0.68, 0.7), circle(0, 0.03, 0.22, 24), circle(0, 0.03, 0.12, 16), line(-0.34, -0.25, 0.34, -0.25)] }),
  F({ kind: "pantry", cat: "Cocina y lavado", label: "Alacena / despensa", w: 0.9, d: 0.6, h: 2.1, ifc: { cls: "IFCFURNITURE", type: "SHELF" }, draw: () => [box(0.9, 0.6), line(0, -0.3, 0, 0.3), line(-0.45, -0.3, 0.45, 0.3)] }),
  // ---------- baño ----------
  F({
    kind: "basin2", cat: "Baño", label: "Lavabo doble", w: 1.5, d: 0.55, h: 0.85, ifc: { cls: "IFCSANITARYTERMINAL", type: "WASHHANDBASIN" },
    draw: () => [box(1.5, 0.55), ellipse(-0.38, 0.04, 0.22, 0.15), ellipse(0.38, 0.04, 0.22, 0.15), circle(-0.38, -0.18, 0.025, 8), circle(0.38, -0.18, 0.025, 8)],
    solids: () => [S(0, 0, 1.5, 0.55, 0.7, 0.15), S(0, -0.05, 1.4, 0.45, 0, 0.7)],
  }),
  F({
    kind: "shower2", cat: "Baño", label: "Ducha 1.50 × 0.80", w: 1.5, d: 0.8, h: 0.05, ifc: { cls: "IFCSANITARYTERMINAL", type: "SHOWER" },
    draw: () => [box(1.5, 0.8), line(-0.75, -0.4, 0.75, 0.4), line(-0.75, 0.4, 0.75, -0.4), circle(0.55, 0, 0.05, 10)],
  }),
  F({ kind: "towelbar", cat: "Baño", label: "Mueble de baño", w: 0.8, d: 0.4, h: 0.85, draw: () => [box(0.8, 0.4), line(0, -0.2, 0, 0.2), line(-0.4, 0.12, 0.4, 0.12)] }),
  // ---------- oficina ----------
  F({
    kind: "officechair", cat: "Oficina", label: "Silla de oficina", w: 0.65, d: 0.65, h: 1.0, ifc: { cls: "IFCFURNITURE", type: "CHAIR" },
    draw: () => [circle(0, 0, 0.32, 5), roundRect(-0.24, -0.2, 0.24, 0.22, 0.08), rect(-0.22, -0.3, 0.22, -0.2)],
    solids: () => [S(0, 0, 0.6, 0.6, 0, 0.08, { shape: "cyl", color: DARK }), S(0, 0, 0.06, 0.06, 0.08, 0.38, { shape: "cyl", color: DARK }), S(0, 0, 0.48, 0.45, 0.42, 0.08), S(0, -0.25, 0.44, 0.08, 0.5, 0.5)],
  }),
  F({
    kind: "meeting", cat: "Oficina", label: "Mesa de juntas (8)", w: 3.2, d: 2.0, h: 0.75, ifc: { cls: "IFCFURNITURE", type: "TABLE" },
    draw: () => [roundRect(-1.2, -0.55, 1.2, 0.55, 0.25), ...[-0.75, 0, 0.75].flatMap((x) => [circle(x, -0.78, 0.22, 16), circle(x, 0.78, 0.22, 16)]), circle(-1.38, 0, 0.22, 16), circle(1.38, 0, 0.22, 16)],
    solids: () => [S(0, 0, 2.4, 1.1, 0.7, 0.05), S(0, 0, 2.0, 0.6, 0, 0.7), ...[-0.75, 0, 0.75].flatMap((x) => [S(x, -0.78, 0.44, 0.44, 0, 0.45, { shape: "cyl" }), S(x, 0.78, 0.44, 0.44, 0, 0.45, { shape: "cyl" })]), S(-1.38, 0, 0.44, 0.44, 0, 0.45, { shape: "cyl" }), S(1.38, 0, 0.44, 0.44, 0, 0.45, { shape: "cyl" })],
  }),
  F({ kind: "filecab", cat: "Oficina", label: "Archivero", w: 0.45, d: 0.6, h: 1.3, draw: () => [box(0.45, 0.6), line(-0.225, 0.22, 0.225, 0.22), rect(-0.08, 0.24, 0.08, 0.28)] }),
  // ---------- exterior y jardín ----------
  F({
    kind: "patioset", cat: "Exterior y jardín", label: "Mesa de jardín con sombrilla", w: 2.2, d: 2.2, h: 2.3,
    draw: () => [poly(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return [1.1 * Math.cos(a), 1.1 * Math.sin(a)] as [number, number]; })), ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return line(0, 0, 1.1 * Math.cos(a), 1.1 * Math.sin(a)); }), circle(0, 0, 0.45, 28), ...[0, 1, 2, 3].map((i) => circle(0.75 * Math.cos((i * Math.PI) / 2), 0.75 * Math.sin((i * Math.PI) / 2), 0.2, 16))],
    solids: () => [S(0, 0, 0.9, 0.9, 0.7, 0.04, { shape: "cyl" }), S(0, 0, 0.05, 0.05, 0, 2.2, { shape: "cyl", color: DARK }), S(0, 0, 2.2, 2.2, 2.05, 0.3, { shape: "cone", color: "#e8e1d0" }), ...[0, 1, 2, 3].map((i) => S(0.75 * Math.cos((i * Math.PI) / 2), 0.75 * Math.sin((i * Math.PI) / 2), 0.4, 0.4, 0, 0.45, { shape: "cyl" }))],
  }),
  F({
    kind: "lounger", cat: "Exterior y jardín", label: "Camastro / tumbona", w: 0.7, d: 1.95, h: 0.4,
    draw: () => [roundRect(-0.35, -0.975, 0.35, 0.975, 0.06), line(-0.35, -0.35, 0.35, -0.35), ...Array.from({ length: 9 }, (_, i) => line(-0.3, -0.25 + i * 0.13, 0.3, -0.25 + i * 0.13))],
    solids: () => [S(0, 0.3, 0.7, 1.3, 0, 0.35), S(0, -0.66, 0.7, 0.62, 0.3, 0.35)],
  }),
  F({ kind: "bbq", cat: "Exterior y jardín", label: "Asador / parrilla", w: 1.2, d: 0.6, h: 0.95, draw: () => [box(1.2, 0.6), rect(-0.4, -0.22, 0.4, 0.22), ...Array.from({ length: 7 }, (_, i) => line(-0.3 + i * 0.1, -0.22, -0.3 + i * 0.1, 0.22)), rect(-0.58, -0.15, -0.46, 0.15), rect(0.46, -0.15, 0.58, 0.15)] }),
  F({
    kind: "pool", cat: "Exterior y jardín", label: "Alberca 4 × 8 m", w: 4.6, d: 8.6, h: 0.05, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [roundRect(-2.3, -4.3, 2.3, 4.3, 0.3), roundRect(-2, -4, 2, 4, 0.2), ...[3.3, 3.6].map((y) => line(-2, y, -0.8, y)), line(-0.8, 3.3, -0.8, 4), ...Array.from({ length: 4 }, (_, i) => line(-1.3 + i * 0.9, -1.2 + (i % 2) * 0.3, -0.9 + i * 0.9, -1.0 + (i % 2) * 0.3))],
    solids: () => [S(0, 0, 4.6, 8.6, 0, 0.04, { color: "#d9d4c7" }), S(0, 0, 4, 8, 0.04, 0.02, { color: WATER })],
  }),
  F({
    kind: "jacuzzi", cat: "Exterior y jardín", label: "Jacuzzi", w: 2.1, d: 2.1, h: 0.9, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [roundRect(-1.05, -1.05, 1.05, 1.05, 0.25), circle(0, 0, 0.75, 32), circle(0, 0, 0.45, 28)],
    solids: () => [S(0, 0, 2.1, 2.1, 0, 0.85, { color: "#d9d4c7" }), S(0, 0, 1.5, 1.5, 0.85, 0.02, { shape: "cyl", color: WATER })],
  }),
  F({
    kind: "swing", cat: "Exterior y jardín", label: "Columpio infantil", w: 2.4, d: 1.4, h: 2.2, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [line(-1.2, -0.7, -1.2, 0.7), line(1.2, -0.7, 1.2, 0.7), line(-1.2, 0, 1.2, 0), rect(-0.75, -0.12, -0.3, 0.12), rect(0.3, -0.12, 0.75, 0.12)],
    solids: () => [S(0, 0, 2.4, 0.08, 2.1, 0.08, { color: DARK }), S(-1.2, 0, 0.08, 1.4, 0, 2.15, { color: DARK }), S(1.2, 0, 0.08, 1.4, 0, 2.15, { color: DARK }), S(-0.52, 0, 0.45, 0.24, 0.45, 0.04), S(0.52, 0, 0.45, 0.24, 0.45, 0.04)],
  }),
  // ---------- vehículos (el frente en +y) ----------
  F({
    kind: "car", cat: "Vehículos", label: "Automóvil sedán", w: 1.98, d: 4.7, h: 1.45, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [
      roundRect(-0.9, -2.35, 0.9, 2.35, 0.38),
      poly([[-0.76, 1.15], [0.76, 1.15], [0.66, 0.5], [-0.66, 0.5]]), rect(-0.66, -0.95, 0.66, 0.5), poly([[-0.66, -0.95], [0.66, -0.95], [0.74, -1.45], [-0.74, -1.45]]),
      line(-0.86, 1.6, 0.86, 1.6), line(-0.84, -1.75, 0.84, -1.75), line(-0.9, 0.5, -0.66, 0.5), line(0.9, 0.5, 0.66, 0.5),
      rect(-0.99, 0.82, -0.9, 0.98), rect(0.9, 0.82, 0.99, 0.98), rect(-0.74, 2.12, -0.42, 2.25), rect(0.42, 2.12, 0.74, 2.25),
    ],
    solids: () => [
      S(0, 0, 1.8, 4.7, 0.3, 0.6, { color: "#3d5a80" }), S(0, -0.25, 1.55, 2.4, 0.9, 0.5, { color: "#26313b" }),
      ...[-1.45, 1.45].flatMap((y) => [S(-0.78, y, 0.24, 0.66, 0, 0.66, { color: DARK }), S(0.78, y, 0.24, 0.66, 0, 0.66, { color: DARK })]),
    ],
  }),
  F({
    kind: "suv", cat: "Vehículos", label: "Camioneta SUV", w: 2.08, d: 4.95, h: 1.8, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [
      roundRect(-0.95, -2.475, 0.95, 2.475, 0.32),
      poly([[-0.8, 1.35], [0.8, 1.35], [0.72, 0.8], [-0.72, 0.8]]), rect(-0.72, -1.95, 0.72, 0.8), line(-0.72, -1.95, -0.8, -2.15), line(0.72, -1.95, 0.8, -2.15),
      line(-0.9, 1.75, 0.9, 1.75), ...[-1.4, -0.7, 0, 0.7].map((y) => line(-0.6, y, 0.6, y)), rect(-1.04, 1.0, -0.95, 1.16), rect(0.95, 1.0, 1.04, 1.16),
    ],
    solids: () => [
      S(0, 0, 1.9, 4.95, 0.35, 0.75, { color: "#5d6b62" }), S(0, -0.55, 1.7, 2.9, 1.1, 0.65, { color: "#26313b" }),
      ...[-1.55, 1.55].flatMap((y) => [S(-0.82, y, 0.27, 0.75, 0, 0.75, { color: DARK }), S(0.82, y, 0.27, 0.75, 0, 0.75, { color: DARK })]),
    ],
  }),
  F({
    kind: "pickup", cat: "Vehículos", label: "Pickup", w: 2.12, d: 5.8, h: 1.9, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [
      roundRect(-1.0, -2.9, 1.0, 2.9, 0.25),
      poly([[-0.84, 1.55], [0.84, 1.55], [0.76, 1.0], [-0.76, 1.0]]), rect(-0.76, -0.4, 0.76, 1.0), line(-0.84, -0.55, 0.84, -0.55),
      rect(-0.86, -2.8, 0.86, -0.7), ...[-2.3, -1.75, -1.2].map((y) => line(-0.86, y, 0.86, y)), line(-0.94, 2.05, 0.94, 2.05), rect(-1.06, 1.2, -1.0, 1.36), rect(1.0, 1.2, 1.06, 1.36),
    ],
    solids: () => [
      S(0, 0, 2.0, 5.8, 0.45, 0.65, { color: "#8a2f2a" }), S(0, 0.3, 1.75, 1.8, 1.1, 0.75, { color: "#26313b" }),
      ...[-1.8, 1.75].flatMap((y) => [S(-0.86, y, 0.28, 0.8, 0, 0.8, { color: DARK }), S(0.86, y, 0.28, 0.8, 0, 0.8, { color: DARK })]),
    ],
  }),
  F({
    kind: "moto", cat: "Vehículos", label: "Motocicleta", w: 0.8, d: 2.15, h: 1.15, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [rect(-0.07, 0.7, 0.07, 1.075), rect(-0.08, -1.075, 0.08, -0.7), ellipse(0, 0.05, 0.22, 0.62, 24), line(-0.4, 0.62, 0.4, 0.62), rect(-0.14, -0.55, 0.14, -0.05), circle(0, 0.25, 0.14, 14)],
    solids: () => [S(0, 0.88, 0.12, 0.6, 0, 0.6, { color: DARK }), S(0, -0.88, 0.14, 0.6, 0, 0.6, { color: DARK }), S(0, 0, 0.4, 1.3, 0.4, 0.45, { color: "#b23b30" }), S(0, 0.62, 0.8, 0.05, 1.0, 0.05, { color: DARK })],
  }),
  F({
    kind: "bike", cat: "Vehículos", label: "Bicicleta", w: 0.6, d: 1.75, h: 1.05, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [rect(-0.025, 0.5, 0.025, 0.875), rect(-0.025, -0.875, 0.025, -0.5), line(0, 0.5, 0, -0.5), line(-0.3, 0.5, 0.3, 0.5), rect(-0.06, -0.38, 0.06, -0.2)],
    solids: () => [S(0, 0.6, 0.05, 0.68, 0, 0.68, { color: DARK }), S(0, -0.6, 0.05, 0.68, 0, 0.68, { color: DARK }), S(0, 0, 0.05, 1.1, 0.45, 0.4, { color: "#2a7f62" }), S(0, 0.5, 0.6, 0.04, 0.95, 0.04, { color: DARK })],
  }),
  // ---------- personas (miran a +y) ----------
  F({
    kind: "person", cat: "Personas", label: "Persona de pie", w: 0.6, d: 0.4, h: 1.75, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [ellipse(0, 0, 0.29, 0.14, 24), circle(0, 0.01, 0.105, 16), poly([[-0.035, 0.11], [0, 0.16], [0.035, 0.11]], false)],
    solids: () => [S(0, 0, 0.3, 0.22, 0, 0.85, { shape: "cyl", color: "#4b5563" }), S(0, 0, 0.48, 0.26, 0.85, 0.6, { shape: "cyl", color: "#7c93b5" }), S(0, 0, 0.21, 0.23, 1.5, 0.25, { shape: "sphere", color: SKIN })],
  }),
  F({
    kind: "personwalk", cat: "Personas", label: "Persona caminando", w: 0.66, d: 0.8, h: 1.75, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [ellipse(0, 0, 0.29, 0.14, 24), circle(0, 0.01, 0.105, 16), ellipse(-0.1, 0.27, 0.055, 0.12, 14), ellipse(0.1, -0.26, 0.055, 0.12, 14), ellipse(0.28, 0.12, 0.045, 0.1, 12), ellipse(-0.28, -0.12, 0.045, 0.1, 12)],
    solids: () => [S(-0.1, 0.12, 0.13, 0.13, 0, 0.85, { shape: "cyl", color: "#4b5563" }), S(0.1, -0.12, 0.13, 0.13, 0, 0.85, { shape: "cyl", color: "#4b5563" }), S(0, 0, 0.48, 0.26, 0.85, 0.6, { shape: "cyl", color: "#b5837c" }), S(0, 0, 0.21, 0.23, 1.5, 0.25, { shape: "sphere", color: SKIN })],
  }),
  F({
    kind: "child", cat: "Personas", label: "Niño", w: 0.42, d: 0.3, h: 1.15, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [ellipse(0, 0, 0.2, 0.1, 20), circle(0, 0.01, 0.085, 14)],
    solids: () => [S(0, 0, 0.22, 0.16, 0, 0.55, { shape: "cyl", color: "#4b5563" }), S(0, 0, 0.34, 0.2, 0.55, 0.38, { shape: "cyl", color: "#e0a458" }), S(0, 0, 0.18, 0.19, 0.95, 0.2, { shape: "sphere", color: SKIN })],
  }),
  F({
    kind: "wheelchair", cat: "Personas", label: "Persona en silla de ruedas", w: 0.7, d: 1.1, h: 1.3, ifc: { cls: "IFCBUILDINGELEMENTPROXY", type: "NOTDEFINED" },
    draw: () => [rect(-0.35, -0.3, -0.3, 0.3), rect(0.3, -0.3, 0.35, 0.3), rect(-0.25, -0.35, 0.25, 0.15), line(-0.25, -0.4, 0.25, -0.4), rect(-0.2, 0.4, 0.2, 0.55), line(-0.15, 0.15, -0.15, 0.4), line(0.15, 0.15, 0.15, 0.4), ellipse(0, -0.12, 0.25, 0.12, 20), circle(0, -0.11, 0.095, 14)],
    solids: () => [S(-0.32, 0, 0.05, 0.6, 0, 0.6, { color: DARK }), S(0.32, 0, 0.05, 0.6, 0, 0.6, { color: DARK }), S(0, -0.1, 0.5, 0.5, 0.45, 0.06, { color: DARK }), S(0, -0.12, 0.44, 0.24, 0.5, 0.55, { shape: "cyl", color: "#7c93b5" }), S(0, -0.11, 0.2, 0.21, 1.05, 0.23, { shape: "sphere", color: SKIN })],
  }),
  // ---------- vegetación ----------
  tree("treeL", "Árbol grande (copa 6 m)", 6, 8),
  tree("treeM", "Árbol mediano (copa 4 m)", 4, 5.5),
  tree("treeS", "Árbol pequeño (copa 2.5 m)", 2.5, 3.5),
  F({
    kind: "conifer", cat: "Vegetación", label: "Pino / conífera", w: 3, d: 3, h: 7, ifc: { cls: "IFCGEOGRAPHICELEMENT", type: "NOTDEFINED" },
    draw: () => [star(1.5, 1.15, 16), star(0.95, 0.7, 12), circle(0, 0, 0.12, 10), ...branches(0.12, 1.3, 8, 0)],
    solids: () => [S(0, 0, 0.25, 0.25, 0, 1.5, { shape: "cyl", color: TRUNK }), S(0, 0, 3, 3, 1.2, 5.8, { shape: "cone", color: DGREEN })],
  }),
  F({
    kind: "palm", cat: "Vegetación", label: "Palmera", w: 4, d: 4, h: 6, ifc: { cls: "IFCGEOGRAPHICELEMENT", type: "NOTDEFINED" },
    draw: () => [...Array.from({ length: 9 }, (_, i) => frond((i / 9) * Math.PI * 2 + 0.2, 0.15, 1.95, 0.22)), ...Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2 + 0.2; return line(0.15 * Math.cos(a), 0.15 * Math.sin(a), 1.9 * Math.cos(a), 1.9 * Math.sin(a)); }), circle(0, 0, 0.18, 12)],
    solids: () => [S(0, 0, 0.3, 0.3, 0, 5.4, { shape: "cyl", color: "#8b7355" }), S(0, 0, 4, 4, 5, 1.0, { shape: "sphere", color: GREEN })],
  }),
  F({
    kind: "shrub", cat: "Vegetación", label: "Arbusto", w: 1.2, d: 1.2, h: 1.0, ifc: { cls: "IFCGEOGRAPHICELEMENT", type: "NOTDEFINED" },
    draw: () => [scallop(0.6, 9), scallop(0.34, 7, 0.05, -0.04, 0.5)],
    solids: () => [S(0, 0, 1.2, 1.2, 0, 1.0, { shape: "sphere", color: GREEN })],
  }),
  F({
    kind: "hedge", cat: "Vegetación", label: "Seto 3 m", w: 3, d: 0.7, h: 1.3, ifc: { cls: "IFCGEOGRAPHICELEMENT", type: "NOTDEFINED" },
    draw: () => [poly([...Array.from({ length: 31 }, (_, i) => [-1.5 + i * 0.1, -0.35 + 0.04 * Math.abs(Math.sin(i * 1.3))] as [number, number]), ...Array.from({ length: 31 }, (_, i) => [1.5 - i * 0.1, 0.35 - 0.04 * Math.abs(Math.sin(i * 1.7))] as [number, number])]), ...Array.from({ length: 6 }, (_, i) => scallop(0.2, 6, -1.25 + i * 0.5, 0))],
    solids: () => [S(0, 0, 3, 0.7, 0, 1.3, { color: DGREEN })],
  }),
  F({
    kind: "flowerbed", cat: "Vegetación", label: "Jardinera con flores", w: 2, d: 0.8, h: 0.5, ifc: { cls: "IFCGEOGRAPHICELEMENT", type: "NOTDEFINED" },
    draw: () => [box(2, 0.8), box(1.84, 0.64), ...[-0.7, -0.35, 0, 0.35, 0.7].flatMap((x, i) => [scallop(0.13, 5, x, i % 2 ? 0.1 : -0.1), circle(x, i % 2 ? 0.1 : -0.1, 0.03, 8)])],
    solids: () => [S(0, 0, 2, 0.8, 0, 0.35, { color: "#b0a99a" }), S(0, 0, 1.8, 0.6, 0.35, 0.25, { color: GREEN })],
  }),
];
