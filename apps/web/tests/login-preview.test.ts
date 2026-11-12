import { describe, expect, it } from "vitest";
import {
  loadLoginPreviewData,
  selectHeroMainCards,
} from "../src/server/public-site-data";

describe("loadLoginPreviewData (LOGIN-2)", () => {
  it("carga partido principal y segundo partido de otra liga con momio justo en americano desde snapshots reales", async () => {
    const { primaryCard, secondaryCard } = await loadLoginPreviewData();

    expect(primaryCard).not.toBeNull();
    expect(primaryCard?.mostProbable.p).toBeGreaterThan(0);
    expect(primaryCard?.mostProbable.p).toBeLessThan(1);
    expect(primaryCard?.mostProbable.fairAmerican).toMatch(/^[+\u2212]\d+$/);

    expect(secondaryCard).not.toBeNull();
    expect(secondaryCard?.league).not.toBe(primaryCard?.league);
    expect(secondaryCard?.mostProbable.fairAmerican).toMatch(/^[+\u2212]\d+$/);
  });

  it("selectHeroMainCards devuelve arreglo vacío cuando no existen tarjetas reales", () => {
    expect(selectHeroMainCards([])).toEqual([]);
  });
});
