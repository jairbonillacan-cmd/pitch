import { getViewerAccess } from "./viewer-access";

export async function hasPublicSessionCookie(): Promise<boolean> {
  try {
    const access = await getViewerAccess();
    return access.via !== "none";
  } catch (err) {
    void err;
    return false;
  }
}
