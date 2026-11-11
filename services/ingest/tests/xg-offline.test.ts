import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildXgDataset } from "../src/index.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const CACHE = resolve(ROOT, "data", "history", "raw", "understat");

// Depende de la caché local de Understat (gitignored): en CI sin caché se omite.
describe.skipIf(!existsSync(CACHE))("xG — reconstrucción offline", () => {
  it("reconstruye el dataset desde caché de forma determinista", async () => {
    // El reporte va a una carpeta temporal: la prueba no debe reescribir Reportes/ del repo.
    const reportDir = mkdtempSync(join(tmpdir(), "xg-report-"));
    const first = await buildXgDataset({ rootDir: ROOT, offline: true, reportDir, log: () => undefined });
    const rows = first.manifest.leagues.reduce((sum, league) => sum + league.rows, 0);
    expect(first.manifest.leagues.length).toBeGreaterThanOrEqual(6);
    expect(rows).toBeGreaterThan(40_000);
    expect(first.manifest.leagues.every((league) => league.rows > 0)).toBe(true);

    const second = await buildXgDataset({ rootDir: ROOT, offline: true, reportDir, log: () => undefined });
    expect(second.manifest.datasetId).toBe(first.manifest.datasetId);
  }, 120_000);
});
