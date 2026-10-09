import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { dwgSegments, hatchLoops, type DwgDatabaseLike } from "../cadImport";
import { toDxf } from "../dxf";
import { parseDxf } from "../dxfImport";
import { hatchArea, hatchSegments, inHatch, maskLoops, patternLines, simplifyLoop, solidTrapezoids } from "../hatch";
import { emptyModel, sampleModel } from "../model";
import { computeRooms, RC } from "../rooms";

const sq = (x0: number, y0: number, s: number) => [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }];
const len = (segs: [{ x: number; y: number }, { x: number; y: number }][]) => segs.reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0);

describe("tramas", () => {
  it("el rayado a 45° llena el contorno y respeta las islas", () => {
    const outer = sq(0, 0, 2), hole = sq(0.5, 0.5, 1);
    const lines = patternLines({ pattern: "diagonal", scale: 1, angle: 0 });
    const full = hatchSegments([outer], lines), holed = hatchSegments([outer, hole], lines);
    // longitud total de la trama ≈ superficie / separación (0,08 m)
    expect(len(full.segs)).toBeGreaterThan((4 / 0.08) * 0.95);
    expect(len(full.segs)).toBeLessThan((4 / 0.08) * 1.05);
    expect(len(holed.segs) / len(full.segs)).toBeCloseTo(3 / 4, 1);
    // ningún trazo pasa por dentro de la isla
    for (const [a, b] of holed.segs) expect(inHatch({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, [outer, hole])).toBe(true);
    // en pantalla (Y hacia abajo) la trama ANSI31 sube hacia la derecha, como en AutoCAD
    const [a, b] = full.segs[0];
    expect(Math.sign(b.x - a.x)).toBe(-Math.sign(b.y - a.y));
  });

  it("los trazos discontinuos de la fábrica no pasan de su largo y la escala los alarga", () => {
    const loops = [sq(0, 0, 1.6)];
    const one = hatchSegments(loops, patternLines({ pattern: "ladrillo", scale: 1, angle: 0 })).segs;
    const vertical = one.filter(([a, b]) => Math.abs(a.x - b.x) < 1e-9);
    expect(vertical.length).toBeGreaterThan(10);
    expect(Math.max(...vertical.map(([a, b]) => Math.abs(b.y - a.y)))).toBeLessThanOrEqual(0.2 + 1e-9);
    const two = hatchSegments(loops, patternLines({ pattern: "ladrillo", scale: 2, angle: 0 })).segs;
    expect(len(two) / len(one)).toBeCloseTo(0.5, 1);
  });

  it("una trama demasiado fina para su tamaño se marca como densa", () => {
    const r = hatchSegments([sq(0, 0, 5000)], patternLines({ pattern: "diagonal", scale: 0.05, angle: 0 }));
    expect(r.dense).toBe(true);
    expect(r.segs).toHaveLength(0);
  });

  it("superficie con islas y descomposición en trapecios", () => {
    const loops = [sq(0, 0, 4), sq(1, 1, 1)];
    expect(hatchArea(loops)).toBeCloseTo(15);
    const tz = solidTrapezoids(loops);
    const area = tz.reduce((s, [a, b, c, d]) => s + (((b.x - a.x) + (d.x - c.x)) / 2) * (c.y - a.y), 0);
    expect(area).toBeCloseTo(15);
  });

  it("endereza los escalones de una pared inclinada", () => {
    const stair = [{ x: 0, y: 0 }];
    for (let i = 1; i <= 20; i++) stair.push({ x: i * 0.05, y: (i - 1) * 0.05 }, { x: i * 0.05, y: i * 0.05 });
    stair.push({ x: 0, y: 1 });
    expect(simplifyLoop(stair, 0.0375).length).toBeLessThanOrEqual(4);
  });
});

describe("sombrear habitaciones", () => {
  it("el contorno de la habitación tiene su superficie útil", () => {
    const m = sampleModel(), g = computeRooms(m)!;
    for (const r of m.rooms) {
      const c = g.rooms.get(r.id)!, loops = maskLoops(c.mask!, g.nx, g.ny, g.x0, g.y0, RC);
      expect(hatchArea(loops)).toBeCloseTo(c.area, 6);
      // un rectángulo de muros da un contorno de 4 vértices
      expect(loops[0].length).toBe(4);
    }
  });

  it("el editor sombrea con un clic, dibuja contornos, mueve, deshace y borra", () => {
    const ed = new Editor();
    ed.loadSample();
    ed.setTool("hatch");
    ed.defaults.hatchPattern = "baldosa";
    ed.commitPoint({ x: 3, y: 2 });
    expect(ed.model.hatches).toHaveLength(1);
    const h = ed.model.hatches[0];
    expect(h.pattern).toBe("baldosa");
    expect(ed.sels).toEqual([{ type: "hatch", id: h.id }]);
    expect(ed.message).toMatch(/Dormitorio/);
    expect(hatchArea(h.loops)).toBeCloseTo(ed.rooms!.rooms.get(ed.model.rooms[0].id)!.area, 6);
    // fuera de las habitaciones se dibuja el contorno
    ed.commitPoint({ x: 12, y: 0 }); ed.commitPoint({ x: 14, y: 0 }); ed.commitPoint({ x: 14, y: 2 });
    ed.runCommand("");
    expect(ed.model.hatches).toHaveLength(2);
    expect(hatchArea(ed.model.hatches[1].loops)).toBeCloseTo(2);
    // se elige por dentro cuando no hay nada más
    ed.setTool("select");
    expect(ed.pick(13.5, 0.4)).toEqual({ type: "hatch", id: ed.model.hatches[1].id });
    ed.select({ type: "hatch", id: ed.model.hatches[1].id });
    ed.setTool("move"); ed.commitPoint({ x: 12, y: 0 }); ed.commitPoint({ x: 12, y: 3 });
    expect(ed.model.hatches[1].loops[0][0]).toEqual({ x: 12, y: 3 });
    ed.undo();
    expect(ed.model.hatches[1].loops[0][0]).toEqual({ x: 12, y: 0 });
    ed.select({ type: "hatch", id: ed.model.hatches[1].id });
    ed.deleteSel();
    expect(ed.model.hatches).toHaveLength(1);
    expect(ed.layerCounts().sombreados).toBe(1);
  });
});

describe("importar y exportar sombreados", () => {
  it("lee el sombreado de un DWG con su trama, pasando de mm a m", () => {
    // datos de un sombreado ANGLE leído por LibreDWG de un DWG de ejemplo (ángulos en radianes)
    const db: DwgDatabaseLike = {
      header: { INSUNITS: 4 },
      entities: [{
        type: "HATCH", layer: "Tavolo 3", patternName: "ANGLE", solidFill: 0,
        boundaryPaths: [{ edges: [
          { type: 1, start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } },
          { type: 1, start: { x: 1000, y: 0 }, end: { x: 1000, y: 1000 } },
          { type: 1, start: { x: 1000, y: 1000 }, end: { x: 0, y: 1000 } },
          { type: 1, start: { x: 0, y: 1000 }, end: { x: 0, y: 0 } },
        ] }],
        definitionLines: [
          { angle: 0, base: { x: 0, y: 0 }, offset: { x: 0, y: 13.97 }, dashLengths: [10.16, -3.81] },
          { angle: Math.PI / 2, base: { x: 0, y: 0 }, offset: { x: -13.97, y: 0 }, dashLengths: [10.16, -3.81] },
        ],
      }],
    };
    const r = dwgSegments(db);
    expect(r.skipped).toEqual({});
    expect(r.hatches).toHaveLength(1);
    const h = r.hatches![0];
    expect(h.solid).toBe(false);
    expect(h.loops[0]).toHaveLength(4);
    expect(hatchArea(h.loops)).toBeCloseTo(1);
    expect(h.lines[0].offset.y).toBeCloseTo(-0.01397);
    expect(h.lines[0].dashes[0]).toBeCloseTo(0.01016);
    expect(h.layer).toBe("Tavolo 3");
  });

  it("enlaza aristas de arco aunque vengan en sentido horario", () => {
    // cuarto de círculo de (1,0) a (0,1) cerrado por dos radios; el arco va en sentido horario de 90° a 0°,
    // que se guarda reflejado: de -90° a 0°
    const loops = hatchLoops([{ edges: [
      { type: 1, start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
      { type: 2, center: { x: 0, y: 0 }, radius: 1, startAngle: -Math.PI / 2, endAngle: 0, isCCW: false },
      { type: 1, start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
    ] }]);
    expect(loops).toHaveLength(1);
    // el arco enlaza los dos radios sin saltos
    const q = loops[0];
    for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1.01); }
    expect(q.every((p) => p.x >= -1e-9 && p.y >= -1e-9)).toBe(true);
    expect(hatchArea(loops)).toBeCloseTo(Math.PI / 4, 1);
  });

  it("un DXF trae bloques con atributos, textos y sombreados", () => {
    const dxf = [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
      "0", "SECTION", "2", "BLOCKS",
      "0", "BLOCK", "8", "0", "2", "PUERTA", "70", "2", "10", "0", "20", "0",
      "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "1", "21", "0",
      "0", "ARC", "8", "0", "10", "0", "20", "0", "40", "1", "50", "0", "51", "90",
      "0", "ENDBLK", "8", "0",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "INSERT", "8", "PUERTAS", "66", "1", "2", "PUERTA", "10", "5", "20", "0", "50", "90",
      "0", "ATTRIB", "8", "0", "10", "5.2", "20", "0.5", "40", "0.2", "1", "P1", "2", "MARCA", "70", "0",
      "0", "SEQEND", "8", "0",
      "0", "TEXT", "8", "ANOT", "10", "1", "20", "2", "40", "0.25", "1", "Cocina", "50", "0",
      "0", "MTEXT", "8", "ANOT", "10", "1", "20", "4", "40", "0.2", "71", "1", "1", "Dos\\Plíneas",
      "0", "HATCH", "8", "SOMBRAS", "2", "ANSI31", "70", "0", "71", "0", "91", "1",
      "92", "2", "72", "0", "73", "1", "93", "4", "10", "0", "20", "0", "10", "2", "20", "0", "10", "2", "20", "2", "10", "0", "20", "2", "97", "0",
      "75", "0", "76", "1", "52", "0", "41", "1", "77", "0", "78", "1",
      "53", "45", "43", "0", "44", "0", "45", "-0.1", "46", "0.1", "79", "0", "98", "0",
      "0", "HATCH", "8", "SOMBRAS", "2", "SOLID", "70", "1", "71", "0", "91", "1",
      "92", "1", "93", "2",
      "72", "1", "10", "-1", "20", "0", "11", "1", "21", "0",
      "72", "2", "10", "0", "20", "0", "40", "1", "50", "0", "51", "180", "73", "1",
      "97", "0", "75", "0", "76", "1", "98", "0",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const r = parseDxf(dxf);
    expect(r.skipped).toEqual({});
    // la puerta girada 90°: su hoja va de (5,0) a (5,1) en el DXF, (5,-1) en la planta
    expect(r.segments.some((s) => Math.abs(s.a.x - 5) < 1e-9 && Math.abs(s.b.x - 5) < 1e-9 && Math.abs(s.b.y + 1) < 1e-9)).toBe(true);
    expect(r.texts!.map((t) => t.text).sort()).toEqual(["Cocina", "Dos", "P1", "líneas"]);
    expect(r.hatches).toHaveLength(2);
    const [rayado, solido] = r.hatches!;
    expect(rayado.solid).toBe(false);
    expect(rayado.name).toBe("ANSI31");
    expect(hatchArea(rayado.loops)).toBeCloseTo(4);
    expect(hatchSegments(rayado.loops, rayado.lines).segs.length).toBeGreaterThan(15);
    expect(solido.solid).toBe(true);
    expect(hatchArea(solido.loops)).toBeCloseTo(Math.PI / 2, 1);
  });

  it("exporta los sombreados al DXF y vuelven al importar", () => {
    const m = emptyModel();
    m.hatches.push({ id: 1, loops: [sq(0, 0, 2)], pattern: "diagonal", scale: 1, angle: 0 });
    m.hatches.push({ id: 2, loops: [sq(3, 0, 1), sq(3.25, 0.25, 0.5)], pattern: "solido", scale: 1, angle: 0 });
    const dxf = toDxf(m, null);
    expect(dxf).toContain("A-SOMBREADOS");
    const r = parseDxf(dxf);
    expect(r.segments.length).toBeGreaterThan(30);
    expect(r.segments.every((s) => s.layer === "A-SOMBREADOS")).toBe(true);
    // el sólido va en trapecios SOLID, que se leen como sombreados sólidos
    expect(r.hatches!.every((h) => h.solid)).toBe(true);
    expect(r.hatches!.reduce((s, h) => s + hatchArea(h.loops), 0)).toBeCloseTo(0.75);
  });

  it("el editor importa los sombreados y los deja seleccionados", () => {
    const ed = new Editor();
    ed.clear();
    const m = emptyModel();
    m.hatches.push({ id: 1, loops: [sq(0, 0, 2)], pattern: "solido", scale: 1, angle: 0 });
    ed.importDxf(toDxf(m, null), "sombras.dxf");
    expect(ed.model.hatches.length).toBeGreaterThan(0);
    expect(ed.model.hatches.every((h) => h.pattern === "solido")).toBe(true);
    expect(ed.sels.every((s) => s.type === "hatch")).toBe(true);
    expect(ed.message).toMatch(/sombreado/);
  });
});
