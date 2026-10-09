import { dwgSegments, type CadImportResult, type DwgBoundaryEdge, type DwgBoundaryPath, type DwgDatabaseLike, type DwgEntity, type ImportedSegment } from "./cadImport";

export type { ImportedSegment };
export type DxfImportResult = CadImportResult;

type Pair = [number, string];

const DEG = Math.PI / 180;

/**
 * Lee un DXF ASCII con lo mismo que un DWG: líneas, polilíneas, arcos, círculos, elipses, splines, textos,
 * bloques (con sus atributos), cotas y sombreados, en metros y con el eje Y hacia abajo como la planta.
 * Si el archivo no declara unidades y el dibujo mide más de 1000, se asume que está en mm.
 */
export function parseDxf(text: string): DxfImportResult {
  const lines = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) { i--; continue; }
    // los valores de texto conservan sus espacios iniciales; los demás se recortan
    pairs.push([code, code === 1 || code === 3 ? lines[i + 1].replace(/\s+$/, "") : lines[i + 1].trim()]);
  }

  let insunits = 0;
  for (let i = 0; i < pairs.length - 1; i++)
    if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS" && pairs[i + 1][0] === 70) insunits = parseInt(pairs[i + 1][1], 10);

  // cada entidad va desde un código 0 hasta el siguiente, dentro de su sección
  const raw: { type: string; data: Pair[]; section: string }[] = [];
  let section = "";
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c !== 0) continue;
    if (v === "SECTION") { section = pairs[i + 1]?.[0] === 2 ? pairs[i + 1][1] : ""; continue; }
    if (v === "ENDSEC") { section = ""; continue; }
    if (section !== "ENTITIES" && section !== "BLOCKS") continue;
    const data: Pair[] = [];
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) data.push(pairs[j++]);
    raw.push({ type: v, data, section });
  }

  const blocks: { name: string; handle: string; basePoint: { x: number; y: number }; entities: DwgEntity[] }[] = [];
  const top: DwgEntity[] = [];
  let block: (typeof blocks)[number] | null = null;
  for (let k = 0; k < raw.length; k++) {
    const { type, data, section } = raw[k];
    if (type === "BLOCK") {
      block = { name: str(data, 2), handle: "", basePoint: pt(data, 10), entities: [] };
      blocks.push(block);
      continue;
    }
    if (type === "ENDBLK") { block = null; continue; }
    let e: DwgEntity | null;
    if (type === "POLYLINE") {
      const verts: Pair[][] = [];
      while (raw[k + 1]?.type === "VERTEX") verts.push(raw[++k].data);
      e = polyline(data, verts);
    } else if (type === "INSERT") {
      const atts: Pair[][] = [];
      while (raw[k + 1]?.type === "ATTRIB") atts.push(raw[++k].data);
      e = toEntity(type, data);
      if (e) e.attribs = atts.map(attrib);
    } else if (type === "SEQEND" || type === "VERTEX" || type === "ATTRIB") continue;
    else e = toEntity(type, data);
    if (!e) continue;
    if (section === "BLOCKS") block?.entities.push(e);
    // lo que va al espacio papel (código 67) no es parte de la planta
    else if (num(data, 67) !== 1) top.push(e);
  }

  const db: DwgDatabaseLike = { header: { INSUNITS: insunits }, entities: top, tables: { BLOCK_RECORD: { entries: blocks } } };
  return dwgSegments(db);
}

const find = (d: Pair[], code: number) => d.find((x) => x[0] === code);
const num = (d: Pair[], code: number, def = 0) => { const p = find(d, code); return p ? parseFloat(p[1]) : def; };
const str = (d: Pair[], code: number) => find(d, code)?.[1] ?? "";
const pt = (d: Pair[], code: number) => ({ x: num(d, code), y: num(d, code + 10) });
const has = (d: Pair[], code: number) => !!find(d, code);
/** Puntos repetidos de un código (10/20, 11/21…) en orden. */
const pts = (d: Pair[], code: number) => {
  const out: { x: number; y: number }[] = [];
  for (const [c, v] of d) {
    if (c === code) out.push({ x: parseFloat(v), y: 0 });
    else if (c === code + 10 && out.length) out[out.length - 1].y = parseFloat(v);
  }
  return out;
};

