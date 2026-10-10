// Gabinetes de cocina (cocina integral) en medidas comerciales: bajos con cubierta, cajoneras, de tarja
// y de parrilla, esquineros, alacenas altas, campana y torre para horno.
// Como el resto del catálogo: origen en el centro, -y local es la pared y +y el frente.
// En planta los gabinetes altos y la campana van a trazos (están por encima del plano de corte).
import type { Pt } from "./geometry";
import type { FurnitureDef, Solid, Stroke } from "./furniture";

const P = (x: number, y: number): Pt => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number, dash = false): Stroke => ({ pts: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], closed: true, dash });
const line = (x0: number, y0: number, x1: number, y1: number, dash = false): Stroke => ({ pts: [P(x0, y0), P(x1, y1)], dash });
const poly = (pts: [number, number][], dash = false): Stroke => ({ pts: pts.map(([x, y]) => P(x, y)), closed: true, dash });
const circle = (cx: number, cy: number, r: number, n = 16): Stroke =>
  ({ pts: Array.from({ length: n }, (_, i) => P(cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2))), closed: true });
const S = (x: number, y: number, w: number, d: number, z0: number, h: number, more: Partial<Solid> = {}): Solid => ({ x, y, w, d, z0, h, ...more });

export const CAB_CAT = "Gabinetes de cocina";
/** Fondo de los bajos con cubierta, de los altos y alturas (cubierta a 90 cm, alacenas de 1.45 a 2.15 m). */
const DB = 0.6, DW = 0.35, TOP = 0.9, CT = 0.04, ZW = 1.45, HW = 0.7;
const GRANITO = "#8a847c", PARRILLA = "#2b2b2b", ACERO = "#c4c8cc";

const F = (d: Omit<FurnitureDef, "ifc" | "cat">): FurnitureDef => ({ cat: CAB_CAT, ifc: { cls: "IFCFURNITURE", type: "NOTDEFINED" }, wall: true, ...d });

/** Caja del gabinete bajo: zoclo remetido, cuerpo y cubierta que vuela 2 cm al frente. */
const baseSolids = (w: number, x = 0, y = 0, d = DB): Solid[] => [
  S(x, y - 0.03, w, d - 0.1, 0, 0.1),
  S(x, y - 0.01, w, d - 0.02, 0.1, TOP - CT - 0.1),
  S(x, y, w, d, TOP - CT, CT, { color: GRANITO }),
];

/** Frente de puertas o cajones en planta: canto de la cubierta y divisiones. */
function front(w: number, doors: number, drawers = 0): Stroke[] {
  const h = DB / 2, x = w / 2, out: Stroke[] = [rect(-x, -h, x, h), line(-x, h - 0.04, x, h - 0.04)];
  for (let i = 1; i < doors; i++) out.push(line(-x + (w * i) / doors, h - 0.04, -x + (w * i) / doors, h));
  // las cajoneras: tres jaladeras a lo ancho
  if (drawers) out.push(line(-0.08, h - 0.1, 0.08, h - 0.1), line(-0.08, h - 0.16, 0.08, h - 0.16), line(-0.08, h - 0.22, 0.08, h - 0.22));
  return out;
}

const base = (cm: number, doors: number) => F({
  kind: `cab-b${cm}`, label: `Gabinete bajo ${doors === 1 ? "1 puerta" : "2 puertas"} ${cm} cm`, w: cm / 100, d: DB, h: TOP,
  draw: () => front(cm / 100, doors), solids: () => baseSolids(cm / 100),
});

const drawers = (cm: number) => F({
  kind: `cab-d${cm}`, label: `Cajonera 3 cajones ${cm} cm`, w: cm / 100, d: DB, h: TOP,
  draw: () => front(cm / 100, 1, 3), solids: () => baseSolids(cm / 100),
});

/** Tarja de acero con su llave, encastrada en la cubierta. */
const sink = (cm: number, bowls: 1 | 2) => {
  const w = cm / 100, bw = bowls === 1 ? Math.min(0.5, w - 0.2) : Math.min(0.4, (w - 0.3) / 2);
  const xs = bowls === 1 ? [0] : [-(bw / 2 + 0.03), bw / 2 + 0.03];
  return F({
    kind: `cab-sink${cm}`, label: `Gabinete de tarja ${bowls === 1 ? "sencilla" : "doble"} ${cm} cm`, w, d: DB, h: TOP,
    draw: () => [...front(w, 2), ...xs.map((x) => rect(x - bw / 2, -0.17, x + bw / 2, 0.2)), circle(0, -0.23, 0.025, 10)],
    solids: () => [...baseSolids(w), ...xs.map((x) => S(x, 0.015, bw, 0.37, TOP - CT - 0.001, CT + 0.003, { color: ACERO })), S(0, -0.23, 0.04, 0.04, TOP, 0.28, { shape: "cyl", color: ACERO })],
  });
};

