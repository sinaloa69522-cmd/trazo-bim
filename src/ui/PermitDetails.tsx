// Láminas de detalles constructivos adicionales del juego de EE.UU.:
// A-502 cimentación (crawl space, muro de bloque CMU, pilar y viga, poste de porche) y
// A-503 escalera, pasamanos, ventana y deck. Mismo sistema que A-501: SVG en mm, medidas en pulgadas.
import type { ReactNode } from "react";
import { Batt, box, DetailTitle, Ln, map, Note, Shape, type Frame, type XY } from "./PermitSheets";

type Box = { x: number; y: number; w: number; h: number };
const CONC = "#e6e6e6", PT = "#cfe3c8", WOOD = "#f2f2f2", METAL = "#9a9a9a";
const K = (inPerFt: number) => (inPerFt * 25.4) / 12;

/** Rejilla 2 × 2 con cuatro detalles; cada uno dibuja en su celda. */
function Grid({ b, children }: { b: Box; children: ReactNode }) {
  return (
    <svg className="pdetails" style={{ left: `${b.x}mm`, top: `${b.y}mm`, width: `${b.w}mm`, height: `${b.h}mm` }} viewBox={`0 0 ${b.w} ${b.h}`}>
      <line x1={b.w / 2} y1={4} x2={b.w / 2} y2={b.h - 4} stroke="#111" strokeWidth={0.2} />
      <line x1={4} y1={b.h / 2} x2={b.w - 4} y2={b.h / 2} stroke="#111" strokeWidth={0.2} />
      {children}
      <defs>
        <pattern id="gravel" width="2" height="2" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.25" fill="#555" /><circle cx="1.5" cy="1.4" r="0.2" fill="#555" />
        </pattern>
        {/* bloque de concreto: rayado cruzado */}
        <pattern id="cmu" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.6" height="1.6" fill="#fff" /><path d="M0 0V1.6M0 0H1.6" stroke="#555" strokeWidth="0.12" />
        </pattern>
        <pattern id="earth" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V1.4" stroke="#777" strokeWidth="0.12" />
        </pattern>
      </defs>
    </svg>
  );
}

const cells = (b: Box) => {
  const cw = b.w / 2, ch = b.h / 2;
  const cell = (i: number) => ({ x: (i % 2) * cw, y: Math.floor(i / 2) * ch });
  return { cw, ch, cell, nx: (i: number) => cell(i).x + cw * 0.56 };
};

/** Notas en columna, una debajo de otra, desde arriba de la celda. */
function Notes({ f, x, y0, items, gap = 6 }: { f: Frame; x: number; y0: number; items: [XY, string][]; gap?: number }) {
  let y = y0;
  return <>{items.map(([at, text], i) => {
    const el = <Note key={i} f={f} at={at} x={x} y={y} text={text} />;
    y += gap + Math.floor(text.length / 35) * 2.2;
    return el;
  })}</>;
}

/** Terreno: línea de rasante con rayado debajo. */
function Grade({ f, x0, x1, y = 0, depth = 3 }: { f: Frame; x0: number; x1: number; y?: number; depth?: number }) {
  return <>
    <Shape f={f} p={box(x0, y - depth, x1, y)} fill="url(#earth)" w={0} />
    <Ln f={f} p={[[x0, y], [x1, y]]} w={0.35} />
  </>;
}

/** Muro de bloque de concreto con hiladas de 8". */
function Cmu({ f, x0, x1, y0, y1 }: { f: Frame; x0: number; x1: number; y0: number; y1: number }) {
  const lines: ReactNode[] = [];
  for (let y = y0 + 8; y < y1 - 0.5; y += 8) lines.push(<Ln key={y} f={f} p={[[x0, y], [x1, y]]} w={0.15} />);
  return <><Shape f={f} p={box(x0, y0, x1, y1)} fill="url(#cmu)" w={0.3} />{lines}</>;
}

