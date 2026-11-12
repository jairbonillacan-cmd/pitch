"use client";

/**
 * Bandeja de notificaciones (Fase 1): campana con contador de no leídas y un popover nativo
 * que en escritorio cuelga bajo la campana y en móvil sube como hoja (mismo patrón que el menú
 * de cuenta). Lo leído se guarda en el navegador hasta que existan cuentas con servidor.
 */
import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buildNotifications,
  formatBadgeCount,
  formatNotificationTime,
  notificationGroup,
  unreadCount,
  type NotificationGroup,
  type NotificationKind,
  type PlatformNotification,
} from "../notifications";
import { usePlatform } from "../platform-provider";
import { MaestroIcon, type MaestroIconName } from "./MaestroPrimitives";

/* ---------- Leídas: almacén compartido (conviven dos encabezados durante la carga) ---------- */

const READ_KEY = "pl-notif-read-v1";
const READ_CAP = 300;
const EMPTY_SET: ReadonlySet<string> = new Set();
let readSnapshot: ReadonlySet<string> | null = null;
const readListeners = new Set<() => void>();

function loadRead(): ReadonlySet<string> {
  if (readSnapshot) return readSnapshot;
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    readSnapshot = new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : []);
  } catch {
    readSnapshot = new Set();
  }
  return readSnapshot;
}

function markRead(ids: readonly string[]): void {
  const next = new Set(loadRead());
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  readSnapshot = next;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...next].slice(-READ_CAP)));
  } catch {
    // Sin almacenamiento: lo leído dura lo que la pestaña.
  }
  for (const fn of readListeners) fn();
}

function subscribeRead(fn: () => void): () => void {
  readListeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== READ_KEY) return;
    readSnapshot = null;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    readListeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

function useReadIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeRead, loadRead, () => EMPTY_SET);
}

/** Reloj por minuto; `null` en el servidor y antes de montar (evita desajustes de hidratación). */
function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/* ---------- Panel (presentacional) ---------- */

const KIND_ICON: Record<NotificationKind, MaestroIconName> = {
  partidos: "calendar",
  cuotas: "activity",
  picks: "ticket",
  resumen: "chart",
};

const FILTERS: ReadonlyArray<{ id: NotificationKind | "todas"; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "partidos", label: "Partidos" },
  { id: "cuotas", label: "Cuotas" },
  { id: "picks", label: "Tus picks" },
];

export interface NotificationInboxPanelProps {
  items: readonly PlatformNotification[];
  readIds: ReadonlySet<string>;
  now: Date;
  /** Hay partidos vigilados: cambia el texto del estado vacío. */
  hasWatchlist: boolean;
  onOpenItem: (item: PlatformNotification) => void;
  onMarkAllRead: () => void;
  onBrowse: () => void;
  titleId?: string;
}

