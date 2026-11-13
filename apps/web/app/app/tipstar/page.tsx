import { permanentRedirect } from "next/navigation";
import { toQueryString } from "../../../src/server/query-string";

/** Ruta anterior: el portal ahora vive en `/app/tipster`. */
export default async function OldTipsterRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const qs = toQueryString(searchParams ? await searchParams : undefined);
  permanentRedirect(`/app/tipster${qs}`);
}
