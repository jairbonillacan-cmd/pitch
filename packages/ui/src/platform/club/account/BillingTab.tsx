"use client";

import React, { useId, useState } from "react";
import { Button, SofascoreCard } from "../../../components/ui/primitives";
import { ExampleNotice, MaestroIcon } from "../../components/MaestroPrimitives";
import { PlSelect } from "../../components/PlSelect";
import { useSafeEffect } from "../../hooks";
import { usePlatformActions, usePlatformCore } from "../../platform-provider";
import { MEMBERSHIP_SPEC } from "../../spacetime-catalog";
import {
  DEFAULT_CFDI_DRAFT_V1,
  readStoredCfdiDraft,
  validateMexicanRfc,
  writeStoredCfdiDraft,
} from "./account-helpers";

const REGIMEN_FISCAL_OPTIONS = [
  {
    value: "612",
    label: "612 — Personas Físicas con Actividades Empresariales",
  },
  {
    value: "626",
    label: "626 — Régimen Simplificado de Confianza (RESICO)",
  },
  {
    value: "605",
    label: "605 — Sueldos y Salarios",
  },
  {
    value: "601",
    label: "601 — General de Ley Personas Morales",
  },
  {
    value: "616",
    label: "616 — Sin obligaciones fiscales",
  },
] as const;

const USO_CFDI_OPTIONS = [
  { value: "G03", label: "G03 — Gastos en general" },
  { value: "S01", label: "S01 — Sin efectos fiscales" },
] as const;

type CfdiErrorField = "rfc" | "razonSocial" | "cpFiscal" | "usoCfdi" | null;

