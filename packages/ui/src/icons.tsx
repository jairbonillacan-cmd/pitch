import React from "react";

export type IconName =
  | "games"
  | "info"
  | "close"
  | "trend"
  | "panel"
  | "home"
  | "search"
  | "user"
  | "bookmark"
  | "more"
  | "chevron"
  | "soccer"
  | "football"
  | "hockey"
  | "baseball"
  | "model"
  | "probability"
  | "sources"
  | "compare"
  | "competition"
  | "simulation"
  | "radar"
  | "shield"
  | "lock"
  | "arrow"
  | "check"
  | "sun"
  | "moon"
  | "backspace";

export function Icon({
  name,
  className = "icon",
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}): React.JSX.Element {
  const a11yProps = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  return (
    <svg
      className={`${className} ${name}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11yProps}
    >
      {renderIconPaths(name)}
    </svg>
  );
}

function renderIconPaths(name: IconName): React.ReactNode {
  switch (name) {
    case "games":
      return <path d="M4 7H20V19H4ZM8 4V10M16 4V10M4 12H20" />;
    case "info":
      return <path d="M12 3A9 9 0 1 1 11.99 3ZM12 11V17M12 7V8" />;
    case "close":
      return <path d="M6 6L18 18M18 6L6 18" />;
    case "trend":
      return <path d="M4 19V5M4 19H20M7 15L11 11L15 13L20 6" />;
    case "panel":
      return <path d="M3 3H21V21H3ZM9 3V21" />;
    case "home":
      return <path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z" />;
    case "search":
      return <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></>;
    case "user":
      return <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>;
    case "bookmark":
      return <path d="M6 4h12v16l-6-4-6 4z" />;
    case "more":
      return <path d="M5 12h.01m6.99 0h.01m6.99 0h.01" strokeWidth={3} />;
    case "chevron":
      return <path d="m9 6 6 6-6 6" />;
    case "soccer":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m12 8 3.8 2.8-1.5 4.5H9.7l-1.5-4.5L12 8Zm0 0V3.5m3.8 7.3 4.3-1.4m-5.8 5.9 2.6 3.7m-7.2-3.7L7.1 19m1.1-8.2L3.9 9.4" />
        </>
      );
    case "football":
      return (
        <path d="M4 20C1.4 11 10.8 1.4 20 4c2.6 9.1-6.9 18.6-16 16ZM5 12.3l6.7 6.7m.6-14 6.7 6.7M9 15l6-6m-4.9 2.1 2.8 2.8m-.8-4.8 2.8 2.8" />
      );
    case "hockey":
      return (
        <>
          <path d="m5.5 4.5 8.8 13h4.4a2 2 0 0 1 2 2v1h-7.2L3.6 5.8l1.9-1.3Z" />
          <rect x="4" y="17.5" width="4.5" height="3" rx="1.2" />
        </>
      );
    case "baseball":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6.6 5.4a10.7 10.7 0 0 1 0 13.2m10.8-13.2a10.7 10.7 0 0 0 0 13.2M6.8 9.1l2.8-.7m-2.4 6.5 2.5.7m7.5-6.5-2.8-.7m2.4 6.5-2.5.7" />
        </>
      );
    case "model":
      return (
        <path d="m12 3.5 8 4.4v8.2l-8 4.4-8-4.4V7.9l8-4.4ZM4 7.9l8 4.5 8-4.5m-8 4.5v8.1m-4-14.8 8 4.4" />
      );
    case "probability":
      return <path d="M11 4a8 8 0 1 0 9 9h-9V4Zm3 0v6h6a8 8 0 0 0-6-6Z" />;
    case "sources":
      return <path d="M6 4h9l3 3v13H6V4Zm9 0v4h3M9 11h6m-6 4h6" />;
    case "compare":
      return <path d="M4 8h15m-3.5-3.5L19 8l-3.5 3.5M20 16H5m3.5-3.5L5 16l3.5 3.5" />;
    case "competition":
      return (
        <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4ZM7.5 6H4v2.5a3 3 0 0 0 3 3h1m8.5-5.5H20v2.5a3 3 0 0 1-3 3h-1M12 13.5v5M8.5 20h7" />
      );
    case "simulation":
      return (
        <>
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="5.5" r="2" />
          <circle cx="18" cy="12" r="2" />
          <circle cx="18" cy="18.5" r="2" />
          <path d="M8 12h8m-8 0c4.5 0 3.5-6.5 8-6.5M8 12c4.5 0 3.5 6.5 8 6.5" />
        </>
      );
    case "radar":
      return (
        <>
          <path d="M7.5 9.5 4 4c-1.1 3.7-.8 7.1.8 9.4C5.5 17.4 8.1 20 12 20s6.5-2.6 7.2-6.6C20.8 11.1 21.1 7.7 20 4l-3.5 5.5A7.5 7.5 0 0 0 12 8a7.5 7.5 0 0 0-4.5 1.5Z" />
          <path d="m7.5 13 1.7.5m5.6 0 1.7-.5m-6.1 3.2c1.1 1 2.1 1 3.2 0" />
        </>
      );
    case "shield":
      return <path d="M12 3.5 19 6v6c0 4.2-3 7-7 8.5C8 19 5 16.2 5 12V6l7-2.5Z" />;
    case "lock":
      return (
        <>
          <rect width="18" height="11" x="3" y="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      );
    case "arrow":
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case "check":
      return <path d="M20 6 9 17l-5-5" />;
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </>
      );
    case "moon":
      return <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />;
    case "backspace":
      return (
        <>
          <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
          <path d="m12 9 6 6m0-6-6 6" />
        </>
      );
  }
}