function common(type: string, d: Pair[]): DwgEntity {
  return { type, layer: str(d, 8) || "0", isVisible: num(d, 60) !== 1 };
}

function polyline(d: Pair[], verts: Pair[][]): DwgEntity | null {
  const flag = num(d, 70);
  // mallas y caras múltiples (16, 64) no son planta
  if (flag & (16 | 64)) return { ...common("POLYMESH", d) };
  return {
    ...common(flag & 8 ? "POLYLINE3D" : "POLYLINE2D", d), flag,
    vertices: verts.filter((v) => !(num(v, 70) & 16)).map((v) => ({ ...pt(v, 10), bulge: num(v, 42) })),
  };
}

function attrib(d: Pair[]): DwgEntity {
  return {
    ...common("ATTRIB", d), isVisible: num(d, 60) !== 1 && !(num(d, 70) & 1),
    text: { text: str(d, 1), startPoint: pt(d, 10), endPoint: has(d, 11) ? pt(d, 11) : undefined, textHeight: num(d, 40), rotation: num(d, 50) * DEG, halign: num(d, 72), valign: num(d, 74) },
  };
}

function toEntity(type: string, d: Pair[]): DwgEntity | null {
  const e = common(type, d);
  switch (type) {
    case "LINE": return { ...e, startPoint: pt(d, 10), endPoint: pt(d, 11) };
    case "LWPOLYLINE": {
      // el abombamiento (42) va detrás de su vértice
      const vs: { x: number; y: number; bulge: number }[] = [];
      for (const [c, v] of d) {
        if (c === 10) vs.push({ x: parseFloat(v), y: 0, bulge: 0 });
        else if (c === 20 && vs.length) vs[vs.length - 1].y = parseFloat(v);
        else if (c === 42 && vs.length) vs[vs.length - 1].bulge = parseFloat(v);
      }
      return { ...e, flag: num(d, 70), vertices: vs };
    }
    case "ARC": return { ...e, center: pt(d, 10), radius: num(d, 40), startAngle: num(d, 50) * DEG, endAngle: num(d, 51) * DEG };
    case "CIRCLE": return { ...e, center: pt(d, 10), radius: num(d, 40) };
    case "ELLIPSE": return { ...e, center: pt(d, 10), majorAxisEndPoint: pt(d, 11), axisRatio: num(d, 40, 1), startAngle: num(d, 41), endAngle: num(d, 42, Math.PI * 2) };
    case "SPLINE": return { ...e, controlPoints: pts(d, 10), fitPoints: pts(d, 11) };
    case "SOLID": case "TRACE": case "3DFACE":
      return { ...e, corner1: pt(d, 10), corner2: pt(d, 11), corner3: pt(d, 12), corner4: has(d, 13) ? pt(d, 13) : undefined };
    case "TEXT":
      return { ...e, text: str(d, 1), startPoint: pt(d, 10), endPoint: has(d, 11) ? pt(d, 11) : undefined, textHeight: num(d, 40), rotation: num(d, 50) * DEG, halign: num(d, 72), valign: num(d, 73) };
    case "MTEXT":
      return {
        ...e, text: d.filter((x) => x[0] === 3).map((x) => x[1]).join("") + str(d, 1), insertionPoint: pt(d, 10), textHeight: num(d, 40),
        attachmentPoint: num(d, 71, 1), direction: has(d, 11) ? pt(d, 11) : undefined, rotation: num(d, 50) * DEG, lineSpacing: num(d, 44, 1),
      };
    case "INSERT":
      return {
        ...e, name: str(d, 2), insertionPoint: pt(d, 10), xScale: num(d, 41, 1), yScale: num(d, 42, 1), rotation: num(d, 50) * DEG,
        columnCount: num(d, 70, 1), rowCount: num(d, 71, 1), columnSpacing: num(d, 44), rowSpacing: num(d, 45),
      };
    case "DIMENSION": return { ...e, name: str(d, 2) };
    case "HATCH": return hatch(e, d);
    default: return e;
  }
}

