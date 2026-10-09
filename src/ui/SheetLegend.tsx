// Leyenda de símbolos de cada lámina: dibuja en pequeño (en mm de papel) los mismos símbolos que
// aparecen en el dibujo, con su significado. En pies y pulgadas se escribe en inglés, como el resto del juego.
import { useId, type ReactNode } from "react";
import { imperial } from "../core/units";

const INK = "#111";
const L = (es: string, en: string) => (imperial() ? en : es);

/** Celda de 14 × 5 mm donde se dibuja cada símbolo. */
function Sym({ children, defs }: { children: ReactNode; defs?: ReactNode }) {
  return (
    <svg width="14mm" height="5mm" viewBox="0 0 14 5" aria-hidden="true" fill="none" stroke={INK} strokeWidth={0.2}>
      {defs && <defs>{defs}</defs>}
      {children}
    </svg>
  );
}

/** Rayado a 45° con identificador propio (puede haber varias leyendas en la misma página impresa). */
function Hatch({ children, gap = 0.7, fill }: { children: (url: string) => ReactNode; gap?: number; fill?: string }) {
  const id = `h${useId().replace(/:/g, "")}`;
  return (
    <Sym defs={<pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      {fill && <rect width={gap} height={gap} fill={fill} stroke="none" />}
      <path d={`M0 0V${gap}`} stroke={INK} strokeWidth={0.12} />
    </pattern>}>{children(`url(#${id})`)}</Sym>
  );
}

function Dots({ children, fill = "#e3e3e3", r = 0.18, gap = 1 }: { children: (url: string) => ReactNode; fill?: string; r?: number; gap?: number }) {
  const id = `d${useId().replace(/:/g, "")}`;
  return (
    <Sym defs={<pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
      <rect width={gap} height={gap} fill={fill} stroke="none" />
      <circle cx={gap / 2} cy={gap / 2} r={r} fill={INK} stroke="none" />
    </pattern>}>{children(`url(#${id})`)}</Sym>
  );
}

