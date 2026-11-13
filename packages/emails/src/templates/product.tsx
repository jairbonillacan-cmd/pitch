import { siteUrl } from "../brand";
import { Cta, Eyebrow, Facts, greeting, P, Stat, StatGrid, TextLink, Title } from "../components";
import { EmailLayout } from "../layout";

/* 16 · Pick calificado ------------------------------------------------------------------ */

export interface PickGradedProps {
  name?: string;
  result: "won" | "lost" | "void";
  matchLabel: string;
  leagueLabel: string;
  pickLabel: string;
  /** Ya formateados, en el formato de momios del usuario: «-110». */
  userOddsLabel: string;
  fairOddsLabel: string;
  /** Contra el cierre: «+3.2 pts». Solo si hay momio de cierre. */
  clvLabel?: string;
  journalUrl?: string;
  settingsUrl: string;
}

const RESULT_TEXT = {
  won: { stat: "Cumplido", tone: "success", title: "Tu pick se cumplió" },
  lost: { stat: "No cumplido", tone: "danger", title: "Tu pick no se cumplió" },
  void: { stat: "Anulado", tone: "info", title: "Tu pick se anuló" },
} as const;

export const pickGradedSubject = ({ result, matchLabel }: PickGradedProps) =>
  `${RESULT_TEXT[result].title}: ${matchLabel}`;

export function PickGradedEmail({
  name,
  result,
  matchLabel,
  leagueLabel,
  pickLabel,
  userOddsLabel,
  fairOddsLabel,
  clvLabel,
  journalUrl = `${siteUrl()}/app/lab`,
  settingsUrl,
}: PickGradedProps) {
  const r = RESULT_TEXT[result];
  return (
    <EmailLayout
      preview={`${matchLabel}: ${r.stat.toLowerCase()}.`}
      footerNote={
        <>
          Recibes este aviso porque activaste los resultados de tu bitácora.{" "}
          <TextLink href={settingsUrl}>Cambiar avisos</TextLink>
        </>
      }
    >
      <Eyebrow>Bitácora · {leagueLabel}</Eyebrow>
      <Title>{r.title}</Title>
      <P>{greeting(name)} Calificamos tu pick de {matchLabel}.</P>
      <Stat value={r.stat} tone={r.tone} />
      <Facts
        rows={[
          ["Tu pick", pickLabel],
          ["Tu momio", userOddsLabel],
          ["Momio justo", fairOddsLabel],
          ...(clvLabel ? ([["Contra el cierre", clvLabel]] as const) : []),
        ]}
      />
      <Cta href={journalUrl}>Ver mi bitácora</Cta>
    </EmailLayout>
  );
}

/* 17 · Tu mes en PitchLab --------------------------------------------------------------- */

export interface MonthlyRecordProps {
  name?: string;
  monthLabel: string;
  /** «+4.5 u» o «−2.0 u». */
  balanceLabel: string;
  balancePositive: boolean;
  /** «12 de 20». */
  hitsLabel: string;
  /** «+1.8 pts». */
  clvLabel: string;
  /** «#41». */
  rankLabel: string;
  bestLeague?: { name: string; record: string };
  journalUrl?: string;
  settingsUrl: string;
}

export const monthlyRecordSubject = ({ monthLabel }: MonthlyRecordProps) => `Tu mes en PitchLab · ${monthLabel}`;

export function MonthlyRecordEmail({
  name,
  monthLabel,
  balanceLabel,
  balancePositive,
  hitsLabel,
  clvLabel,
  rankLabel,
  bestLeague,
  journalUrl = `${siteUrl()}/app/lab`,
  settingsUrl,
}: MonthlyRecordProps) {
  return (
    <EmailLayout
      preview={`Saldo ${balanceLabel}, ${hitsLabel} cumplidos, puesto ${rankLabel}.`}
      footerNote={
        <>
          Recibes este resumen porque lo activaste en tu cuenta. <TextLink href={settingsUrl}>Darme de baja</TextLink>
        </>
      }
    >
      <Eyebrow>Tu mes · {monthLabel}</Eyebrow>
      <Title>Tu mes en PitchLab</Title>
      <P>{greeting(name)} Así quedó tu bitácora este mes.</P>
      <StatGrid
        items={[
          { label: "Saldo", value: balanceLabel, tone: balancePositive ? "success" : "danger" },
          { label: "Cumplidos", value: hitsLabel },
          { label: "Contra el cierre", value: clvLabel },
          { label: "Puesto", value: rankLabel },
        ]}
      />
      {bestLeague ? <Facts rows={[["Tu mejor liga", `${bestLeague.name} · ${bestLeague.record}`]]} /> : null}
      <Cta href={journalUrl}>Ver mi bitácora</Cta>
    </EmailLayout>
  );
}
