import { Section } from "@react-email/components";

import { COLORS, FONT_STACK, siteUrl } from "../brand";
import { Cta, Eyebrow, greeting, P, TextLink, Title } from "../components";
import { EmailLayout } from "../layout";

/* 14 · Resumen semanal de lo más probable ------------------------------------------------ */

export interface DigestItem {
  match: string;
  league: string;
  kickoff: string;
  /** Resultado más probable, en palabras: «Gana Cruz Azul». */
  outcome: string;
  /** Ya formateada: «62 %». */
  probability: string;
  /** Momio justo: «1.61». */
  fairOdds: string;
}

export interface WeeklyDigestProps {
  name?: string;
  weekLabel: string;
  items: readonly DigestItem[];
  appUrl?: string;
  /** Obligatorio: el resumen es un correo que se manda con consentimiento y se puede cancelar de un clic. */
  unsubscribeUrl: string;
}

export const weeklyDigestSubject = ({ weekLabel }: WeeklyDigestProps) => `Lo más probable de la semana · ${weekLabel}`;

export function WeeklyDigestEmail({
  name,
  weekLabel,
  items,
  appUrl = `${siteUrl()}/app`,
  unsubscribeUrl,
}: WeeklyDigestProps) {
  return (
    <EmailLayout
      preview={`${items.length} partidos con su resultado más probable y su momio justo.`}
      footerNote={
        <>
          Recibes este resumen porque lo activaste en tu cuenta.{" "}
          <TextLink href={unsubscribeUrl}>Darme de baja</TextLink>
        </>
      }
    >
      <Eyebrow>Resumen semanal · {weekLabel}</Eyebrow>
      <Title>Lo más probable de la semana</Title>
      <P>{greeting(name)} Los partidos que vigilas esta semana.</P>
      <Section style={{ margin: "20px 0 8px", border: `1px solid ${COLORS.border}`, borderRadius: "20px" }}>
        {items.map((item, i) => (
          <table
            key={`${item.match}-${item.kickoff}`}
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.rule}` }}
          >
            <tbody>
              <tr>
                <td
                  width="104"
                  valign="middle"
                  style={{
                    padding: "20px 0 20px 20px",
                    fontFamily: FONT_STACK,
                    fontSize: "30px",
                    lineHeight: "32px",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    color: COLORS.success,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.probability}
                </td>
                <td valign="middle" style={{ padding: "18px 20px 18px 8px", fontFamily: FONT_STACK }}>
                  <div style={{ fontSize: "12px", lineHeight: "18px", color: COLORS.textMuted }}>
                    {item.league} · {item.kickoff}
                  </div>
                  <div style={{ fontSize: "16px", lineHeight: "24px", fontWeight: 600, color: COLORS.text }}>
                    {item.match}
                  </div>
                  <div style={{ fontSize: "14px", lineHeight: "22px", color: COLORS.textSecondary }}>
                    {item.outcome} · momio justo <span style={{ color: COLORS.brand, fontWeight: 600 }}>{item.fairOdds}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        ))}
      </Section>
      <Cta href={appUrl}>Ver todos los partidos</Cta>
    </EmailLayout>
  );
}
