import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

import { COLORS, FONT_STACK } from "./brand";

/** Rótulo violeta en mayúsculas sobre el título, como en la landing. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: "0 0 14px",
        fontFamily: FONT_STACK,
        fontSize: "11px",
        lineHeight: "16px",
        fontWeight: 600,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: COLORS.brand,
      }}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        margin: "0 0 14px",
        fontFamily: FONT_STACK,
        fontSize: "32px",
        lineHeight: "36px",
        fontWeight: 800,
        letterSpacing: "-0.035em",
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
        fontSize: "16px",
        lineHeight: "26px",
        color: muted ? COLORS.textMuted : COLORS.textSecondary,
      }}
    >
      {children}
    </Text>
  );
}

/** Botón principal: píldora blanca con texto negro, igual que la landing. */
export function Cta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "28px 0 8px" }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: COLORS.buttonBg,
          color: COLORS.buttonFg,
          fontFamily: FONT_STACK,
          fontSize: "15px",
          lineHeight: "20px",
          fontWeight: 600,
          letterSpacing: "-0.01em",
          textDecoration: "none",
          borderRadius: "999px",
          padding: "15px 30px",
        }}
      >
        {children}&nbsp;&nbsp;→
      </Button>
    </Section>
  );
}

/** Enlace en texto bajo el botón, por si el botón no carga. */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Text
      style={{
        margin: "20px 0 0",
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

type Tone = "info" | "success" | "warning" | "danger" | "brand";

const TONE_COLOR: Record<Tone, string> = {
  info: COLORS.info,
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
  brand: COLORS.brand,
};

const TONE_LABEL: Record<Tone, string> = {
  info: "Nota",
  success: "Listo",
  warning: "Importante",
  danger: "Atención",
  brand: "Nota",
};

/** Aviso sin caja: filete fino, rótulo de color en mayúsculas y texto. Igual que los rótulos de la landing. */
export function Notice({ tone = "info", label, children }: { tone?: Tone; label?: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0 8px", borderTop: `1px solid ${COLORS.rule}`, padding: "18px 0 0" }}>
      <Text
        style={{
          margin: "0 0 6px",
          fontFamily: FONT_STACK,
          fontSize: "11px",
          lineHeight: "16px",
          fontWeight: 600,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: TONE_COLOR[tone],
        }}
      >
        {label ?? TONE_LABEL[tone]}
      </Text>
      <Text
        style={{
          margin: 0,
          fontFamily: FONT_STACK,
          fontSize: "15px",
          lineHeight: "24px",
          color: COLORS.textSecondary,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

/** Cifra grande en verde, como las probabilidades de la landing. */
export function Stat({ value, label, tone = "success" }: { value: string; label?: string; tone?: Tone }) {
  return (
    <Section style={{ margin: "4px 0 20px" }}>
      <Text
        style={{
          margin: 0,
          fontFamily: FONT_STACK,
          fontSize: "52px",
          lineHeight: "56px",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          color: TONE_COLOR[tone],
        }}
      >
        {value}
      </Text>
      {label ? (
        <Text style={{ margin: "4px 0 0", fontFamily: FONT_STACK, fontSize: "14px", color: COLORS.textMuted }}>
          {label}
        </Text>
      ) : null}
    </Section>
  );
}

/** Cuadrícula de cifras (2 por fila) con filetes finos: el récord del mes. */
export function StatGrid({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: string; tone?: Tone }>;
}) {
  const rows: Array<typeof items> = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <Section
      style={{
        margin: "20px 0 16px",
        backgroundColor: COLORS.well,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "20px",
      }}
    >
      {rows.map((row, r) => (
        <table
          key={row[0]!.label}
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderTop: r === 0 ? "none" : `1px solid ${COLORS.rule}` }}
        >
          <tbody>
            <tr>
              {row.map((item, c) => (
                <td
                  key={item.label}
                  width="50%"
                  valign="top"
                  style={{ padding: "20px 22px", borderLeft: c === 0 ? "none" : `1px solid ${COLORS.rule}` }}
                >
                  <div
                    style={{
                      fontFamily: FONT_STACK,
                      fontSize: "32px",
                      lineHeight: "36px",
                      fontWeight: 800,
                      letterSpacing: "-0.035em",
                      color: item.tone ? TONE_COLOR[item.tone] : COLORS.text,
                    }}
                  >
                    {item.value}
                  </div>
                  <div style={{ fontFamily: FONT_STACK, fontSize: "13px", lineHeight: "20px", color: COLORS.textMuted }}>
                    {item.label}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  );
}

/** Tabla de datos (recibos, fechas, montos): tarjeta con borde fino. */
export function Facts({ rows }: { rows: ReadonlyArray<readonly [label: string, value: string]> }) {
  return (
    <Section
      style={{
        margin: "20px 0 16px",
        backgroundColor: COLORS.well,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "20px",
        padding: "6px 20px",
      }}
    >
      {rows.map(([label, value], i) => (
        <table
          key={label}
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.rule}` }}
        >
          <tbody>
            <tr>
              <td style={{ padding: "13px 0", fontFamily: FONT_STACK, fontSize: "14px", color: COLORS.textMuted }}>
                {label}
              </td>
              <td
                align="right"
                style={{
                  padding: "13px 0",
                  fontFamily: FONT_STACK,
                  fontSize: "15px",
                  fontWeight: 600,
                  color: COLORS.text,
                }}
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
  return <Hr style={{ borderColor: COLORS.rule, margin: "24px 0" }} />;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: COLORS.brand, textDecoration: "underline" }}>
      {children}
    </Link>
  );
}

/** Lista numerada con círculos (pasos, qué probar). */
export function Steps({ items }: { items: readonly string[] }) {
  return (
    <Section style={{ margin: "20px 0 8px" }}>
      {items.map((item, i) => (
        <table key={item} role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td width="44" valign="top" style={{ padding: "7px 0" }}>
                <table role="presentation" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td
                        align="center"
                        width="30"
                        height="30"
                        style={{
                          width: "30px",
                          height: "30px",
                          border: `1px solid ${COLORS.borderStrong}`,
                          borderRadius: "999px",
                          fontFamily: FONT_STACK,
                          fontSize: "13px",
                          fontWeight: 700,
                          color: COLORS.brand,
                        }}
                      >
                        {i + 1}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td
                valign="top"
                style={{
                  padding: "7px 0",
                  fontFamily: FONT_STACK,
                  fontSize: "16px",
                  lineHeight: "26px",
                  color: COLORS.textSecondary,
                }}
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
