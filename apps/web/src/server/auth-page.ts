import { sanitizeNextPath } from "./beta-auth";
import type { ViewerAccess } from "./viewer-access";

export const SIGNUP_DETAILS_PATH = "/signup?paso=2&via=cuenta";

export function authPageRedirect(
  mode: "login" | "signup",
  step: string | undefined,
  next: string | undefined,
  access: Pick<ViewerAccess, "via" | "signupComplete">,
): string | null {
  if (step === "confirmado" || step === "vencido" || (mode === "signup" && step === "2")) return null;
  if (access.via === "none") return null;
  if (access.via === "account" && !access.signupComplete) {
    const dest = sanitizeNextPath(next);
    return dest === "/app" ? SIGNUP_DETAILS_PATH : `${SIGNUP_DETAILS_PATH}&next=${encodeURIComponent(dest)}`;
  }
  return sanitizeNextPath(next);
}
