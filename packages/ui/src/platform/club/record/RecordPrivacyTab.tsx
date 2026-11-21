"use client";

import React, { useId, useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import { Button, SofascoreCard } from "../../../components/ui/primitives";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
import {
  DEFAULT_RECORD_PRIVACY,
  RECORD_PRIVACY_BLOCKS,
  publicRecordView,
  type RecordEntry,
  type RecordPrivacy,
  type RecordPrivacyBlock,
  type RecordStats,
} from "../../record-stats";
import type { OddsFormat } from "../../types";
import { PublicRecordPreviewCard } from "./PublicRecordSections";

const BLOCK_KEYS: readonly RecordPrivacyBlock[] = [
  "record",
  "performance",
  "bank",
  "history",
];

function getFieldEntries(blockKey: RecordPrivacyBlock): ReadonlyArray<readonly [string, string]> {
  return Object.entries(RECORD_PRIVACY_BLOCKS[blockKey].fields);
}

function getBlockFieldFlag(
  privacy: RecordPrivacy,
  blockKey: RecordPrivacyBlock,
  fieldKey: string,
): boolean {
  const entries = Object.entries(privacy[blockKey].fields);
  const matched = entries.find(([key]) => key === fieldKey);
  return Boolean(matched?.[1]);
}

function isPrivacyCustomized(
  privacy: RecordPrivacy,
  publicRecordVisible: boolean,
  showInRanking: boolean,
): boolean {
  if (!publicRecordVisible || !showInRanking) return true;
  for (const blockKey of BLOCK_KEYS) {
    const cur = privacy[blockKey];
    const def = DEFAULT_RECORD_PRIVACY[blockKey];
    if (cur.enabled !== def.enabled) return true;
    for (const [fKey] of getFieldEntries(blockKey)) {
      if (getBlockFieldFlag(privacy, blockKey, fKey) !== getBlockFieldFlag(DEFAULT_RECORD_PRIVACY, blockKey, fKey)) {
        return true;
      }
    }
  }
  return false;
}

export function RecordPrivacyTab({
  handle,
  stats,
  entries,
  oddsFormat,
  publicRecordVisible,
  showInRanking,
  privacy,
  onTogglePublicRecord,
  onToggleShowInRanking,
  onToggleBlock,
  onToggleField,
  onResetPrivacy,
}: {
  handle: string;
  stats: RecordStats;
  entries: readonly RecordEntry[];
  oddsFormat: OddsFormat;
  publicRecordVisible: boolean;
  showInRanking: boolean;
  privacy: RecordPrivacy;
  onTogglePublicRecord: (next: boolean) => void;
  onToggleShowInRanking: (next: boolean) => void;
  onToggleBlock: (block: RecordPrivacyBlock, enabled: boolean) => void;
  onToggleField: (block: RecordPrivacyBlock, field: string, enabled: boolean) => void;
  onResetPrivacy?: () => void;
}): React.JSX.Element {
  const uid = useId();
  const masterLabelId = `${uid}-master-lbl`;
  const masterDescId = `${uid}-master-desc`;
  const rankLabelId = `${uid}-rank-lbl`;
  const rankDescId = `${uid}-rank-desc`;

  const [expanded, setExpanded] = useState<Record<RecordPrivacyBlock, boolean>>({
    record: true,
    performance: true,
    bank: true,
    history: true,
  });
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const liveView = useMemo(
    () => (publicRecordVisible ? publicRecordView(stats, entries, privacy, 12) : null),
    [entries, privacy, publicRecordVisible, stats],
  );

  const customized = useMemo(
    () => isPrivacyCustomized(privacy, publicRecordVisible, showInRanking),
    [privacy, publicRecordVisible, showInRanking],
  );

  return (
    <div className="pl-rec-priv-layout">
      <div className="pl-rec-priv-controls">
        <SofascoreCard
          id={`${uid}-general`}
          title="Visibilidad general"
          meta={<span>@{handle}</span>}
        >
          <div className="space-y-3">
            <p className="pl-rec-card-meta">
              Tú eliges qué ven otros socios en <strong>@{handle}</strong>.
            </p>

            <div className="pl-rec-priv-banner [text-wrap:pretty]">
              <strong>Garantía de privacidad:</strong> los montos en pesos (banca y equivalencias
              MXN) y tus picks abiertos nunca se muestran a nadie, aunque actives todos los bloques.
            </div>

            <div className="pl-rec-priv-row">
              <div className="min-w-0">
                <strong id={masterLabelId} className="block text-sm font-bold">
                  Mostrar mi récord en mi perfil público
                </strong>
                <span
                  id={masterDescId}
                  className="block text-xs [text-wrap:pretty]"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  Si lo apagas, nadie ve estadísticas ni historial de picks en tu perfil.
                </span>
              </div>
              <Switch
                aria-labelledby={masterLabelId}
                aria-describedby={masterDescId}
                isSelected={publicRecordVisible}
                onChange={onTogglePublicRecord}
                className="pl-acct-switch"
              >
                <Switch.Content>
                  <Switch.Control className="pl-acct-switch-control">
                    <Switch.Thumb className="pl-acct-switch-thumb" />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>

            <div
              className="pl-rec-priv-row hairline-t"
              data-dimmed={!publicRecordVisible ? "true" : undefined}
            >
              <div className="min-w-0">
                <strong id={rankLabelId} className="block text-sm font-bold">
                  Aparecer en el ranking de Comunidad
                </strong>
                <span
                  id={rankDescId}
                  className="block text-xs [text-wrap:pretty]"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  Participas en la tabla semanal y mensual cuando cumplas la muestra mínima de picks
                  cerrados.
                </span>
              </div>
              <Switch
                aria-labelledby={rankLabelId}
                aria-describedby={rankDescId}
                isSelected={publicRecordVisible && showInRanking}
                isDisabled={!publicRecordVisible}
                onChange={onToggleShowInRanking}
                className="pl-acct-switch"
              >
                <Switch.Content>
                  <Switch.Control className="pl-acct-switch-control">
                    <Switch.Thumb className="pl-acct-switch-thumb" />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>
          </div>
        </SofascoreCard>

        {BLOCK_KEYS.map((blockKey) => {
          const spec = RECORD_PRIVACY_BLOCKS[blockKey];
          const blockState = privacy[blockKey];
          const fieldEntries = getFieldEntries(blockKey);
          const activeFields = fieldEntries.filter(([fKey]) =>
            getBlockFieldFlag(privacy, blockKey, fKey),
          ).length;
          const isOpen = expanded[blockKey];
          const blockLabelId = `${uid}-blk-${blockKey}-lbl`;
          const blockDescId = `${uid}-blk-${blockKey}-desc`;
          const panelId = `${uid}-blk-${blockKey}-panel`;

          return (
            <section
              key={blockKey}
              className="pl-sf-card pl-rec-priv-block"
              aria-labelledby={blockLabelId}
              data-pl-sf-card=""
              data-privacy-block={blockKey}
            >
              <div className="pl-rec-priv-block-head">
                <div className="pl-rec-priv-block-copy">
                  <h3 id={blockLabelId} className="pl-rec-priv-block-title">
                    <span>{spec.label}</span>
                    <span className="pl-pill num">
                      {!publicRecordVisible || !blockState.enabled
                        ? "Oculto"
                        : `${activeFields} de ${fieldEntries.length} visibles`}
                    </span>
                  </h3>
                  <p id={blockDescId} className="pl-rec-hint [text-wrap:pretty]">
                    {spec.hint}
                  </p>
                </div>

                <Switch
                  aria-labelledby={blockLabelId}
                  aria-describedby={blockDescId}
                  isSelected={publicRecordVisible && blockState.enabled}
                  isDisabled={!publicRecordVisible}
                  onChange={(next) => onToggleBlock(blockKey, next)}
                  className="pl-acct-switch"
                >
                  <Switch.Content>
                    <Switch.Control className="pl-acct-switch-control">
                      <Switch.Thumb className="pl-acct-switch-thumb" />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </div>

              {fieldEntries.length > 1 ? (
                <button
                  type="button"
                  className="pl-rec-disclosure"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [blockKey]: !prev[blockKey] }))
                  }
                >
                  <MaestroIcon name={isOpen ? "chevronDown" : "chevronRight"} size={14} />
                  <span>{isOpen ? "Ocultar datos individuales" : "Elegir dato por dato"}</span>
                </button>
              ) : null}

              <div
                id={panelId}
                className="pl-rec-priv-fields"
                hidden={!isOpen && fieldEntries.length > 1}
              >
                {fieldEntries.map(([fieldKey, fieldLabel]) => {
                  const fieldChecked = getBlockFieldFlag(privacy, blockKey, fieldKey);
                  const disabled = !publicRecordVisible || !blockState.enabled;
                  const fId = `${uid}-fld-${blockKey}-${fieldKey}`;
                  return (
                    <div
                      key={fieldKey}
                      className="pl-rec-priv-row"
                      data-dimmed={disabled ? "true" : undefined}
                      data-privacy-field={`${blockKey}.${fieldKey}`}
                    >
                      <span id={fId} className="pl-rec-priv-field-name">
                        {fieldLabel}
                      </span>
                      <Switch
                        aria-labelledby={fId}
                        isSelected={!disabled && fieldChecked}
                        isDisabled={disabled}
                        onChange={(next) => onToggleField(blockKey, fieldKey, next)}
                        className="pl-acct-switch"
                      >
                        <Switch.Content>
                          <Switch.Control className="pl-acct-switch-control">
                            <Switch.Thumb className="pl-acct-switch-thumb" />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {onResetPrivacy && customized ? (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              data-reset-privacy-trigger=""
              onClick={() => setConfirmResetOpen(true)}
            >
              Restaurar privacidad predeterminada
            </Button>
          </div>
        ) : null}
      </div>

      <aside className="pl-rec-priv-preview" aria-label="Vista previa pública de tu récord">
        <PublicRecordPreviewCard
          handle={handle}
          hidden={!publicRecordVisible}
          settled={stats.settled}
          view={liveView}
          oddsFormat={oddsFormat}
          isPreview
        />
      </aside>

      {onResetPrivacy ? (
        <ConfirmActionDialog
          open={confirmResetOpen}
          title="¿Restaurar privacidad predeterminada?"
          description="Se restablecerán los bloques visibles a la configuración inicial. Tus montos en pesos y tus picks pendientes siempre permanecerán privados."
          confirmLabel="Restaurar"
          cancelLabel="Cancelar"
          tone="brand"
          onConfirm={onResetPrivacy}
          onCancel={() => setConfirmResetOpen(false)}
        />
      ) : null}
    </div>
  );
}
