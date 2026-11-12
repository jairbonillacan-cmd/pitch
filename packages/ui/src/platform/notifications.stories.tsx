import React, { useState } from "react";
import { NotificationInboxPanel } from "./components/NotificationInbox";
import type { PlatformNotification } from "./notifications";

/* Avisos de ejemplo (partidos y momios inventados para la story; no son datos de la jornada). */
const NOW = new Date("2026-11-14T19:30:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

const SAMPLE: PlatformNotification[] = [
  {
    id: "value:ame-caz",
    kind: "cuotas",
    priority: "urgent",
    title: "Cruz Azul gana: la casa paga 2.40, la cuota justa es 2.12",
    context: { lead: "Geodesic estima 47.2 %", text: "; el momio de la casa implica 41.7 %." },
    atIso: ago(4),
    source: "Caliente",
    actionLabel: "Ver cuotas",
    href: "/app/liga-mx/games/ame-caz",
  },
  {
    id: "kickoff:ame-caz",
    kind: "partidos",
    priority: "urgent",
    title: "América vs Cruz Azul empieza en 52 min",
    context: { lead: "Lo más probable: Cruz Azul 47.2 %", text: " · cuota justa 2.12" },
    atIso: ago(8),
    actionLabel: "Abrir partido",
    href: "/app/liga-mx/games/ame-caz",
  },
  {
    id: "locked:j1",
    kind: "picks",
    priority: "normal",
    title: "Tu pick quedó bloqueado",
    context: { text: "Arsenal gana · 1.72 · 2 u. Empezó Arsenal vs Liverpool y ya no se puede editar." },
    atIso: ago(180),
    actionLabel: "Ver bitácora",
    href: "/app/lab",
  },
  {
    id: "final:kc-buf",
    kind: "partidos",
    priority: "normal",
    title: "Final: Chiefs 27–24 Bills",
    context: { lead: "Lo más probable era Chiefs (58.4 %)", text: " y ocurrió." },
    atIso: ago(300),
    actionLabel: "Ver resumen",
    href: "/app/nfl/games/kc-buf",
  },
  {
    id: "graded:j0",
    kind: "picks",
    priority: "normal",
    title: "Pick calificado: Bills +2.5",
    context: { lead: "Cumplido", text: " · +4.1 pts frente a la cuota justa. Registraste 1.96." },
    atIso: ago(1500),
    actionLabel: "Ver bitácora",
    href: "/app/lab",
  },
  {
    id: "digest:liga-mx:16",
    kind: "resumen",
    priority: "digest",
    title: "Cierre de Liga MX · Jornada 16",
    context: { lead: "6 de 9", text: " partidos terminaron con lo más probable." },
    atIso: ago(2000),
    actionLabel: "Ver liga",
    href: "/app/liga-mx",
  },
];

function Frame({
  items,
  initialRead = [],
  hasWatchlist = true,
  sheet = false,
}: {
  items: PlatformNotification[];
  initialRead?: string[];
  hasWatchlist?: boolean;
  sheet?: boolean;
}): React.JSX.Element {
  const [read, setRead] = useState<Set<string>>(new Set(initialRead));
  return (
    <div
      className="pl-profile-menu pl-notif-menu"
      style={{
        position: "relative",
        inset: "auto",
        display: "flex",
        // Fuera de un popover abierto la clase aplica el estado «cerrado»; aquí se muestra fijo.
        opacity: 1,
        translate: "0 0",
        scale: "1",
        margin: sheet ? "0 auto" : undefined,
        width: sheet ? 375 : 400,
        borderRadius: sheet ? "24px 24px 0 0" : undefined,
      }}
    >
      {sheet ? <span className="pl-profile-menu-grab" style={{ display: "block", margin: "8px auto 0" }} /> : null}
      <NotificationInboxPanel
        items={items}
        readIds={read}
        now={NOW}
        hasWatchlist={hasWatchlist}
        onOpenItem={(n) => setRead((prev) => new Set(prev).add(n.id))}
        onMarkAllRead={() => setRead(new Set(items.map((n) => n.id)))}
        onBrowse={() => undefined}
      />
    </div>
  );
}

export default {
  title: "Platform v4 / Notificaciones",
};

export const ConAvisos = { render: () => <Frame items={SAMPLE} initialRead={["graded:j0", "digest:liga-mx:16"]} /> };
export const ConAvisosClaro = { ...ConAvisos, globals: { theme: "light" } };

export const TodoLeido = { render: () => <Frame items={SAMPLE} initialRead={SAMPLE.map((n) => n.id)} /> };
export const TodoLeidoClaro = { ...TodoLeido, globals: { theme: "light" } };

export const SinPartidosVigilados = { render: () => <Frame items={[]} hasWatchlist={false} /> };
export const SinPartidosVigiladosClaro = { ...SinPartidosVigilados, globals: { theme: "light" } };

export const HojaMovil = {
  render: () => <Frame items={SAMPLE} initialRead={["graded:j0"]} sheet />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const HojaMovilClaro = { ...HojaMovil, globals: { theme: "light" } };