export function NotificationInboxPanel({
  items,
  readIds,
  now,
  hasWatchlist,
  onOpenItem,
  onMarkAllRead,
  onBrowse,
  titleId,
}: NotificationInboxPanelProps): React.JSX.Element {
  const [filter, setFilter] = useState<NotificationKind | "todas">("todas");
  const total = unreadCount(items, readIds);
  const allRead = items.every((n) => readIds.has(n.id));
  // El resumen de jornada no tiene filtro propio: solo aparece en «Todas».
  const shown = filter === "todas" ? items : items.filter((n) => n.kind === filter);
  let lastGroup: NotificationGroup | null = null;

  return (
    <div className="pl-notif">
      <div className="pl-notif-head">
        <h2 id={titleId} className="pl-notif-title">
          Notificaciones
        </h2>
        {items.length > 0 ? (
          <button type="button" className="pl-notif-link" onClick={onMarkAllRead} disabled={allRead}>
            Marcar todo leído
          </button>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="pl-notif-chips" role="group" aria-label="Filtrar por tipo">
          {FILTERS.map((f) => {
            const n = f.id === "todas" ? total : unreadCount(items.filter((i) => i.kind === f.id), readIds);
            return (
              <button
                key={f.id}
                type="button"
                className="pl-notif-chip"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {n > 0 ? <span className="num">{n}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="pl-notif-list">
        {items.length === 0 ? (
          <div className="pl-notif-empty">
            <MaestroIcon name="bell" size={20} />
            <strong>{hasWatchlist ? "Todo tranquilo" : "Sigue un partido para recibir avisos"}</strong>
            <p>
              {hasWatchlist
                ? "Te avisamos 1 hora antes de que empiecen tus partidos, cuando la casa pague más que la cuota justa y al final."
                : "Toca el ojo en cualquier partido. Te avisamos antes de que empiece, si la casa paga más que la cuota justa y con el resultado."}
            </p>
            <button type="button" className="pl-notif-link" onClick={onBrowse}>
              Ver la jornada
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="pl-notif-empty">
            <p>Nada de este tipo por ahora.</p>
          </div>
        ) : (
          shown.map((n) => {
            const group = notificationGroup(n.atIso, now);
            const header =
              group !== lastGroup ? (
                <div key={`g-${group}`} className="pl-notif-group" role="presentation">
                  {group}
                </div>
              ) : null;
            lastGroup = group;
            const unread = !readIds.has(n.id);
            const urgent = n.priority === "urgent";
            return (
              <React.Fragment key={n.id}>
                {header}
                <a
                  href={n.href}
                  className="pl-notif-row"
                  data-read={unread ? undefined : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenItem(n);
                  }}
                >
                  <span className="pl-notif-ico" data-urgent={urgent ? "" : undefined} aria-hidden="true">
                    <MaestroIcon name={KIND_ICON[n.kind]} size={16} />
                  </span>
                  <span className="pl-notif-body">
                    <span className="pl-notif-row-title num">
                      {unread ? <span className="sr-only">No leída. </span> : null}
                      {urgent ? <span className="sr-only">Urgente. </span> : null}
                      {n.title}
                    </span>
                    <span className="pl-notif-ctx num">
                      {n.context.lead ? <b>{n.context.lead}</b> : null}
                      {n.context.text}
                    </span>
                    <span className="pl-notif-foot">
                      <span>
                        {formatNotificationTime(n.atIso, now)}
                        {n.source ? ` · ${n.source}` : ""}
                      </span>
                      <span className="pl-notif-act">
                        {n.actionLabel}
                        <MaestroIcon name="arrowRight" size={12} />
                      </span>
                    </span>
                  </span>
                  <span className="pl-notif-side" aria-hidden="true">
                    {urgent ? <span className="pl-notif-urgent">Urgente</span> : null}
                    <span className="pl-notif-dot" />
                  </span>
                </a>
              </React.Fragment>
            );
          })
        )}
      </div>

      {items.length > 0 ? (
        <div className="pl-notif-bottom">
          <span className="num">{total > 0 ? `${total} sin leer` : "Todo al día"}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Campana + popover (contenedor) ---------- */

export function NotificationBell(): React.JSX.Element {
  const { dataset, watchlistGameIds, journal, oddsFormat, favoriteLeagues, navigateTo } = usePlatform();
  const now = useMinuteClock();
  const readIds = useReadIds();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const menuId = `pl-notif-menu${uid}`;
  const titleId = `${menuId}-title`;
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);

  const items = useMemo(
    () =>
      now
        ? buildNotifications({
            games: dataset.games,
            watchlistGameIds,
            journal,
            favoriteLeagues,
            oddsFormat,
            now,
            generatedAtIso: dataset.generatedAt,
          })
        : [],
    [dataset.games, dataset.generatedAt, watchlistGameIds, journal, favoriteLeagues, oddsFormat, now],
  );
  const count = unreadCount(items, readIds);

  const close = () => {
    try {
      menuRef.current?.hidePopover();
    } catch {
      // Ya estaba cerrado.
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        className="pl-btn-glass pl-bell-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `Notificaciones, ${count} sin leer` : "Notificaciones"}
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          const menu = menuRef.current;
          if (rect && menu) {
            menu.style.setProperty("--menu-top", `${rect.bottom + 8}px`);
            menu.style.setProperty(
              "--menu-right",
              `${Math.max(8, document.documentElement.clientWidth - rect.right)}px`,
            );
          }
        }}
      >
        <MaestroIcon name="bell" size={16} />
        {count > 0 ? (
          <span className="pl-bell-count num" aria-hidden="true">
            {formatBadgeCount(count)}
          </span>
        ) : null}
      </button>

      <div
        id={menuId}
        ref={menuRef}
        popover="auto"
        className="pl-profile-menu pl-notif-menu"
        role="dialog"
        aria-labelledby={titleId}
      >
        <span className="pl-profile-menu-grab" aria-hidden="true" />
        {open && now ? (
          <NotificationInboxPanel
            items={items}
            readIds={readIds}
            now={now}
            hasWatchlist={watchlistGameIds.length > 0}
            titleId={titleId}
            onOpenItem={(n) => {
              markRead([n.id]);
              close();
              navigateTo(n.href);
            }}
            onMarkAllRead={() => markRead(items.map((n) => n.id))}
            onBrowse={() => {
              close();
              navigateTo("/app");
            }}
          />
        ) : (
          <h2 id={titleId} className="sr-only">
            Notificaciones
          </h2>
        )}
      </div>
    </>
  );
}
