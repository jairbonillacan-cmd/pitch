import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  CalibrationCurveChart,
  computeModelCalibration,
} from "../src/platform/components/CalibrationCurveChart";
import {
  PlayerPropStreakCard,
  evaluatePropStreak,
} from "../src/platform/components/PlayerPropStreakCard";
import {
  TacticalPitchSvg,
  layoutTeamOnHalfPitch,
  parseFormationRows,
} from "../src/platform/components/TacticalPitchSvg";

describe("Componentes atómicos v3 (ADR-046)", () => {
  it("parsea formaciones tácticas y distribuye los 11 titulares en TacticalPitchSvg", () => {
    expect(parseFormationRows("4-2-3-1")).toEqual([1, 4, 2, 3, 1]);
    expect(parseFormationRows("4-3-3")).toEqual([1, 4, 3, 3]);
    expect(parseFormationRows("3-5-2")).toEqual([1, 3, 5, 2]);
    expect(parseFormationRows(undefined, 11)).toEqual([1, 4, 3, 3]);

    const starters = Array.from({ length: 11 }, (_, i) => ({
      name: `Jugador ${i + 1}`,
      number: i + 1,
    }));
    const nodes = layoutTeamOnHalfPitch(starters, "4-2-3-1");
    expect(nodes).toHaveLength(11);
    expect(nodes[0]!.xPct).toBe(50);

    const html = renderToStaticMarkup(
      <TacticalPitchSvg
        homeName="América"
        awayName="Guadalajara"
        lineups={{
          sourceLabel: "Oficial",
          verifiedAtUtc: "2026-11-19T18:00:00Z",
          homeFormation: "4-2-3-1",
          awayFormation: "4-3-3",
          homeStarters: starters,
          awayStarters: starters,
        }}
      />,
    );
    expect(html).toContain("data-tactical-pitch");
    expect(html).toContain("4-2-3-1");
    expect(html).toContain("4-3-3");
  });

  it("evalúa rachas U5/U10/U20 y renderiza PlayerPropStreakCard con range input nativo", () => {
    const pts = [
      { label: "J1", value: 2 },
      { label: "J2", value: 3 },
      { label: "J3", value: 1 },
      { label: "J4", value: 4 },
      { label: "J5", value: 2 },
    ];
    const summary = evaluatePropStreak(pts, 1.5, 5);
    expect(summary.hits).toBe(4);
    expect(summary.total).toBe(5);
    expect(summary.hitRatePct).toBe(80);
    expect(summary.average).toBe(2.4);

    const html = renderToStaticMarkup(
      <PlayerPropStreakCard
        playerName="Henry Martín"
        teamName="Club América"
        teamSlug="america"
        league={asLeagueId("liga-mx")}
        series={[
          {
            key: "sot",
            label: "Tiros a puerta",
            unit: "tiros",
            defaultLine: 1.5,
            points: pts,
          },
        ]}
      />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain("aria-valuetext");
    expect(html).toContain("4/5");
    expect(html).toContain("80 %");
  });

  it("calcula Brier, ECE y cubetas de calibración en CalibrationCurveChart con aviso de muestra pequeña", () => {
    const samples = [
      { p: 0.55, hit: true },
      { p: 0.58, hit: false },
      { p: 0.72, hit: true },
      { p: 0.76, hit: true },
      { p: 0.85, hit: true },
    ];
    const cal = computeModelCalibration(samples);
    expect(cal.total).toBe(5);
    expect(cal.hits).toBe(4);
    expect(cal.brierScore).not.toBeNull();
    expect(cal.brierScore!).toBeLessThan(0.2);
    expect(cal.ece).not.toBeNull();
    expect(cal.buckets.length).toBeGreaterThanOrEqual(2);

    const html = renderToStaticMarkup(<CalibrationCurveChart samples={samples} />);
    expect(html).toContain("data-calibration-curve");
    expect(html).toContain("Muestra pequeña (5 partidos)");
    expect(html).toContain("Brier");
  });
});
