import { permanentRedirect } from "next/navigation";

export default function PricingRedirectPage(): never {
  permanentRedirect("/precio");
}
