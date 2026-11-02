import { describe, expect, it } from "vitest";
import { checkLevel, checkProject, roomUse } from "../codeCheck";
import { emptyModel, newLevel, type Model } from "../model";
import { computeRooms, minSide } from "../rooms";
import { TEMPLATES } from "../templates";

/** Cuarto rectangular de w × d entre ejes de muros de 0.15, con una ventana y una puerta. */
function box(w: number, d: number, name: string, win = 1.2, door = 0.9): Model {
  const m = emptyModel();
  const W = (x1: number, y1: number, x2: number, y2: number) => { const id = m.walls.length + 1; m.walls.push({ id, type: "x", x1, y1, x2, y2, thick: 0.15, height: 2.6, attach: false }); return id; };
  const a = W(0, 0, w, 0); W(w, 0, w, d); const c = W(w, d, 0, d); W(0, d, 0, 0);
  if (win) m.openings.push({ id: 100, wallId: a, t: 0.5, kind: "window", width: win, height: 1.2, sill: 0.9, flip: false });
  if (door) m.openings.push({ id: 101, wallId: c, t: 0.5, kind: "door", width: door, height: 2.1, sill: 0, flip: false });
  m.rooms.push({ id: 50, x: w / 2, y: d / 2, name });
  return m;
}

describe("revisión de reglamento", () => {
  it("toma el uso del nombre", () => {
    expect(roomUse("Recámara principal")).toBe("recamara-principal");
    expect(roomUse("Recámara 2")).toBe("recamara");
    expect(roomUse("Sala, comedor y cocina")).toBe("estancia-comedor");
    expect(roomUse("Medio baño")).toBe("bano");
    expect(roomUse("Cocina")).toBe("cocina");
    expect(roomUse("Pasillo")).toBe("circulacion");
    expect(roomUse("Bodega")).toBe("otro");
  });
  it("mide el lado libre de un rectángulo", () => {
    const m = box(3, 4, "Recámara"), g = computeRooms(m)!;
    expect(minSide(g, g.rooms.get(50)!)).toBeCloseTo(2.85, 1);
  });
  it("una recámara amplia y bien iluminada cumple", () => {
    const r = checkLevel(newLevel("PB", 0, box(3, 3.6, "Recámara 1", 1.6, 0.9)), 0);
    expect(r.findings).toEqual([]);
    expect(r.rooms[0].ok).toBe(true);
  });
  it("marca área, lado, iluminación y puerta de una recámara chica", () => {
    const r = checkLevel(newLevel("PB", 0, box(2.1, 2.6, "Recámara 2", 0.6, 0.7)), 0);
    const topics = r.findings.map((f) => f.topic);
    expect(topics).toEqual(expect.arrayContaining(["Área", "Lado libre", "Iluminación", "Puerta"]));
    expect(r.findings.every((f) => f.where === "Recámara 2" || f.where === "Acceso")).toBe(true);
  });
  it("un baño sin ventana pide extractor (aviso) y la puerta de entrada angosta no cumple", () => {
    const r = checkLevel(newLevel("PB", 0, box(1.6, 2.2, "Baño", 0, 0.7)), 0);
    expect(r.findings.find((f) => f.topic === "Ventilación")?.sev).toBe("warn");
    expect(r.findings.find((f) => f.where === "Acceso")?.sev).toBe("error");
  });
  it("revisa escaleras: huella, peralte y ancho", () => {
    const m = box(4, 4, "Bodega", 0, 0);
    m.stairs.push({ id: 9, x1: 0.5, y1: 0.5, x2: 2.5, y2: 0.5, width: 0.7, height: 2.8 });
    const r = checkLevel(newLevel("PB", 0, m), 0), msgs = r.findings.filter((f) => f.topic === "Escalera").map((f) => f.msg).join(" | ");
    expect(msgs).toMatch(/ancho 0.70/);
    expect(msgs).toMatch(/huella|peralte/);
  });
  it("las plantillas cumplen", () => {
    for (const t of TEMPLATES) expect(checkProject(t.build()).findings.filter((f) => f.sev === "error")).toEqual([]);
  });

  it("en pies se revisa con el IRC: escape de recámara y área de 70 sq ft", () => {
    const FT = 0.3048, IN = 0.0254;
    expect(roomUse("Primary Bedroom")).toBe("recamara-principal");
    expect(roomUse("Bedroom 2")).toBe("recamara");
    expect(roomUse("Great Room")).toBe("estancia");
    expect(roomUse("Walk-in closet")).toBe("otro");
    // 12' × 11' con ventana de 3' × 5' a 2' del piso: cumple el escape (34" × 28" libres = 6.6 sq ft)
    const ok = box(12 * FT, 11 * FT, "Bedroom 2", 3 * FT, 32 * IN);
    ok.openings[0].height = 5 * FT; ok.openings[0].sill = 2 * FT;
    ok.walls.forEach((w) => { w.height = 9 * FT; });
    expect(checkLevel(newLevel("L1", 0, ok), 0, "us").findings.filter((f) => f.where === "Bedroom 2")).toEqual([]);
    // 8' × 8' con ventana chica: área, iluminación y escape
    const bad = box(8 * FT, 8 * FT, "Bedroom 3", 2 * FT, 30 * IN);
    bad.openings[0].height = 2 * FT; bad.openings[0].sill = 4 * FT;
    const topics = checkLevel(newLevel("L1", 0, bad), 0, "us").findings.filter((f) => f.where === "Bedroom 3").map((f) => f.topic);
    expect(topics).toEqual(expect.arrayContaining(["Área", "Escape", "Iluminación"]));
    // en métrico la misma recámara no pide ventana de escape
    expect(checkLevel(newLevel("PB", 0, bad), 0).findings.some((f) => f.topic === "Escape")).toBe(false);
  });
  it("con IRC la escalera pide 36\" de ancho", () => {
    const m = box(4, 4, "Storage", 0, 0);
    m.stairs.push({ id: 9, x1: 0.5, y1: 0.5, x2: 2.5, y2: 0.5, width: 0.86, height: 2.8 });
    const msgs = checkLevel(newLevel("L1", 0, m), 0, "us").findings.filter((f) => f.topic === "Escalera").map((f) => f.msg).join(" | ");
    expect(msgs).toMatch(/R311\.7\.1/);
  });
});
