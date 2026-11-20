import { NextResponse } from "next/server";
import { loadExtendedShellPayload } from "../../../../src/server/platform-data";
import { getViewerAccess } from "../../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

/**
 * Tramo 2 del shell RSC progresivo (ADR-053): entrega el resto del horizonte (7 días / todas las
 * ligas / `parlayCandidates`) al estar ocioso el navegador o bajo demanda, respetando estrictamente
 * la redacción Cero-Fuga en servidor para visitantes vs. socios con acceso activo.
 */
export async function GET(): Promise<NextResponse> {
  const access = await getViewerAccess();
  if (access.via === "none") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = loadExtendedShellPayload(access.fullAccess);
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=30",
    },
  });
}
