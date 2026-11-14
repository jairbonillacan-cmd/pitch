import { siteUrl } from "../brand";
import { Cta, Eyebrow, Facts, P, Stat, TextLink, Title } from "../components";
import { EmailLayout } from "../layout";

export interface DataHealthAlertItem {
  targetLabel: string;
  kindLabel: string;
  message: string;
  failingSinceLabel: string;
}

export interface DataHealthAlertProps {
  summaryLabel: string;
  detectedAtLabel: string;
  severity: "warning" | "critical";
  incidents: DataHealthAlertItem[];
  adminUrl?: string;
}

export const dataHealthAlertSubject = ({ summaryLabel, incidents }: DataHealthAlertProps) =>
  incidents.length > 1
    ? `[Salud de datos] ${incidents.length} avisos nuevos · ${summaryLabel}`
    : `[Salud de datos] ${summaryLabel}`;

export function DataHealthAlertEmail({
  summaryLabel,
  detectedAtLabel,
  severity,
  incidents,
  adminUrl = `${siteUrl()}/app/admin#salud-datos`,
}: DataHealthAlertProps) {
  const tone = severity === "critical" ? "danger" : "warning";
  const badgeText =
    incidents.length === 1 ? "1 incidencia activa" : `${incidents.length} incidencias activas`;

  return (
    <EmailLayout
      preview={`${summaryLabel} · detectado ${detectedAtLabel}.`}
      footerNote={
        <>
          Aviso operativo para cuentas en <code>PITCHLAB_ADMIN_EMAILS</code>. No se repite mientras la
          misma falla siga abierta. <TextLink href={adminUrl}>Abrir Consola del fundador</TextLink>
        </>
      }
    >
      <Eyebrow>Operación · Salud de datos</Eyebrow>
      <Title>{summaryLabel}</Title>
      <P>
        Se detectó una incidencia en la recolección o validación automática de datos. El corte
        anterior se conservó intacto sin publicar datos incompletos ni cruzados.
      </P>
      <Stat value={badgeText} tone={tone} />
      {incidents.map((item, idx) => (
        <Facts
          key={`${item.targetLabel}-${idx}`}
          rows={[
            ["Qué falló", `${item.targetLabel} (${item.kindLabel})`],
            ["Detalle", item.message],
            ["Desde cuándo", item.failingSinceLabel],
          ]}
        />
      ))}
      <P muted>Corte revisado: {detectedAtLabel} (hora del centro de México).</P>
      <Cta href={adminUrl}>Ver Salud de datos</Cta>
    </EmailLayout>
  );
}
