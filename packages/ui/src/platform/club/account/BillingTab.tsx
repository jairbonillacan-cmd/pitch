"use client";

import React, { useEffect, useState } from "react";
import { ExampleNotice, MaestroIcon } from "../../components/MaestroPrimitives";
import { usePlatform } from "../../platform-provider";
import { MEMBERSHIP_SPEC } from "../../spacetime-catalog";
import {
  DEFAULT_CFDI_DRAFT_V1,
  readStoredCfdiDraft,
  validateMexicanRfc,
  writeStoredCfdiDraft,
} from "./account-helpers";

export function BillingTab({
  accountsEnabledOverride,
}: {
  accountsEnabledOverride?: boolean;
} = {}): React.JSX.Element {
  const { hasAccountSessionAuth, paymentMode, navigateTo } = usePlatform();
  const accountsEnabled = accountsEnabledOverride ?? hasAccountSessionAuth;

  const [rfc, setRfc] = useState(DEFAULT_CFDI_DRAFT_V1.rfc);
  const [razonSocial, setRazonSocial] = useState(DEFAULT_CFDI_DRAFT_V1.razonSocial);
  const [regimenFiscal, setRegimenFiscal] = useState(DEFAULT_CFDI_DRAFT_V1.regimenFiscal);
  const [usoCfdi, setUsoCfdi] = useState(DEFAULT_CFDI_DRAFT_V1.usoCfdi);
  const [cpFiscal, setCpFiscal] = useState(DEFAULT_CFDI_DRAFT_V1.cpFiscal);
  const [errorNotice, setErrorNotice] = useState("");
  const [savedNotice, setSavedNotice] = useState("");

  useEffect(() => {
    const stored = readStoredCfdiDraft();
    setRfc(stored.rfc);
    setRazonSocial(stored.razonSocial);
    setRegimenFiscal(stored.regimenFiscal);
    setUsoCfdi(stored.usoCfdi);
    setCpFiscal(stored.cpFiscal);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedRfc = rfc.trim().toUpperCase();
    const cleanedRazon = razonSocial.trim().toUpperCase();
    const cleanedCp = cpFiscal.replace(/\D/g, "").slice(0, 5);

    const rfcCheck = validateMexicanRfc(cleanedRfc, regimenFiscal);
    if (!rfcCheck.valid) {
      setSavedNotice("");
      setErrorNotice(rfcCheck.error ?? "Revisa el RFC.");
      return;
    }
    if (cleanedRazon.length < 2) {
      setSavedNotice("");
      setErrorNotice("Ingresa tu nombre o razón social tal como aparece en tu constancia.");
      return;
    }
    if (!/^\d{5}$/.test(cleanedCp)) {
      setSavedNotice("");
      setErrorNotice("Ingresa un código postal fiscal de 5 dígitos.");
      return;
    }
    if (regimenFiscal === "616" && usoCfdi !== "S01") {
      setSavedNotice("");
      setErrorNotice("Para el régimen 616 (Sin obligaciones fiscales) selecciona uso de CFDI S01.");
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
        <div
          className="glass-ring rounded-2xl p-4 space-y-2.5"
          style={{ background: "var(--pl-surface)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="pl-pill pl-pill--accent">Beta 1.0 · Transferencia SPEI</span>
            <a
              href="/app/account?tab=plan#transfer"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/account?tab=plan#transfer");
              }}
              className="pl-btn-glass text-xs min-h-[44px] inline-flex items-center px-3"
            >
              Ver pagos SPEI
            </a>
          </div>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            En Beta 1.0 las facturas CFDI 4.0 se emiten bajo solicitud después de aprobar tu
            transferencia SPEI. Valida aquí tus datos fiscales y envíalos junto con tu referencia{" "}
            <code>PL-...</code> a{" "}
            <a href="mailto:soporte@pitchlab.mx" className="font-bold underline">
              soporte@pitchlab.mx
            </a>{" "}
            dentro del mismo mes calendario del pago.
          </p>
        </div>
      ) : null}

      <section className="pl-acct-card glass-card glass-ring" aria-labelledby="pl-acct-cfdi-h">
        <div className="pl-acct-row-between">
          <div>
            <h2 id="pl-acct-cfdi-h" className="pl-acct-h2">
              Facturación CFDI 4.0
            </h2>
            <p className="pl-acct-subcopy">{MEMBERSHIP_SPEC.cfdiNote}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="pl-acct-cfdi-form" noValidate>
          <div className="pl-acct-cfdi-grid">
            <div className="pl-acct-field">
              <label htmlFor="cfdi-rfc" className="pl-acct-field-label">
                RFC
              </label>
              <input
                id="cfdi-rfc"
                type="text"
                maxLength={13}
                value={rfc}
                onChange={(e) => {
                  setRfc(e.target.value.toUpperCase());
                  if (errorNotice) setErrorNotice("");
                  if (savedNotice) setSavedNotice("");
                }}
                placeholder="ABCD890123XYZ"
                autoComplete="off"
                className="pl-acct-input pl-acct-mono num"
              />
            </div>

            <div className="pl-acct-field">
              <label htmlFor="cfdi-razon" className="pl-acct-field-label">
                Razón social (sin régimen societario)
              </label>
              <input
                id="cfdi-razon"
                type="text"
                value={razonSocial}
                onChange={(e) => {
                  setRazonSocial(e.target.value.toUpperCase());
                  if (errorNotice) setErrorNotice("");
                  if (savedNotice) setSavedNotice("");
                }}
                placeholder="TAL COMO APARECE EN TU CONSTANCIA"
                autoComplete="organization"
                className="pl-acct-input"
              />
            </div>

            <div className="pl-acct-field">
              <label htmlFor="cfdi-regimen" className="pl-acct-field-label">
                Régimen fiscal SAT
              </label>
              <select
                id="cfdi-regimen"
                value={regimenFiscal}
                onChange={(e) => {
                  setRegimenFiscal(e.target.value);
                  if (errorNotice) setErrorNotice("");
                  if (savedNotice) setSavedNotice("");
                }}
                className="pl-acct-input"
              >
                <option value="612">612 — Personas Físicas con Actividades Empresariales</option>
                <option value="626">626 — Régimen Simplificado de Confianza (RESICO)</option>
                <option value="605">605 — Sueldos y Salarios</option>
                <option value="601">601 — General de Ley Personas Morales</option>
                <option value="616">616 — Sin obligaciones fiscales</option>
              </select>
            </div>

            <div className="pl-acct-field">
              <label htmlFor="cfdi-uso" className="pl-acct-field-label">
                Uso de CFDI
              </label>
              <select
                id="cfdi-uso"
                value={usoCfdi}
                onChange={(e) => {
                  setUsoCfdi(e.target.value);
                  if (savedNotice) setSavedNotice("");
                }}
                className="pl-acct-input"
              >
                <option value="G03">G03 — Gastos en general</option>
                <option value="S01">S01 — Sin efectos fiscales</option>
              </select>
            </div>

            <div className="pl-acct-field">
              <label htmlFor="cfdi-cp" className="pl-acct-field-label">
                Código postal fiscal
              </label>
              <input
                id="cfdi-cp"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={cpFiscal}
                onChange={(e) => {
                  setCpFiscal(e.target.value.replace(/\D/g, ""));
                  if (errorNotice) setErrorNotice("");
                  if (savedNotice) setSavedNotice("");
                }}
                placeholder="06600"
                autoComplete="postal-code"
                className="pl-acct-input num"
              />
            </div>
          </div>

          {errorNotice ? (
            <p role="alert" className="pl-acct-prefs-warn" data-cfdi-error="">
              {errorNotice}
            </p>
          ) : null}

          <div className="pl-acct-cfdi-actions">
            <button type="submit" className="pl-acct-btn pl-acct-btn--primary">
              <MaestroIcon name="receipt" size={15} />
              <span>Guardar datos fiscales</span>
            </button>
            <span role="status" aria-live="polite" className="pl-acct-saved-inline">
              {savedNotice}
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}
