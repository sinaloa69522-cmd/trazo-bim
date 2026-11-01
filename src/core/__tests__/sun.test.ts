import { describe, expect, it } from "vitest";
import { dayOfYear, sunPosition, sunriseSunset, sunVector } from "../sun";

describe("estudio de sol", () => {
  it("al mediodía del equinoccio la altura es 90° − latitud y el sol está al sur", () => {
    const s = sunPosition(40, dayOfYear(3, 20), 12);
    expect(s.alt).toBeCloseTo(50, 0);
    expect(s.az).toBeCloseTo(180, 0);
  });
  it("en el solsticio de verano en Ciudad de México el sol del mediodía pasa al norte", () => {
    const s = sunPosition(19.43, dayOfYear(6, 21), 12);
    expect(s.alt).toBeGreaterThan(85);
    expect(s.az < 90 || s.az > 270).toBe(true);
  });
  it("sale por el este en la mañana y se pone por el oeste", () => {
    expect(sunPosition(19.43, dayOfYear(3, 20), 8).az).toBeGreaterThan(80);
    expect(sunPosition(19.43, dayOfYear(3, 20), 8).az).toBeLessThan(110);
    expect(sunPosition(19.43, dayOfYear(3, 20), 17).az).toBeGreaterThan(250);
    const d = sunriseSunset(19.43, dayOfYear(3, 20))!;
    expect(d.rise).toBeCloseTo(6, 0); expect(d.set).toBeCloseTo(18, 0);
  });
  it("el vector apunta al este (+x) con acimut 90 y al norte (−y) con 0", () => {
    expect(sunVector(0, 90).x).toBeCloseTo(1);
    expect(sunVector(0, 0).y).toBeCloseTo(-1);
    expect(sunVector(90, 0).z).toBeCloseTo(1);
  });
});
