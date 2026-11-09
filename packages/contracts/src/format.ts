/**
 * Formateadores es-MX (DESIGN_SYSTEM.md §2 y SHARED_CONTRACTS.md §1).
 * Porcentajes con 1 decimal y espacio ("55.8 %"), horas en 24 h ("18:00").
 */

export function formatPct(p: number): string {
  return (
    (p * 100).toLocaleString("es-MX", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " %"
  );
}

export function formatFairOdds(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  return (1 / p).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDayKey(isoOrDate: string): string {
  const normalized = isoOrDate.length === 10 ? `${isoOrDate}T12:00:00` : isoOrDate;
  return new Date(normalized).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatCutTimestamp(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  const month = months[d.getMonth()] ?? "nov";
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}
