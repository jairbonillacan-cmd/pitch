import { getViewerAccess } from "./viewer-access";

export interface PublicSessionStatus {
  readonly authenticated: boolean;
  readonly hasAccountSession: boolean;
}

export async function getPublicSessionStatus(): Promise<PublicSessionStatus> {
  try {
    const access = await getViewerAccess();
    return {
      authenticated: access.via !== "none",
      hasAccountSession: access.via === "account",
    };
  } catch (err) {
    void err;
    return {
      authenticated: false,
      hasAccountSession: false,
    };
  }
}

export async function hasPublicSessionCookie(): Promise<boolean> {
  const status = await getPublicSessionStatus();
  return status.authenticated;
}