const cooktop = F({
  kind: "cab-cook90", label: "Gabinete con parrilla 90 cm (4 quemadores)", w: 0.9, d: DB, h: TOP,
  draw: () => [...front(0.9, 2), rect(-0.38, -0.24, 0.38, 0.2), ...[[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.09], [0.2, 0.09]].map(([x, y]) => circle(x, y, 0.08))],
  solids: () => [...baseSolids(0.9), S(0, -0.02, 0.76, 0.44, TOP, 0.012, { color: PARRILLA }),
    ...[[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.09], [0.2, 0.09]].map(([x, y]) => S(x, y, 0.13, 0.13, TOP + 0.012, 0.02, { shape: "cyl", color: PARRILLA }))],
});

/** Esquinero en L de 90 × 90 (los dos brazos de 60 de fondo contra las dos paredes). */
const cornerBase = F({
  kind: "cab-bc", label: "Gabinete esquinero bajo 90 × 90", w: 0.9, d: 0.9, h: TOP,
  draw: () => [poly([[-0.45, -0.45], [0.45, -0.45], [0.45, 0.15], [0.15, 0.15], [0.15, 0.45], [-0.45, 0.45]]), line(0.15, 0.11, 0.45, 0.11), line(0.11, 0.15, 0.11, 0.45)],
  solids: () => [...baseSolids(0.9, 0, -0.15), ...baseSolids(0.6, -0.15, 0.3, 0.3)],
});

const wallCab = (cm: number) => F({
  kind: `cab-w${cm}`, label: `Gabinete alto (alacena aérea) ${cm} cm`, w: cm / 100, d: DW, h: ZW + HW,
  draw: () => { const x = cm / 200, y = DW / 2; return [rect(-x, -y, x, y, true), line(-x, -y, x, y, true), line(-x, y, x, -y, true)]; },
  solids: () => [S(0, 0, cm / 100, DW, ZW, HW)],
});

const cornerWall = F({
  kind: "cab-wc", label: "Gabinete alto esquinero 60 × 60", w: 0.6, d: 0.6, h: ZW + HW,
  draw: () => [poly([[-0.3, -0.3], [0.3, -0.3], [0.3, 0.05], [0.05, 0.05], [0.05, 0.3], [-0.3, 0.3]], true)],
  solids: () => [S(0, -0.125, 0.6, DW, ZW, HW), S(-0.125, 0.175, DW, 0.25, ZW, HW)],
});

const hood = F({
  kind: "cab-hood", label: "Campana extractora 90 cm", w: 0.9, d: 0.5, h: 2.15,
  draw: () => [rect(-0.45, -0.25, 0.45, 0.25, true), rect(-0.15, -0.25, 0.15, -0.05, true)],
  solids: () => [S(0, 0, 0.9, 0.5, 1.6, 0.12, { color: ACERO }), S(0, -0.15, 0.3, 0.2, 1.72, 0.43, { color: ACERO })],
});

const ovenTower = F({
  kind: "cab-oven", label: "Torre para horno 60 cm", w: 0.6, d: DB, h: 2.15,
  draw: () => [rect(-0.3, -0.3, 0.3, 0.3), line(-0.3, -0.3, 0.3, 0.3), line(-0.3, 0.3, 0.3, -0.3), line(-0.3, 0.26, 0.3, 0.26)],
  solids: () => [S(0, -0.01, 0.6, 0.58, 0, 0.1), S(0, 0, 0.6, DB, 0.1, 0.7), S(0, 0.005, 0.56, DB - 0.01, 0.8, 0.6, { color: PARRILLA }), S(0, 0, 0.6, DB, 1.4, 0.75)],
});

export const KITCHEN: FurnitureDef[] = [
  base(45, 1), base(60, 1), base(80, 2), base(90, 2),
  drawers(45), drawers(60),
  sink(80, 1), sink(120, 2), cooktop, cornerBase,
  wallCab(30), wallCab(45), wallCab(60), wallCab(80), wallCab(90), cornerWall, hood, ovenTower,
];

/** Gabinetes altos y campana: por encima de la cubierta, se cuentan aparte en el presupuesto. */
export const isWallCabinet = (kind: string) => kind.startsWith("cab-w") || kind === "cab-hood";
