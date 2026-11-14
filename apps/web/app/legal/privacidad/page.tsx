import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui/legal";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Aviso de Privacidad Integral para México conforme a la LFPDPPP: datos tratados, cobro SPEI y cupones, perfil público, correos, cookies, analítica y derechos ARCO.";

export const metadata: Metadata = {
  title: "Aviso de privacidad · PitchLab",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/privacidad" },
};

export default async function PrivacidadPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <LegalDocumentSurface
      slug="privacidad"
      eyebrow="Aviso de Privacidad Integral · México"
      title="Aviso de privacidad"
      lede={DESCRIPTION}
      lastUpdated="Última actualización: noviembre de 2026"
      hasSession={hasSession}
      intro={
        <p>
          <strong>Marco legal:</strong> Este Aviso de Privacidad Integral se emite en cumplimiento
          de la{" "}
          <strong>
            Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)
          </strong>{" "}
          vigente en los Estados Unidos Mexicanos y su normativa aplicable. Para cualquier duda,
          revocación de consentimiento o solicitud de <strong>Derechos ARCO</strong>, escríbenos a{" "}
          <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
        </p>
      }
      sections={[
        {
          id: "responsable",
          title: "1. Identidad y domicilio del Responsable",
          body: (
            <p>
              El Responsable del tratamiento de tus datos personales en <strong>PitchLab</strong> (
              <code>pitchlab.mx</code>) es{" "}
              <code>
                [POR DEFINIR: nombre completo o denominación/razón social del Responsable en México]
              </code>
              , con domicilio convencional para oír y recibir notificaciones en{" "}
              <code>[POR DEFINIR: domicilio completo en México]</code> y correo electrónico de
              privacidad en <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
            </p>
          ),
        },
        {
          id: "datos-que-tratamos",
          title: "2. Datos personales que recabamos",
          body: (
            <>
              <p>
                Recabamos únicamente las categorías de datos necesarias para operar tu cuenta de
                análisis deportivo:
              </p>
              <ul>
                <li>
                  <strong>Identificación y cuenta:</strong> correo electrónico, nombre visible,
                  identificador <code>@usuario</code>, fecha de nacimiento (empleada para comprobar
                  que eres mayor de 18 años; nunca es pública; si no cumples la mayoría de edad en
                  el registro, no creamos la cuenta ni almacenamos tus datos), biografía opcional,
                  imagen de avatar opcional y usuario opcional de X (<code>@xUsername</code>). Si
                  eliges iniciar sesión con Google o X o vincular tu perfil de X, solo conservamos
                  el identificador básico verificado y descartamos los tokens de acceso tras la
                  validación.
                </li>
                <li>
                  <strong>Cobro por transferencia SPEI, cupones y facturación:</strong> tu código
                  único de referencia SPEI ligado a tu cuenta (<code>PL-...</code>), plan elegido
                  (mensual o anual), monto esperado y monto reportado en MXN, fecha de transferencia
                  y, cuando los capturas para facilitar la conciliación, banco emisor, clave de
                  rastreo o referencia del comprobante, nombre del ordenante y notas opcionales, así
                  como los cupones emitidos y canjeados.{" "}
                  <strong>
                    PitchLab no solicita ni almacena números completos de tarjetas bancarias, NIP ni
                    códigos CVV.
                  </strong>{" "}
                  Si solicitas factura CFDI por correo, trataremos tus datos fiscales (RFC, nombre o
                  razón social, régimen fiscal, código postal y uso de CFDI) exclusivamente para
                  emitir el comprobante.
                </li>
                <li>
                  <strong>Actividad, preferencias y consentimientos:</strong> picks registrados en
                  unidades simuladas, partidos en seguimiento, publicaciones, comentarios y «me
                  gusta» en Comunidad, configuración de ligas, zona horaria, formato de momios,
                  equivalencia privada de unidad en MXN y bitácora de consentimientos con versión y
                  fecha (<code>termsVersion</code>, <code>termsAcceptedAt</code>,{" "}
                  <code>analyticsConsent</code> y <code>marketingConsent</code>).
                </li>
                <li>
                  <strong>Seguridad y prevención de abuso:</strong> huellas criptográficas
                  irreversibles (<code>SHA-256</code> con clave del servidor) del correo
                  normalizado, agente de navegador y subred IP para hacer cumplir el límite de una
                  sola prueba gratuita por persona y proteger los endpoints frente a abuso
                  automatizado.
                </li>
              </ul>
              <p>
                <strong>Datos personales sensibles:</strong> PitchLab{" "}
                <strong>no recaba ni trata datos personales sensibles</strong> conforme a la
                LFPDPPP. Cuando eliges una pausa voluntaria de descanso (24 horas, 7 días o 30
                días), solo guardamos esa preferencia temporal para silenciar alertas y exposición a
                picks.
              </p>
            </>
          ),
        },
        {
          id: "finalidades",
          title: "3. Finalidades primarias y secundarias del tratamiento",
          body: (
            <>
              <p>
                <strong>Finalidades primarias (indispensables para prestarte el servicio):</strong>
              </p>
              <ul>
                <li>
                  Verificar la mayoría de edad (+18), crear tu cuenta y autenticar tu sesión
                  mediante enlace mágico por correo o inicio de sesión social.
                </li>
                <li>
                  Calcular y mostrarte probabilidades deportivas, Momio Justo, parlays, bitácora en
                  unidades simuladas, insignias, <em>Mi récord</em> y Comunidad.
                </li>
                <li>
                  Asignar tu referencia única SPEI (<code>PL-...</code>), conciliar transferencias
                  pendientes, generar y enviarte desde <code>noreply@pitchlab.mx</code> tu cupón
                  personal de un solo uso con vigencia de 30 días y activar tu suscripción al
                  canjearlo en <code>/canjear</code>.
                </li>
                <li>
                  Enviar comunicaciones transaccionales estrictamente operativas (enlaces de acceso
                  desde <code>acceso@pitchlab.mx</code>, entrega de cupones y comprobantes desde{" "}
                  <code>noreply@pitchlab.mx</code>, avisos de vencimiento de pase y atención de
                  solicitudes de soporte, baja o derechos ARCO).
                </li>
                <li>
                  Administrar el programa de referidos, Embajadores y Tipsters Oficiales, moderar la
                  Comunidad, prevenir fraude y cumplir obligaciones legales aplicables en México.
                </li>
              </ul>
              <p>
                <strong>Finalidades secundarias (opcionales y sujetas a tu elección):</strong>
              </p>
              <ul>
                <li>
                  <strong>Analítica de uso anónima (<code>analyticsConsent</code>):</strong> casilla
                  opcional y desmarcada por omisión durante el registro para medir de forma agregada
                  el funcionamiento de la plataforma y mejorar sus pantallas.
                </li>
                <li>
                  <strong>Novedades por correo y alertas configurables:</strong> la casilla opcional{" "}
                  <code>marketingConsent</code> (desmarcada por omisión en el registro) autoriza
                  recibir novedades de PitchLab; adicionalmente, desde{" "}
                  <code>/app/account?tab=prefs</code> puedes encender o apagar en cualquier momento
                  las alertas de valor, recordatorios antes del partido, resultados de tus picks y
                  avisos previos de renovación.
                </li>
              </ul>
              <p>
                Negarte a las finalidades secundarias o revocarlas posteriormente no afecta tu
                cuenta ni tu acceso al servicio.
              </p>
            </>
          ),
        },
        {
          id: "perfil-publico-privacidad",
          title: "4. Perfil público, «Mi récord» y Ranking: qué se muestra y cómo se elige",
          body: (
            <>
              <p>
                Ningún visitante ni socio puede ver datos privados de tu cuenta salvo los que tú
                decidas compartir de forma explícita:
              </p>
              <ul>
                <li>
                  <strong>Interruptores principales en <code>/app/account?tab=prefs</code>:</strong>{" "}
                  controlas por separado <em>Perfil público</em> (visibilidad de tu ficha en{" "}
                  <code>/app/u/[handle]</code>), <em>Aparecer en el ranking</em> (participación en
                  la pestaña Ranking de <code>/app/social</code>, que exige perfil público activo y
                  al menos 5 picks cerrados en la semana o 15 en el mes) y{" "}
                  <em>Pausar Comunidad</em> (oculta tus publicaciones y detiene avisos sociales).
                </li>
                <li>
                  <strong>Selección granular en «Mi récord» (<code>/app/lab</code>):</strong> cuando
                  tu perfil es público, el servidor aplica tu configuración por bloques para mostrar
                  únicamente las métricas habilitadas (ganados/perdidos, tasa de acierto, por liga y
                  mercado, rachas, rendimiento porcentual sobre unidades, CLV promedio, momio
                  promedio, mejor/peor mes, saldo neto en unidades, curva de unidades y hasta 50
                  picks ya liquidados), junto con hasta 3 insignias ganadas que hayas elegido
                  destacar.
                </li>
                <li>
                  <strong>Datos siempre privados:</strong> tu correo electrónico, tu fecha de
                  nacimiento, tu banca inicial o el valor de tu unidad en pesos mexicanos (MXN) y
                  todos tus <strong>picks abiertos o pendientes</strong> permanecen siempre ocultos
                  para terceros.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "derechos-arco",
          title: "5. Derechos ARCO, revocación del consentimiento y controles directos",
          body: (
            <>
              <p>
                En términos de la <strong>LFPDPPP</strong>, tú o tu representante legal pueden
                ejercer en cualquier momento tus derechos de <strong>Acceso</strong>,{" "}
                <strong>Rectificación</strong>, <strong>Cancelación</strong> y{" "}
                <strong>Oposición</strong> (<strong>Derechos ARCO</strong>), así como{" "}
                <strong>revocar el consentimiento</strong> otorgado para el tratamiento de tus datos
                o limitar su uso y divulgación:
              </p>
              <ol>
                <li>
                  <strong>Solicitud por correo:</strong> envía un mensaje a{" "}
                  <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a> con el asunto{" "}
                  <code>Derechos ARCO</code> o <code>Revocación de consentimiento</code>, incluyendo
                  tu nombre o <code>@usuario</code>, medio para recibir notificaciones, documento
                  que acredite tu identidad (o personalidad de tu representante legal), la
                  descripción clara de los datos y del derecho que ejerces, y cualquier elemento que
                  facilite ubicarlos.
                </li>
                <li>
                  <strong>Plazos de atención conforme a la LFPDPPP:</strong> te comunicaremos la
                  determinación adoptada en un plazo máximo de <strong>20 días hábiles</strong>{" "}
                  contados desde la recepción de tu solicitud completa y, de resultar procedente, la
                  haremos efectiva dentro de los <strong>15 días hábiles</strong> siguientes (plazos
                  ampliables por una sola ocasión por periodo igual cuando las circunstancias lo
                  justifiquen). La entrega digital de tus datos es gratuita.
                </li>
                <li>
                  <strong>Herramientas de autoservicio en <code>/app/account?tab=prefs</code>:</strong>{" "}
                  además del procedimiento ARCO formal, desde tu cuenta puedes ejecutar en cualquier
                  momento <strong>«Descargar mis datos»</strong> (exportación inmediata en formato{" "}
                  <code>JSON</code> de tu perfil, preferencias, vigencias, transferencias, cupones,
                  bitácora y actividad en Comunidad) y <strong>«Eliminar cuenta»</strong> (solicitud
                  registrada en bitácora de auditoría con atención operativa en un máximo de{" "}
                  <strong>72 horas hábiles</strong>, conservando bajo bloqueo únicamente los
                  registros exigidos por ley fiscal, contable o de prevención de fraude).
                </li>
              </ol>
              <p>
                Si consideras que tu derecho a la protección de datos personales ha sido lesionado,
                puedes acudir ante la autoridad federal competente en México en materia de
                protección de datos personales en posesión de los particulares (la{" "}
                <strong>Secretaría Anticorrupción y Buen Gobierno</strong>, conforme a la LFPDPPP
                vigente).
              </p>
            </>
          ),
        },
        {
          id: "correos-cookies-analitica",
          title: "6. Correos electrónicos, cookies, almacenamiento local y analítica",
          body: (
            <ul>
              <li>
                <strong>Correos y baja de avisos:</strong> enviamos correos desde el dominio{" "}
                <code>@pitchlab.mx</code> (enlaces de acceso desde <code>acceso@pitchlab.mx</code>,
                cupones por transferencia SPEI y recibos desde <code>noreply@pitchlab.mx</code>, y
                atención desde <code>soporte@pitchlab.mx</code>). Puedes apagar alertas opcionales
                en <code>/app/account?tab=prefs</code> o visitar <a href="/baja">/baja</a>.
              </li>
              <li>
                <strong>Cookies técnicas indispensables:</strong> utilizamos cookies HTTP-only
                firmadas para mantener tu sesión autenticada (<code>better-auth</code>) y, en modo
                de evaluación autorizada, la cookie de acceso de vista previa.{" "}
                <strong>
                  No utilizamos cookies publicitarias de terceros, rastreadores entre sitios ni
                  píxeles de casas de apuestas.
                </strong>
              </li>
              <li>
                <strong>Almacenamiento en tu navegador (<code>localStorage</code>):</strong>{" "}
                guardamos preferencias locales de interfaz como el tema oscuro o claro (
                <code>pl-theme</code>), preferencias visuales, partidos seguidos y datos temporales
                del paso de registro mientras confirmas tu correo (con vigencia máxima de 24 horas).
              </li>
              <li>
                <strong>Analítica condicionada a consentimiento:</strong> hoy PitchLab no inyecta
                rastreadores comerciales de terceros; cualquier telemetría agregada de uso del
                producto respeta estrictamente el indicador opcional <code>analyticsConsent</code>{" "}
                (desactivado por omisión) y puede revocarse escribiendo a{" "}
                <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
              </li>
            </ul>
          ),
        },
        {
          id: "encargados-y-transferencias",
          title: "7. Encargados de infraestructura y transferencias de datos",
          body: (
            <p>
              <strong>No vendemos ni cedemos tus datos personales a terceros anunciantes ni a casas
              de apuestas.</strong> Para operar la plataforma utilizamos proveedores tecnológicos
              que actúan como encargados bajo medidas de seguridad y confidencialidad: alojamiento
              aplicativo y de imágenes de avatar (Vercel / Vercel Blob), base de datos PostgreSQL
              cifrada (Neon), despacho de correos transaccionales (Resend), verificación anti-bots
              en formularios (Cloudflare Turnstile), proveedores de identidad cuando tú eliges
              iniciar sesión con ellos (Google o X) y generación de resúmenes deportivos de{" "}
              <strong>Cortex IA</strong> mediante OpenRouter (servicio al que solo se envían datos
              estadísticos del partido y <strong>ningún dato personal de los socios</strong>). Si en
              el futuro se habilita el pago con tarjeta, este se procesará directamente con Stripe
              bajo certificación PCI-DSS. Dichos encargados pueden procesar información en
              infraestructura en la nube ubicada en Estados Unidos bajo controles contractuales y
              técnicos alineados con la LFPDPPP.
            </p>
          ),
        },
        {
          id: "cambios-aviso",
          title: "8. Medidas de seguridad y cambios al Aviso de Privacidad",
          body: (
            <p>
              Protegemos tu información mediante conexiones cifradas TLS, cookies HTTP-only
              firmadas, validación de origen (CSRF), límites de tasa por endpoint y auditoría de
              acciones administrativas. Cualquier actualización sustancial a este Aviso de
              Privacidad se publicará en <a href="/legal/privacidad">/legal/privacidad</a> indicando
              su fecha de revisión y, cuando corresponda conforme a la LFPDPPP, te lo notificaremos
              por correo electrónico o dentro de la aplicación.
            </p>
          ),
        },
      ]}
    />
  );
}
