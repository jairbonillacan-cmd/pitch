"use client";

import React, { useMemo } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { Label, ListBox, Select } from "@heroui/react";
import { LeagueBadge } from "../../sports";
import { MaestroIcon } from "./MaestroPrimitives";

export interface PlSelectOption<T extends string = string> {
  /** Valor único de la opción. */
  value: T;
  /** Etiqueta principal mostrada en la lista (y en el disparador si no hay triggerLabel). */
  label: string;
  /** Metadata o línea secundaria dentro de la lista desplegable. */
  description?: string;
  /** Emblema o ícono izquierdo (ej. LeagueBadge o MaestroIcon). */
  icon?: React.ReactNode;
  /** Etiqueta compacta en el botón cerrado cuando el menú abierto muestra más contexto. */
  triggerLabel?: string;
  /** Texto plano para lectores de pantalla y búsqueda rápida con el teclado. */
  textValue?: string;
  disabled?: boolean;
}

export type PlSelectVariant = "glass" | "pill" | "field" | "auth";
export type PlSelectSize = "sm" | "md" | "lg";

export interface PlSelectProps<T extends string = string> {
  options: readonly PlSelectOption<T>[];
  value: T | "" | null | undefined;
  onChange: (value: T) => void;
  variant?: PlSelectVariant;
  size?: PlSelectSize;
  fullWidth?: boolean;
  label?: React.ReactNode;
  placeholder?: string;
  /** ID aplicado al `<button>` disparador para asociar `<label htmlFor>` y pruebas. */
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  name?: string;
  autoComplete?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  /**
   * "min-trigger": crece lo necesario para que opciones cortas en botones angostos respiren.
   * "trigger": iguala el ancho del botón disparador (ideal en formularios anchos con texto largo).
   */
  popoverWidth?: "min-trigger" | "trigger";
}

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Selector curado de PitchLab sobre HeroUI `Select` + React Aria `ListBox`.
 * Usa Smoked Glass en tema oscuro y Alabastro limpio en tema claro, mantiene un
 * `<select>` oculto para autofill y formularios nativos, y garantiza navegación
 * completa por teclado, detección de bordes y objetivos táctiles de >= 44 px en móvil.
 */
export function PlSelect<T extends string = string>({
  options,
  value,
  onChange,
  variant = "glass",
  size = variant === "pill" ? "sm" : variant === "auth" ? "lg" : "md",
  fullWidth = variant === "field" || variant === "auth",
  label,
  placeholder,
  id,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  name,
  autoComplete,
  isDisabled = false,
  isInvalid = false,
  defaultOpen,
  className,
  triggerClassName,
  popoverClassName,
  popoverWidth = "min-trigger",
}: PlSelectProps<T>): React.JSX.Element {
  const optionByValue = useMemo(() => {
    const map = new Map<string, PlSelectOption<T>>();
    for (const opt of options) {
      map.set(opt.value, opt);
    }
    return map;
  }, [options]);

  const resolvedValue =
    value != null && value !== "" && optionByValue.has(value) ? value : null;

  return (
    <Select
      className={joinClasses("pl-select", className)}
      data-pl-select=""
      data-variant={variant}
      data-size={size}
      data-full-width={fullWidth ? "true" : undefined}
      fullWidth={fullWidth}
      value={resolvedValue}
      onChange={(nextKey) => {
        if (nextKey == null) return;
        onChange(String(nextKey) as T);
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      name={name}
      autoComplete={autoComplete}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      defaultOpen={defaultOpen}
    >
      {label ? <Label className="pl-select-label">{label}</Label> : null}
      <Select.Trigger
        id={id}
        aria-describedby={ariaDescribedBy || undefined}
        className={joinClasses("pl-select-trigger", triggerClassName)}
      >
        <Select.Value className="pl-select-value">
          {({ isPlaceholder, state }) => {
            const activeKey =
              state.value != null ? String(state.value) : resolvedValue;
            const current = activeKey ? optionByValue.get(activeKey) : undefined;
            if (isPlaceholder || !current) {
              return (
                <span className="pl-select-value-text">{placeholder ?? ""}</span>
              );
            }
            return (
              <span className="pl-select-value-row">
                {current.icon ? (
                  <span className="pl-select-value-icon" aria-hidden="true">
                    {current.icon}
                  </span>
                ) : null}
                <span className="pl-select-value-text">
                  {current.triggerLabel ?? current.label}
                </span>
              </span>
            );
          }}
        </Select.Value>
        <Select.Indicator className="pl-select-chevron" />
      </Select.Trigger>
      <Select.Popover
        className={joinClasses("pl-select-popover", popoverClassName)}
        data-popover-width={popoverWidth}
        placement="bottom start"
        offset={6}
        containerPadding={12}
        shouldFlip
      >
        <ListBox className="pl-select-listbox">
          {options.map((opt) => (
            <ListBox.Item
              key={opt.value}
              id={opt.value}
              textValue={opt.textValue ?? opt.label}
              isDisabled={opt.disabled}
              className="pl-select-item"
            >
              {opt.icon ? (
                <span className="pl-select-item-icon" aria-hidden="true">
                  {opt.icon}
                </span>
              ) : null}
              <span className="pl-select-item-copy">
                <span className="pl-select-item-label">{opt.label}</span>
                {opt.description ? (
                  <span className="pl-select-item-desc">{opt.description}</span>
                ) : null}
              </span>
              <ListBox.ItemIndicator className="pl-select-item-check" />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export interface PlLeagueSelectProps {
  leagues: ReadonlyArray<{ league: LeagueId; label: string; logoUrl?: string }>;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  ariaLabel: string;
  variant?: PlSelectVariant;
  size?: PlSelectSize;
  defaultOpen?: boolean;
  className?: string;
}

/** Selector de liga compartido: muestra los emblemas oficiales junto al filtro global. */
export function PlLeagueSelect({
  leagues,
  value,
  onChange,
  allLabel,
  ariaLabel,
  variant = "glass",
  size = "sm",
  defaultOpen,
  className,
}: PlLeagueSelectProps): React.JSX.Element {
  const options = useMemo<PlSelectOption<string>[]>(
    () => [
      {
        value: "all",
        label: allLabel,
        icon: <MaestroIcon name="layers" size={14} />,
      },
      ...leagues.map((l) => ({
        value: l.league,
        label: l.label,
        icon: <LeagueBadge league={l.league} label={l.label} logoUrl={l.logoUrl} size={16} />,
      })),
    ],
    [allLabel, leagues],
  );

  return (
    <PlSelect
      options={options}
      value={value}
      onChange={onChange}
      variant={variant}
      size={size}
      defaultOpen={defaultOpen}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
