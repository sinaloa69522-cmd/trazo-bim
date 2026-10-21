// Láminas de detalles de instalaciones: electricidad, plomería y aire acondicionado. Los mismos dibujos
// sirven al juego de permiso de EE.UU. (E-501, P-501, M-501, en inglés, con NEC / IPC / IRC) y al juego
// en metros de México (en español). Dibujo en cm con el encaje de las demás láminas de detalles.
import { BLUE, fit, GREEN, Pipe, RED, Valve } from "./MxExtra";
import { Bar, Break, CONC, Dim, Earth, Grid, NoteCol, T, Title, type Box } from "./MxSheets";
import { box, Ln, Shape, type Frame, type XY } from "./PermitSheets";

const GRAY = "#555", COPPER = "#a0522d", GAS = "#c9a227", WOOD = "#f2f2f2";
const circ = (cx: number, cy: number, r: number, n = 24): XY[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)]);

interface Props { box: Box; sheet: string; en: boolean }
type Fit = ReturnType<typeof fit>;

/** Rótulo del detalle: en el juego de EE.UU. sin escala (N.T.S.); en el de México con su escala, o S/E en los esquemas. */
function Head({ d, n, es, en, sheet, isEn, schematic }: { d: Fit; n: number; es: string; en: string; sheet: string; isEn: boolean; schematic?: boolean }) {
  return <Title x={d.tx} y={d.ty} n={n} title={isEn ? en : es} scale={isEn ? "N.T.S." : schematic ? "S/E" : d.scale} sheet={sheet} en={isEn} />;
}

/** Muro en corte (block o muro genérico) con su rayado. */
const Wall = ({ f, x0, x1, y0, y1 }: { f: Frame; x0: number; x1: number; y0: number; y1: number }) => <Shape f={f} p={box(x0, y0, x1, y1)} fill="url(#mxblock)" w={0.3} />;
const Rect = ({ f, x0, x1, y0, y1, fill = "#fff", w = 0.3 }: { f: Frame; x0: number; x1: number; y0: number; y1: number; fill?: string; w?: number }) => <Shape f={f} p={box(x0, y0, x1, y1)} fill={fill} w={w} />;
const Clamp = ({ f, at }: { f: Frame; at: XY }) => <Rect f={f} x0={at[0] - 3} x1={at[0] + 3} y0={at[1] - 3} y1={at[1] + 3} fill="#111" w={0.1} />;

// ---------- E-501: electricidad ----------