export function BillingTab({
  accountsEnabledOverride,
}: {
  accountsEnabledOverride?: boolean;
} = {}): React.JSX.Element {
  const { hasAccountSessionAuth, paymentMode } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const accountsEnabled = accountsEnabledOverride ?? hasAccountSessionAuth;

  const baseId = useId();
  const rfcHintId = `${baseId}-rfc-hint`;
  const razonHintId = `${baseId}-razon-hint`;
  const cpHintId = `${baseId}-cp-hint`;
  const errorBannerId = `${baseId}-cfdi-err`;

  const [rfc, setRfc] = useState(DEFAULT_CFDI_DRAFT_V1.rfc);
  const [razonSocial, setRazonSocial] = useState(DEFAULT_CFDI_DRAFT_V1.razonSocial);
  const [regimenFiscal, setRegimenFiscal] = useState(DEFAULT_CFDI_DRAFT_V1.regimenFiscal);
  const [usoCfdi, setUsoCfdi] = useState(DEFAULT_CFDI_DRAFT_V1.usoCfdi);
  const [cpFiscal, setCpFiscal] = useState(DEFAULT_CFDI_DRAFT_V1.cpFiscal);
  const [errorNotice, setErrorNotice] = useState("");
  const [errorField, setErrorField] = useState<CfdiErrorField>(null);
  const [savedNotice, setSavedNotice] = useState("");

  useSafeEffect(() => {
    readStoredCfdiDraft();
  }, []);

  const clearFeedback = () => {
    if (errorNotice) setErrorNotice("");
    if (errorField) setErrorField(null);
    if (savedNotice) setSavedNotice("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedRfc = rfc.trim().toUpperCase();
    const cleanedRazon = razonSocial.trim().toUpperCase();
    const cleanedCp = cpFiscal.replace(/\D/g, "").slice(0, 5);

    const rfcCheck = validateMexicanRfc(cleanedRfc, regimenFiscal);
    if (!rfcCheck.valid) {
      setSavedNotice("");
      setErrorField("rfc");
      setErrorNotice(rfcCheck.error ?? "Revisa el RFC.");
      document.getElementById("cfdi-rfc")?.focus();
      return;
    }
    if (cleanedRazon.length < 2) {
      setSavedNotice("");
      setErrorField("razonSocial");
      setErrorNotice("Ingresa tu nombre o razón social tal como aparece en tu constancia.");
      document.getElementById("cfdi-razon")?.focus();
      return;
    }
    if (!/^\d{5}$/.test(cleanedCp)) {
      setSavedNotice("");
      setErrorField("cpFiscal");
      setErrorNotice("Ingresa un código postal fiscal de 5 dígitos.");
      document.getElementById("cfdi-cp")?.focus();
      return;
    }
    if (regimenFiscal === "616" && usoCfdi !== "S01") {
      setSavedNotice("");
      setErrorField("usoCfdi");
      setErrorNotice("Para el régimen 616 (Sin obligaciones fiscales) selecciona uso de CFDI S01.");
      document.getElementById("cfdi-uso")?.focus();
      return;
    }

    writeStoredCfdiDraft({
      v: 1,
      rfc: cleanedRfc,
      razonSocial: cleanedRazon,
      regimenFiscal,
      usoCfdi,
      cpFiscal: cleanedCp,
    });
    setRfc(cleanedRfc);
    setRazonSocial(cleanedRazon);
    setCpFiscal(cleanedCp);
    setErrorField(null);
    setErrorNotice("");
    setSavedNotice("Datos fiscales validados para esta sesión.");
  };

  return (
    <div className="pl-acct-stack">
      {!accountsEnabled ? (
        <ExampleNotice>
          La emisión de facturas CFDI 4.0 se habilita al activar tu Pase PitchLab Ultra. Por
          privacidad, tus datos fiscales no se guardan en el navegador.
        </ExampleNotice>
      ) : paymentMode === "transfer" ? (
        <SofascoreCard
          as="section"
          title="Beta 1.0 · Transferencia SPEI"
          meta={
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href="/app/account?tab=plan#transfer"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/app/account?tab=plan#transfer");
                  }}
                />
              }
            >
              Ver pagos SPEI
            </Button>
          }
        >
          <p className="m-0 text-sm leading-relaxed text-[var(--pl-text-secondary)]">
            En Beta 1.0 las facturas CFDI 4.0 se emiten bajo solicitud después de aprobar tu
            transferencia SPEI. Valida aquí tus datos fiscales y envíalos junto con tu referencia{" "}
            <code className="pl-acct-mono">PL-...</code> a{" "}
            <a href="mailto:soporte@pitchlab.mx" className="font-bold underline break-all">
              soporte@pitchlab.mx
            </a>{" "}
            dentro del mismo mes calendario del pago.
          </p>
        </SofascoreCard>
      ) : null}

      <SofascoreCard
        id="pl-acct-cfdi"
        title="Facturación CFDI 4.0"
        meta="Solo en memoria · sin localStorage"
      >
        <p className="pl-acct-subcopy mt-0 mb-4">{MEMBERSHIP_SPEC.cfdiNote}</p>

        <form
          onSubmit={handleSubmit}
          aria-labelledby="pl-acct-cfdi-title"
          className="pl-acct-cfdi-form min-w-0"
          noValidate
        >
          <div className="pl-acct-cfdi-grid">
            <div className="pl-acct-field">
              <label htmlFor="cfdi-rfc" className="pl-acct-field-label">
                RFC
              </label>
              <input
                id="cfdi-rfc"
                name="rfc"
                type="text"
                maxLength={13}
                value={rfc}
                onChange={(e) => {
                  setRfc(e.target.value.toUpperCase());
                  clearFeedback();
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="next"
                required
                aria-invalid={errorField === "rfc" ? "true" : undefined}
                aria-describedby={errorField === "rfc" ? `${rfcHintId} ${errorBannerId}` : rfcHintId}
                className="pl-acct-input pl-acct-mono num"
              />
              <span id={rfcHintId} className="pl-acct-field-hint">
                12 caracteres para persona moral o 13 para persona física.
              </span>
            </div>

            <div className="pl-acct-field">
              <label htmlFor="cfdi-razon" className="pl-acct-field-label">
                Razón social (sin régimen societario)
              </label>
              <input
                id="cfdi-razon"
                name="razonSocial"
                type="text"
                value={razonSocial}
                onChange={(e) => {
                  setRazonSocial(e.target.value.toUpperCase());
                  clearFeedback();
                }}
                autoComplete="organization"
                enterKeyHint="next"
                required
                aria-invalid={errorField === "razonSocial" ? "true" : undefined}
                aria-describedby={
                  errorField === "razonSocial" ? `${razonHintId} ${errorBannerId}` : razonHintId
                }
                className="pl-acct-input"
              />
              <span id={razonHintId} className="pl-acct-field-hint">
                Exactamente como aparece en tu Constancia de Situación Fiscal.
              </span>
            </div>

            <div className="pl-acct-field">
              <label
                id="cfdi-regimen-label"
                htmlFor="cfdi-regimen"
                className="pl-acct-field-label"
              >
                Régimen fiscal SAT
              </label>
              <PlSelect
                id="cfdi-regimen"
                name="regimenFiscal"
                ariaLabelledBy="cfdi-regimen-label"
                variant="field"
                size="md"
                fullWidth
                popoverWidth="trigger"
                triggerClassName="pl-acct-select-trigger"
                value={regimenFiscal}
                onChange={(next) => {
                  setRegimenFiscal(next);
                  clearFeedback();
                }}
                options={REGIMEN_FISCAL_OPTIONS}
              />
            </div>

            <div className="pl-acct-field">
              <label id="cfdi-uso-label" htmlFor="cfdi-uso" className="pl-acct-field-label">
                Uso de CFDI
              </label>
              <PlSelect
                id="cfdi-uso"
                name="usoCfdi"
                ariaLabelledBy="cfdi-uso-label"
                variant="field"
                size="md"
                fullWidth
                popoverWidth="trigger"
                triggerClassName="pl-acct-select-trigger"
                isInvalid={errorField === "usoCfdi"}
                value={usoCfdi}
                onChange={(next) => {
                  setUsoCfdi(next);
                  clearFeedback();
                }}
                options={USO_CFDI_OPTIONS}
              />
            </div>

            <div className="pl-acct-field">
              <label htmlFor="cfdi-cp" className="pl-acct-field-label">
                Código postal fiscal
              </label>
              <input
                id="cfdi-cp"
                name="cpFiscal"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={cpFiscal}
                onChange={(e) => {
                  setCpFiscal(e.target.value.replace(/\D/g, ""));
                  clearFeedback();
                }}
                autoComplete="postal-code"
                enterKeyHint="done"
                required
                aria-invalid={errorField === "cpFiscal" ? "true" : undefined}
                aria-describedby={errorField === "cpFiscal" ? `${cpHintId} ${errorBannerId}` : cpHintId}
                className="pl-acct-input num"
              />
              <span id={cpHintId} className="pl-acct-field-hint">
                Código postal de 5 dígitos registrado ante el SAT.
              </span>
            </div>
          </div>

          {errorNotice ? (
            <p
              id={errorBannerId}
              role="alert"
              className="pl-acct-prefs-warn"
              data-cfdi-error=""
            >
              {errorNotice}
            </p>
          ) : null}

          <div className="pl-acct-cfdi-actions">
            <Button type="submit" variant="primary">
              <MaestroIcon name="receipt" size={15} />
              <span>Guardar datos fiscales</span>
            </Button>
            <span role="status" aria-live="polite" className="pl-acct-saved-inline">
              {savedNotice}
            </span>
          </div>
        </form>
      </SofascoreCard>
    </div>
  );
}