/** Rayado cruzado del bloque de concreto. */
function CrossHatch() {
  const id = `x${useId().replace(/:/g, "")}`;
  return (
    <Sym defs={<pattern id={id} width={0.9} height={0.9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={0.9} height={0.9} fill="#fff" stroke="none" /><path d="M0 0V.9M0 0H.9" stroke={INK} strokeWidth={0.1} /></pattern>}>
      <rect x={1} y={0.8} width={12} height={3.4} fill={`url(#${id})`} strokeWidth={0.15} /><path d="M7 .8v3.4" strokeWidth={0.15} />
    </Sym>
  );
}

const T = ({ x = 7, y = 3.2, s = 1.6, children, w = 600 }: { x?: number; y?: number; s?: number; children: ReactNode; w?: number }) => (
  <text x={x} y={y} fontSize={s} fontWeight={w} textAnchor="middle" fill={INK} stroke="none" fontFamily="'IBM Plex Sans Condensed','Arial Narrow',sans-serif">{children}</text>
);

/**
 * Flecha del norte de las láminas: aguja partida (mitad negra, mitad blanca) dentro de un anillo doble,
 * con marcas en los otros tres puntos cardinales y la N encima. La planta siempre tiene el norte arriba.
 */
export function NorthArrow({ size = 20, label = true }: { size?: number; label?: boolean }) {
  const ticks = [90, 180, 270].map((a) => {
    const r = (a * Math.PI) / 180, c = Math.sin(r), d = -Math.cos(r);
    return `M${(c * 30).toFixed(2)} ${(d * 30).toFixed(2)}L${(c * 38).toFixed(2)} ${(d * 38).toFixed(2)}`;
  }).join("");
  return (
    <svg width={`${size}mm`} height={`${size * (label ? 1.18 : 1)}mm`} viewBox={label ? "-50 -68 100 118" : "-50 -50 100 100"} aria-label="North" role="img" className="northarrow">
      <circle r={38} fill="none" stroke={INK} strokeWidth={1.1} />
      <circle r={30} fill="none" stroke={INK} strokeWidth={0.5} />
      <path d={ticks} stroke={INK} strokeWidth={1.4} />
      <path d="M0 -46L-11 14L0 6Z" fill={INK} />
      <path d="M0 -46L11 14L0 6Z" fill="#fff" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      <circle r={3} fill="#fff" stroke={INK} strokeWidth={1.1} />
      {label && <text y={-52} textAnchor="middle" fontSize={17} fontWeight={700} fill={INK} fontFamily="'IBM Plex Sans Condensed','Arial Narrow',sans-serif" letterSpacing={1}>N</text>}
    </svg>
  );
}

// ---------- símbolos ----------

const S = {
  extWall: () => <Hatch>{(u) => <rect x={1} y={1} width={12} height={3} fill={u} />}</Hatch>,
  intWall: () => <Hatch>{(u) => <rect x={1} y={1.8} width={12} height={1.4} fill={u} />}</Hatch>,
  door: () => <Sym><path d="M1 4.2h3M10 4.2h3" strokeWidth={0.5} /><path d="M4 4.2V.4" strokeWidth={0.3} /><path d="M4 .4A3.8 3.8 0 0 1 7.8 4.2" strokeDasharray=".4 .3" strokeWidth={0.12} /></Sym>,
  window: () => <Sym><rect x={1} y={1.4} width={12} height={2.2} strokeWidth={0.15} /><path d="M1 2.2h12M1 2.8h12" strokeWidth={0.12} /><path d="M1 1.4v2.2M13 1.4v2.2" strokeWidth={0.4} /></Sym>,
  tag: (s: string) => () => <Sym><rect x={4.6} y={1} width={4.8} height={3} fill="#fff" strokeWidth={0.18} /><T y={3.05} s={1.6}>{s}</T></Sym>,
  room: () => <Sym><T y={2.2} s={1.6}>{L("ESPACIO", "ROOM")}</T><T y={4.3} s={1.3} w={400}>{L("00 m²", "000 sq ft")}</T></Sym>,
  dim: () => <Sym><path d="M1 3h12M1 1.5v3M13 1.5v3M.5 3.5l1-1M12.5 3.5l1-1" strokeWidth={0.15} /><T y={2.4} s={1.3} w={400}>{L("3.00", `10'-0"`)}</T></Sym>,
  section: () => <Sym><path d="M3 3.2H13" strokeDasharray="1.6 .4 .3 .4" strokeWidth={0.15} /><path d="M3 4.4V1.6" strokeWidth={0.3} /><path d="M2.4 2.2L3 1 3.6 2.2z" fill={INK} /><T x={1.2} y={3.6} s={1.8}>A</T></Sym>,
  detail: () => <Sym><circle cx={7} cy={2.5} r={2.2} strokeWidth={0.2} /><path d="M4.8 2.5h4.4" strokeWidth={0.15} /><T y={2.1} s={1.4}>1</T><T y={4.1} s={1}>A-501</T></Sym>,
  datum: () => <Sym><path d="M1 3.6h12" strokeWidth={0.15} /><path d="M2 3.6L1.3 2.6h1.4z" fill={INK} /><T x={8} y={2.6} s={1.3} w={400}>{L("+0.00 NIVEL", `+0'-0" F.F.`)}</T></Sym>,
  north: () => <span className="nsym"><NorthArrow size={5} label={false} /></span>,
  roofAbove: () => <Sym><path d="M1 2.5h12" strokeDasharray="1 .6" strokeWidth={0.2} /></Sym>,
  leader: () => <Sym><circle cx={1.5} cy={4} r={0.3} fill={INK} /><path d="M1.5 4L4 1.6h1.2" strokeWidth={0.15} /><T x={9} y={2.1} s={1.2} w={400}>{L("MATERIAL", "MATERIAL")}</T></Sym>,
  grade: () => <Hatch gap={0.6}>{(u) => <><rect x={1} y={3} width={12} height={1.6} fill={u} stroke="none" /><path d="M1 3h12" strokeWidth={0.45} /></>}</Hatch>,
  glazing: () => <Sym><rect x={3} y={0.8} width={8} height={3.4} fill="#dfe6ee" strokeWidth={0.15} /></Sym>,
  cut: () => <Sym><rect x={1} y={1.5} width={12} height={2} fill="#222" stroke="none" /></Sym>,
  beyond: () => <Sym><rect x={1} y={1} width={12} height={3} fill="#eee" strokeWidth={0.12} /></Sym>,
  footing: () => <Sym><path d="M1 1.4h12M1 3.6h12" strokeDasharray=".9 .5" strokeWidth={0.2} /></Sym>,
  bolt: () => <Sym><circle cx={7} cy={2.5} r={0.8} strokeWidth={0.18} /><path d="M5.7 2.5h2.6M7 1.2v2.6" strokeWidth={0.18} /></Sym>,
  ftag: () => <Sym><ellipse cx={7} cy={2.5} rx={2.4} ry={1.5} fill="#fff" strokeWidth={0.18} /><T y={3.05} s={1.5}>F1</T></Sym>,
  slab: () => <Sym><rect x={1} y={0.8} width={12} height={3.4} fill="#f6f6f6" strokeWidth={0.12} /><T y={3.05} s={1.1} w={400}>{`4" SOG`}</T></Sym>,
  joists: () => <Sym><path d="M2 .5v4M4 .5v4M6 .5v4M8 .5v4M10 .5v4M12 .5v4" strokeWidth={0.12} /></Sym>,
  span: () => <Sym><path d="M2.2 2.5h9.6" strokeWidth={0.25} /><path d="M1 2.5l1.6-.8v1.6zM13 2.5l-1.6-.8v1.6z" fill={INK} stroke="none" /></Sym>,
  studs: () => <Sym><rect x={1} y={1.6} width={12} height={1.8} strokeWidth={0.12} /><path d="M2.5 1.6v1.8M5 1.6v1.8M7.5 1.6v1.8M10 1.6v1.8M12.5 1.6v1.8" strokeWidth={0.2} /></Sym>,
  header: () => <Sym><path d="M1 2.5h12" strokeWidth={0.8} /></Sym>,
  roofEdge: () => <Sym><path d="M1 2.5h12" strokeWidth={0.4} /></Sym>,
  ridge: () => <Sym><path d="M1 2.5h12" strokeWidth={0.75} /></Sym>,
  rafters: () => <Sym><path d="M1 .6h12" strokeWidth={0.4} /><path d="M2.5 .6v4M5 .6v4M7.5 .6v4M10 .6v4M12.5 .6v4" strokeWidth={0.12} /></Sym>,
  pl: () => <Sym><path d="M1 2.5h12" strokeDasharray="2.4 .5 .4 .5" strokeWidth={0.35} /></Sym>,
  setback: () => <Sym><path d="M1 2.5h12" strokeDasharray=".9 .6" strokeWidth={0.15} /></Sym>,
  footprint: () => <Sym><rect x={2} y={0.8} width={10} height={3.4} fill="#dcdcdc" strokeWidth={0.35} /></Sym>,
  drive: () => <Sym><rect x={2} y={1} width={10} height={3} strokeWidth={0.15} /><T y={3} s={1} w={400}>CONC.</T></Sym>,
  meter: () => <Sym><circle cx={2} cy={3.6} r={0.35} fill={INK} /><path d="M2 3.6L4.6 1.8h1" strokeWidth={0.15} /><T x={9.5} y={2.3} s={1.1} w={400}>METER</T></Sym>,
  supply: () => <Sym><rect x={5.4} y={0.9} width={3.2} height={3.2} fill="#fff" strokeWidth={0.2} /><path d="M5.4 .9l3.2 3.2M8.6 .9L5.4 4.1" strokeWidth={0.18} /></Sym>,
  ret: () => <Sym><rect x={3.5} y={1.2} width={7} height={2.6} fill="#fff" strokeWidth={0.2} /><path d="M5 1.2v2.6M6.3 1.2v2.6M7.6 1.2v2.6M8.9 1.2v2.6" strokeWidth={0.1} /></Sym>,
  duct: () => <Sym><path d="M1 2.5h12" stroke="#555" strokeWidth={0.75} /></Sym>,
  ahu: () => <Sym><rect x={4} y={0.6} width={6} height={3.8} fill="#e5e5e5" strokeWidth={0.25} /><T y={3.05} s={1.3}>AHU</T></Sym>,
  cu: () => <Sym><rect x={5} y={0.5} width={4} height={4} fill="#fff" strokeWidth={0.25} /><circle cx={7} cy={2.5} r={1.4} strokeWidth={0.15} /></Sym>,
  ef: () => <Sym><circle cx={7} cy={2.5} r={1.6} fill="#fff" strokeWidth={0.2} /><T y={3} s={1.2}>EF</T></Sym>,
  refrig: () => <Sym><path d="M1 2.5h12" strokeDasharray=".5 .5" strokeWidth={0.15} /></Sym>,
  concrete: () => <Dots r={0.14} gap={0.9}>{(u) => <rect x={1} y={0.8} width={12} height={3.4} fill={u} strokeWidth={0.15} />}</Dots>,
  gravel: () => <Dots fill="#fff" r={0.28} gap={0.8}>{(u) => <rect x={1} y={0.8} width={12} height={3.4} fill={u} strokeWidth={0.15} />}</Dots>,
  earth: () => <Hatch gap={0.6}>{(u) => <rect x={1} y={0.8} width={12} height={3.4} fill={u} stroke="none" />}</Hatch>,
  batt: () => <Sym><rect x={1} y={0.8} width={12} height={3.4} strokeWidth={0.12} /><path d="M1 4.2L2 .8 3 4.2 4 .8 5 4.2 6 .8 7 4.2 8 .8 9 4.2 10 .8 11 4.2 12 .8 13 4.2" strokeWidth={0.12} /></Sym>,
  lumber: () => <Sym><rect x={1} y={1} width={12} height={3} strokeWidth={0.15} /><path d="M1 1l12 3M1 4l12-3" strokeWidth={0.12} /></Sym>,
  cmu: () => <CrossHatch />,
  sheathing: () => <Sym><rect x={1} y={2} width={12} height={1} fill="#c9b48a" strokeWidth={0.12} /></Sym>,
};

type Row = [() => ReactNode, string, string];

const ARCH: Row[] = [
  [S.extWall, "Muro exterior", "EXTERIOR WALL (2x6 WOOD STUD)"],
  [S.intWall, "Muro interior", "INTERIOR WALL (2x4 WOOD STUD)"],
  [S.door, "Puerta y abatimiento", "DOOR AND SWING"],
  [S.window, "Ventana", "WINDOW"],
  [S.tag("D1"), "Marca de puerta (ver cuadro)", "DOOR TAG, SEE SCHEDULE"],
  [S.tag("W1"), "Marca de ventana (ver cuadro)", "WINDOW TAG, SEE SCHEDULE"],
  [S.room, "Nombre y superficie del espacio", "ROOM NAME AND AREA"],
  [S.dim, "Cota", "DIMENSION"],
  [S.section, "Corte (ver sección)", "BUILDING SECTION CUT"],
  [S.roofAbove, "Cubierta / alero encima", "ROOF / EAVE ABOVE"],
];

const ROWS: Record<string, Row[]> = {
  cover: [
    [S.section, "Corte de sección", "BUILDING SECTION"],
    [S.detail, "Detalle (número / lámina)", "DETAIL NO. / SHEET NO."],
    [S.datum, "Cota de nivel", "LEVEL DATUM / ELEVATION"],
    [S.tag("D1"), "Marca de puerta", "DOOR TAG"],
    [S.tag("W1"), "Marca de ventana", "WINDOW TAG"],
    [S.tag("H1"), "Marca de dintel", "HEADER TAG"],
    [S.room, "Nombre y superficie del espacio", "ROOM NAME AND AREA"],
    [S.dim, "Cota", "DIMENSION"],
    [S.leader, "Nota con línea de llamada", "KEYED NOTE / LEADER"],
    [S.north, "Norte", "NORTH ARROW"],
  ],
  notes: [
    [S.concrete, "Hormigón", "CONCRETE"],
    [S.gravel, "Grava compactada", "COMPACTED GRAVEL"],
    [S.earth, "Terreno natural", "EARTH / COMPACTED FILL"],
    [S.lumber, "Madera estructural", "DIMENSIONAL LUMBER (CONT.)"],
    [S.sheathing, "Tablero OSB / contrachapado", "OSB / PLYWOOD SHEATHING"],
    [S.batt, "Aislamiento en manta", "BATT INSULATION"],
  ],
  site: [
    [S.pl, "Lindero", "PROPERTY LINE"],
    [S.setback, "Retiro", "BUILDING SETBACK LINE"],
    [S.footprint, "Vivienda proyectada", "PROPOSED RESIDENCE"],
    [S.drive, "Entrada de coches", "CONCRETE DRIVEWAY"],
    [S.dim, "Cota", "DIMENSION"],
    [S.meter, "Contador (agua / luz)", "UTILITY METER"],
    [S.north, "Norte", "NORTH ARROW"],
  ],
  found: [
    [S.extWall, "Muro encima", "WALL ABOVE"],
    [S.footing, "Zapata bajo losa", "FOOTING BELOW SLAB (DASHED)"],
    [S.ftag, "Marca de zapata (ver cuadro)", "FOOTING TAG, SEE SCHEDULE"],
    [S.bolt, "Perno de anclaje 1/2\"", "1/2\" DIA. ANCHOR BOLT"],
    [S.slab, "Losa sobre terreno", "CONCRETE SLAB ON GRADE"],
    [S.dim, "Cota", "DIMENSION"],
  ],
  floorfr: [
    [S.extWall, "Muro de carga", "BEARING WALL BELOW"],
    [S.joists, "Viguetas a 16\"", "JOISTS @ 16\" O.C."],
    [S.span, "Dirección y luz de viguetas", "JOIST SPAN / DIRECTION"],
    [S.dim, "Cota", "DIMENSION"],
  ],
  wallfr: [
    [S.extWall, "Muro exterior 2x6", "EXTERIOR BEARING WALL, 2x6"],
    [S.intWall, "Muro interior 2x4", "INTERIOR WALL, 2x4"],
    [S.studs, "Montantes a 16\"", "STUDS @ 16\" O.C."],
    [S.header, "Dintel sobre hueco", "HEADER OVER OPENING"],
    [S.tag("H1"), "Marca de dintel (ver cuadro)", "HEADER TAG, SEE SCHEDULE"],
  ],
  rooffr: [
    [S.roofEdge, "Borde de cubierta / alero", "ROOF EDGE / EAVE LINE"],
    [S.ridge, "Cumbrera", "RIDGE BOARD"],
    [S.rafters, "Cabios a 24\"", "RAFTERS @ 24\" O.C."],
    [S.intWall, "Muro debajo", "WALL BELOW"],
  ],
  plan: ARCH,
  fach: [
    [S.datum, "Cota de nivel", "LEVEL DATUM"],
    [S.grade, "Terreno terminado", "FINISH GRADE"],
    [S.glazing, "Acristalamiento", "GLAZING"],
    [S.leader, "Acabado (ver nota)", "FINISH MATERIAL TAG"],
    [S.dim, "Altura", "HEIGHT DIMENSION"],
  ],
  sec: [
    [S.cut, "Elemento cortado", "ELEMENT IN SECTION (CUT)"],
    [S.beyond, "Elemento en vista", "ELEMENT BEYOND"],
    [S.glazing, "Acristalamiento", "GLAZING"],
    [S.datum, "Cota de nivel", "LEVEL DATUM"],
    [S.grade, "Terreno terminado", "FINISH GRADE"],
  ],
  details: [
    [S.detail, "Detalle (número / lámina)", "DETAIL NO. / SHEET NO."],
    [S.concrete, "Hormigón", "CONCRETE"],
    [S.gravel, "Grava compactada", "COMPACTED GRAVEL"],
    [S.earth, "Terreno natural", "EARTH / COMPACTED FILL"],
    [S.lumber, "Madera estructural", "DIMENSIONAL LUMBER (CONT.)"],
    [S.sheathing, "Tablero OSB / contrachapado", "OSB / PLYWOOD SHEATHING"],
    [S.batt, "Aislamiento en manta", "BATT INSULATION"],
    [S.leader, "Nota con línea de llamada", "NOTE LEADER"],
  ],
  hvac: [
    [S.supply, "Rejilla de impulsión", "SUPPLY REGISTER (CEILING)"],
    [S.ret, "Rejilla de retorno", "RETURN AIR GRILLE"],
    [S.duct, "Conducto", "SUPPLY / RETURN DUCT"],
    [S.ahu, "Unidad interior", "FURNACE / AIR HANDLER"],
    [S.cu, "Unidad exterior", "CONDENSING UNIT"],
    [S.refrig, "Línea de refrigerante", "REFRIGERANT LINE SET"],
    [S.ef, "Extractor", "EXHAUST FAN"],
  ],
};
ROWS.elev = ROWS.fach;
ROWS.details2 = [ROWS.details[0], [S.cmu, "Bloque de concreto (CMU)", "CONCRETE MASONRY UNIT (CMU)"], ...ROWS.details.slice(1)];
ROWS.details3 = [...ROWS.details];
ROWS.notes = [...ROWS.notes.slice(0, 1), [S.cmu, "Bloque de concreto (CMU)", "CONCRETE MASONRY UNIT (CMU)"], ...ROWS.notes.slice(1)];

/** Bloque «Leyenda y símbolos» de una lámina; nada si la lámina no tiene símbolos propios. */
export function SheetLegend({ content }: { content: string }) {
  const rows = ROWS[content];
  if (!rows) return null;
  return <>
    <h4>{content === "notes" || content.startsWith("details") ? L("Materiales", "Material legend") : L("Leyenda y símbolos", "Legend & symbols")}</h4>
    <table className="legend symleg"><tbody>
      {rows.map(([draw, es, en], i) => <tr key={i}><td>{draw()}</td><td>{L(es, en)}</td></tr>)}
    </tbody></table>
  </>;
}

// ---------- instalaciones en inglés (juego de EE.UU.) ----------

const MEP_EN: Record<string, string> = {
  luz: "CEILING LIGHT FIXTURE", aplique: "WALL SCONCE", interruptor: "SINGLE-POLE SWITCH", conmutador: "3-WAY SWITCH",
  enchufe: "DUPLEX RECEPTACLE 15/20A", "enchufe-fuerza": "240V RECEPTACLE (RANGE / DRYER)", cuadro: "MAIN SERVICE PANEL",
  "toma-af": "COLD WATER OUTLET", "toma-ac": "HOT WATER OUTLET", desague: "FIXTURE DRAIN", sumidero: "FLOOR DRAIN",
  bajante: "VENT / SOIL STACK", llave: "SHUT-OFF VALVE", contador: "WATER METER", termo: "WATER HEATER",
};
const SYS_EN: Record<string, string> = { elec: "BRANCH CIRCUIT / HOMERUN", af: "COLD WATER (CW)", ac: "HOT WATER (HW)", san: "SANITARY / DWV" };
const CIRCUIT_EN: Record<string, string> = {
  C1: "LIGHTING", C2: "GENERAL RECEPTACLES", C3: "KITCHEN RANGE", C4: "LAUNDRY, DISHWASHER, WATER HEATER", C5: "BATH & KITCHEN COUNTERS (GFCI)",
};
const FIXTURE_EN: Record<string, string> = {
  Inodoro: "WATER CLOSET", Lavabo: "LAVATORY", "Plato de ducha": "SHOWER", Bañera: "BATHTUB", "Encimera de cocina": "KITCHEN SINK",
  Fregadero: "KITCHEN SINK", Lavadora: "CLOTHES WASHER", Lavavajillas: "DISHWASHER",
};
/** Nombre de un símbolo, red, circuito o aparato en el idioma de la lámina. */
export const mepEn = {
  fixture: (kind: string, es: string) => (imperial() ? MEP_EN[kind] ?? es.toUpperCase() : es),
  system: (sys: string, es: string) => (imperial() ? SYS_EN[sys] ?? es.toUpperCase() : es),
  circuit: (c: string, es: string) => (imperial() ? CIRCUIT_EN[c] ?? es.toUpperCase() : es),
  sanitary: (es: string) => (imperial() ? FIXTURE_EN[es] ?? es.toUpperCase() : es),
};
