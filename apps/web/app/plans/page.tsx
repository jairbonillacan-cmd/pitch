import { permanentRedirect } from "next/navigation";
import { toQueryString } from "../../src/server/query-string";

export default async function PlansRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const qs = toQueryString(searchParams ? await searchParams : undefined);
  permanentRedirect(`/precio${qs}`);
}
