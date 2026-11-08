import React from "react";
import { LegalShell } from "../../../src/client/legal-shell.js";

export default function PrivacidadPage(): React.JSX.Element {
  return (
    <LegalShell eyebrow="Documento preliminar · Beta" title="Aviso de privacidad">
      <p>
        <strong>Nota preliminar:</strong> Este documento es un borrador informativo
        para la etapa de beta cerrada de PitchLab y no sustituye asesoría legal
        formal.
      </p>
      <h2>1. Datos que recopilamos en la beta</h2>
      <p>
        Durante la beta cerrada por invitación, PitchLab no almacena cuentas
        personales ni procesa pagos. Únicamente utilizamos una cookie técnica
        firmada (<code>pl_beta</code>) para recordar que desbloqueaste el acceso
        con tu código de invitación y registros temporales de dirección IP para
        prevenir intentos automatizados.
      </p>
      <h2>2. Uso de la información</h2>
      <p>
        No vendemos, alquilamos ni compartimos datos con terceros comercializadores
        ni con casas de apuestas. La preferencia de tema visual (oscuro o claro)
        se guarda localmente en tu navegador (<code>localStorage</code>).
      </p>
      <h2>3. Contacto</h2>
      <p>
        Para cualquier duda sobre privacidad durante la beta cerrada, comunícate
        directamente con el equipo fundador a través del canal de tu invitación.
      </p>
    </LegalShell>
  );
}
