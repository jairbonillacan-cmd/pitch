import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

import { COLORS, FONT_STACK } from "./brand";

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        margin: "0 0 12px",
        fontFamily: FONT_STACK,
        fontSize: "24px",
        lineHeight: "30px",
        fontWeight: 700,
        letterSpacing: "-0.01em",
        color: COLORS.text,
      }}
    >
      {children}
    </Heading>
  );
}

export function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        margin: "0 0 16px",
        fontFamily: FONT_STACK,
        fontSize: "15px",
        lineHeight: "24px",
        color: muted ? COLORS.textMuted : COLORS.textSecondary,
      }}
    >
      {children}
    </Text>
  );
}

export function Cta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0 8px" }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: COLORS.primary,
          color: COLORS.onPrimary,
          fontFamily: FONT_STACK,
          fontSize: "15px",
          lineHeight: "20px",
          fontWeight: 600,
          textDecoration: "none",
          borderRadius: "10px",
          padding: "13px 24px",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** Enlace en texto bajo el botón, por si el botón no carga. */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Text
      style={{
        margin: "16px 0 0",
        fontFamily: FONT_STACK,
        fontSize: "12px",
        lineHeight: "18px",
        color: COLORS.textMuted,
        wordBreak: "break-all",
      }}
    >
      ¿El botón no funciona? Copia este enlace en tu navegador:
      <br />
      <Link href={href} style={{ color: COLORS.accent, textDecoration: "underline" }}>
        {href}
      </Link>
    </Text>
  );
}

type Tone = "info" | "success" | "warning" | "danger";

const TONE_COLOR: Record<Tone, string> = {
  info: COLORS.info,
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
};

/** Aviso con barra de color a la izquierda. */
export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <Section
      style={{
        margin: "8px 0 16px",
        backgroundColor: COLORS.cardSoft,
        borderLeft: `3px solid ${TONE_COLOR[tone]}`,
        borderRadius: "8px",
        padding: "12px 16px",
      }}
    >
      <Text
        style={{
          margin: 0,
          fontFamily: FONT_STACK,
          fontSize: "14px",
          lineHeight: "22px",
          color: COLORS.textSecondary,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

/** Tabla de datos (recibos, fechas, montos). */
export function Facts({ rows }: { rows: ReadonlyArray<readonly [label: string, value: string]> }) {
  return (
    <Section
      style={{
        margin: "8px 0 16px",
        backgroundColor: COLORS.cardSoft,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "12px",
        padding: "4px 16px",
      }}
    >
      {rows.map(([label, value], i) => (
        <table
          key={label}
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}
        >
          <tbody>
            <tr>
              <td style={{ padding: "11px 0", fontFamily: FONT_STACK, fontSize: "13px", color: COLORS.textMuted }}>
                {label}
              </td>
              <td
                align="right"
                style={{ padding: "11px 0", fontFamily: FONT_STACK, fontSize: "14px", fontWeight: 600, color: COLORS.text }}
              >
                {value}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  );
}

export function Divider() {
  return <Hr style={{ borderColor: COLORS.border, margin: "24px 0" }} />;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: COLORS.primary, textDecoration: "underline" }}>
      {children}
    </Link>
  );
}

/** Lista numerada simple (pasos, qué probar). */
export function Steps({ items }: { items: readonly string[] }) {
  return (
    <Section style={{ margin: "8px 0 8px" }}>
      {items.map((item, i) => (
        <table key={item} role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td
                width="32"
                valign="top"
                style={{ padding: "6px 0", fontFamily: FONT_STACK, fontSize: "15px", fontWeight: 700, color: COLORS.primary }}
              >
                {i + 1}
              </td>
              <td
                valign="top"
                style={{ padding: "6px 0", fontFamily: FONT_STACK, fontSize: "15px", lineHeight: "24px", color: COLORS.textSecondary }}
              >
                {item}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  );
}

export function greeting(name?: string): string {
  return name ? `Hola, ${name}.` : "Hola.";
}