const Dot = ({ f, at, r = 0.55 }: { f: Frame; at: XY; r?: number }) => { const [x, y] = map(f, at); return <circle cx={x} cy={y} r={r} fill="#111" />; };
/** Corte (línea de interrupción) horizontal. */
const Break = ({ f, x0, x1, y }: { f: Frame; x0: number; x1: number; y: number }) => {
  const m = (x0 + x1) / 2, d = (x1 - x0) * 0.06;
  return <Ln f={f} p={[[x0 - 2, y], [m - d, y], [m - d / 2, y + 2], [m + d / 2, y - 2], [m + d, y], [x1 + 2, y]]} w={0.15} />;
};
const circle = (cx: number, cy: number, r: number, n = 24): XY[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)]);

// ---------- A-502: cimentación ----------

export function FoundationDetails({ box: b }: { box: Box }) {
  const { ch, cell, nx } = cells(b), S = "A-502";
  const half = K(0.5);
  const f5: Frame = { ox: cell(0).x + 30, oy: cell(0).y + 62, k: half };
  const f6: Frame = { ox: cell(1).x + 30, oy: cell(1).y + 52, k: half };
  const f7: Frame = { ox: cell(2).x + 38, oy: cell(2).y + 50, k: half };
  const f8: Frame = { ox: cell(3).x + 38, oy: cell(3).y + 54, k: half };
  return (
    <Grid b={b}>
      {/* 5. crawl space con muro de bloque */}
      <g>
        <Grade f={f5} x0={-24} x1={-1.2} />
        <Shape f={f5} p={box(-6, -26, 14, -18)} fill={CONC} w={0.35} />
        <Dot f={f5} at={[0, -22.5]} /><Dot f={f5} at={[8, -22.5]} />
        <Cmu f={f5} x0={0} x1={7.625} y0={-18} y1={22} />
        <Ln f={f5} p={[[9, -24], [3.8, -24], [3.8, 20]]} w={0.3} />
        <Shape f={f5} p={box(0.6, 7, 7, 13)} fill="#fff" w={0.2} />
        <Ln f={f5} p={[[0.6, 7], [7, 13]]} w={0.12} /><Ln f={f5} p={[[0.6, 13], [7, 7]]} w={0.12} />
        <Shape f={f5} p={box(0, 22, 5.5, 23.5)} fill={PT} w={0.25} />
        <Ln f={f5} p={[[2.75, 24.5], [2.75, 15], [4.5, 15]]} w={0.3} />
        <Shape f={f5} p={box(0, 23.5, 1.5, 32.75)} fill={WOOD} w={0.25} />
        <Ln f={f5} p={[[1.5, 23.5], [46, 23.5]]} w={0.25} /><Ln f={f5} p={[[1.5, 32.75], [46, 32.75]]} w={0.25} />
        <Ln f={f5} p={Array.from({ length: 22 }, (_, i) => [4 + i * 2, i % 2 ? 31.5 : 25] as XY)} w={0.12} />
        <Shape f={f5} p={box(0, 32.75, 46, 33.5)} fill={WOOD} w={0.2} />
        <Shape f={f5} p={box(0, 33.5, 5.5, 35)} fill={WOOD} w={0.25} />
        <Shape f={f5} p={box(0, 35, 5.5, 50)} w={0.25} />
        <Batt f={f5} x0={0} x1={5.5} y0={35} y1={50} />
        <Ln f={f5} p={[[-0.44, 20], [-0.44, 50]]} w={0.25} /><Ln f={f5} p={[[-1.2, 21], [-1.2, 50]]} w={0.25} />
        <Break f={f5} x0={-2} x1={8} y={51} />
        <Ln f={f5} p={[[7.625, -2], [46, -2]]} w={0.3} />
        <Ln f={f5} p={[[7.9, 10], [7.9, -1.7], [46, -1.7]]} w={0.2} dash="1.2 0.6" />
        <Ln f={f5} p={[[30, -2], [30, 23.5]]} w={0.12} dash="0.6 0.6" />
        <Notes f={f5} x={nx(0)} y0={cell(0).y + 10} items={[
          [[2.75, 44], `2x6 STUDS @ 16" O.C. W/ R-20 BATT`],
          [[20, 33.1], `3/4" T&G OSB SUBFLOOR, GLUED AND NAILED`],
          [[24, 28], `2x10 FLOOR JOISTS @ 16" O.C. PER S-102, R-19 BATT W/ SUPPORTS`],
          [[0.75, 28], `2x10 RIM JOIST`],
          [[4.5, 22.8], `2x6 P.T. SILL PLATE W/ SILL SEALER`],
          [[2.75, 18], `1/2" DIA. ANCHOR BOLT @ 6'-0" O.C. IN GROUTED CELL`],
          [[5.5, 0], `8" CMU STEM WALL, #4 VERT. @ 48" O.C., GROUT REINFORCED CELLS`],
          [[6.5, 10], `FOUNDATION VENT, 1 SQ FT PER 150 SQ FT OF CRAWL SPACE (IRC R408.1)`],
          [[20, -1.7], `6 MIL POLY VAPOR RETARDER, LAP 6", TURN UP 12" ON WALL`],
          [[30, 12], `18" MIN CLEAR, GROUND TO BOTTOM OF JOISTS (IRC R317.1)`],
          [[11, -22], `20" x 8" CONC. FOOTING W/ (2) #4 CONT.`],
          [[-12, -0.5], `FINISH GRADE, BOTTOM OF FTG. 12" MIN BELOW GRADE OR FROST DEPTH`],
        ]} />
        <DetailTitle x={cell(0).x + 6} y={ch - 9} n={1} sheet={S} title="Crawl space at exterior wall" scale={`1/2" = 1'-0"`} />
      </g>

      {/* 6. muro de bloque con losa */}
      <g>
        <Grade f={f6} x0={-24} x1={-1.2} />
        <Shape f={f6} p={box(-6, -30, 14, -20)} fill={CONC} w={0.35} />
        <Dot f={f6} at={[0, -25.5]} /><Dot f={f6} at={[8, -25.5]} />
        <Cmu f={f6} x0={0} x1={7.625} y0={-20} y1={8} />
        <Ln f={f6} p={[[0, 4], [7.625, 4]]} w={0.15} />
        <Dot f={f6} at={[3.8, 6]} />
        <Ln f={f6} p={[[9, -28], [3.8, -28], [3.8, 6]]} w={0.3} />
        <Shape f={f6} p={box(7.625, -16, 8.625, 4)} fill="#fff" w={0.2} />
        <Ln f={f6} p={Array.from({ length: 11 }, (_, i) => [i % 2 ? 8.5 : 7.75, -16 + i * 2] as XY)} w={0.1} />
        <Shape f={f6} p={box(8.625, 0, 46, 4)} fill="url(#gravel)" w={0.15} />
        <Shape f={f6} p={box(8.625, 4, 46, 8)} fill={CONC} w={0.3} />
        <Ln f={f6} p={[[8.625, 4], [46, 4]]} w={0.25} dash="1 0.6" />
        <Shape f={f6} p={box(0, 8, 5.5, 9.5)} fill={PT} w={0.25} />
        <Ln f={f6} p={[[2.75, 10.5], [2.75, -1], [4.5, -1]]} w={0.3} />
        <Shape f={f6} p={box(0, 9.5, 5.5, 36)} w={0.25} />
        <Batt f={f6} x0={0} x1={5.5} y0={9.5} y1={36} />
        <Ln f={f6} p={[[-0.44, 6], [-0.44, 36]]} w={0.25} /><Ln f={f6} p={[[-1.2, 6], [-1.2, 36]]} w={0.25} />
        <Break f={f6} x0={-2} x1={8} y={37} />
        <Notes f={f6} x={nx(1)} y0={cell(1).y + 10} items={[
          [[2.75, 28], `2x6 STUDS @ 16" O.C. W/ R-20 BATT`],
          [[4.5, 8.8], `2x6 P.T. SILL PLATE W/ SILL SEALER`],
          [[2.75, 2], `1/2" DIA. A.B. @ 6'-0" O.C., 7" MIN EMBED. IN GROUTED CELL`],
          [[30, 6], `4" CONC. SLAB OVER 6 MIL VAPOR RETARDER OVER 4" GRAVEL`],
          [[8.1, -8], `1" RIGID INSUL. (R-5) AT SLAB EDGE, 24" DEEP`],
          [[3.8, 6], `BOND BEAM AT TOP COURSE W/ (1) #4 CONT.`],
          [[2, -10], `8" CMU STEM WALL, #4 VERT. @ 48" O.C. W/ STD. HOOK, GROUT CELLS W/ REBAR`],
          [[-10, -0.4], `6" MIN CLEARANCE GRADE TO WOOD (IRC R317.1)`],
          [[11, -25], `20" x 10" CONC. FOOTING W/ (2) #4 CONT.`],
          [[-6, -30], `12" MIN BELOW GRADE OR FROST DEPTH`],
        ]} />
        <DetailTitle x={cell(1).x + 6} y={ch - 9} n={2} sheet={S} title="CMU stem wall with slab" scale={`1/2" = 1'-0"`} />
      </g>

      {/* 7. pilar y viga en crawl space */}
      <g>
        <Grade f={f7} x0={-30} x1={30} />
        <Ln f={f7} p={[[-30, 0.4], [30, 0.4]]} w={0.2} dash="1.2 0.6" />
        <Shape f={f7} p={box(-12, -22, 12, -12)} fill={CONC} w={0.35} />
        {[-6, 0, 6].map((x) => <Dot key={x} f={f7} at={[x, -19]} />)}
        <Ln f={f7} p={[[-10, -19], [10, -19]]} w={0.25} />
        <Cmu f={f7} x0={-8} x1={8} y0={-12} y1={18} />
        <Shape f={f7} p={box(-8, 18, 8, 19.5)} fill={PT} w={0.25} />
        {[-2.25, -0.75, 0.75].map((x) => <Shape key={x} f={f7} p={box(x, 19.5, x + 1.5, 28.75)} fill={WOOD} w={0.25} />)}
        <Ln f={f7} p={[[-4.5, 14], [-4.5, 22], [-2.25, 22]]} w={0.45} /><Ln f={f7} p={[[4.5, 14], [4.5, 22], [2.25, 22]]} w={0.45} />
        <Ln f={f7} p={[[-30, 28.75], [30, 28.75]]} w={0.25} /><Ln f={f7} p={[[-30, 38], [30, 38]]} w={0.25} />
        <Shape f={f7} p={box(-30, 38, 30, 38.75)} fill={WOOD} w={0.2} />
        <Ln f={f7} p={[[-30, 28.75], [-30, 38.75]]} w={0.15} dash="0.6 0.6" /><Ln f={f7} p={[[30, 28.75], [30, 38.75]]} w={0.15} dash="0.6 0.6" />
        <Notes f={f7} x={nx(2)} y0={cell(2).y + 10} items={[
          [[18, 38.4], `3/4" T&G OSB SUBFLOOR`],
          [[16, 33], `2x10 FLOOR JOISTS @ 16" O.C., CLIP OR TOENAIL TO GIRDER`],
          [[0, 24], `(3) 2x10 GIRDER, SPAN PER IRC TABLE R602.7(1), SPLICE OVER PIERS ONLY`],
          [[4.5, 18], `2x P.T. PAD W/ STRAP (SIMPSON MSTA OR EQ.) GIRDER TO PIER`],
          [[-5, 4], `16" x 16" CMU PIER, CELLS GROUTED SOLID`],
          [[20, 0.4], `6 MIL VAPOR RETARDER OVER CRAWL SPACE GROUND`],
          [[6, -19], `24" x 24" x 10" CONC. PAD W/ #4 @ 8" O.C. EACH WAY`],
          [[-12, -22], `PIERS @ 8'-0" O.C. MAX, SEE FOUNDATION PLAN S-101`],
        ]} />
        <DetailTitle x={cell(2).x + 6} y={b.h - 9} n={3} sheet={S} title="Pier and girder at crawl space" scale={`1/2" = 1'-0"`} />
      </g>

      {/* 8. poste de porche / deck sobre dado de concreto */}
      <g>
        <Grade f={f8} x0={-30} x1={30} />
        <Shape f={f8} p={box(-10, -30, 10, -22)} fill={CONC} w={0.35} />
        <Shape f={f8} p={box(-6, -22, 6, 2)} fill={CONC} w={0.35} />
        <Ln f={f8} p={[[-2, -28], [-2, 0]]} w={0.25} /><Ln f={f8} p={[[2, -28], [2, 0]]} w={0.25} />
        <Ln f={f8} p={[[-8, -27], [8, -27]]} w={0.25} />
        <Shape f={f8} p={box(-3.4, 2, 3.4, 3)} fill={METAL} w={0.2} />
        <Ln f={f8} p={[[-3.4, 3], [-3.4, 9]]} w={0.35} /><Ln f={f8} p={[[3.4, 3], [3.4, 9]]} w={0.35} />
        <Ln f={f8} p={[[0, 2], [0, -6]]} w={0.35} />
        <Shape f={f8} p={box(-2.75, 3, 2.75, 40)} fill={WOOD} w={0.3} />
        <Ln f={f8} p={[[-2.75, 3], [2.75, 40]]} w={0.12} /><Ln f={f8} p={[[2.75, 3], [-2.75, 40]]} w={0.12} />
        <Break f={f8} x0={-5} x1={5} y={41} />
        <Notes f={f8} x={nx(3)} y0={cell(3).y + 10} items={[
          [[0, 30], `6x6 P.T. POST (UC4A GROUND CONTACT)`],
          [[3.4, 6], `SIMPSON ABU66Z POST BASE W/ 1" STANDOFF, OR EQ.`],
          [[0, -4], `5/8" DIA. ANCHOR, EPOXY OR CAST-IN PER MFR.`],
          [[5, -8], `12" DIA. CONC. PIER (SONOTUBE), 2" MIN ABOVE GRADE`],
          [[2, -15], `(2) #4 VERT.`],
          [[7, -26], `20" x 20" x 8" CONC. FOOTING W/ (2) #4 E.W.`],
          [[-10, -30], `BOTTOM 12" MIN BELOW GRADE OR FROST DEPTH (IRC R403.1.4)`],
        ]} />
        <DetailTitle x={cell(3).x + 6} y={b.h - 9} n={4} sheet={S} title="Porch / deck post footing" scale={`1/2" = 1'-0"`} />
      </g>
    </Grid>
  );
}