/** HATCH: los códigos se repiten por contorno y por arista, así que se leen en orden. */
function hatch(e: DwgEntity, d: Pair[]): DwgEntity {
  let i = 0;
  const peek = () => d[i]?.[0];
  const take = (code: number, def = 0) => { if (d[i]?.[0] === code) return parseFloat(d[i++][1]); return def; };
  const takeStr = (code: number) => (d[i]?.[0] === code ? d[i++][1] : "");
  const xy = (cx: number) => { const x = take(cx), y = take(cx + 10); return { x, y }; };
  const seek = (code: number) => { while (i < d.length && d[i][0] !== code) i++; return i < d.length; };

  let patternName = "", solidFill = 0;
  while (i < d.length && peek() !== 91) {
    if (peek() === 2) patternName = takeStr(2);
    else if (peek() === 70) solidFill = take(70);
    else i++;
  }
  const paths: DwgBoundaryPath[] = [];
  const nLoops = take(91);
  for (let l = 0; l < nLoops && seek(92); l++) {
    const flag = take(92);
    if (flag & 2) {
      const hasBulge = take(72), closed = take(73), n = take(93);
      const vertices: { x: number; y: number; bulge: number }[] = [];
      for (let v = 0; v < n; v++) { const p = xy(10); vertices.push({ ...p, bulge: hasBulge ? take(42) : 0 }); }
      paths.push({ vertices, isClosed: !!closed });
    } else {
      const n = take(93), edges: DwgBoundaryEdge[] = [];
      for (let k = 0; k < n && seek(72); k++) {
        const type = take(72);
        if (type === 1) edges.push({ type, start: xy(10), end: xy(11) });
        else if (type === 2) {
          const center = xy(10), radius = take(40), a0 = take(50), a1 = take(51), ccw = take(73, 1);
          edges.push({ type, center, radius, startAngle: a0 * DEG, endAngle: a1 * DEG, isCCW: !!ccw });
        } else if (type === 3) {
          const center = xy(10), end = xy(11), ratio = take(40), a0 = take(50), a1 = take(51), ccw = take(73, 1);
          edges.push({ type, center, end, lengthOfMinorAxis: ratio, startAngle: a0 * DEG, endAngle: a1 * DEG, isCCW: !!ccw });
        } else if (type === 4) {
          take(94); take(73); take(74);
          const nk = take(95), nc = take(96);
          for (let q = 0; q < nk; q++) take(40);
          const controlPoints: { x: number; y: number }[] = [];
          for (let q = 0; q < nc; q++) { controlPoints.push(xy(10)); if (peek() === 42) take(42); }
          const fitDatum: { x: number; y: number }[] = [];
          if (peek() === 97) { const nf = take(97); for (let q = 0; q < nf; q++) fitDatum.push(xy(11)); }
          edges.push({ type, controlPoints, fitDatum });
        }
      }
      paths.push({ edges });
    }
  }
  const definitionLines: NonNullable<DwgEntity["definitionLines"]> = [];
  if (seek(78)) {
    const n = take(78);
    for (let k = 0; k < n && seek(53); k++) {
      const angle = take(53) * DEG, base = { x: take(43), y: take(44) }, ox = take(45), oy = take(46), nd = take(79);
      const dashLengths: number[] = [];
      for (let q = 0; q < nd; q++) dashLengths.push(take(49));
      definitionLines.push({ angle, base, offset: { x: ox, y: oy }, dashLengths });
    }
  }
  return { ...e, patternName, solidFill, boundaryPaths: paths, definitionLines };
}
