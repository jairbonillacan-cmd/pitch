import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  buildInviteShareMetadata,
  resolveOgDisplayHandle,
  resolveShortInviteTarget,
} from "../../../src/server/short-invite";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code: rawCode } = await params;
  const accountsEnabled = Boolean(process.env.DATABASE_URL);
  const resolved = await resolveShortInviteTarget(rawCode, { accountsEnabled });
  const displayHandle = resolved.code
    ? resolveOgDisplayHandle({
        code: resolved.code,
        dbHandle: resolved.handle,
        accountsEnabled,
      })
    : null;
  return buildInviteShareMetadata({
    code: resolved.code,
    handle: displayHandle,
  });
}

export default async function ShortInviteRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const [{ code: rawCode }, resolvedParams] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);
  const resolved = await resolveShortInviteTarget(rawCode, {
    extraQuery: resolvedParams,
  });
  redirect(resolved.redirectTo);
}
