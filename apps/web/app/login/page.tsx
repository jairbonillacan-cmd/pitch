import React from "react";
import { sanitizeNextPath } from "../../src/server/beta-auth.js";
import { LoginClient } from "../../src/client/login-client.js";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<React.JSX.Element> {
  const resolved = await searchParams;
  const nextPath = sanitizeNextPath(resolved.next);
  return <LoginClient nextPath={nextPath} />;
}
