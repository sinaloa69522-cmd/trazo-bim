import { describe, expect, it } from "vitest";
import { sampleProject } from "../model";
import { addVersion, listVersions, MAX_VERSIONS, removeVersion, renameVersion } from "../versions";

function mem(limit = Infinity) {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { if (v.length > limit) throw new Error("lleno"); m.set(k, v); } };
}

describe("historial de versiones", () => {
  it("guarda, lista (la más nueva primero), renombra y borra", () => {
    const s = mem(), p = sampleProject();
    addVersion(s, p, "Anteproyecto", new Date("2026-01-01"));
    p.levels[0].walls.pop();
    addVersion(s, p, "Con cambios", new Date("2026-01-02"));
    const l = listVersions(s);
    expect(l.map((v) => v.name)).toEqual(["Con cambios", "Anteproyecto"]);
    expect(l[1].summary.walls - l[0].summary.walls).toBe(1);
    expect(JSON.parse(l[1].data).levels[0].walls).toHaveLength(6);
    renameVersion(s, l[0].id, "Versión B");
    expect(listVersions(s)[0].name).toBe("Versión B");
    expect(removeVersion(s, l[1].id)).toHaveLength(1);
  });
  it("conserva como mucho MAX_VERSIONS y quita las antiguas si no hay espacio", () => {
    const s = mem(), p = sampleProject();
    for (let i = 0; i < MAX_VERSIONS + 3; i++) addVersion(s, p, `v${i}`);
    expect(listVersions(s)).toHaveLength(MAX_VERSIONS);
    expect(listVersions(s)[0].name).toBe(`v${MAX_VERSIONS + 2}`);
    const one = JSON.stringify([{ data: JSON.stringify(p) }]).length;
    const small = mem(one * 2.6);
    for (let i = 0; i < 5; i++) addVersion(small, p, `v${i}`);
    const kept = listVersions(small);
    expect(kept.length).toBeGreaterThan(0); expect(kept.length).toBeLessThan(5);
    expect(kept[0].name).toBe("v4");
  });
});
