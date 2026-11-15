import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { asLeagueId } from "@pitchlab/contracts";
import { PlLeagueSelect, PlSelect } from "../src/platform";

describe("PlSelect y PlLeagueSelect", () => {
  it("renderiza el disparador accesible, placeholder y <select> oculto con autoComplete", () => {
    const html = renderToStaticMarkup(
      <PlSelect
        variant="auth"
        size="lg"
        ariaLabel="Día"
        placeholder="Día"
        autoComplete="bday-day"
        value=""
        onChange={() => {}}
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
        ]}
      />,
    );

    expect(html).toContain('data-pl-select=""');
    expect(html).toContain('data-variant="auth"');
    expect(html).toContain('data-placeholder="true"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('autoComplete="bday-day"');
    expect(html).toContain(">Día<");
  });

  it("renderiza PlLeagueSelect con emblema oficial de la liga activa", () => {
    const html = renderToStaticMarkup(
      <PlLeagueSelect
        leagues={[
          { league: asLeagueId("liga-mx"), label: "Liga MX" },
          { league: asLeagueId("nfl"), label: "NFL" },
        ]}
        value="liga-mx"
        onChange={() => {}}
        allLabel="Todas las ligas"
        ariaLabel="Filtrar por liga"
      />,
    );

    expect(html).toContain("pl-select-value-row");
    expect(html).toContain("Liga MX");
    expect(html).toContain('data-variant="glass"');
  });

  it("propaga id, ariaLabelledBy, ariaDescribedBy, isInvalid e isDisabled", () => {
    const html = renderToStaticMarkup(
      <PlSelect
        id="cfdi-regimen"
        ariaLabelledBy="cfdi-regimen-label"
        ariaDescribedBy="cfdi-hint"
        variant="field"
        size="md"
        fullWidth
        isInvalid
        isDisabled
        value="612"
        onChange={() => {}}
        options={[
          { value: "612", label: "612 — Personas Físicas con Actividades Empresariales" },
        ]}
      />,
    );

    expect(html).toContain('id="cfdi-regimen"');
    expect(html).toContain('data-invalid="true"');
    expect(html).toContain('data-full-width="true"');
    expect(html).toContain("cfdi-regimen-label");
    expect(html).toContain("cfdi-hint");
  });
});