export function ElecDetails({ box: b, sheet, en }: Props) {
  const L = (es: string, e: string) => (en ? e : es);
  const d1 = fit(b, 0, [-130, 90, -110, 320]), f1 = d1.f;
  const d2 = fit(b, 1, [-10, 310, -15, 265]), f2 = d2.f;
  const d3 = fit(b, 2, [-10, 215, -70, 125]), f3 = d3.f;
  const d4 = fit(b, 3, en ? [-12, 52, -10, 20] : [-14, 58, -8, 22]), f4 = d4.f;
  // 1: altura del medidor; 2: alturas de salidas
  const mH = en ? 152 : 170;
  const H = en ? 244 : 250, dH = en ? 203 : 210, hS = en ? 122 : 120, hR = en ? 40.6 : 30, hC = en ? 107 : 110, hK = en ? 91.4 : 90, hU = en ? 137 : 150;
  return <Grid b={b}>
    {/* 1. acometida, medidor y tablero */}
    <Earth f={f1} x0={-130} x1={90} y0={-110} y1={0} />
    <Ln f={f1} p={[[-130, 0], [0, 0]]} w={0.4} />
    <Rect f={f1} x0={-5} x1={20} y0={-40} y1={0} fill={CONC} />
    <Rect f={f1} x0={15} x1={90} y0={-10} y1={0} fill={CONC} />
    <Wall f={f1} x0={0} x1={15} y0={0} y1={300} />
    <Break f={f1} x0={0} x1={15} y={305} />
    <Pipe f={f1} p={[[70, -110], [70, 90]]} w={1.2} color={BLUE} />
    <Pipe f={f1} p={[[35, 110], [35, 60], [70, 60]]} w={0.4} color={GREEN} />
    <Clamp f={f1} at={[70, 60]} />
    <Pipe f={f1} p={[[-14, mH - 30], [-14, 125], [27, 125], [27, 110]]} w={0.9} color={GRAY} />
    <Pipe f={f1} p={[[-14, mH + 30], [-14, 300]]} w={1.2} color={GRAY} />
    <Shape f={f1} p={[[-20, 300], [-8, 300], [-8, 306], [-14, 312], [-20, 306]]} fill="#fff" w={0.3} />
    <Ln f={f1} p={[[-14, 310], [-60, 302], [-130, 316]]} w={0.3} dash="2 1" />
    <Rect f={f1} x0={-28} x1={0} y0={mH - 30} y1={mH + 30} w={0.35} />
    <Shape f={f1} p={circ(-14, mH, 9)} fill="#fff" w={0.3} />
    <T f={f1} at={[-14, mH - 1]} s="kWh" size={1.5} />
    <Rect f={f1} x0={15} x1={40} y0={110} y1={200} w={0.4} />
    {[130, 145, 160, 175].map((y) => <Ln key={y} f={f1} p={[[19, y], [36, y]]} w={0.15} />)}
    <Pipe f={f1} p={[[-22, mH - 30], [-22, -10], [-60, -10]]} w={0.4} color={GREEN} />
    <Pipe f={f1} p={[[-60, -6], [-60, -100]]} w={1.4} color={COPPER} />
    <Clamp f={f1} at={[-60, -10]} />
    <Break f={f1} x0={-66} x1={-54} y={-55} />
    <Dim f={f1} a={[0, 0]} b={[0, 200]} off={-120} s={L("2.00 máx.", `6'-7" MAX`)} />
    <Dim f={f1} a={[-60, -100]} b={[-60, -10]} off={-30} s={L("3.00 m", `8'-0"`)} />
    <NoteCol f={f1} x={d1.nx} y0={d1.ny} items={[
      [[-14, 308], L("Mufa y tubo conduit galvanizado pared gruesa con abrazaderas; altura de la acometida según CFE", `WEATHERHEAD AND 2" RIGID MAST, STRAPPED; SERVICE DROP 10'-0" MIN ABOVE GRADE, 12'-0" OVER DRIVEWAY (NEC 230.24)`)],
      [[-14, mH + 9], L("Base de medidor según especificación de CFE, a la altura que indique la compañía", "METER SOCKET PER SERVING UTILITY, HEIGHT AND LOCATION PER UTILITY")],
      [[27, 185], L("Interruptor general y centro de carga; espacio de trabajo libre de 0.90 m al frente, manija más alta a 2.00 m máx.", `200A MAIN PANEL W/ MAIN BREAKER; 30" W x 36" D WORKING SPACE (NEC 110.26); HIGHEST HANDLE 6'-7" MAX (NEC 240.24)`)],
      [[6, 125], L("Conductores de acometida THW-LS en tubo conduit; sellar el pasamuro", "SERVICE ENTRANCE CONDUCTORS 2/0 CU OR 4/0 AL (NEC 310.12) IN SCH. 80 PVC THRU WALL, SEALED")],
      [[-22, 60], L("Conductor del electrodo de cobre desnudo cal. 8 AWG, protegido donde quede expuesto", "#6 CU GROUNDING ELECTRODE CONDUCTOR TO RODS (NEC 250.66(A)), PROTECTED WHERE EXPOSED")],
      [[-60, -80], L("Varilla copperweld 5/8\" × 3.00 m en registro; resistencia a tierra 25 Ω máx.", `(2) 5/8" x 8'-0" GROUND RODS 6'-0" MIN APART (NEC 250.53), OR CONCRETE-ENCASED ELECTRODE (NEC 250.52(A)(3))`)],
      [[70, 60], L("Unión a la tubería metálica de agua cerca de su entrada", `#4 CU BOND TO METAL WATER PIPE WITHIN 5'-0" OF ENTRY (NEC 250.68(C))`)],
    ]} />
    <Head d={d1} n={1} sheet={sheet} isEn={en} es="Acometida, medidor y tablero" en="Service entrance and main panel" />

    {/* 2. alturas de salidas */}
    <Ln f={f2} p={[[-10, 0], [310, 0]]} w={0.45} />
    <Ln f={f2} p={[[-10, H], [310, H]]} w={0.3} />
    <Rect f={f2} x0={20} x1={110} y0={0} y1={dH} />
    <Shape f={f2} p={circ(100, dH * 0.45, 2.5, 12)} fill="#fff" w={0.25} />
    <Rect f={f2} x0={200} x1={300} y0={10} y1={hK - 4} />
    <Ln f={f2} p={[[250, 10], [250, hK - 4]]} w={0.15} />
    <Rect f={f2} x0={200} x1={300} y0={hK - 4} y1={hK} fill="#ddd" />
    <Rect f={f2} x0={200} x1={300} y0={hK} y1={hK + 10} fill="#f3f3f3" w={0.15} />
    <Rect f={f2} x0={200} x1={300} y0={hU} y1={hU + 76} />
    <Ln f={f2} p={[[250, hU], [250, hU + 76]]} w={0.15} />
    <Rect f={f2} x0={122} x1={128} y0={hS - 5} y1={hS + 5} />
    <Ln f={f2} p={[[125, hS - 2], [125, hS + 2]]} w={0.4} />
    {en && <><Rect f={f2} x0={146} x1={156} y0={147} y1={157} /><T f={f2} at={[151, 150.5]} s="T" size={1.6} /></>}
    {[[175, hR], [250, hC]].map(([x, y]) => <g key={x}><Rect f={f2} x0={x - 4} x1={x + 4} y0={y - 5} y1={y + 5} />
      <Ln f={f2} p={[[x - 1.5, y + 1], [x - 1.5, y + 3]]} w={0.2} /><Ln f={f2} p={[[x + 1.5, y + 1], [x + 1.5, y + 3]]} w={0.2} /></g>)}
    <T f={f2} at={[250, hC - 9]} s="GFCI" size={1.4} />
    <Rect f={f2} x0={52} x1={68} y0={H - 4} y1={H} />
    <T f={f2} at={[60, H - 9]} s={L("DH", "SD/CO")} size={1.4} />
    <Dim f={f2} a={[133, 0]} b={[133, hS]} off={0} s={L("1.20", `48"`)} />
    <Dim f={f2} a={[185, 0]} b={[185, hR]} off={0} s={L("0.30", `16"`)} />
    <Dim f={f2} a={[262, 0]} b={[262, hC]} off={0} s={L("1.10", `42"`)} />
    <Dim f={f2} a={[305, 0]} b={[305, hK]} off={0} s={L("0.90", `36"`)} />
    {en && <Dim f={f2} a={[160, 0]} b={[160, 152]} off={0} s={`60"`} />}
    <NoteCol f={f2} x={d2.nx} y0={d2.ny} items={[
      [[125, hS + 5], L("Apagador a 1.20 m, del lado de la chapa", `SWITCH 48" AFF TO CENTER, ON LATCH SIDE OF DOOR`)],
      ...(en ? [[[151, 157], `THERMOSTAT 60" AFF ON INTERIOR WALL, AWAY FROM SUPPLY REGISTERS`] as [XY, string]] : []),
      [[175, hR + 5], L("Contacto general a 0.30 m; el número y la separación según NOM-001-SEDE", `RECEPTACLE 16" AFF, TAMPER-RESISTANT (NEC 406.12); NO POINT ALONG WALL OVER 6'-0" FROM A RECEPTACLE (NEC 210.52(A))`)],
      [[250, hC + 5], L("Contacto de cocina a 1.10 m sobre la barra, con protección GFCI", `COUNTERTOP RECEPTACLE 42" AFF, GFCI, 20A; NO POINT OVER 24" FROM A RECEPTACLE (NEC 210.52(C))`)],
      [[60, H - 4], L("Detector de humo en plafón, a 10 cm mínimo del muro", `SMOKE / CO ALARM ON CEILING, HARD-WIRED W/ BATTERY BACKUP, INTERCONNECTED (IRC R314, R315)`)],
      [[20, 6], L("Alturas al centro de la chalupa sobre N.P.T.", "HEIGHTS TO CENTER OF BOX ABOVE FINISHED FLOOR U.N.O.")],
    ]} />
    <Head d={d2} n={2} sheet={sheet} isEn={en} es="Alturas de salidas eléctricas" en="Device mounting heights" />

    {/* 3. puesta a tierra y unión (esquema) */}
    <Earth f={f3} x0={-10} x1={215} y0={-70} y1={0} />
    <Ln f={f3} p={[[-10, 0], [215, 0]]} w={0.35} />
    <Rect f={f3} x0={0} x1={28} y0={60} y1={110} w={0.35} />
    <Shape f={f3} p={circ(14, 85, 8)} fill="#fff" w={0.25} />
    <Rect f={f3} x0={55} x1={110} y0={20} y1={115} w={0.4} />
    <Rect f={f3} x0={60} x1={80} y0={95} y1={108} />
    <T f={f3} at={[70, 100.5]} s={L("PRINC.", "MAIN")} size={1.4} />
    <Rect f={f3} x0={62} x1={103} y0={48} y1={52} fill="#999" w={0.2} />
    <Rect f={f3} x0={62} x1={103} y0={32} y1={36} fill="#999" w={0.2} />
    <T f={f3} at={[60, 48.5]} s="N" size={1.6} anchor="end" />
    <T f={f3} at={[60, 32.5]} s={L("T", "G")} size={1.6} anchor="end" />
    <Pipe f={f3} p={[[28, 102], [60, 102]]} w={0.45} />
    <Pipe f={f3} p={[[28, 98], [60, 98]]} w={0.45} />
    <Pipe f={f3} p={[[28, 92], [48, 92], [48, 50], [62, 50]]} w={0.45} color="#888" />
    <Pipe f={f3} p={[[100, 52], [100, 36]]} w={0.9} color={GREEN} />
    <Pipe f={f3} p={[[80, 32], [80, -8]]} w={0.45} color={GREEN} />
    <Pipe f={f3} p={[[80, -6], [80, -62]]} w={1.4} color={COPPER} />
    <Pipe f={f3} p={[[135, -70], [135, 70]]} w={1.6} color={BLUE} />
    <Pipe f={f3} p={[[150, -20], [150, 70]]} w={1.4} color={GAS} />
    <Pipe f={f3} p={[[103, 34], [150, 34]]} w={0.45} color={GREEN} />
    <Clamp f={f3} at={[135, 34]} /><Clamp f={f3} at={[150, 34]} />
    <Rect f={f3} x0={170} x1={210} y0={20} y1={115} w={0.4} />
    <Rect f={f3} x0={176} x1={204} y0={62} y1={66} fill="#999" w={0.2} />
    {[178, 200].map((x) => <Rect key={x} f={f3} x0={x} x1={x + 3} y0={58} y1={62} w={0.15} />)}
    <Rect f={f3} x0={176} x1={204} y0={32} y1={36} fill="#999" w={0.2} />
    <Pipe f={f3} p={[[204, 34], [210, 34]]} w={0.6} color={GREEN} />
    <Pipe f={f3} p={[[110, 106], [170, 106]]} w={0.45} />
    <Pipe f={f3} p={[[110, 101], [170, 101]]} w={0.45} />
    <Pipe f={f3} p={[[88, 52], [88, 96], [170, 96], [188, 96], [188, 66]]} w={0.45} color="#888" />
    <Pipe f={f3} p={[[95, 36], [95, 91], [170, 91], [196, 91], [196, 36]]} w={0.45} color={GREEN} />
    <NoteCol f={f3} x={d3.nx} y0={d3.ny} items={[
      [[100, 44], L("Puente de unión principal: neutro y tierra unidos solo en el equipo de acometida (NOM-001-SEDE, art. 250)", "MAIN BONDING JUMPER: NEUTRAL AND GROUND BONDED AT SERVICE EQUIPMENT ONLY (NEC 250.24(B), 250.28)")],
      [[80, 10], L("Conductor del electrodo de puesta a tierra continuo, sin empalmes", "GROUNDING ELECTRODE CONDUCTOR CONTINUOUS OR IRREVERSIBLY SPLICED (NEC 250.64(C))")],
      [[80, -45], L("Electrodo: varilla copperweld 5/8\" × 3.00 m", "GROUNDING ELECTRODE SYSTEM (NEC 250.50)")],
      [[142, 34], L("Unir a tierra las tuberías metálicas de agua y gas", "BOND METAL WATER (NEC 250.104(A)) AND GAS PIPING (NEC 250.104(B))")],
      [[140, 96], L("Alimentador al tablero derivado: fases, neutro y conductor de puesta a tierra", "4-WIRE FEEDER TO SUBPANEL: 2 HOTS, NEUTRAL AND EQUIPMENT GROUND (NEC 215.6)")],
      [[190, 64], L("Tablero derivado: barra de neutro aislada de la caja", "SUBPANEL NEUTRAL BAR ISOLATED FROM ENCLOSURE (NEC 250.24(A)(5))")],
      [[207, 34], L("Barra de tierra del tablero derivado unida a la caja", "SUBPANEL GROUND BAR BONDED TO ENCLOSURE")],
    ]} />
    <Head d={d3} n={3} sheet={sheet} isEn={en} schematic es="Puesta a tierra y unión" en="Grounding and bonding diagram" />

    {/* 4. protección del cable en el muro (planta) */}
    {en ? <>
      <Ln f={f4} p={[[-12, -1.27], [52, -1.27]]} w={0.35} /><Ln f={f4} p={[[-12, 10.17], [52, 10.17]]} w={0.35} />
      <Pipe f={f4} p={[[-12, 4.45], [23, 4.45]]} w={0.6} color={GRAY} />
      <Pipe f={f4} p={[[28, 1.6], [52, 1.6]]} w={0.6} color={GRAY} />
      {[0, 40.6].map((x) => <g key={x}><Rect f={f4} x0={x} x1={x + 3.8} y0={0} y1={8.9} fill={WOOD} w={0.3} />
        <Ln f={f4} p={[[x, 0], [x + 3.8, 8.9]]} w={0.1} /><Ln f={f4} p={[[x, 8.9], [x + 3.8, 0]]} w={0.1} /></g>)}
      <Ln f={f4} p={[[0, 4.45], [3.8, 4.45]]} w={0.3} dash="0.6 0.4" />
      <Ln f={f4} p={[[40.6, 1.6], [44.4, 1.6]]} w={0.3} dash="0.6 0.4" />
      <Pipe f={f4} p={[[39.8, -0.2], [45.2, -0.2]]} w={1.1} />
      <Rect f={f4} x0={18} x1={28} y0={-1.27} y1={5.5} w={0.35} />
      <Dim f={f4} a={[3.8, 8.9]} b={[3.8, 5.55]} off={6} s={`1 1/4" MIN`} />
      <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
        [[2, 4.45], `BORED HOLES 1 1/4" MIN FROM NEAREST EDGE OF STUD (NEC 300.4(A)(1))`],
        [[42.5, -0.2], `1/16" STEEL NAIL PLATE WHERE LESS THAN 1 1/4" FROM EDGE`],
        [[48, 1.6], `NM CABLE SECURED WITHIN 12" OF BOX AND AT 4'-6" MAX (NEC 334.30)`],
        [[23, 2], `DEVICE BOX FLUSH WITH FINISH SURFACE (NEC 314.20)`],
        [[42.5, 6], `2x4 STUDS @ 16" O.C.; BORED HOLES 60% OF STUD DEPTH MAX, 40% IN BEARING WALLS (IRC R602.6)`],
        [[-8, 10.17], `1/2" GYP. BD. EACH SIDE`],
      ]} />
    </> : <>
      <Wall f={f4} x0={-14} x1={40} y0={0} y1={15} />
      <Rect f={f4} x0={40} x1={58} y0={0} y1={15} fill={CONC} />
      {[[43, 3], [55, 3], [43, 12], [55, 12]].map(([x, y]) => <Bar key={`${x}${y}`} f={f4} at={[x, y]} r={f4.k * 0.6} />)}
      <Ln f={f4} p={[[-14, -1.5], [58, -1.5]]} w={0.3} /><Ln f={f4} p={[[-14, 16.5], [58, 16.5]]} w={0.3} />
      <Rect f={f4} x0={6} x1={12} y0={0} y1={5} fill="#cfcfcf" w={0.25} />
      <Shape f={f4} p={circ(9, 2.5, 1.0, 16)} fill="#fff" w={0.35} />
      <Rect f={f4} x0={22} x1={32} y0={-1.5} y1={4} w={0.35} />
      <Dim f={f4} a={[12, 0]} b={[12, 5]} off={4} s="5" />
      <Dim f={f4} a={[-14, 0]} b={[-14, 15]} off={-3} s="15" />
      <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
        [[9, 2.5], "Poliducto naranja Ø 13 mm (½\") alojado en la ranura"],
        [[11, 4.5], "Ranura con cortadora, profundidad máx. 1/3 del espesor del muro; nunca en castillos ni cadenas"],
        [[7, 1], "Relleno de mortero cemento-arena 1:4 antes del aplanado"],
        [[27, 1], "Chalupa galvanizada al ras del aplanado"],
        [[16, -1.5], "Aplanado de mezcla 1.5 cm"],
        [[49, 8], "Castillo de concreto armado (ver EST)"],
      ]} />
    </>}
    <Head d={d4} n={4} sheet={sheet} isEn={en} es="Tubería ranurada en muro de block (planta)" en="Cable protection in stud wall (plan)" />
  </Grid>;
}

