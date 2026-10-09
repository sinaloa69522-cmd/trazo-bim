import { openingStyle } from "./openingStyles";
import { furnitureDef, furnitureSolids } from "./furniture";
import { dir, endExt, roofGeom, stairSteps, type P3 } from "./geometry";
import type { Opening, Project } from "./model";
import { computeRooms } from "./rooms";
import { mepDef, systemDef } from "./mep";
import type { RunSystem } from "./model";
import { levelMarks } from "./schedules";
import { wallType, wallTypeLabel } from "./wallTypes";

/**
 * Exporta el proyecto a IFC4 (texto STEP), para abrirlo en Revit, ArchiCAD, BIMcollab, etc.
 * Un IfcBuildingStorey por nivel; muros con sus huecos, puertas y ventanas, losas, cubiertas,
 * escaleras y espacios. En IFC el eje Y apunta al norte, así que la Y de la planta se invierte.
 */
/** Apertura de la puerta en IFC; la de una hoja dice hacia qué lado abre. */
function ifcOp(o: Opening) {
  const op = openingStyle(o).ifc;
  return op === "SINGLE_SWING" ? `SINGLE_SWING_${o.flip ? "RIGHT" : "LEFT"}` : op;
}

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
  /** Prisma de planta poligonal (coordenadas IFC), con huecos opcionales, extruido desde z0 una altura h. */
  const prism = (pts: { x: number; y: number }[], z0: number, h: number, holes: { x: number; y: number }[][] = []) => {
    const ring = (r: { x: number; y: number }[]) => { const ps = r.map((q) => pt2(q.x, q.y)); return add(`IFCPOLYLINE(${list([...ps, ps[0]])})`); };
    const prof = holes.length
      ? add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${ring(pts)},${list(holes.map(ring))})`)
      : add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ring(pts)})`);
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
  /** Elementos de cada red, para agruparlos en su IfcDistributionSystem */
  const bySystem = new Map<RunSystem, string[]>();
  const toSystem = (sys: RunSystem, el: string) => bySystem.set(sys, [...(bySystem.get(sys) ?? []), el]);
  /** Muros por material, para asociarles su IfcMaterial al final */
  const byMaterial = new Map<string, string[]>();
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
      const wall = add(`IFCWALL('${id()}',$,${str(wallTypeLabel(w))},$,$,${wPl},${shape("SweptSolid", [solid])},$,.STANDARD.)`);
      contained.push(wall);
      const mat = wallType(w.type).material;
      byMaterial.set(mat, [...(byMaterial.get(mat) ?? []), wall]);
      for (const o of lv.openings.filter((x) => x.wallId === w.id)) {
        const s = o.t * L, top = Math.min(o.height, w.height - o.sill);
        const oPl = place(wPl, s, 0, o.sill);
        const op = add(`IFCOPENINGELEMENT('${id()}',$,'Hueco',$,$,${oPl},${shape("SweptSolid", [box(0, 0, o.width, w.thick + 0.1, 0, top)])},$,.OPENING.)`);
        add(`IFCRELVOIDSELEMENT('${id()}',$,$,$,${wall},${op})`);
        const fPl = place(oPl);
        const mark = marks.get(o.id) ?? "";
        const leaf = shape("SweptSolid", [box(0, 0, o.width - 0.02, o.kind === "door" ? 0.045 : 0.06, 0, top)]);
        const el = o.kind === "door"
          ? add(`IFCDOOR('${id()}',$,${str(`${openingStyle(o).name} ${mark}`)},$,$,${fPl},${leaf},${str(mark)},${f(top)},${f(o.width)},.DOOR.,.${ifcOp(o)}.,$)`)
          : add(`IFCWINDOW('${id()}',$,${str(`${openingStyle(o).name} ${mark}`)},$,$,${fPl},${leaf},${str(mark)},${f(top)},${f(o.width)},.WINDOW.,.${openingStyle(o).ifc}.,$)`);
        add(`IFCRELFILLSELEMENT('${id()}',$,$,$,${op},${el})`);
        contained.push(el);
      }
    }

    // losas: el contorno se extruye hacia abajo desde la cota del nivel
    for (const sl of lv.slabs) {
      if (sl.pts.length < 3) continue;
      const rep = shape("SweptSolid", [prism(sl.pts.map((q) => ({ x: q.x, y: -q.y })), -sl.thick, sl.thick, sl.holes.map((h) => h.map((q) => ({ x: q.x, y: -q.y }))))]);
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

    // mobiliario y aparatos sanitarios
    for (const fu of lv.furniture) {
      const d = furnitureDef(fu.kind), a = (fu.rot * Math.PI) / 180;
      const rep = shape("SweptSolid", furnitureSolids(fu.kind).map((s) => box(s.x, -s.y, s.w, s.d, s.z0, s.h)));
      const pl = place(stPl, fu.x, -fu.y, 0, Math.cos(a), -Math.sin(a));
      contained.push(add(`${d.ifc.cls}('${id()}',$,${str(d.label)},$,$,${pl},${rep},$,.${d.ifc.type}.)`));
    }

    // instalaciones: cada punto como una caja pequeña a su altura de montaje
    for (const fx of lv.fixtures) {
      const d = mepDef(fx.kind), a = (fx.rot * Math.PI) / 180;
      const [bw, bd, bh] = fx.kind === "termo" ? [0.45, 0.45, 0.8] : fx.kind === "cuadro" ? [0.5, 0.12, 0.6] : fx.kind === "luz" ? [0.3, 0.3, 0.08] : [0.08, 0.05, 0.08];
      const rep = shape("SweptSolid", [box(0, fx.kind === "termo" ? -0.2 : 0, bw, bd, 0, bh)]);
      const pl = place(stPl, fx.x, -fx.y, fx.h, Math.cos(a), -Math.sin(a));
      const name = fx.circuit ? `${d.label} ${fx.circuit}` : d.label;
      const el = add(`${d.ifc.cls}('${id()}',$,${str(name)},$,$,${pl},${rep},${fx.circuit ? str(fx.circuit) : "$"},.${d.ifc.type}.)`);
      contained.push(el);
      toSystem(d.sys, el);
    }
    // tuberías y canalizaciones: un tramo recto por segmento de la polilínea
    for (const run of lv.runs) {
      const z = run.system === "san" ? -0.3 : run.system === "elec" ? 2.6 : 2.5, dia = run.system === "san" ? 0.11 : run.system === "elec" ? 0.025 : 0.02;
      for (let i = 1; i < run.pts.length; i++) {
        const a = run.pts[i - 1], b = run.pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 1e-3) continue;
        const pl = place(stPl, a.x, -a.y, z, (b.x - a.x) / L, -(b.y - a.y) / L);
        const rep = shape("SweptSolid", [box(L / 2, 0, L, dia, 0, dia)]);
        const el = run.system === "elec"
          ? add(`IFCCABLECARRIERSEGMENT('${id()}',$,${str(systemDef(run.system).label)},$,$,${pl},${rep},$,.CONDUITSEGMENT.)`)
          : add(`IFCPIPESEGMENT('${id()}',$,${str(systemDef(run.system).label)},$,$,${pl},${rep},$,.RIGIDSEGMENT.)`);
        contained.push(el);
        toSystem(run.system, el);
      }
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
  const SYS_IFC: Record<RunSystem, string> = { elec: "ELECTRICAL", af: "DOMESTICCOLDWATER", ac: "DOMESTICHOTWATER", san: "SEWAGE" };
  for (const [sys, els] of bySystem) {
    const g = add(`IFCDISTRIBUTIONSYSTEM('${id()}',$,${str(systemDef(sys).label)},$,$,$,.${SYS_IFC[sys]}.)`);
    add(`IFCRELASSIGNSTOGROUP('${id()}',$,$,$,${list(els)},$,${g})`);
    add(`IFCRELSERVICESBUILDINGS('${id()}',$,$,$,${g},(${building}))`);
  }
  for (const [name, walls] of byMaterial)
    add(`IFCRELASSOCIATESMATERIAL('${id()}',$,$,$,${list(walls)},${add(`IFCMATERIAL(${str(name)},$,$)`)})`);

  const stamp = now.toISOString().slice(0, 19);
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(`${p.info.name || "proyecto"}.ifc`)},'${stamp}',(${str(p.info.author)}),(''),'Smartarchitect','Smartarchitect','');`,
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
