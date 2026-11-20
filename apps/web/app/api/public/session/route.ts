import { NextResponse } from "next/server";
import { hasPublicSessionCookie } from "../../../../src/server/public-session";

export const dynamic = "force-dynamic";

/**
 * Comprobación mínima de sesión para la barra pública (`PublicNavBarClient`).
 * Permite cachear HTML público (ISR + `Cache-Control: public`) sin leer cookies
 * durante el renderizado SSR ni filtrar datos de sesión entre visitantes (`ADR-053`).
 */
export async function GET(): Promise<NextResponse> {
  const authenticated = await hasPublicSessionCookie();
  return NextResponse.json(
    { authenticated },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
