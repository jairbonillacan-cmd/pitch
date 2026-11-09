import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pruneStaleFiles } from "../src/index.js";

let directory: string | null = null;

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = null;
});

describe("research — poda de archivos", () => {
  it("borra ligas viejas pero conserva datasets auxiliares", () => {
    directory = mkdtempSync(join(tmpdir(), "pitchlab-prune-"));
    for (const name of [
      "premier-league.jsonl",
      "la-liga.jsonl",
      "liga-mx-espn-stats.jsonl",
      "liga-mx-stats.jsonl",
      "liga-mx-enriched.jsonl",
      "otro-dataset.jsonl",
    ]) {
      writeFileSync(join(directory, name), "{}\n", "utf8");
    }
    const removed = pruneStaleFiles(directory, new Set(["premier-league.jsonl"]));
    expect(removed).toEqual(["la-liga.jsonl"]);
    expect(readdirSync(directory).sort()).toEqual([
      "liga-mx-enriched.jsonl",
      "liga-mx-espn-stats.jsonl",
      "liga-mx-stats.jsonl",
      "otro-dataset.jsonl",
      "premier-league.jsonl",
    ]);
  });
});
