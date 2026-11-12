import { Body, Container, Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

import { COLORS, FONT_STACK, LEGAL_LINE, logoUrl, siteUrl, supportEmail } from "./brand";

export interface EmailLayoutProps {
  /** Texto que se ve junto al asunto en la bandeja de entrada. */
  preview: string;
  children: ReactNode;
  /** Pie opcional sobre el aviso legal (por ejemplo, el enlace para darse de baja). */
  footerNote?: ReactNode;
}

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  const site = siteUrl();
  const smallLink = { color: COLORS.textMuted, textDecoration: "underline" } as const;
  const small = { margin: "0 0 12px", fontSize: "12px", lineHeight: "18px", color: COLORS.textMuted } as const;
  return (
    <Html lang="es-MX" dir="ltr">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <title>PitchLab</title>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: COLORS.page, fontFamily: FONT_STACK, color: COLORS.text }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 16px 40px" }}>
          <Section style={{ padding: "0 0 24px" }}>
            {/* Sin enlace: la primera URL del HTML debe ser la del botón principal. */}
            <Img src={logoUrl()} width="160" alt="PitchLab" style={{ display: "block", border: 0 }} />
          </Section>

          <Section
            style={{
              backgroundColor: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "16px",
              padding: "32px 28px",
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: "24px 8px 0" }}>
            {footerNote ? <Text style={small}>{footerNote}</Text> : null}
            <Text style={small}>{LEGAL_LINE}</Text>
            <Text style={{ ...small, margin: 0 }}>
              <Link href={`${site}/legal/terminos`} style={smallLink}>
                Términos
              </Link>
              {" · "}
              <Link href={`${site}/legal/privacidad`} style={smallLink}>
                Privacidad
              </Link>
              {" · "}
              <Link href={`${site}/legal/juego-responsable`} style={smallLink}>
                Juego responsable
              </Link>
              {" · "}
              <Link href={`mailto:${supportEmail()}`} style={smallLink}>
                {supportEmail()}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