// ---------- A-503: escalera, pasamanos, ventana y deck ----------

export function StairDetails({ box: b }: { box: Box }) {
  const { ch, cell, nx } = cells(b), S = "A-503";
  const R = 7.5, T = 10, N = 5;
  const f9: Frame = { ox: cell(0).x + 22, oy: cell(0).y + 92, k: K(0.5) };
  const f10: Frame = { ox: cell(1).x + 42, oy: cell(1).y + 52, k: K(3) };
  const f11: Frame = { ox: cell(2).x + 40, oy: cell(2).y + 88, k: K(1) };
  const f12: Frame = { ox: cell(3).x + 50, oy: cell(3).y + 62, k: K(1) };
  const nose = (i: number): XY => [i * T - 1, (i + 1) * R];
  return (
    <Grid b={b}>
      {/* 9. sección de escalera */}
      <g>
        <Shape f={f9} p={box(-14, -4, 52, 0)} fill={CONC} w={0.3} />
        {Array.from({ length: N - 1 }, (_, i) => <Shape key={i} f={f9} p={box(i * T - 1, (i + 1) * R - 1, (i + 1) * T, (i + 1) * R)} fill={WOOD} w={0.25} />)}
        {Array.from({ length: N }, (_, i) => <Ln key={i} f={f9} p={[[i * T, i * R], [i * T, (i + 1) * R - 1]]} w={0.25} />)}
        <Ln f={f9} p={[[8, 0], [(N - 1) * T, (N - 1) * R - 3]]} w={0.3} />
        <Ln f={f9} p={[[(N - 1) * T, (N - 1) * R - 3], [(N - 1) * T, N * R - 11.25]]} w={0.3} />
        {/* piso de arriba */}
        <Shape f={f9} p={box((N - 1) * T, N * R - 10, 52, N * R)} w={0.25} />
        <Ln f={f9} p={[[(N - 1) * T, N * R - 0.75], [52, N * R - 0.75]]} w={0.15} />
        <Ln f={f9} p={[[(N - 1) * T + 1.5, N * R - 10], [(N - 1) * T + 1.5, N * R - 0.75]]} w={0.15} />
        {/* línea de narices y pasamanos a 36" */}
        <Ln f={f9} p={[nose(0), nose(N - 1)]} w={0.15} dash="1 0.6" />
        <Ln f={f9} p={[[nose(0)[0], nose(0)[1] + 36], [nose(N - 1)[0] + 4, nose(N - 1)[1] + 36 + 3]]} w={0.7} />
        {[0, 2, 4].map((i) => { const [x, y] = nose(Math.min(i, N - 1)); return <Ln key={i} f={f9} p={[[x + 3, y + 33], [x + 3, y + 36]]} w={0.2} />; })}
        <Ln f={f9} p={[[nose(1)[0] + 6, nose(1)[1]], [nose(1)[0] + 6, nose(1)[1] + 36]]} w={0.12} dash="0.5 0.5" />
        <Notes f={f9} x={nx(0)} y0={cell(0).y + 10} items={[
          [[nose(3)[0] + 6, nose(3)[1] + 38.5], `HANDRAIL 34"-38" ABOVE NOSINGS, CONTINUOUS FULL FLIGHT, SEE DETAIL 2`],
          [[nose(1)[0] + 6, nose(1)[1] + 18], `34" MIN / 38" MAX MEASURED VERTICALLY FROM NOSING LINE`],
          [[nose(2)[0], nose(2)[1] - 0.5], `3/4" MIN TO 1 1/4" MAX NOSING`],
          [[2 * T, 2 * R + 2], `7 3/4" MAX RISER, 4" MIN; VARIATION 3/8" MAX (IRC R311.7.5)`],
          [[3 * T - 5, 4 * R], `10" MIN TREAD DEPTH`],
          [[24, 18.4], `(3) 2x12 STRINGERS, P.T. WHERE IN CONTACT W/ CONCRETE`],
          [[46, N * R - 5], `FLOOR FRAMING PER S-102, DOUBLE HEADER AT STAIR OPENING`],
          [[-8, -2], `36" MIN CLEAR WIDTH, 6'-8" MIN HEADROOM (IRC R311.7.1-2)`],
          [[5, 1], `GUARD 36" MIN AT OPEN SIDES MORE THAN 30" ABOVE FLOOR, 4" SPHERE RULE`],
          [[15, 6], `ENCLOSED USABLE SPACE UNDER STAIR: 1/2" GYP. BD. (IRC R302.7)`],
        ]} />
        <DetailTitle x={cell(0).x + 6} y={ch - 9} n={1} sheet={S} title="Typical stair section" scale={`1/2" = 1'-0"`} />
      </g>

      {/* 10. pasamanos */}
      <g>
        <Shape f={f10} p={box(-3.5, -5, -0.5, 5)} fill={WOOD} w={0.3} />
        <Ln f={f10} p={[[-3.5, -5], [-0.5, 5]]} w={0.1} /><Ln f={f10} p={[[-3.5, 5], [-0.5, -5]]} w={0.1} />
        <Shape f={f10} p={box(-0.5, -5, 0, 5)} fill="#fff" w={0.25} />
        <Break f={f10} x0={-3.5} x1={0} y={5.4} /><Break f={f10} x0={-3.5} x1={0} y={-5.4} />
        <Shape f={f10} p={box(0, -2.6, 0.35, 0.6)} fill={METAL} w={0.2} />
        <Ln f={f10} p={[[0.35, -1.6], [2.375, -1.6], [2.375, -0.9]]} w={0.5} />
        <Ln f={f10} p={[[-2, -0.5], [0.2, -0.5]]} w={0.2} /><Ln f={f10} p={[[-2, -2], [0.2, -2]]} w={0.2} />
        <Shape f={f10} p={circle(2.375, 0, 0.875)} fill={WOOD} w={0.35} />
        <Ln f={f10} p={[[0, 2.2], [1.5, 2.2]]} w={0.12} />
        <Ln f={f10} p={[[0, 1.8], [0, 2.6]]} w={0.12} /><Ln f={f10} p={[[1.5, 1.8], [1.5, 2.6]]} w={0.12} />
        <Notes f={f10} x={nx(1)} y0={cell(1).y + 10} items={[
          [[2.9, 0.5], `1 3/4" DIA. HARDWOOD HANDRAIL (TYPE I: 1 1/4" TO 2" DIA.) (IRC R311.7.8.5)`],
          [[0.75, 2.2], `1 1/2" MIN CLEAR BETWEEN HANDRAIL AND WALL`],
          [[1.4, -1.6], `METAL HANDRAIL BRACKET @ 4'-0" O.C. MAX, 2 SCREWS INTO BLOCKING`],
          [[-2, 3], `2x BLOCKING BETWEEN STUDS AT EACH BRACKET`],
          [[-0.25, -4], `1/2" GYP. BD.`],
          [[2.375, -0.875], `RAIL AND BRACKETS FOR 200 LB CONCENTRATED LOAD (IRC TABLE R301.5)`],
          [[3.25, 0], `ENDS RETURNED TO WALL OR TERMINATED IN NEWEL POSTS`],
        ]} />
        <DetailTitle x={cell(1).x + 6} y={ch - 9} n={2} sheet={S} title="Handrail at wall" scale={`3" = 1'-0"`} />
      </g>

      {/* 11. cabezal y alféizar de ventana */}
      <g>
        <Shape f={f11} p={box(0, -6, 5.5, -1.5)} w={0.25} />
        <Shape f={f11} p={box(0, -1.5, 5.5, 0)} fill={WOOD} w={0.25} />
        <Ln f={f11} p={[[-1.6, 0.25], [4.2, 0.25], [4.2, 1]]} w={0.45} />
        <Shape f={f11} p={box(-0.6, 0.5, 3.6, 2.6)} fill="#ddd" w={0.25} />
        <Ln f={f11} p={[[1.2, 2.6], [1.2, 12]]} w={0.15} /><Ln f={f11} p={[[2.2, 2.6], [2.2, 12]]} w={0.15} />
        <Break f={f11} x0={-2} x1={7} y={13} />
        <Ln f={f11} p={[[1.2, 14], [1.2, 24]]} w={0.15} /><Ln f={f11} p={[[2.2, 14], [2.2, 24]]} w={0.15} />
        <Shape f={f11} p={box(-0.6, 24, 3.6, 26.1)} fill="#ddd" w={0.25} />
        <Shape f={f11} p={box(0, 26.6, 5.5, 35.85)} fill="#d9d9d9" w={0.35} />
        <Ln f={f11} p={[[0, 31.2], [5.5, 31.2]]} w={0.12} />
        <Ln f={f11} p={[[-0.44, 36], [-0.44, 27.2], [-2.1, 26.6], [-2.1, 25.9]]} w={0.4} />
        <Ln f={f11} p={[[-0.44, -6], [-0.44, 0.2]]} w={0.25} />
        <Ln f={f11} p={[[-1.3, -6], [-1.3, 0]]} w={0.25} /><Ln f={f11} p={[[-1.3, 27.6], [-1.3, 36]]} w={0.25} />
        <Shape f={f11} p={circle(-0.9, 1.2, 0.3, 10)} fill="#fff" w={0.15} />
        <Shape f={f11} p={circle(-0.9, 25.2, 0.3, 10)} fill="#fff" w={0.15} />
        <Shape f={f11} p={box(3.6, 0.5, 7.2, 1.25)} fill={WOOD} w={0.25} />
        <Shape f={f11} p={box(5.5, -4, 6.25, 0.5)} fill={WOOD} w={0.2} />
        <Ln f={f11} p={[[6, -6], [6, -4]]} w={0.2} /><Ln f={f11} p={[[6, 26.1], [6, 36]]} w={0.2} />
        <Notes f={f11} x={nx(2)} y0={cell(2).y + 10} items={[
          [[-0.44, 33], `WRB LAPPED OVER HEAD FLASHING, SHINGLE FASHION`],
          [[-1.6, 26.4], `METAL HEAD FLASHING W/ END DAMS`],
          [[3, 33], `(2) 2x10 HEADER PER SCHEDULE ON S-103`],
          [[-0.9, 25.2], `SEALANT AND BACKER ROD AT PERIMETER`],
          [[1.7, 18], `WINDOW PER SCHEDULE, U-0.30 MAX, NAIL FLANGE SET IN SEALANT`],
          [[3, 0.25], `SELF-ADHERED SILL PAN FLASHING SLOPED TO EXTERIOR, TURN UP 6" AT JAMBS`],
          [[5.4, 0.9], `WOOD STOOL AND APRON`],
          [[2.75, -0.75], `2x6 ROUGH SILL, CRIPPLES BELOW @ 16" O.C.`],
          [[-1.3, -4], `SIDING OVER WRB OVER 7/16" OSB SHEATHING`],
          [[6, -5], `1/2" GYP. BD.`],
        ]} />
        <DetailTitle x={cell(2).x + 6} y={b.h - 9} n={3} sheet={S} title="Window head and sill" scale={`1" = 1'-0"`} />
      </g>

      {/* 12. ledger de deck en la casa */}
      <g>
        <Shape f={f12} p={box(0, 0, 1.5, 9.25)} fill={WOOD} w={0.3} />
        <Ln f={f12} p={[[1.5, 0], [12, 0]]} w={0.25} /><Ln f={f12} p={[[1.5, 9.25], [12, 9.25]]} w={0.25} />
        <Shape f={f12} p={box(0, 9.25, 12, 10)} fill={WOOD} w={0.2} />
        <Shape f={f12} p={box(0, 10, 5.5, 11.5)} fill={WOOD} w={0.25} />
        <Shape f={f12} p={box(0, 11.5, 5.5, 22)} w={0.25} />
        <Batt f={f12} x0={0} x1={5.5} y0={11.5} y1={22} />
        <Break f={f12} x0={-2} x1={8} y={23} />
        <Ln f={f12} p={[[-0.44, -4], [-0.44, 22]]} w={0.25} />
        <Ln f={f12} p={[[-1.2, 11], [-1.2, 22]]} w={0.25} />
        <Shape f={f12} p={box(-1.94, -0.25, -0.44, 9)} fill={PT} w={0.3} />
        <Ln f={f12} p={[[-0.44, 11.5], [-0.44, 9.4], [-2.5, 9.2], [-2.5, 8.4]]} w={0.45} />
        {[2.2, 6.6].map((y) => <g key={y}><Ln f={f12} p={[[-2.7, y], [2.4, y]]} w={0.45} /><Ln f={f12} p={[[-2.2, y - 0.9], [-2.2, y + 0.9]]} w={0.3} /></g>)}
        <Ln f={f12} p={[[-20, -0.25], [-1.94, -0.25]]} w={0.25} /><Ln f={f12} p={[[-20, 9], [-1.94, 9]]} w={0.25} />
        <Ln f={f12} p={[[-1.94, -0.75], [-4.5, -0.75], [-4.5, 6.5]]} w={0.35} />
        {Array.from({ length: 3 }, (_, i) => <Shape key={i} f={f12} p={box(-19 + i * 5.625, 9, -19 + i * 5.625 + 5.5, 10)} fill={PT} w={0.2} />)}
        <Ln f={f12} p={[[-20, -0.25], [-20, 10]]} w={0.15} dash="0.6 0.6" />
        <Notes f={f12} x={nx(3)} y0={cell(3).y + 10} items={[
          [[-1.2, 16], `SIDING AND WRB, BOTTOM 1" MIN ABOVE DECKING`],
          [[-1.5, 9.3], `METAL Z-FLASHING OVER LEDGER, WRB LAPPED OVER FLASHING`],
          [[-1.2, 4.5], `2x10 P.T. LEDGER, SAME DEPTH AS DECK JOISTS`],
          [[-2.7, 2.2], `1/2" DIA. THRU-BOLTS OR LAG SCREWS @ 16" O.C. STAGGERED (IRC R507.9.1.3)`],
          [[0.75, 5], `2x10 RIM JOIST OF HOUSE, NO ATTACHMENT TO BRICK VENEER OR CANTILEVERS`],
          [[-12, 4], `2x10 P.T. DECK JOISTS @ 16" O.C.`],
          [[-4.5, 3], `GALV. JOIST HANGER (SIMPSON LUS210Z OR EQ.)`],
          [[-14, 9.5], `5/4x6 P.T. OR COMPOSITE DECKING, 1/8" GAPS`],
          [[8, 9.6], `FLOOR FRAMING PER S-102`],
        ]} />
        <DetailTitle x={cell(3).x + 6} y={b.h - 9} n={4} sheet={S} title="Deck ledger at house" scale={`1" = 1'-0"`} />
      </g>
    </Grid>
  );
}
