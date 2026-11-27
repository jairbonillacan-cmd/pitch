"use client";

import React from "react";

export interface DrawerErrorBoundaryProps {
  readonly title?: string;
  readonly onClose?: () => void;
  readonly children: React.ReactNode;
}

interface DrawerErrorBoundaryState {
  readonly hasError: boolean;
  readonly resetCount: number;
}

export class DrawerErrorBoundary extends React.Component<
  DrawerErrorBoundaryProps,
  DrawerErrorBoundaryState
> {
  constructor(props: DrawerErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, resetCount: 0 };
  }

  static getDerivedStateFromError(): Partial<DrawerErrorBoundaryState> {
    return { hasError: true };
  }

  private handleReset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      resetCount: prev.resetCount + 1,
    }));
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      const heading = this.props.title ?? "Panel temporalmente no disponible";
      return (
        <div className="p-4 sm:p-5 space-y-4" role="alert">
          <div className="space-y-1.5">
            <h2 className="m-0 text-base font-bold text-[var(--pl-text)]">{heading}</h2>
            <p className="m-0 text-sm text-[var(--pl-text-secondary)]">
              Ocurrió un problema inesperado al dibujar esta vista. Puedes reintentar sin perder tu sesión.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="pl-btn-glass min-h-11 px-4 text-sm font-semibold"
            >
              Reintentar
            </button>
            {this.props.onClose ? (
              <button
                type="button"
                onClick={this.props.onClose}
                className="pl-btn-glass min-h-11 px-4 text-sm"
              >
                Cerrar
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.resetCount}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