// ---------- P-501: plomería ----------

export function PlumbDetails({ box: b, sheet, en }: Props) {
  const L = (es: string, e: string) => (en ? e : es);
  const d1 = fit(b, 0, [-15, 175, -5, 245]), f1 = d1.f;
  const d2 = fit(b, 1, [-5, 190, -45, 265]), f2 = d2.f;
  const d3 = fit(b, 2, [-20, 140, -45, 60]), f3 = d3.f;
  const d4 = fit(b, 3, [-15, 340, -100, 140]), f4 = d4.f;
  const rim = en ? 86 : 80, roof = 240;
  return <Grid b={b}>
    {/* 1. calentador de agua */}
    <Ln f={f1} p={[[-15, 0], [175, 0]]} w={0.45} />
    <Wall f={f1} x0={-15} x1={-5} y0={0} y1={240} />
    <Rect f={f1} x0={30} x1={110} y0={0} y1={5} fill="#ddd" />
    <Shape f={f1} p={[[40, 5], [100, 5], [100, 145], [92, 152], [48, 152], [40, 145]]} fill="#fff" w={0.45} />
    <T f={f1} at={[70, 80]} s={L("CALENTADOR", "WATER HEATER")} size={1.8} rot={-90} />
    {[45, 115].map((y) => <Ln key={y} f={f1} p={[[-5, y], [40, y], [40, y + 3], [100, y + 3]]} w={0.35} />)}
    <Pipe f={f1} p={[[55, 152], [55, 200], [-5, 200]]} color={BLUE} />
    <Valve f={f1} at={[55, 178]} vertical />
    <Pipe f={f1} p={[[30, 200], [30, 192]]} color={BLUE} />
    <Rect f={f1} x0={22} x1={38} y0={160} y1={192} />
    <Pipe f={f1} p={[[85, 152], [85, 200], [175, 200]]} color={RED} dash="1.4 .5 .3 .5" />
    <Pipe f={f1} p={[[100, 135], [118, 135], [118, 12]]} w={0.8} />
    <Rect f={f1} x0={100} x1={108} y0={131} y1={139} w={0.25} />
    <Pipe f={f1} p={[[70, 152], [70, 240]]} w={2.2} color="#999" />
    <Dim f={f1} a={[118, 0]} b={[118, 12]} off={14} s={L("15 máx.", `6" MAX`)} />
    <NoteCol f={f1} x={d1.nx} y0={d1.ny} items={[
      [[70, 225], L("Chimenea (tubo de escape) al exterior, 0.60 m sobre la azotea, con capuchón", "TYPE B VENT PER MANUFACTURER, CLEARANCES TO COMBUSTIBLES PER LISTING")],
      [[55, 178], L("Llave de paso y tuerca unión en la entrada de agua fría", "FULL-PORT SHUTOFF VALVE ON COLD SUPPLY (IPC 606.2)")],
      [[30, 176], L("Tanque de expansión o jarro de aire según la instalación", "THERMAL EXPANSION TANK WHERE CHECK VALVE OR PRV EXISTS (IPC 607.3.2)")],
      [[104, 135], L("Válvula de alivio de presión y temperatura, descarga entera hasta la coladera, sin válvulas", `T&P RELIEF VALVE, 3/4" FULL-SIZE DISCHARGE, NO VALVES, TERMINATE 6" MAX ABOVE FLOOR OR PAN (IPC 504.6)`)],
      [[20, 115], L("Fijar al muro con flejes metálicos", `SEISMIC STRAPS AT UPPER AND LOWER 1/3 OF TANK, LOWER 4" MIN ABOVE CONTROLS (IRC M1307.2)`)],
      [[100, 3], L("Charola con desagüe si queda en interior; si es de gas, fuera de baños y recámaras", `DRAIN PAN W/ 3/4" DRAIN WHERE LEAKAGE WOULD CAUSE DAMAGE (IPC 504.7); GAS UNIT IN GARAGE: IGNITION 18" ABOVE FLOOR (IRC G2408.2)`)],
    ]} />
    <Head d={d1} n={1} sheet={sheet} isEn={en} es="Calentador de agua de depósito" en="Water heater installation" />

    {/* 2. lavabo: céspol, ventilación y alimentaciones */}
    <Ln f={f2} p={[[-5, 0], [190, 0]]} w={0.45} />
    <Rect f={f2} x0={-5} x1={190} y0={-8} y1={0} fill={CONC} w={0.25} />
    <Rect f={f2} x0={100} x1={115} y0={0} y1={roof - 10} fill="#fafafa" w={0.25} />
    <Ln f={f2} p={[[100, roof - 10], [190, roof - 10]]} w={0.3} />
    <Shape f={f2} p={[[15, rim], [85, rim], [80, rim - 12], [20, rim - 12]]} fill="#fff" w={0.35} />
    <Pipe f={f2} p={[[50, rim - 12], [50, 56], [50, 50]]} w={0.9} />
    <Pipe f={f2} p={[[50, 50], [52, 45], [57, 43], [62, 45], [64, 50], [64, 54], [107, 52]]} w={0.9} />
    <Pipe f={f2} p={[[107, -45], [107, roof + 25]]} w={1.4} color={GRAY} />
    <Pipe f={f2} p={[[107, -30], [190, -36]]} w={1.4} color={GRAY} />
    <Rect f={f2} x0={103} x1={111} y0={8} y1={14} />
    <Pipe f={f2} p={[[100, 60], [72, 60], [72, rim + 4]]} color={BLUE} />
    <Valve f={f2} at={[80, 60]} />
    <Pipe f={f2} p={[[100, 64], [30, 64], [30, rim + 4]]} color={RED} dash="1.4 .5 .3 .5" />
    <Valve f={f2} at={[90, 64]} />
    <Dim f={f2} a={[10, 0]} b={[10, rim]} off={0} s={L("0.80", `34" MAX`)} />
    <Dim f={f2} a={[107, roof - 10]} b={[107, roof + 25]} off={14} s={L("30", `6" MIN`)} />
    <NoteCol f={f2} x={d2.nx} y0={d2.ny} items={[
      [[107, roof + 15], L("Tubo de ventilación Ø 38 mm (1½\") hasta 0.30 m sobre la azotea", `VENT THROUGH ROOF, 6" MIN ABOVE ROOF (IRC P3103.1); AAV WHERE APPROVED (IPC 918)`)],
      [[107, 52], L("Yee o tee sanitaria en la conexión del brazo", "SANITARY TEE AT TRAP ARM CONNECTION")],
      [[57, 44], L("Céspol Ø 32 mm (1¼\") con sello de agua de 5 a 10 cm", `1 1/4" P-TRAP, 2" TO 4" TRAP SEAL (IPC 1002.4)`)],
      [[85, 53], L("Brazo del céspol con pendiente del 2 %, 1.50 m máximo hasta la ventilación", `TRAP ARM 1/4"/FT; 1 1/4": 5'-0" MAX, 1 1/2": 6'-0" MAX TO VENT (IPC TABLE 909.1)`)],
      [[80, 60], L("Llave de control (de ángulo) en cada alimentación, Ø 13 mm", "ANGLE STOP ON EACH SUPPLY (IPC 606.2)")],
      [[107, 11], L("Tapón registro al pie de la bajada", "CLEANOUT AT BASE OF STACK (IPC 708)")],
      [[150, -33], L("Drenaje al registro con pendiente del 2 % mínimo", `BUILDING DRAIN 1/4"/FT MIN (1/8" FOR 3" AND LARGER) (IPC 704.1)`)],
    ]} />
    <Head d={d2} n={2} sheet={sheet} isEn={en} es="Lavabo: céspol y ventilación" en="Lavatory trap and vent" />

    {/* 3. piso de regadera y coladera */}
    <Rect f={f3} x0={-20} x1={140} y0={-10} y1={0} fill={CONC} />
    <Wall f={f3} x0={-20} x1={-5} y0={0} y1={60} />
    <Rect f={f3} x0={-5} x1={-3.5} y0={0} y1={60} fill="#fff" w={0.2} />
    <Shape f={f3} p={[[-3.5, 0], [120, 0], [120, 4], [60, 2], [-3.5, 4]]} fill="#e9e9e9" w={0.25} />
    <Pipe f={f3} p={[[-3.5, 4.5], [60, 2.5], [120, 4.5], [120, 13], [134, 13]]} w={0.7} />
    <Pipe f={f3} p={[[-3.2, 4.5], [-3.2, 20]]} w={0.7} />
    <Shape f={f3} p={[[-3.5, 4.5], [60, 2.5], [120, 4.5], [120, 8], [60, 6], [-3.5, 8]]} fill={CONC} w={0.25} />
    <Shape f={f3} p={[[-3.5, 8], [60, 6], [120, 8], [120, 9], [60, 7], [-3.5, 9]]} fill="#fff" w={0.3} />
    <Rect f={f3} x0={120} x1={135} y0={0} y1={14} fill={CONC} />
    <Rect f={f3} x0={52} x1={68} y0={-10} y1={7} w={0.35} />
    <Ln f={f3} p={[[53, 7], [67, 7]]} w={0.6} dash="1 .6" />
    <Pipe f={f3} p={[[60, -10], [60, -25], [62, -30], [67, -32], [72, -30], [74, -25], [74, -22], [100, -24]]} w={1.2} color={GRAY} />
    <Dim f={f3} a={[120, 0]} b={[120, 14]} off={10} s={L("10", `2"-9"`)} />
    <NoteCol f={f3} x={d3.nx} y0={d3.ny} items={[
      [[-3.2, 15], L("Impermeabilizante subiendo 20 cm en muros y sobre el sardinel", `WATERPROOF PAN LINER TURNED UP 2" MIN ABOVE CURB, ON WALLS PER MFR (IPC 417.5.2)`)],
      [[30, 8.5], L("Loseta antiderrapante con pendiente del 2 % hacia la coladera", `TILE OVER MORTAR BED, FLOOR SLOPED 1/4"/FT MIN, 1/2"/FT MAX TO DRAIN (IPC 417.4)`)],
      [[90, 5], L("Entortado de mortero con pendiente", "PRE-SLOPE MORTAR BED UNDER LINER")],
      [[60, 3], L("Coladera de PVC o bronce Ø 2\" con rejilla", `2" CLAMPING-RING SHOWER DRAIN W/ WEEP HOLES`)],
      [[67, -32], L("Céspol de la coladera", "P-TRAP")],
      [[128, 10], L("Sardinel de 10 cm", `CURB 2" MIN, 9" MAX ABOVE DRAIN`)],
      [[-12, 40], L("Muro con recubrimiento cerámico hasta 2.10 m", "CEMENT BOARD (NOT GYPSUM) BEHIND TILE (IRC R702.4.2)")],
    ]} />
    <Head d={d3} n={3} sheet={sheet} isEn={en} es="Piso de regadera y coladera" en="Shower floor and drain" />

    {/* 4. toma de agua */}
    <Earth f={f4} x0={-15} x1={240} y0={-100} y1={0} />
    <Ln f={f4} p={[[-15, 0], [240, 0]]} w={0.4} />
    <Shape f={f4} p={circ(0, -80, 10)} fill="#fff" w={0.4} />
    <Pipe f={f4} p={[[10, -80], [60, -80], [60, -30], [240, -30]]} color={BLUE} w={0.9} />
    <Valve f={f4} at={[40, -80]} />
    <Rect f={f4} x0={80} x1={130} y0={-45} y1={0} fill="none" w={0.4} />
    <Shape f={f4} p={circ(110, -30, 6)} fill="#fff" w={0.3} />
    <T f={f4} at={[110, -31]} s="M" size={1.5} />
    <Valve f={f4} at={[92, -30]} />
    <Rect f={f4} x0={240} x1={255} y0={-40} y1={140} fill={CONC} />
    <Rect f={f4} x0={255} x1={340} y0={-10} y1={0} fill={CONC} />
    <Pipe f={f4} p={[[240, -30], [265, -30], [265, 110], [340, 110]]} color={BLUE} w={0.9} />
    <Valve f={f4} at={[265, 40]} vertical />
    {en && <><Rect f={f4} x0={259} x1={271} y0={62} y1={76} /><T f={f4} at={[265, 67]} s="PRV" size={1.3} /></>}
    <Pipe f={f4} p={[[265, 90], [225, 90]]} color={BLUE} w={0.9} />
    <Valve f={f4} at={[228, 90]} />
    <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
      [[0, -72], L("Red municipal de agua potable", "PUBLIC WATER MAIN")],
      [[40, -80], L("Toma domiciliaria con llave de inserción y llave de banqueta", "CORPORATION STOP AND CURB STOP PER WATER PURVEYOR")],
      [[110, -24], L("Medidor en nicho o registro según el organismo operador", "WATER METER AND METER BOX PER PURVEYOR")],
      [[180, -30], L("Tubería de polietileno o cobre Ø 13 mm a 40 cm de profundidad mínima", `3/4" MIN WATER SERVICE (IPC 603.1), BELOW FROST; 5'-0" FROM BUILDING SEWER OR ON SHELF 12" ABOVE (IPC 603.2)`)],
      [[265, 40], L("Llave de paso general a la entrada de la vivienda", "MAIN SHUTOFF VALVE, ACCESSIBLE (IPC 606.1)")],
      ...(en ? [[[265, 70], "PRESSURE REDUCING VALVE WHERE STATIC PRESSURE EXCEEDS 80 PSI (IPC 604.8)"] as [XY, string]] : []),
      [[228, 90], L("Llave de nariz para manguera", "FROST-FREE HOSE BIB W/ VACUUM BREAKER (IPC 608)")],
      [[320, 110], L("Alimentación a cisterna o tinaco con válvula de flotador", "TO WATER HEATER AND FIXTURES, SEE P-101")],
    ]} />
    <Head d={d4} n={4} sheet={sheet} isEn={en} schematic es="Toma de agua y llave general" en="Water service entry" />
  </Grid>;
}

