import { Section } from "@react-email/components";

import { COLORS, FONT_STACK, siteUrl } from "../brand";
import { Cta, greeting, P, TextLink, Title } from "../components";
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
  /** Cuota justa: «1.61». */
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
      preview={`${items.length} partidos con su resultado más probable y su cuota justa.`}
      footerNote={
        <>
          Recibes este resumen porque lo activaste en tu cuenta.{" "}
          <TextLink href={unsubscribeUrl}>Darme de baja</TextLink>
        </>
      }
    >
      <Title>Lo más probable de la semana</Title>
      <P muted>{weekLabel}</P>
      <P>{greeting(name)} Estos son los partidos que vigilas, con su resultado más probable y su cuota justa.</P>
      {items.map((item) => (
        <Section
          key={`${item.match}-${item.kickoff}`}
          style={{
            margin: "0 0 12px",
            backgroundColor: COLORS.cardSoft,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "12px",
            padding: "14px 16px",
          }}
        >
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
            <tbody>
              <tr>
                <td style={{ fontFamily: FONT_STACK, fontSize: "12px", color: COLORS.textMuted, paddingBottom: "4px" }}>
                  {item.league} · {item.kickoff}
                </td>
              </tr>
              <tr>
                <td style={{ fontFamily: FONT_STACK, fontSize: "15px", fontWeight: 600, color: COLORS.text }}>
                  {item.match}
                </td>
              </tr>
              <tr>
                <td style={{ fontFamily: FONT_STACK, fontSize: "14px", color: COLORS.textSecondary, paddingTop: "6px" }}>
                  <span style={{ color: COLORS.primary, fontWeight: 700 }}>{item.probability}</span> {item.outcome} ·
                  cuota justa {item.fairOdds}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      ))}
      <Cta href={appUrl}>Ver todos los partidos</Cta>
    </EmailLayout>
  );
}
