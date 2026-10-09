import { dir, endExt, roofGeom, stairSteps, type P3 } from "./geometry";
import type { Project } from "./model";
import { computeRooms } from "./rooms";
import { levelMarks } from "./schedules";

/**
 * Exporta el proyecto a IFC4 (texto STEP), para abrirlo en Revit, ArchiCAD, BIMcollab, etc.
 * Un IfcBuildingStorey por nivel; muros con sus huecos, puertas y ventanas, losas, cubiertas,
 * escaleras y espacios. En IFC el eje Y apunta al norte, así que la Y de la planta se invierte.
 */
export function toIfc(p: Project, opts: { now?: Date; random?: () => number } = {}): string {
  const rnd = opts.random ?? Math.random;
  const now = opts.now ?? new Date();
  const out: string[] = [];
  let n = 0;
  const add = (s: string) => { out.push(`#${++n}=${s};`); return `#${n}`; };
  const id = () => guid(rnd);
  const list = (xs: string[]) => `(${xs.join(",")})`;

  // ---------- contexto, unidades y proyecto ----------
  const origin = add(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const zAxis = add(`IFCDIRECTION((0.,0.,1.))`);
  const xAxis = add(`IFCDIRECTION((1.,0.,0.))`);
  const world = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const units = add(`IFCUNITASSIGNMENT(${list([
    add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`),
    add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`),
    add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`),
    add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`),
  ])})`);
  const project = add(`IFCPROJECT('${id()}',$,${str(p.info.name || "Proyecto")},$,$,$,$,(${ctx}),${units})`);

  const pt3 = (x: number, y: number, z: number) => add(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`);
  const pt2 = (x: number, y: number) => add(`IFCCARTESIANPOINT((${f(x)},${f(y)}))`);
  const dir3 = (x: number, y: number, z: number) => add(`IFCDIRECTION((${f(x)},${f(y)},${f(z)}))`);
  /** Colocación local relativa a otra, con origen y eje X dados. */
  const place = (rel: string | null, x = 0, y = 0, z = 0, ux = 1, uy = 0) =>
    add(`IFCLOCALPLACEMENT(${rel ?? "$"},${add(`IFCAXIS2PLACEMENT3D(${pt3(x, y, z)},${zAxis},${dir3(ux, uy, 0)})`)})`);
  const shape = (type: string, items: string[]) =>
    add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','${type}',${list(items)})`)}))`);
  /** Prisma de planta rectangular (centro cx, cy; lados a, b) extruido desde z0 una altura h. */
  const box = (cx: number, cy: number, a: number, b: number, z0: number, h: number) => {
    const prof = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${pt2(cx, cy)},$)`)},${f(a)},${f(b)})`);
    return add(`IFCEXTRUDEDAREASOLID(${prof},${add(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, z0)},$,$)`)},${zAxis},${f(h)})`);
  };
  /** Prisma de planta poligonal (coordenadas IFC) extruido desde z0 una altura h. */
  const prism = (pts: { x: number; y: number }[], z0: number, h: number) => {
    const ps = pts.map((q) => pt2(q.x, q.y));
    const prof = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${add(`IFCPOLYLINE(${list([...ps, ps[0]])})`)})`);
    return add(`IFCEXTRUDEDAREASOLID(${prof},${add(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, z0)},$,$)`)},${zAxis},${f(h)})`);
  };
  /** Superficies (caras planas) como modelo de superficies. */
  const surfaces = (faces: P3[][]) => {
    const fs = faces.filter((fc) => fc.length >= 3).map((fc) =>
      add(`IFCFACE((${add(`IFCFACEOUTERBOUND(${add(`IFCPOLYLOOP(${list(fc.map((q) => pt3(q.x, -q.y, q.z)))})`)},.T.)`)}))`));
    return add(`IFCSHELLBASEDSURFACEMODEL((${add(`IFCOPENSHELL(${list(fs)})`)}))`);
  };

  // ---------- estructura espacial ----------
  const sitePl = place(null);
  const site = add(`IFCSITE('${id()}',$,'Parcela',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = place(sitePl);
  const building = add(`IFCBUILDING('${id()}',$,'Edificio',$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${id()}',$,$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES('${id()}',$,$,$,${site},(${building}))`);

  const storeys: string[] = [];
  p.levels.forEach((lv, li) => {
    const stPl = place(bldPl, 0, 0, lv.elev);
    const storey = add(`IFCBUILDINGSTOREY('${id()}',$,${str(lv.name)},$,$,${stPl},$,$,.ELEMENT.,${f(lv.elev)})`);
    storeys.push(storey);
    const contained: string[] = [];
    const marks = levelMarks(p, li);

    // muros, con huecos que vacían el muro y puertas o ventanas que los rellenan
    for (const w of lv.walls) {
      const { ux, uy, L } = dir(w), e0 = endExt(lv, w, 0), e1 = endExt(lv, w, 1);
      const wPl = place(stPl, w.x1, -w.y1, 0, ux, -uy);
      const solid = box((L + e1 - e0) / 2, 0, L + e0 + e1, w.thick, 0, w.height);
      const wall = add(`IFCWALL('${id()}',$,${str(`Muro básico ${Math.round(w.thick * 100)} cm`)},$,$,${wPl},${shape("SweptSolid", [solid])},$,.STANDARD.)`);
      contained.push(wall);
      for (const o of lv.openings.filter((x) => x.wallId === w.id)) {
        const s = o.t * L, top = Math.min(o.height, w.height - o.sill);
        const oPl = place(wPl, s, 0, o.sill);
        const op = add(`IFCOPENINGELEMENT('${id()}',$,'Hueco',$,$,${oPl},${shape("SweptSolid", [box(0, 0, o.width, w.thick + 0.1, 0, top)])},$,.OPENING.)`);
        add(`IFCRELVOIDSELEMENT('${id()}',$,$,$,${wall},${op})`);
        const fPl = place(oPl);
        const mark = marks.get(o.id) ?? "";
        const leaf = shape("SweptSolid", [box(0, 0, o.width - 0.02, o.kind === "door" ? 0.045 : 0.06, 0, top)]);
        const el = o.kind === "door"
          ? add(`IFCDOOR('${id()}',$,${str(`Puerta ${mark}`)},$,$,${fPl},${leaf},${str(mark)},${f(top)},${f(o.width)},.DOOR.,.SINGLE_SWING_${o.flip ? "RIGHT" : "LEFT"}.,$)`)
          : add(`IFCWINDOW('${id()}',$,${str(`Ventana ${mark}`)},$,$,${fPl},${leaf},${str(mark)},${f(top)},${f(o.width)},.WINDOW.,.SINGLE_PANEL.,$)`);
        add(`IFCRELFILLSELEMENT('${id()}',$,$,$,${op},${el})`);
        contained.push(el);
      }
    }

    // losas: el contorno se extruye hacia abajo desde la cota del nivel
    for (const sl of lv.slabs) {
      if (sl.pts.length < 3) continue;
      const rep = shape("SweptSolid", [prism(sl.pts.map((q) => ({ x: q.x, y: -q.y })), -sl.thick, sl.thick)]);
      contained.push(add(`IFCSLAB('${id()}',$,'Losa',$,$,${place(stPl)},${rep},$,.FLOOR.)`));
    }

    // cubiertas como superficies (faldones y hastiales)
    for (const r of lv.roofs) {
      const g = roofGeom(r);
      const rep = shape("SurfaceModel", [surfaces([...g.faces, ...g.gables])]);
      const kind = r.kind === "flat" ? "FLAT_ROOF" : r.kind === "gable" ? "GABLE_ROOF" : "HIP_ROOF";
      contained.push(add(`IFCROOF('${id()}',$,'Cubierta',$,$,${place(stPl)},${rep},$,.${kind}.)`));
    }

    // escaleras: un prisma por peldaño
    for (const st of lv.stairs) {
      const k = stairSteps(st), { ux, uy } = dir(st);
      const items = Array.from({ length: k.n }, (_, i) => box((i + 0.5) * k.tread, 0, k.tread, st.width, 0, (i + 1) * k.riser));
      const rep = shape("SweptSolid", items);
      contained.push(add(`IFCSTAIR('${id()}',$,${str(`Escalera ${k.n} peldaños`)},$,$,${place(stPl, st.x1, -st.y1, 0, ux, -uy)},${rep},$,.STRAIGHT_RUN_STAIR.)`));
    }

    if (contained.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${id()}',$,$,$,${list(contained)},${storey})`);

    // espacios con su superficie útil
    const g = computeRooms(lv), spaces: string[] = [];
    for (const r of lv.rooms) {
      const c = g?.rooms.get(r.id);
      if (!c?.ok) continue;
      const sp = add(`IFCSPACE('${id()}',$,${str(r.name)},$,$,${place(stPl, c.cx, -c.cy, 0)},$,${str(r.name)},.ELEMENT.,.INTERNAL.,$)`);
      const q = add(`IFCQUANTITYAREA('NetFloorArea',$,$,${f(c.area)},$)`);
      const eq = add(`IFCELEMENTQUANTITY('${id()}',$,'Qto_SpaceBaseQuantities',$,$,(${q}))`);
      add(`IFCRELDEFINESBYPROPERTIES('${id()}',$,$,$,(${sp}),${eq})`);
      spaces.push(sp);
    }
    if (spaces.length) add(`IFCRELAGGREGATES('${id()}',$,$,$,${storey},${list(spaces)})`);
  });
  if (storeys.length) add(`IFCRELAGGREGATES('${id()}',$,$,$,${building},${list(storeys)})`);

  const stamp = now.toISOString().slice(0, 19);
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(`${p.info.name || "proyecto"}.ifc`)},'${stamp}',(${str(p.info.author)}),(''),'Trazo BIM','Trazo BIM','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    ...out,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

/** Número real en formato STEP: siempre con punto decimal y sin notación exponencial. */
function f(v: number) {
  const s = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/0+$/, "");
  return s === "-0." ? "0." : s;
}

/** Cadena STEP: comillas dobladas y caracteres no ASCII como \X2\hhhh\X0\. */
export function str(s: string) {
  let r = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "'") r += "''";
    else if (ch === "\\") r += "\\\\";
    else if (c >= 32 && c < 127) r += ch;
    else r += `\\X2\\${c.toString(16).toUpperCase().padStart(c > 0xffff ? 8 : 4, "0")}\\X0\\`;
  }
  return `'${r}'`;
}

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
/** GlobalId de IFC: 128 bits aleatorios en 22 caracteres (el primero solo lleva 2 bits). */
export function guid(rnd: () => number) {
  let s = B64[Math.floor(rnd() * 4)];
  for (let i = 0; i < 21; i++) s += B64[Math.floor(rnd() * 64)];
  return s;
}
