import React, { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmblemSurfaceProvider } from "../../sports";
import { useSafeEffect } from "../hooks";
import { VerificationSurface } from "./VerificationSurface";

const meta = {
  title: "Platform v4 / Público / VerificationSurface",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function VerificationStoryShell({
  children,
  mobile = false,
}: {
  readonly children: React.ReactNode;
  readonly mobile?: boolean;
}): React.JSX.Element {
  return (
    <EmblemSurfaceProvider surface="public">
      <div
        className="pl-stage"
        style={{
          minHeight: "100vh",
          padding: mobile ? 12 : 24,
        }}
      >
        <div
          style={{
            maxWidth: mobile ? 375 : 1120,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {children}
        </div>
      </div>
    </EmblemSurfaceProvider>
  );
}

function VerificationAutoTrigger({
  action,
  children,
}: {
  readonly action: "valid" | "tampered";
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useSafeEffect(() => {
    const root = hostRef.current;
    if (!root) return undefined;
    const selector =
      action === "valid" ? "[data-ver-example-valid]" : "[data-ver-example-tampered]";
    const timerId = window.setTimeout(() => {
      const button = root.querySelector<HTMLButtonElement>(selector);
      button?.click();
    }, 30);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [action]);

  return <div ref={hostRef}>{children}</div>;
}

export const VerificacionSha256ValidaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <VerificationStoryShell>
      <VerificationAutoTrigger action="valid">
        <VerificationSurface />
      </VerificationAutoTrigger>
    </VerificationStoryShell>
  ),
};

export const VerificacionSha256ValidaClaro: Story = {
  globals: { theme: "light" },
  render: VerificacionSha256ValidaOscuro.render,
};

export const HashManipuladoAlertaHonestaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <VerificationStoryShell>
      <VerificationAutoTrigger action="tampered">
        <VerificationSurface />
      </VerificationAutoTrigger>
    </VerificationStoryShell>
  ),
};

export const HashManipuladoAlertaHonestaClaro: Story = {
  globals: { theme: "light" },
  render: HashManipuladoAlertaHonestaOscuro.render,
};

export const EstadoVacioOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <VerificationStoryShell>
      <VerificationSurface />
    </VerificationStoryShell>
  ),
};

export const EstadoVacioClaro: Story = {
  globals: { theme: "light" },
  render: EstadoVacioOscuro.render,
};

export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <VerificationStoryShell mobile>
      <VerificationAutoTrigger action="valid">
        <VerificationSurface />
      </VerificationAutoTrigger>
    </VerificationStoryShell>
  ),
};

export const MovilClaro: Story = {
  globals: { theme: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: MovilOscuro.render,
};

export const MovilHashManipuladoOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <VerificationStoryShell mobile>
      <VerificationAutoTrigger action="tampered">
        <VerificationSurface />
      </VerificationAutoTrigger>
    </VerificationStoryShell>
  ),
};

export const MovilHashManipuladoClaro: Story = {
  globals: { theme: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: MovilHashManipuladoOscuro.render,
};
