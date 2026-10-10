import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { normalizeProject } from "../model";
import { serializeProject } from "../projectFile";
import { metersPerMm, parseLatLon, project, scaleBar, siteTiles, TILE_MM, unproject } from "../site";

describe("croquis de localización", () => {
  it("lee coordenadas sueltas, enlaces de Google Maps y grados-minutos-segundos", () => {
    expect(parseLatLon("19.4326, -99.1332")).toEqual({ lat: 19.4326, lon: -99.1332 });
    expect(parseLatLon("19.4326 -99.1332")).toEqual({ lat: 19.4326, lon: -99.1332 });
    expect(parseLatLon("https://www.google.com/maps/place/Z%C3%B3calo/@19.4326077,-99.133208,17z/data=!3m1")).toEqual({ lat: 19.4326077, lon: -99.133208, zoom: 17 });
    expect(parseLatLon("https://maps.google.com/?q=20.6597,-103.3496")).toEqual({ lat: 20.6597, lon: -103.3496 });
    const d = parseLatLon(`19°25'57.4"N 99°07'59.5"W`)!;
    expect(d.lat).toBeCloseTo(19.43261, 4); expect(d.lon).toBeCloseTo(-99.13319, 4);
    expect(parseLatLon("Calle Juárez 12, Centro")).toBeNull();
    expect(parseLatLon("120, 20")).toBeNull();
  });
  it("las teselas cubren el recuadro y el predio queda en el centro", () => {
    const s = { lat: 19.4326, lon: -99.1332, zoom: 17 }, t = siteTiles(s, 60, 38);
    for (const d of t) { expect(d.dx).toBeLessThanOrEqual(30); expect(d.dx + TILE_MM).toBeGreaterThanOrEqual(-30); }
    // la tesela que contiene el centro tiene el origen (0,0) dentro
    expect(t.some((d) => d.dx <= 0 && d.dx + TILE_MM > 0 && d.dy <= 0 && d.dy + TILE_MM > 0)).toBe(true);
    const c = project(s.lat, s.lon, 17), back = unproject(c.x, c.y, 17);
    expect(back.lat).toBeCloseTo(s.lat, 9); expect(back.lon).toBeCloseTo(s.lon, 9);
    // a zoom 17 en CDMX, un mm de lámina son unos 7 m de terreno
    expect(metersPerMm(19.43, 17)).toBeCloseTo(7.21, 1);
    expect(scaleBar(19.43, 17)).toMatchObject({ m: 100, label: "100 m" });
  });
  it("la ubicación y la imagen propia se guardan con el proyecto", () => {
    const ed = new Editor();
    ed.setSite({ lat: 19.4326, lon: -99.1332, address: "Zócalo, CDMX" });
    expect(ed.project.info.site).toMatchObject({ lat: 19.4326, zoom: 17, address: "Zócalo, CDMX" });
    ed.setSiteImage("data:image/png;base64,AAAA");
    const key = ed.project.info.site!.img!;
    const text = serializeProject(ed.project, new Date(), ed.usedImages());
    expect(JSON.parse(text).images[key]).toBe("data:image/png;base64,AAAA");
    const ed2 = new Editor();
    ed2.openFile(text, "p.trazo");
    expect(ed2.images.get(key)).toBe("data:image/png;base64,AAAA");
    expect(ed2.project.info.site?.address).toBe("Zócalo, CDMX");
    ed.setSite(null);
    expect(ed.project.info.site).toBeUndefined();
    expect(normalizeProject({ levels: [], info: { site: { lat: "x" } } } as never).info.site).toBeUndefined();
  });
});
