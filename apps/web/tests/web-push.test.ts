import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createVerify,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations, upsertPushSubscription, users, type Db } from "@pitchlab/db";
import {
  buildVapidHeaders,
  encryptWebPushPayload,
  sendPushNotification,
  sendPushToUsers,
  vapidConfigFromEnv,
} from "../src/server/web-push";

function createTestVapidPair(): { publicKey: string; privateKey: string; subject: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pubJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const privJwk = privateKey.export({ format: "jwk" }) as { d: string };
  const pubUncompressed = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pubJwk.x, "base64url"),
    Buffer.from(pubJwk.y, "base64url"),
  ]);
  return {
    publicKey: pubUncompressed.toString("base64url"),
    privateKey: Buffer.from(privJwk.d, "base64url").toString("base64url"),
    subject: "mailto:test@pitchlab.mx",
  };
}

function decryptRfc8291(
  packet: Buffer,
  uaEcdh: ReturnType<typeof createECDH>,
  authSecret: Buffer,
): Buffer {
  const salt = packet.subarray(0, 16);
  const idLen = packet.readUInt8(20);
  const asPublic = packet.subarray(21, 21 + idLen);
  const ciphertext = packet.subarray(21 + idLen);
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);

  const sharedSecret = uaEcdh.computeSecret(asPublic);
  const uaPublic = uaEcdh.getPublicKey();
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\x00", "utf8"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\x00", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\x00", "utf8"), 12));

  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(authTag);
  const padded = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  // Quita el delimitador de padding 0x02 y los ceros finales.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  expect(padded[end]).toBe(0x02);
  return padded.subarray(0, end);
}

describe("Web Push VAPID y RFC 8291", () => {
  it("firma un JWT ES256 válido y cifra un payload descifrable por el navegador", () => {
    const vapid = createTestVapidPair();
    const endpoint = "https://fcm.googleapis.com/fcm/send/demo-token-123";
    const headers = buildVapidHeaders(endpoint, vapid, 1_760_000_000_000);
    expect(headers.Authorization).toMatch(/^vapid t=[^,]+, k=/);

    const token = headers.Authorization.slice("vapid t=".length, headers.Authorization.indexOf(", k="));
    const [hdrB64, payB64, sigB64] = token.split(".");
    expect(JSON.parse(Buffer.from(payB64!, "base64url").toString("utf8"))).toMatchObject({
      aud: "https://fcm.googleapis.com",
      sub: "mailto:test@pitchlab.mx",
    });

    const pubBytes = Buffer.from(vapid.publicKey, "base64url");
    const verifier = createVerify("SHA256");
    verifier.update(`${hdrB64}.${payB64}`);
    const okSig = verifier.verify(
      {
        key: {
          kty: "EC",
          crv: "P-256",
          x: pubBytes.subarray(1, 33).toString("base64url"),
          y: pubBytes.subarray(33, 65).toString("base64url"),
        },
        format: "jwk",
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(sigB64!, "base64url"),
    );
    expect(okSig).toBe(true);

    const ua = createECDH("prime256v1");
    const uaPub = ua.generateKeys().toString("base64url");
    const authSecret = randomBytes(16);
    const body = JSON.stringify({ title: "Gol en vivo", body: "América 1-0 Chivas", url: "/app" });
    const packet = encryptWebPushPayload(body, uaPub, authSecret.toString("base64url"));
    const plain = decryptRfc8291(packet, ua, authSecret).toString("utf8");
    expect(plain).toBe(body);

    expect(
      vapidConfigFromEnv({
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: vapid.subject,
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual(vapid);
  });

  it("envía notificación por fetch y limpia endpoints caducados (410 Gone) en DB", async () => {
    const client = new PGlite();
    await applyMigrations((sqlText) => client.exec(sqlText));
    const db = drizzle(client) as unknown as Db;

    const vapid = createTestVapidPair();
    process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    process.env.VAPID_SUBJECT = vapid.subject;

    try {
      const [user] = await db
        .insert(users)
        .values({ email: "push@pitchlab.mx", displayName: "Socio Push", handle: "sociopush" })
        .returning({ id: users.id });

      const ua1 = createECDH("prime256v1");
      const ua2 = createECDH("prime256v1");
      await upsertPushSubscription(db, {
        userId: user!.id,
        endpoint: "https://fcm.googleapis.com/fcm/send/ok-sub",
        p256dh: ua1.generateKeys().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
        topicPicks: true,
      });
      await upsertPushSubscription(db, {
        userId: user!.id,
        endpoint: "https://fcm.googleapis.com/fcm/send/gone-sub",
        p256dh: ua2.generateKeys().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
        topicPicks: true,
      });

      const called: string[] = [];
      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        called.push(url);
        expect((init?.headers as Record<string, string>)["Content-Encoding"]).toBe("aes128gcm");
        return new Response(null, { status: url.includes("gone-sub") ? 410 : 201 });
      }) as typeof fetch;

      const summary = await sendPushToUsers(
        db,
        [user!.id],
        "picks",
        { title: "Pick ganado", body: "América -0.5" },
        mockFetch,
      );
      expect(called).toHaveLength(2);
      expect(summary).toEqual({ sent: 1, failed: 0, pruned: 1 });

      // Verifica que sendPushNotification individual funcione.
      const single = await sendPushNotification(
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/single",
          p256dh: ua1.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
        { title: "Prueba", body: "Cuerpo" },
        vapid,
        mockFetch,
      );
      expect(single.ok).toBe(true);
    } finally {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      delete process.env.VAPID_SUBJECT;
      await client.close();
    }
  });
});
