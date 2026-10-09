import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { budget, budgetCsv, defaultBudget } from "../budget";
import { normalizeProject, sampleProject } from "../model";
import { roomSchedule, wallSchedule } from "../schedules";

const item = (b: ReturnType<typeof budget>, code: string) => b.chapters.flatMap((c) => c.items).find((i) => i.code === code);

describe("presupuesto", () => {
  it("mide el proyecto de ejemplo por capítulos", () => {
    const p = sampleProject(), b = budget(p);
    expect(b.chapters.map((c) => c.name)).toEqual(["Estructura", "Muros y tabiques", "Cubiertas", "Carpintería", "Pisos", "Instalación eléctrica", "Plomería y saneamiento", "Muebles sanitarios"]);
    // losa de 10 x 7 x 0,20
    expect(item(b, "01.01")!.qty).toBeCloseTo(14);
    // los muros coinciden con la tabla de muros de las láminas
    const walls = b.chapters.find((c) => c.code === "02")!.items.reduce((t, i) => t + i.qty, 0);
    expect(walls).toBeCloseTo(wallSchedule(p).reduce((t, r) => t + r.area, 0), 1);
    // cubierta a dos aguas de 30°: superficie real mayor que en planta (11 x 8 con el vuelo)
    expect(item(b, "03.01")!.qty).toBeCloseTo((11 * 8) / Math.cos(Math.PI / 6), 1);
    expect(item(b, "04.01")!.qty).toBe(3);
    expect(item(b, "06.01")!.qty).toBeCloseTo(roomSchedule(p).reduce((t, r) => t + r.area, 0), 1);
    expect(item(b, "09.wc")!.qty).toBe(1);
  });

  it("suma indirectos e IVA sobre el costo directo", () => {
    const b = budget(sampleProject(), { ...defaultBudget(), indirect: 10, tax: 16 });
    expect(b.direct).toBeCloseTo(b.chapters.reduce((t, c) => t + c.total, 0), 2);
    expect(b.indirect).toBeCloseTo(b.direct * 0.1, 1);
    expect(b.total).toBeCloseTo(b.direct * 1.1 * 1.16, 0);
  });

  it("usa los precios propios, se guardan con el proyecto y se deshacen", () => {
    const ed = new Editor();
    const before = item(budget(ed.project, ed.project.budget), "04.01")!;
    ed.setPrice("04.01", 6000);
    const after = item(budget(ed.project, ed.project.budget), "04.01")!;
    expect(after.price).toBe(6000);
    expect(after.amount).toBeCloseTo(3 * 6000);
    expect(normalizeProject(JSON.parse(JSON.stringify(ed.project))).budget.prices["04.01"]).toBe(6000);
    ed.undo();
    expect(item(budget(ed.project, ed.project.budget), "04.01")!.price).toBe(before.price);
    // los proyectos guardados antes cargan con los ajustes por defecto
    expect(normalizeProject({ levels: [] }).budget).toEqual(defaultBudget());
  });

  it("las cantidades siguen al modelo", () => {
    const ed = new Editor();
    const n = item(budget(ed.project), "04.01")!.qty;
    ed.model.openings = ed.model.openings.filter((o) => o.kind !== "door");
    expect(item(budget(ed.project), "04.01")).toBeUndefined();
    expect(n).toBe(3);
  });

  it("exporta un CSV para Excel en español", () => {
    const p = sampleProject(), s = defaultBudget(), b = budget(p, s), csv = budgetCsv(b, s, "Presupuesto · Casa");
    expect(csv.startsWith("﻿Presupuesto · Casa")).toBe(true);
    expect(csv).toContain("Código;Descripción;Unidad;Cantidad;Precio (MXN);Importe (MXN)");
    expect(csv).toMatch(/01\.01;Losa maciza[^;]*;m³;14,00;4800,00;67200,00/);
    expect(csv.trimEnd().split("\r\n").pop()).toBe(`;TOTAL;;;;${b.total.toFixed(2).replace(".", ",")}`);
  });
});
