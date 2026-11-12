import { siteUrl, supportEmail } from "../brand";
import { Cta, Eyebrow, Facts, greeting, Notice, P, Title } from "../components";
import { EmailLayout } from "../layout";

/* 24 · Quitamos una publicación --------------------------------------------------------- */

export interface ContentRemovedProps {
  name?: string;
  removedOn: string;
  /** Motivo en palabras del usuario: «Incluía un enlace de afiliado». */
  reason: string;
  rulesUrl?: string;
}

export const contentRemovedSubject = () => "Quitamos una publicación tuya de PitchLab";

export function ContentRemovedEmail({
  name,
  removedOn,
  reason,
  rulesUrl = `${siteUrl()}/legal/terminos#comunidad`,
}: ContentRemovedProps) {
  return (
    <EmailLayout preview="Una publicación tuya no cumplía las reglas de la comunidad.">
      <Eyebrow>Comunidad</Eyebrow>
      <Title>Quitamos una publicación</Title>
      <P>{greeting(name)} Una publicación tuya no cumplía las reglas de la comunidad y la retiramos.</P>
      <Facts
        rows={[
          ["Fecha", removedOn],
          ["Motivo", reason],
        ]}
      />
      <Notice tone="info" label="¿Crees que fue un error?">
        Escríbenos a {supportEmail()} y la revisamos.
      </Notice>
      <Cta href={rulesUrl}>Leer las reglas</Cta>
    </EmailLayout>
  );
}
