export const UNSUBSCRIBE_PATHNAME = "/api/me/email-preferences/unsubscribe";

export const UNSUBSCRIBE_SHARED_STYLES = `
      :root{color-scheme:dark}
      body{font-family:system-ui,-apple-system,sans-serif;background:rgb(10 13 18);color:rgb(244 246 249);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
      main{max-width:440px;width:100%;background:rgb(18 23 33);border:1px solid rgb(36 45 61);border-radius:16px;padding:28px;text-align:center}
      h1{font-size:20px;margin:0 0 12px}
      p{font-size:14px;line-height:1.55;color:rgb(184 194 209);margin:0 0 20px}
      form{margin:0 0 14px}
      button,a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:10px 20px;border-radius:999px;font-weight:700;text-decoration:none;font-size:max(1rem,1em);cursor:pointer;box-sizing:border-box}
      button{border:0;width:100%;background:rgb(16 185 129);color:rgb(5 46 22)}
      a.primary{background:rgb(16 185 129);color:rgb(5 46 22)}
      a.secondary{background:transparent;color:rgb(184 194 209);border:1px solid rgb(52 64 84);width:100%}
      button:focus-visible,a:focus-visible{outline:3px solid rgb(16 185 129);outline-offset:2px}`;

export const UNSUBSCRIBE_STYLE_CONTENT = `${UNSUBSCRIBE_SHARED_STYLES}\n    `;

let cachedUnsubscribeCsp = null;

export async function getUnsubscribeCsp() {
  if (cachedUnsubscribeCsp) return cachedUnsubscribeCsp;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(UNSUBSCRIBE_STYLE_CONTENT),
  );
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  const sha256 = btoa(binary);
  cachedUnsubscribeCsp = `default-src 'none'; script-src 'none'; style-src 'sha256-${sha256}'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
  return cachedUnsubscribeCsp;
}