// ---------- M-501: aire acondicionado ----------

export function MechDetails({ box: b, sheet, en }: Props) {
  const L = (es: string, e: string) => (en ? e : es);
  const d1 = fit(b, 0, [-15, 140, -30, 230]), f1 = d1.f;
  const d2 = fit(b, 1, [-70, 200, -25, 95]), f2 = d2.f;
  const d3 = fit(b, 2, [-25, 145, -12, 72]), f3 = d3.f;
  const d4 = fit(b, 3, [-45, 60, -12, 112]), f4 = d4.f;
  return <Grid b={b}>
    {/* 1. unidad condensadora */}
    <Earth f={f1} x0={0} x1={140} y0={-30} y1={0} />
    <Ln f={f1} p={[[0, 0], [140, 0]]} w={0.4} />
    <Wall f={f1} x0={-15} x1={0} y0={-30} y1={220} />
    <Rect f={f1} x0={25} x1={115} y0={0} y1={8} fill={CONC} />
    <Rect f={f1} x0={30} x1={110} y0={8} y1={90} w={0.4} />
    {[20, 30, 40, 50, 60, 70, 80].map((y) => <Ln key={y} f={f1} p={[[33, y], [107, y]]} w={0.12} />)}
    <Rect f={f1} x0={45} x1={95} y0={88} y1={92} fill="#ddd" w={0.25} />
    <Ln f={f1} p={[[30, 242], [110, 242]]} w={0.2} dash="1.5 1" />
    <Pipe f={f1} p={[[30, 40], [8, 40], [8, 150], [0, 150]]} w={1.6} color="#333" />
    <Pipe f={f1} p={[[30, 35], [5, 35], [5, 146], [0, 146]]} w={0.5} />
    <Rect f={f1} x0={0} x1={14} y0={110} y1={135} w={0.35} />
    <Pipe f={f1} p={[[7, 110], [7, 100], [20, 85], [30, 70]]} w={0.7} color={GRAY} dash="1 .4" />
    <Dim f={f1} a={[0, 95]} b={[30, 95]} off={20} s={L("30 mín.", `12" MIN`)} />
    <Dim f={f1} a={[120, 0]} b={[120, 8]} off={6} s={L("8", `3"`)} />
    <NoteCol f={f1} x={d1.nx} y0={d1.ny} items={[
      [[70, 92], L("Unidad condensadora; despejes según fabricante (1.50 m libres arriba)", `CONDENSING UNIT; CLEARANCES PER MANUFACTURER, 60" CLEAR ABOVE TYP.`)],
      [[7, 125], L("Interruptor de seguridad (desconectador) a la vista de la unidad", "DISCONNECT WITHIN SIGHT OF UNIT (NEC 440.14); 120V GFCI SERVICE RECEPTACLE WITHIN 25'-0\" (NEC 210.63)")],
      [[20, 85], L("Tubo flexible tipo licuatite a la unidad", "LIQUIDTIGHT FLEXIBLE CONDUIT WHIP")],
      [[8, 100], L("Tubería de cobre de refrigeración con aislante elastomérico de 13 mm y protección UV", `REFRIGERANT LINE SET, SUCTION LINE INSULATED 1/2" MIN, UV PROTECTED; LOCKING CAPS ON PORTS (IRC M1411)`)],
      [[70, 4], L("Base de concreto de 8 cm, nivelada, con soportes antivibratorios", `3" CONC. OR COMPOSITE PAD, LEVEL, 3" MIN ABOVE GRADE (IRC M1305.1.4.1)`)],
    ]} />
    <Head d={d1} n={1} sheet={sheet} isEn={en} es="Unidad condensadora" en="Condensing unit pad" />

    {/* 2. manejadora horizontal con charola y condensados */}
    <Rect f={f2} x0={-70} x1={200} y0={-5} y1={0} fill={WOOD} w={0.25} />
    {[-60, -20, 20, 60, 100, 140, 180].map((x) => <Rect key={x} f={f2} x0={x} x1={x + 4} y0={-25} y1={-5} fill={WOOD} w={0.2} />)}
    <Shape f={f2} p={[[0, 0], [165, 0], [165, 6], [160, 6], [160, 2], [5, 2], [5, 6], [0, 6]]} fill="#ccc" w={0.3} />
    {[25, 140].map((x) => <Rect key={x} f={f2} x0={x - 4} x1={x + 4} y0={2} y1={10} fill="#999" w={0.15} />)}
    <Rect f={f2} x0={10} x1={155} y0={10} y1={60} fill="#eee" w={0.45} />
    <T f={f2} at={[82, 33]} s={L("MANEJADORA", "AIR HANDLER / FURNACE")} size={1.8} />
    <Rect f={f2} x0={155} x1={185} y0={5} y1={65} w={0.4} />
    <Pipe f={f2} p={[[185, 45], [200, 45]]} w={2.6} color="#999" />
    <Rect f={f2} x0={-15} x1={10} y0={5} y1={65} w={0.4} />
    <Ln f={f2} p={[[-6, 5], [-6, 65]]} w={0.6} dash="1.2 .6" />
    <Pipe f={f2} p={[[-15, 45], [-30, 45]]} w={2.6} color="#999" />
    <Pipe f={f2} p={[[20, 14], [-40, 14], [-40, 6], [-45, 3], [-50, 6], [-50, 14], [-70, 12]]} w={0.7} color={BLUE} />
    <Pipe f={f2} p={[[2, 4], [2, 70], [-70, 68]]} w={0.5} color={BLUE} dash="1.2 .6" />
    <Rect f={f2} x0={150} x1={158} y0={2} y1={7} fill="#111" w={0.1} />
    <Ln f={f2} p={[[155, 60], [155, 92]]} w={0.15} />
    <Dim f={f2} a={[165, 0]} b={[200, 0]} off={-14} s={L("0.75", `30"`)} />
    <NoteCol f={f2} x={d2.nx} y0={d2.ny} items={[
      [[82, 50], L("Manejadora (evaporadora) horizontal según fabricante; espacio de servicio de 0.75 m al frente", `HORIZONTAL AIR HANDLER / FURNACE PER MFR; 30" x 30" WORKING SPACE AT SERVICE SIDE (IRC M1305.1.3)`)],
      [[80, 1], L("Charola auxiliar con desagüe independiente o sensor de nivel", `SECONDARY DRAIN PAN 1 1/2" DEEP, 3" LARGER THAN UNIT, SEPARATE DRAIN TO CONSPICUOUS POINT OR WATER-LEVEL SWITCH (IRC M1411.3.1)`)],
      [[-45, 3], L("Drenaje de condensados Ø 19 mm con trampa y pendiente del 1 %", `3/4" PRIMARY CONDENSATE DRAIN, TRAPPED PER MFR, 1/8"/FT MIN SLOPE (IRC M1411.3)`)],
      [[-6, 40], L("Filtro en el retorno, accesible", "RETURN AIR FILTER, ACCESSIBLE FOR REPLACEMENT")],
      [[192, 45], L("Ducto de suministro sellado y aislado", "SUPPLY DUCTS SEALED, R-8 IN UNCONDITIONED ATTIC (IECC R403.3.1)")],
      [[-40, -2], L("Plataforma de servicio sobre la estructura", `24" WIDE PASSAGEWAY FROM ATTIC ACCESS, 20'-0" MAX; LIGHT AND RECEPTACLE AT UNIT (IRC M1305.1.3)`)],
    ]} />
    <Head d={d2} n={2} sheet={sheet} isEn={en} es="Manejadora con charola de condensados" en="Air handler in attic" />

    {/* 3. difusor de suministro en el plafón */}
    {en ? <>
      {[-20, 20, 60, 100, 140].map((x) => <Rect key={x} f={f3} x0={x - 1.9} x1={x + 1.9} y0={1.3} y1={24.8} fill={WOOD} w={0.25} />)}
      <Ln f={f3} p={Array.from({ length: 40 }, (_, i) => [-25 + i * 4.25, i % 2 ? 50 : 26] as XY)} w={0.12} />
    </> : <>
      <Rect f={f3} x0={-25} x1={145} y0={55} y1={67} fill={CONC} />
      {[0, 120].map((x) => <Ln key={x} f={f3} p={[[x, 1.3], [x, 55]]} w={0.2} />)}
    </>}
    <Rect f={f3} x0={-25} x1={145} y0={0} y1={1.3} fill="#fff" w={0.3} />
    <Shape f={f3} p={[[25, 1.3], [55, 1.3], [52, 18], [28, 18]]} fill="#fff" w={0.35} />
    <Pipe f={f3} p={[[-25, 42], [10, 42], [32, 36], [40, 28], [40, 18]]} w={4.2} color="#bbb" />
    <Pipe f={f3} p={[[-25, 42], [10, 42], [32, 36], [40, 28], [40, 18]]} w={3.0} color="#eee" />
    <Rect f={f3} x0={22} x1={58} y0={-1.6} y1={0} fill="#fff" w={0.3} />
    {[26, 31, 36, 41, 46, 51].map((x) => <Ln key={x} f={f3} p={[[x, -1.6], [x + 3, 0]]} w={0.12} />)}
    <Ln f={f3} p={[[-12, 35], [-12, 49]]} w={0.4} />
    <NoteCol f={f3} x={d3.nx} y0={d3.ny} items={[
      [[40, -1], L("Difusor de suministro (ver cuadro)", "SUPPLY REGISTER, SIZE AND CFM PER M-101")],
      [[52, 10], L("Bota de lámina galvanizada sellada al plafón", "SHEET METAL BOOT SEALED TO DRYWALL W/ MASTIC (IECC R402.4)")],
      [[10, 42], L("Ducto flexible aislado, extendido, con pocas curvas y sujeto con cincho", `R-8 FLEX DUCT, FULLY EXTENDED, SUPPORTED @ 4'-0" MAX W/ 1 1/2" STRAP`)],
      [[-12, 42], L("Compuerta de balanceo en la derivación", "BALANCING DAMPER AT TAKEOFF")],
      [[90, 0.6], L("Plafón de tablaroca", `1/2" GYP. BD. CEILING`)],
      en ? [[80, 30], `CEILING JOISTS PER S-102; ATTIC INSULATION OVER DUCTS`] as [XY, string] : [[120, 30], "Plafón suspendido de la losa con colgantes"] as [XY, string],
      [[34, 37], L("Sellar uniones con cinta de aluminio o mastique", "JOINTS SEALED, UL 181 TAPE OR MASTIC (IRC M1601.4.1)")],
    ]} />
    <Head d={d3} n={3} sheet={sheet} isEn={en} es="Difusor y ducto en plafón" en="Supply register and duct" />

    {/* 4. pasamuro de la línea de refrigeración */}
    <Wall f={f4} x0={0} x1={15} y0={0} y1={110} />
    <Ln f={f4} p={[[-1.5, 0], [-1.5, 110]]} w={0.3} /><Ln f={f4} p={[[16.5, 0], [16.5, 110]]} w={0.3} />
    <Shape f={f4} p={[[-3, 54], [18, 58], [18, 66], [-3, 62]]} fill="#fff" w={0.3} />
    <Pipe f={f4} p={[[60, 70], [30, 70], [20, 63], [0, 59], [-10, 57], [-20, 50], [-20, -10]]} w={2.2} color="#333" />
    <Pipe f={f4} p={[[60, 66], [30, 66], [20, 60], [0, 57], [-10, 55], [-16, 50], [-16, -10]]} w={0.5} />
    <Pipe f={f4} p={[[60, 62], [30, 62], [20, 58], [0, 56], [-8, 54], [-12, 50], [-12, -10]]} w={0.4} color={BLUE} />
    <Rect f={f4} x0={-27} x1={-8} y0={-10} y1={48} fill="none" w={0.35} />
    <Shape f={f4} p={[[-3, 53], [-6, 53], [-6, 63], [-3, 63]]} fill="#111" w={0.1} />
    <Shape f={f4} p={[[18, 57], [21, 57], [21, 67], [18, 67]]} fill="#111" w={0.1} />
    <Rect f={f4} x0={30} x1={60} y0={80} y1={105} />
    <NoteCol f={f4} x={d4.nx} y0={d4.ny} items={[
      [[8, 60], L("Pasamuro de PVC Ø 75 mm (3\") con pendiente hacia el exterior", `3" PVC SLEEVE THRU WALL, SLOPED DOWN TO EXTERIOR`)],
      [[-4.5, 58], L("Sellar con silicón el espacio entre tubos y pasamuro", "SEAL ANNULAR SPACE W/ SEALANT; FLASH AT WRB (IRC R703.4)")],
      [[40, 70], L("Línea de succión aislada, línea de líquido y cable de control", `INSULATED SUCTION LINE, LIQUID LINE AND CONTROL WIRE`)],
      [[40, 62], L("Drenaje de condensados con pendiente, descarga lejos de la cimentación", "CONDENSATE DRAIN SLOPED, DISCHARGE AWAY FROM FOUNDATION")],
      [[-17, 20], L("Canaleta cubre-tubos en el exterior, con protección UV", "LINE SET COVER ON EXTERIOR, UV PROTECTED")],
      [[45, 92], L("Evaporadora (minisplit) o manejadora", "INDOOR UNIT OR AIR HANDLER")],
    ]} />
    <Head d={d4} n={4} sheet={sheet} isEn={en} es="Pasamuro de la línea de refrigeración" en="Line set through exterior wall" />
  </Grid>;
}
