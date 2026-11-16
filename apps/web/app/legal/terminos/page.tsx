import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui/legal";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Condiciones del servicio de análisis estadístico deportivo en México (+18), cobro por transferencia SPEI, cupones de acceso, privacidad de récord y reglas de comunidad.";

export const metadata: Metadata = {
  title: "Términos de uso · PitchLab",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/terminos" },
};

export default async function TerminosPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <LegalDocumentSurface
      slug="terminos"
      eyebrow="Documento legal · México"
      title="Términos de uso"
      lede={DESCRIPTION}
      lastUpdated="Última actualización: noviembre de 2026"
      hasSession={hasSession}
      intro={
        <p>
          <strong>Alcance en México:</strong> Estos Términos regulan el acceso y uso de{" "}
          <strong>PitchLab</strong> (<code>pitchlab.mx</code>), operado de forma independiente por{" "}
          <strong>
            {process.env.PITCHLAB_LEGAL_RESPONSIBLE?.trim()
              ? `${process.env.PITCHLAB_LEGAL_RESPONSIBLE.trim()}${process.env.PITCHLAB_LEGAL_RFC?.trim() ? ` (RFC ${process.env.PITCHLAB_LEGAL_RFC.trim()})` : ""}`
              : "PitchLab México (Ciudad de México, México)"}
          </strong>
          , con contacto oficial en <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>. Al
          crear una cuenta y marcar la casilla obligatoria de aceptación, confirmas que eres mayor
          de 18 años y aceptas estas condiciones junto con nuestro{" "}
          <a href="/legal/privacidad">Aviso de privacidad</a>.
        </p>
      }
      sections={[
        {
          id: "naturaleza-informativa",
          title: "1. Mayoría de edad (+18) y ausencia de apuestas",
          body: (
            <>
              <p>
                PitchLab es una plataforma digital de análisis estadístico deportivo dirigida
                exclusivamente a personas <strong>mayores de 18 años</strong>. Durante el registro
                verificamos tu mayoría de edad mediante tu fecha de nacimiento; si no tienes 18 años
                cumplidos, el sistema bloquea el alta y no conserva tus datos.
              </p>
              <p>
                <strong>PitchLab no es casa de apuestas, casino ni operador de juegos y sorteos:</strong>{" "}
                no recibimos depósitos para apostar, no aceptamos ni colocamos apuestas por cuenta
                propia o de terceros, no intermediamos dinero de juego, no otorgamos premios en
                efectivo y no utilizamos enlaces de afiliados con operadores de apuestas. Consulta
                nuestras herramientas de autocontrol y líneas de apoyo en{" "}
                <a href="/legal/juego-responsable">Juego responsable (+18)</a>.
              </p>
            </>
          ),
        },
        {
          id: "unidades-simuladas",
          title: "2. Probabilidades, Momio Justo y unidades simuladas",
          body: (
            <>
              <p>
                Las probabilidades previas al partido, el <strong>Momio Justo</strong>, el
                comparador de momios, las lecturas contextuales de <strong>Cortex IA</strong> y el
                armador de parlays se elaboran con fines informativos, educativos y recreativos a
                partir de modelos estadísticos e historial deportivo. Ninguna estimación constituye
                asesoría financiera, recomendación de inversión ni promesa de resultado futuro.
              </p>
              <p>
                Tu bitácora personal y <strong>Mi récord</strong> (<code>/app/lab</code>) registran
                selecciones únicamente en <strong>unidades simuladas (u)</strong>. Si activas en tus
                preferencias la opción privada para ver una equivalencia en pesos mexicanos (MXN),
                dicha cifra sirve solo como referencia personal y nunca implica saldo monetario
                depositado en PitchLab.
              </p>
            </>
          ),
        },
        {
          id: "pase-y-cancelacion",
          title: "3. Prueba sin tarjeta, planes y facturación en México",
          body: (
            <>
              <p>
                <strong>Prueba de 7 días sin tarjeta:</strong> las cuentas nuevas elegibles reciben
                7 días de acceso de cortesía sin registrar tarjeta bancaria, limitados estrictamente
                a <strong>una prueba por persona</strong> (validado mediante normalización de correo,
                bloqueo de correos temporales y huellas criptográficas irreversibles). Al concluir
                la prueba no se ejecuta ningún cargo automático; conservas acceso a tu cuenta y
                bitácora, y para consultar los análisis completos deberás activar el{" "}
                <strong>Pase PitchLab Ultra</strong>.
              </p>
              <ul>
                <li>
                  <strong>Pase Mensual:</strong> $299 MXN por 30 días naturales (IVA 16 % incluido),
                  o $209 MXN en el primer mes al registrarte con un código de invitación elegible.
                </li>
                <li>
                  <strong>Pase Anual:</strong> $2,390 MXN por 365 días naturales (IVA 16 % incluido).
                </li>
                <li>
                  <strong>Facturación CFDI:</strong> la emisión automática en cuenta aún no está
                  habilitada; puedes solicitar tu CFDI 4.0 enviando tus datos fiscales y la
                  referencia de tu pago a{" "}
                  <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a> dentro del mes
                  calendario en que realizaste la transferencia.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "cobro-spei-cupones",
          title: "4. Cobro por transferencia SPEI y cupones de acceso",
          body: (
            <>
              <p>
                Actualmente la activación y extensión del Pase PitchLab Ultra se realiza por{" "}
                <strong>transferencia interbancaria SPEI</strong> y{" "}
                <strong>cupones de acceso</strong>, sin cobros recurrentes automáticos:
              </p>
              <ol>
                <li>
                  <strong>Referencia única ligada a tu cuenta:</strong> al iniciar sesión y visitar{" "}
                  <a href="/precio">/precio</a> o <code>/app/account?tab=plan</code>, la plataforma
                  muestra los datos bancarios destino y tu código único de referencia SPEI ligado a
                  tu cuenta (formato <code>PL-...</code>), listo para copiar.
                </li>
                <li>
                  <strong>Aviso de transferencia:</strong> tras transferir el monto exacto del plan
                  e incluir tu referencia única en el concepto de pago, registras el aviso en la
                  plataforma para su conciliación.
                </li>
                <li>
                  <strong>Confirmación y envío del cupón por correo:</strong> una vez verificado el
                  depósito en la consola administrativa, PitchLab genera un{" "}
                  <strong>cupón personal de un solo uso</strong> con{" "}
                  <strong>vigencia de 30 días naturales</strong> para ser canjeado y lo envía desde{" "}
                  <code>noreply@pitchlab.mx</code> al correo electrónico de tu cuenta.
                </li>
                <li>
                  <strong>Canje y activación del periodo pagado:</strong> al ingresar ese cupón en{" "}
                  <a href="/canjear">/canjear</a> (o <code>/app/canjear</code>), se activa tu
                  suscripción por el periodo pagado (30 o 365 días). Si ya cuentas con días activos,
                  el nuevo periodo se suma al final de tu vigencia actual.
                </li>
              </ol>
              <p>
                Los cupones emitidos por transferencia SPEI están restringidos exclusivamente a la
                cuenta titular que reportó el pago, admiten un único canje, no son transferibles a
                terceros y no son reembolsables ni canjeables por efectivo una vez redimidos, salvo
                los derechos aplicables conforme a la Ley Federal de Protección al Consumidor
                (LFPC). Los cupones promocionales o de cortesía están sujetos a su fecha de
                vencimiento y límite de usos. Cuando en una etapa posterior se habilite el cobro
                recurrente con tarjeta vía Stripe, se informará expresamente antes de contratar y
                podrás cancelar la renovación en cualquier momento desde{" "}
                <code>/app/account?tab=plan</code>.
              </p>
            </>
          ),
        },
        {
          id: "perfil-record-ranking",
          title: "5. Perfil público, «Mi récord», insignias y Ranking",
          body: (
            <>
              <p>
                Tú decides qué información estadística compartes con otros socios dentro del club:
              </p>
              <ul>
                <li>
                  <strong>Perfil público opcional (<code>/app/u/[handle]</code>):</strong> se activa
                  o desactiva en <code>/app/account?tab=prefs</code>. Cuando está desactivado, otros
                  socios no pueden consultar tu récord ni tus picks cerrados.
                </li>
                <li>
                  <strong>Configuración por bloques en «Mi récord» (<code>/app/lab</code>):</strong>{" "}
                  si activas tu perfil público, eliges qué bloques y métricas mostrar (ganados y
                  perdidos, tasa de acierto, desglose por liga o mercado, rachas, rendimiento en
                  unidades, ventaja promedio, momio promedio, mejor y peor mes, saldo neto, curva de
                  unidades e historial de hasta 50 picks ya cerrados) y puedes destacar hasta 3
                  insignias ganadas.
                </li>
                <li>
                  <strong>Ranking de Comunidad (<code>/app/social</code>):</strong> participar es
                  voluntario y exige tener activos tanto <em>Perfil público</em> como{" "}
                  <em>Aparecer en el ranking</em> (sin pausa de comunidad ni de descanso), además de
                  contar con al menos <strong>5 picks cerrados</strong> en los últimos 7 días para
                  el ranking semanal o <strong>15 picks cerrados</strong> en los últimos 30 días
                  para el mensual. El orden se calcula solo en unidades simuladas y no entrega
                  premios monetarios.
                </li>
                <li>
                  <strong>Qué jamás es público:</strong> tu correo electrónico, tu fecha de
                  nacimiento, tu banca o valor de unidad en pesos mexicanos (MXN) y tus{" "}
                  <strong>picks abiertos o pendientes</strong> antes de liquidarse nunca se exponen
                  en perfiles públicos ni en el Ranking.
                </li>
              </ul>
              <p>
                Los picks registrados en bitácora quedan sellados antes del inicio oficial del
                partido y no pueden editarse ni borrarse una vez comenzado el encuentro.
              </p>
            </>
          ),
        },
        {
          id: "referidos-y-creadores",
          title: "6. Programa de referidos, Embajadores y Tipsters Oficiales",
          body: (
            <p>
              Cuando una persona invitada elegible activa su primer periodo pagado del Pase PitchLab
              Ultra (incluido el canje de su cupón por transferencia SPEI), tanto quien invita como
              quien se registra reciben <strong>+7 días</strong> de vigencia; al acumular 5 amigos
              activos con pago confirmado, quien invita obtiene el distintivo de Embajador y{" "}
              <strong>+30 días</strong> adicionales. En el programa de Tipsters Oficiales, la
              comisión aplicable (25 % sobre ingreso neto efectivamente cobrado antes de IVA) madura
              a los 14 días naturales y se revierte ante reembolsos, pagos inválidos, auto-referidos
              o creación fraudulenta de cuentas.
            </p>
          ),
        },
        {
          id: "comunidad",
          title: "7. Reglas de Comunidad y moderación",
          body: (
            <p>
              En Comunidad (<code>/app/social</code>) está prohibido publicar promesas de ganancias
              o aciertos infalibles, lenguaje abusivo, acoso, spam, venta de pronósticos externos o
              enlaces promocionales a casas de apuestas y grupos ajenos a PitchLab. Cualquier socio
              puede reportar publicaciones o activar <em>Pausar Comunidad</em> desde sus
              preferencias. Nos reservamos el derecho de retirar publicaciones o suspender cuentas
              que manipulen registros, usen automatización no autorizada o incumplan estas reglas.
            </p>
          ),
        },
        {
          id: "ley-aplicable",
          title: "8. Propiedad intelectual, avisos y legislación aplicable en México",
          body: (
            <p>
              El código, diseño, motores estadísticos, textos y distintivos de PitchLab son
              propiedad de su titular; las fuentes abiertas de datos deportivos se reconocen en{" "}
              <a href="/legal/creditos">Créditos de datos</a>. Puedes configurar tus alertas por
              correo en <code>/app/account?tab=prefs</code> o consultar <a href="/baja">/baja</a>.
              Estos Términos se rigen por las leyes federales aplicables en los Estados Unidos
              Mexicanos y cualquier controversia se someterá a los tribunales competentes en México,
              respetando en todo momento los derechos irrenunciables previstos en la LFPC.
            </p>
          ),
        },
      ]}
    />
  );
}
