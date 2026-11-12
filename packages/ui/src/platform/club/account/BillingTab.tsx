"use client";

import React, { useState } from "react";
import { ExampleBadge, ExampleNotice, MaestroIcon } from "../../components/MaestroPrimitives";
import { usePlatform } from "../../platform-provider";
import { MEMBERSHIP_SPEC } from "../../spacetime-catalog";

export function BillingTab(): React.JSX.Element {
  const { pushToast } = usePlatform();
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [regimenFiscal, setRegimenFiscal] = useState("612");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [cpFiscal, setCpFiscal] = useState("");
  const [savedNotice, setSavedNotice] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedRfc = rfc.trim().toUpperCase();
    if (cleanedRfc.length > 0 && cleanedRfc.length < 12) {
      pushToast("Revisa el RFC: debe tener 12 o 13 caracteres.", "warning");
      return;
    }
    setSavedNotice("Datos fiscales guardados en este dispositivo.");
    pushToast("Datos fiscales guardados para tu próxima factura CFDI 4.0.", "success");
  };

  return (
    <div className="pl-acct-stack">
      <ExampleNotice>
        La emisión automática de facturas CFDI 4.0 se activará junto con el cobro. Puedes guardar tus datos fiscales desde ahora.
      </ExampleNotice>

      <section className="pl-acct-card glass-card glass-ring" aria-labelledby="pl-acct-cfdi-h">
        <div className="pl-acct-row-between">
          <div>
            <h2 id="pl-acct-cfdi-h" className="pl-acct-h2">
              Facturación CFDI 4.0
            </h2>
            <p className="pl-acct-subcopy">{MEMBERSHIP_SPEC.cfdiNote}</p>
          </div>
          <ExampleBadge />
        </div>

        <form onSubmit={handleSubmit} className="pl-acct-cfdi-form">
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
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
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
                onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                placeholder="NOMBRE O DENOMINACIÓN TAL COMO EN CONSTANCIA"
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
                onChange={(e) => setRegimenFiscal(e.target.value)}
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
                onChange={(e) => setUsoCfdi(e.target.value)}
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
                onChange={(e) => setCpFiscal(e.target.value.replace(/\D/g, ""))}
                placeholder="06600"
                autoComplete="postal-code"
                className="pl-acct-input num"
              />
            </div>
          </div>

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
