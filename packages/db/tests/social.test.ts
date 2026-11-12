import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addSocialComment,
  applyMigrations,
  applyModerationAction,
  createSocialPost,
  deleteSocialPost,
  followCounts,
  getSocialPostById,
  listFollowing,
  listModerationPanelData,
  listSocialFeed,
  listSocialNotifications,
  markSocialNotificationsRead,
  reportSocialContent,
  sealedPicks,
  setSocialFollow,
  setSocialLike,
  SOCIAL_LIMITS,
  socialModerationLogs,
  users,
  type Db,
  type NewSocialPost,
} from "../src/index";

let client: PGlite;
let db: Db;
const now = new Date("2026-11-12T12:00:00Z");
const MIN = 60_000;

async function member(handle: string, displayName: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `${handle}@example.com`, handle, displayName, authUserId: `auth-${handle}`, isAdult: true })
    .returning();
  return u!;
}

const post = (body: string, extra: Partial<NewSocialPost> = {}): NewSocialPost => ({
  body,
  leagueLabel: "Comunidad",
  matchLabel: "",
  pickBadge: "",
  originType: "Bitácora Propia",
  ...extra,
});

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
}, 60_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE social_moderation_logs, users CASCADE");
});

afterAll(async () => {
  await client?.close();
});

describe("comunidad compartida", () => {
  it("lo que publica un socio lo ve otro, con comentarios y «me gusta»", async () => {
    const ana = await member("ana_mx", "Ana López");
    const beto = await member("beto_nfl", "Beto Ruiz");

    const created = await createSocialPost(db, ana.id, post("Monterrey o empate, el local llega con bajas."), now);
    expect(created.ok).toBe(true);
    const postId = created.ok ? created.id : "";

    const comment = await addSocialComment(db, beto.id, postId, "Coincido, buen pick.", new Date(now.getTime() + MIN));
    expect(comment).toMatchObject({ ok: true, comment: { authorHandle: "beto_nfl", authorName: "Beto Ruiz" } });
    expect(await setSocialLike(db, beto.id, postId, true)).toEqual({ ok: true, likes: 1 });
    // Dar «me gusta» dos veces no suma dos.
    expect(await setSocialLike(db, beto.id, postId, true)).toEqual({ ok: true, likes: 1 });

    const [seenByBeto] = await listSocialFeed(db, beto.id);
    expect(seenByBeto).toMatchObject({
      id: postId,
      authorHandle: "ana_mx",
      authorName: "Ana López",
      likes: 1,
      likedByMe: true,
      isMine: false,
      record: "Sin picks liquidados",
    });
    expect(seenByBeto!.comments.map((c) => c.body)).toEqual(["Coincido, buen pick."]);

    const [seenByAna] = await listSocialFeed(db, ana.id);
    expect(seenByAna).toMatchObject({ likedByMe: false, isMine: true });

    expect(await setSocialLike(db, beto.id, postId, false)).toEqual({ ok: true, likes: 0 });
  });

  it("al cambiar de @usuario, sus publicaciones muestran el nuevo", async () => {
    const ana = await member("ana_mx", "Ana López");
    await createSocialPost(db, ana.id, post("Primera lectura de la jornada."), now);
    await db.update(users).set({ handle: "ana_pro", displayName: "Ana Analista" });
    const [p] = await listSocialFeed(db, null);
    expect(p).toMatchObject({ authorHandle: "ana_pro", authorName: "Ana Analista" });
  });

  it("el récord sale de la bitácora sellada, no del navegador", async () => {
    const ana = await member("ana_mx", "Ana López");
    const sealed = {
      userId: ana.id,
      gameId: "g1",
      leagueLabel: "Liga MX",
      matchLabel: "A vs B",
      pickLabel: "Local",
      origin: "Spacetime Suite",
      units: "1",
      fairDecimal: "1.9",
      clvPct: "2",
      sealHash: "h".repeat(64),
      sealedAt: new Date("2026-11-01T10:00:00Z"),
      kickoffAt: new Date("2026-11-01T18:00:00Z"),
    };
    await db.insert(sealedPicks).values([
      { ...sealed, pickId: "p1", userDecimal: "2.5", status: "won" },
      { ...sealed, pickId: "p2", userDecimal: "2", status: "lost" },
    ]);
    await createSocialPost(db, ana.id, post("Récord al día, sigo con Liga MX."), now);
    const [p] = await listSocialFeed(db, null);
    expect(p).toMatchObject({ record: "+0.5u · 2 picks", clv: "CLV +2.0 %" });
  });

  it("frena texto repetido y más de 10 publicaciones por hora", async () => {
    const ana = await member("ana_mx", "Ana López");
    await createSocialPost(db, ana.id, post("Texto que no se repite."), now);
    expect(await createSocialPost(db, ana.id, post("  texto que NO se repite. "), now)).toEqual({
      ok: false,
      reason: "repetido",
    });
    for (let i = 1; i < SOCIAL_LIMITS.postsPerHour; i += 1) {
      await createSocialPost(db, ana.id, post(`Lectura número ${i} del día.`), new Date(now.getTime() + i * MIN));
    }
    expect(
      await createSocialPost(db, ana.id, post("Una más de la cuenta."), new Date(now.getTime() + 20 * MIN)),
    ).toEqual({ ok: false, reason: "limite" });
    // Una hora después ya puede volver a publicar.
    expect(
      (await createSocialPost(db, ana.id, post("Ya pasó la hora."), new Date(now.getTime() + 61 * MIN))).ok,
    ).toBe(true);
  });

  it("solo el autor borra su publicación", async () => {
    const ana = await member("ana_mx", "Ana López");
    const beto = await member("beto_nfl", "Beto Ruiz");
    const created = await createSocialPost(db, ana.id, post("Esta la voy a borrar."), now);
    const id = created.ok ? created.id : "";
    expect(await deleteSocialPost(db, beto.id, id)).toBe(false);
    expect(await deleteSocialPost(db, ana.id, id)).toBe(true);
    expect(await listSocialFeed(db, null)).toEqual([]);
  });

  it("seguir: filtra el feed, cuenta seguidores y no permite seguirse a sí mismo", async () => {
    const ana = await member("ana_mx", "Ana López");
    const beto = await member("beto_nfl", "Beto Ruiz");
    const caro = await member("caro_liga", "Caro Díaz");
    await createSocialPost(db, beto.id, post("Lectura de Beto para el domingo."), now);
    await createSocialPost(db, caro.id, post("Lectura de Caro para el sábado."), now);

    expect(await setSocialFollow(db, ana.id, "BETO_NFL", true)).toEqual({ ok: true, following: true });
    expect(await setSocialFollow(db, ana.id, "ana_mx", true)).toEqual({ ok: false, reason: "propio" });
    expect(await setSocialFollow(db, ana.id, "nadie_aqui", true)).toEqual({ ok: false, reason: "no_existe" });

    expect(await listFollowing(db, ana.id)).toEqual(["beto_nfl"]);
    expect((await listSocialFeed(db, ana.id, { following: true })).map((p) => p.authorHandle)).toEqual(["beto_nfl"]);
    expect((await listSocialFeed(db, null, { authorHandle: "caro_liga" })).map((p) => p.authorHandle)).toEqual([
      "caro_liga",
    ]);
    expect(await followCounts(db, beto.id)).toEqual({ followers: 1, following: 0 });

    await setSocialFollow(db, ana.id, "beto_nfl", false);
    expect(await listFollowing(db, ana.id)).toEqual([]);
  });

  it("guarda el pick adjunto y oculta lo moderado", async () => {
    const ana = await member("ana_mx", "Ana López");
    const pick = {
      pickId: "pk1",
      gameId: "g9",
      label: "Gana Monterrey",
      units: 1.5,
      userDecimal: 2.1,
      fairDecimal: 1.95,
      modelProbability: 0.51,
    };
    const created = await createSocialPost(db, ana.id, post("Con pick adjunto del modelo.", { pick }), now);
    const [p] = await listSocialFeed(db, null);
    expect(p!.pick).toEqual(pick);
    await client.exec(`UPDATE social_posts SET is_hidden_by_moderation = true WHERE id = '${created.ok ? created.id : ""}'`);
    expect(await listSocialFeed(db, null)).toEqual([]);
  });

  it("avisos: comentario ajeno (no propio), seguido solo la primera vez y likes agrupados", async () => {
    const ana = await member("ana_mx", "Ana López");
    const beto = await member("beto_nfl", "Beto Ruiz");
    const caro = await member("caro_liga", "Caro Díaz");
    const dani = await member("dani_premier", "Dani Soto");

    const created = await createSocialPost(db, ana.id, post("Monterrey llega completo y con descanso."), now);
    const postId = created.ok ? created.id : "";
    expect((await getSocialPostById(db, null, postId))?.id).toBe(postId);

    // Comentarse a sí misma no genera aviso.
    await addSocialComment(db, ana.id, postId, "Agrego dato de bajas.", new Date(now.getTime() + MIN));
    expect(await listSocialNotifications(db, ana.id)).toEqual([]);

    // Comentario ajeno sí avisa con extracto.
    await addSocialComment(db, beto.id, postId, "Coincido con esa línea.", new Date(now.getTime() + 2 * MIN));

    // Seguir avisa la primera vez; dejar de seguir y volver a seguir no duplica ni reabre.
    await setSocialFollow(db, beto.id, "ana_mx", true, new Date(now.getTime() + 3 * MIN));
    let inbox = await listSocialNotifications(db, ana.id);
    expect(inbox.map((n) => ({ kind: n.kind, actorHandle: n.actorHandle }))).toEqual([
      { kind: "follow", actorHandle: "beto_nfl" },
      { kind: "comment", actorHandle: "beto_nfl" },
    ]);
    expect(inbox[1]?.postExcerpt).toBe("Monterrey llega completo y con descanso.");

    // Marca leído el aviso de seguimiento.
    const followNotifId = inbox[0]!.id;
    expect(await markSocialNotificationsRead(db, ana.id, [followNotifId], new Date(now.getTime() + 4 * MIN))).toBe(1);
    await setSocialFollow(db, beto.id, "ana_mx", false, new Date(now.getTime() + 5 * MIN));
    await setSocialFollow(db, beto.id, "ana_mx", true, new Date(now.getTime() + 6 * MIN));

    inbox = await listSocialNotifications(db, ana.id);
    const followRows = inbox.filter((n) => n.kind === "follow");
    expect(followRows).toHaveLength(1);
    expect(followRows[0]?.readAt).not.toBeNull();

    // Likes: el propio no avisa; varios ajenos se agrupan en un solo aviso que se actualiza.
    await setSocialLike(db, ana.id, postId, true, new Date(now.getTime() + 7 * MIN));
    expect((await listSocialNotifications(db, ana.id)).filter((n) => n.kind === "like")).toEqual([]);

    await setSocialLike(db, beto.id, postId, true, new Date(now.getTime() + 8 * MIN));
    await markSocialNotificationsRead(db, ana.id, undefined, new Date(now.getTime() + 9 * MIN));
    await setSocialLike(db, caro.id, postId, true, new Date(now.getTime() + 10 * MIN));
    await setSocialLike(db, dani.id, postId, true, new Date(now.getTime() + 11 * MIN));

    inbox = await listSocialNotifications(db, ana.id);
    const likeRows = inbox.filter((n) => n.kind === "like");
    expect(likeRows).toHaveLength(1);
    expect(likeRows[0]).toMatchObject({
      actorHandle: "dani_premier",
      actorName: "Dani Soto",
      likeCount: 3,
      readAt: null,
      postId,
    });
  });

  it("reportes y moderación: sin doble reporte, auto-oculta al 3.º, pausa bloquea y todo queda en logs", async () => {
    const autor = await member("autor_mx", "Autor Liga");
    const r1 = await member("rep_uno", "Reportero Uno");
    const r2 = await member("rep_dos", "Reportero Dos");
    const r3 = await member("rep_tres", "Reportero Tres");
    const admin = await member("jair_admin", "Jair Fundador");

    const created = await createSocialPost(db, autor.id, post("Garantizado 100 por ciento seguro hoy."), now);
    const postId = created.ok ? created.id : "";

    // No puede reportar lo propio ni motivos inválidos.
    expect(await reportSocialContent(db, autor.id, { postId, reason: "spam_enlaces" }, now)).toEqual({
      ok: false,
      reason: "propio_reporte",
    });
    expect(await reportSocialContent(db, r1.id, { postId, reason: "inventado" }, now)).toEqual({
      ok: false,
      reason: "motivo_invalido",
    });

    // Primer reporte: sigue visible; el mismo socio no puede reportar dos veces lo mismo.
    expect(await reportSocialContent(db, r1.id, { postId, reason: "apuesta_riesgosa" }, now)).toMatchObject({
      ok: true,
      autoHidden: false,
    });
    expect(await reportSocialContent(db, r1.id, { postId, reason: "spam_enlaces" }, new Date(now.getTime() + MIN))).toEqual({
      ok: false,
      reason: "ya_reportado",
    });
    expect((await listSocialFeed(db, r2.id)).map((p) => p.id)).toEqual([postId]);

    // Segundo reporte distinto: aún visible.
    expect(
      await reportSocialContent(db, r2.id, { postId, reason: "spam_enlaces" }, new Date(now.getTime() + 2 * MIN)),
    ).toMatchObject({
      ok: true,
      autoHidden: false,
    });
    expect((await listSocialFeed(db, r3.id)).map((p) => p.id)).toEqual([postId]);

    // Tercer reporte distinto: se oculta sola mientras sigue pendiente en la cola del panel.
    expect(
      await reportSocialContent(db, r3.id, { postId, reason: "ofensivo" }, new Date(now.getTime() + 3 * MIN)),
    ).toMatchObject({
      ok: true,
      autoHidden: true,
    });
    expect(await listSocialFeed(db, r1.id)).toEqual([]);

    const panelBefore = await listModerationPanelData(db);
    expect(panelBefore.pendingQueue).toHaveLength(1);
    expect(panelBefore.pendingQueue[0]).toMatchObject({
      targetType: "post",
      targetId: postId,
      authorHandle: "autor_mx",
      isHiddenByModeration: true,
      reportCount: 3,
    });
    expect(new Set(panelBefore.pendingQueue[0]!.reasons)).toEqual(
      new Set(["apuesta_riesgosa", "spam_enlaces", "ofensivo"]),
    );

    // Restaurar desde el panel limpia la cola y vuelve a mostrar la publicación.
    expect(
      await applyModerationAction(
        db,
        admin.id,
        { action: "restore", targetType: "post", targetId: postId },
        new Date(now.getTime() + 4 * MIN),
      ),
    ).toEqual({ ok: true });
    expect((await listSocialFeed(db, r1.id)).map((p) => p.id)).toEqual([postId]);
    expect((await listModerationPanelData(db)).pendingQueue).toEqual([]);

    // Pausar al socio: sus publicaciones no las ven los demás y no puede publicar ni comentar.
    expect(
      await applyModerationAction(
        db,
        admin.id,
        { action: "pause_user", targetUserId: autor.id },
        new Date(now.getTime() + 5 * MIN),
      ),
    ).toEqual({ ok: true });

    expect(await listSocialFeed(db, r1.id)).toEqual([]);
    expect(await createSocialPost(db, autor.id, post("Intento publicar estando en pausa."), new Date(now.getTime() + 6 * MIN))).toEqual({
      ok: false,
      reason: "pausado",
    });

    const otherPost = await createSocialPost(db, r1.id, post("Publicación normal de otro socio."), new Date(now.getTime() + 7 * MIN));
    const otherPostId = otherPost.ok ? otherPost.id : "";
    expect(await addSocialComment(db, autor.id, otherPostId, "Intento comentar.", new Date(now.getTime() + 8 * MIN))).toEqual({
      ok: false,
      reason: "pausado",
    });

    // Límite por hora de reportes.
    for (let i = 0; i < SOCIAL_LIMITS.reportsPerHour - 1; i++) {
      const extra = await createSocialPost(
        db,
        r2.id,
        post(`Publicación extra número ${i} para probar tope.`),
        new Date(now.getTime() + (10 + i) * MIN),
      );
      if (extra.ok) {
        const rep = await reportSocialContent(
          db,
          r1.id,
          { postId: extra.id, reason: "otro" },
          new Date(now.getTime() + (10 + i) * MIN),
        );
        expect(rep.ok).toBe(true);
      }
    }
    expect(
      await reportSocialContent(
        db,
        r1.id,
        { postId: otherPostId, reason: "otro" },
        new Date(now.getTime() + 25 * MIN),
      ),
    ).toEqual({
      ok: false,
      reason: "propio_reporte",
    });
    const extraTarget = await createSocialPost(
      db,
      r3.id,
      post("Una publicación más para cruzar el tope por hora."),
      new Date(now.getTime() + 26 * MIN),
    );
    expect(
      await reportSocialContent(
        db,
        r1.id,
        { postId: extraTarget.ok ? extraTarget.id : "", reason: "otro" },
        new Date(now.getTime() + 27 * MIN),
      ),
    ).toEqual({
      ok: false,
      reason: "limite",
    });

    // Todas las acciones (auto-ocultar, restaurar y pausar) quedaron en social_moderation_logs.
    const logs = await db.select().from(socialModerationLogs);
    expect(logs.map((l) => l.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("auto_ocultar:post:"),
        expect.stringContaining(":restaurar:post:"),
        expect.stringContaining(":pausar_socio"),
      ]),
    );
  });
});
