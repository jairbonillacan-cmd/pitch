"use client";

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button, Drawer, Input, Label, Modal, Switch, TextArea, TextField } from "@heroui/react";
import { containsExternalLink, MAX_PROFILE_BIO_LENGTH, profileBioLength } from "@pitchlab/contracts";
import { normalizeSignupHandle, useHandleAvailability } from "../public/use-handle-availability";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports";
import { Avatar } from "./community-ui";

/** Ligas que se pueden marcar como favoritas, agrupadas por deporte. */
const FAVORITE_GROUPS: ReadonlyArray<{ sport: string; leagues: ReadonlyArray<{ id: LeagueId; label: string }> }> = [
  {
    sport: "Fútbol",
    leagues: [
      { id: "liga-mx" as LeagueId, label: "Liga MX" },
      { id: "premier-league" as LeagueId, label: "Premier League" },
      { id: "laliga" as LeagueId, label: "LaLiga" },
      { id: "bundesliga" as LeagueId, label: "Bundesliga" },
      { id: "serie-a" as LeagueId, label: "Serie A" },
      { id: "ligue-1" as LeagueId, label: "Ligue 1" },
    ],
  },
  { sport: "Fútbol americano", leagues: [{ id: "nfl" as LeagueId, label: "NFL" }] },
];

interface ProfilePrivacy {
  favoriteLeagues: string[];
  publicRecordVisible: boolean;
  showInRanking: boolean;
}

const DEFAULT_PRIVACY: ProfilePrivacy = {
  favoriteLeagues: ["liga-mx", "nfl", "premier-league"],
  publicRecordVisible: true,
  showInRanking: true,
};

export interface EditableProfile {
  displayName: string;
  handle: string;
  bio: string | null;
  xUsername: string | null;
  avatarUrl?: string | null;
}

const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeToViewport(callback: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

const profileErrors: Record<string, string> = {
  nombre_invalido: "Escribe un nombre de 2 a 40 caracteres.",
  usuario_invalido: "Usa de 3 a 20 caracteres y empieza con una letra.",
  usuario_reservado: "Ese usuario está reservado.",
  usuario_ocupado: "Ese usuario ya está ocupado.",
  bio_invalida: "La bio admite hasta 160 caracteres.",
  bio_con_enlace: "Quita el enlace de tu bio.",
};

const avatarErrors: Record<string, string> = {
  almacenamiento_no_disponible: "La foto de perfil estará disponible pronto.",
  almacenamiento_no_configurado: "La foto de perfil estará disponible pronto.",
  archivo_muy_grande: "Elige una imagen de hasta 2 MB.",
  formato_invalido: "Usa una imagen JPG, PNG o WebP.",
  imagen_invalida: "No pudimos procesar esa imagen. Prueba con otra.",
  archivo_requerido: "Elige una imagen.",
};

export function XBrandMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M18.9 1.2h3.7l-8.2 9.3L24 22.8h-7.5l-5.9-7.7-6.7 7.7H.2l8.8-10L0 1.2h7.7l5.3 7 5.9-7Zm-1.3 19.4h2L6.6 3.3H4.4l13.2 17.3Z" />
    </svg>
  );
}

export function EditProfileDialog({
  profile,
  xEnabled,
  avatarEnabled = false,
  onChange,
  initialOpen = false,
  checkHandle = true,
}: {
  profile: EditableProfile;
  xEnabled: boolean;
  avatarEnabled?: boolean;
  onChange: (profile: EditableProfile) => void;
  initialOpen?: boolean;
  checkHandle?: boolean;
}): React.JSX.Element {
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
  const [open, setOpen] = useState(initialOpen);
  const [pending, setPending] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(profile.avatarUrl ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState("");
  const [saveIssue, setSaveIssue] = useState("");
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(DEFAULT_PRIVACY);
  const [privacyLoaded, setPrivacyLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const id = useId();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const cleanHandle = normalizeSignupHandle(handle);
  const handleStatus = useHandleAvailability(handle, open && checkHandle, profile.handle);
  const handleInvalid = handleStatus === "invalid" || handleStatus === "reserved" ||
    handleStatus === "taken" || saveIssue === "usuario_ocupado";
  const handleText = saveIssue === "usuario_ocupado" ? profileErrors.usuario_ocupado : {
    idle: "Minúsculas, números y guion bajo.",
    checking: "Revisando…",
    free: `@${cleanHandle} está libre.`,
    taken: `@${cleanHandle} ya está ocupado.`,
    reserved: "Ese usuario está reservado.",
    invalid: "Usa de 3 a 20 caracteres y empieza con una letra.",
  }[handleStatus];
  const bioLength = profileBioLength(bio);
  const bioError = bioLength > MAX_PROFILE_BIO_LENGTH ? profileErrors.bio_invalida :
    containsExternalLink(bio) ? profileErrors.bio_con_enlace : null;
  const ready = !pending && displayName.trim().length >= 2 && Boolean(cleanHandle) &&
    !handleInvalid && handleStatus !== "checking" && !bioError;

  const effectiveAvatarUrl = removePhoto ? null : (previewUrl ?? savedAvatarUrl);
  const avatarInitials =
    (displayName.trim() || profile.displayName)
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PL";

  const openEditor = () => {
    setDisplayName(profile.displayName);
    setHandle(profile.handle);
    setBio(profile.bio ?? "");
    setSavedAvatarUrl(profile.avatarUrl ?? null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setRemovePhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");
    setSaveIssue("");
    setOpen(true);
    // Ligas favoritas y privacidad viven en las preferencias del servidor.
    setPrivacyLoaded(false);
    fetch("/api/me/preferences", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ({ preferences?: Partial<ProfilePrivacy> } & Partial<ProfilePrivacy>) | null) => {
        const p = data?.preferences ?? data;
        if (p) {
          setPrivacy({
            favoriteLeagues:
              Array.isArray(p.favoriteLeagues) && p.favoriteLeagues.length > 0
                ? p.favoriteLeagues
                : DEFAULT_PRIVACY.favoriteLeagues,
            publicRecordVisible: p.publicRecordVisible ?? true,
            showInRanking: p.showInRanking ?? true,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setPrivacyLoaded(true));
  };

  const toggleLeague = (league: string) => {
    setPrivacy((prev) => {
      const has = prev.favoriteLeagues.includes(league);
      if (has && prev.favoriteLeagues.length === 1) return prev;
      return {
        ...prev,
        favoriteLeagues: has ? prev.favoriteLeagues.filter((l) => l !== league) : [...prev.favoriteLeagues, league],
      };
    });
  };

  const handleSelectAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_AVATAR_MIME.has(file.type)) {
      setError(avatarErrors.formato_invalido!);
      event.target.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(avatarErrors.archivo_muy_grande!);
      event.target.value = "";
      return;
    }
    setError("");
    setSelectedFile(file);
    setRemovePhoto(false);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    setError("");
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (savedAvatarUrl) {
      setRemovePhoto(true);
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    setError("");
    setSaveIssue("");
    try {
      let nextAvatarUrl = savedAvatarUrl;
      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const uploadRes = await fetch("/api/me/avatar", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const uploadErr = (await uploadRes.json().catch(() => ({}))) as { error?: string };
          setError(avatarErrors[uploadErr.error ?? ""] ?? "No pudimos subir tu foto. Intenta de nuevo.");
          return;
        }
        const uploaded = (await uploadRes.json()) as { avatarUrl?: string | null };
        nextAvatarUrl = uploaded.avatarUrl ?? null;
        setSavedAvatarUrl(nextAvatarUrl);
        setSelectedFile(null);
        setPreviewUrl(null);
      } else if (removePhoto && savedAvatarUrl) {
        const delRes = await fetch("/api/me/avatar", { method: "DELETE" });
        if (!delRes.ok) {
          setError("No pudimos quitar tu foto. Intenta de nuevo.");
          return;
        }
        nextAvatarUrl = null;
        setSavedAvatarUrl(null);
        setRemovePhoto(false);
      }

      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, handle: cleanHandle, bio }),
      });
      if (response.ok) {
        const patched = (await response.json()) as EditableProfile;
        if (privacyLoaded) {
          const prefRes = await fetch("/api/me/preferences", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(privacy),
          });
          if (!prefRes.ok) {
            setError("Guardamos tu perfil, pero no tus ligas ni tu privacidad. Intenta de nuevo.");
            onChange({ ...patched, avatarUrl: patched.avatarUrl !== undefined ? patched.avatarUrl : nextAvatarUrl });
            return;
          }
        }
        onChange({
          ...patched,
          avatarUrl: patched.avatarUrl !== undefined ? patched.avatarUrl : nextAvatarUrl,
        });
        setOpen(false);
        return;
      }
      const result = (await response.json()) as { error?: string };
      const issue = result.error ?? "";
      setSaveIssue(issue);
      setError(profileErrors[issue] ?? "No pudimos guardar tu perfil. Intenta de nuevo.");
    } catch {
      setError("No pudimos guardar tu perfil. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  };

  const updateX = async () => {
    if (pending || (!xEnabled && !profile.xUsername)) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/me/profile/x", {
        method: profile.xUsername ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error();
      if (profile.xUsername) {
        onChange({ ...profile, xUsername: null });
      } else {
        const result = (await response.json()) as { url?: string };
        if (!result.url) throw new Error();
        window.location.assign(result.url);
      }
    } catch {
      setError(profile.xUsername ? "No pudimos desconectar X." : "No pudimos conectar X.");
    } finally {
      setPending(false);
    }
  };

  const fields = (
    <form className="pl-profile-editor-form" onSubmit={save}>
      <div className="pl-profile-editor-avatar">
        <Avatar
          initials={avatarInitials}
          avatarUrl={effectiveAvatarUrl}
          gradVar="var(--avatar-grad-3)"
          size={56}
        />
        <div className="pl-profile-editor-avatar-copy">
          <strong>Foto de perfil</strong>
          <span>{avatarEnabled ? "JPG, PNG o WebP · máx. 2 MB" : "Pronto"}</span>
        </div>
        <div className="pl-profile-editor-avatar-actions">
          {avatarEnabled ? (
            <>
              <input
                ref={fileInputRef}
                id={`${id}-avatar`}
                name="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="pl-visually-hidden"
                disabled={pending}
                onChange={handleSelectAvatar}
              />
              <label
                htmlFor={`${id}-avatar`}
                className={`pl-profile-editor-file-btn ${pending ? "is-disabled" : ""}`}
              >
                {effectiveAvatarUrl ? "Cambiar" : "Elegir foto"}
              </label>
            </>
          ) : (
            <Button type="button" variant="secondary" isDisabled>
              Subir foto
            </Button>
          )}
          {effectiveAvatarUrl ? (
            <Button
              type="button"
              variant="secondary"
              isDisabled={pending}
              onPress={handleRemoveAvatar}
            >
              Quitar
            </Button>
          ) : null}
        </div>
      </div>

      <TextField className="pl-profile-editor-field" isRequired value={displayName} onChange={setDisplayName}>
        <Label>Nombre</Label>
        <Input autoComplete="nickname" maxLength={40} />
      </TextField>
      <TextField
        className="pl-profile-editor-field"
        isRequired
        isInvalid={handleInvalid}
        value={handle}
        onChange={(value) => { setHandle(value); setSaveIssue(""); }}
      >
        <Label>Usuario</Label>
        <Input
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={21}
          aria-describedby={`${id}-handle`}
        />
        <p id={`${id}-handle`} className="pl-profile-editor-hint" aria-live="polite">{handleText}</p>
      </TextField>
      <TextField className="pl-profile-editor-field" value={bio} onChange={setBio} isInvalid={Boolean(bioError)}>
        <Label>Bio</Label>
        <TextArea rows={3} maxLength={MAX_PROFILE_BIO_LENGTH * 2} aria-describedby={`${id}-bio`} />
        <div className="pl-profile-editor-bio-hint" id={`${id}-bio`}>
          <span>{bioError ?? "Opcional"}</span>
          <span className="num">{bioLength}/{MAX_PROFILE_BIO_LENGTH}</span>
        </div>
      </TextField>

      <section className="pl-profile-editor-section" aria-labelledby={`${id}-leagues`}>
        <h3 id={`${id}-leagues`}>Ligas y deportes favoritos</h3>
        <p className="pl-profile-editor-hint">Se muestran en tu perfil y ordenan tu Inicio. Elige al menos una.</p>
        {FAVORITE_GROUPS.map((group) => (
          <div key={group.sport} className="pl-profile-editor-leagues" role="group" aria-label={group.sport}>
            <span className="pl-profile-editor-sport">{group.sport}</span>
            <div className="pl-profile-editor-chips">
              {group.leagues.map((l) => {
                const on = privacy.favoriteLeagues.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`pl-profile-editor-chip ${on ? "is-on" : ""}`.trim()}
                    aria-pressed={on}
                    disabled={pending || !privacyLoaded}
                    onClick={() => toggleLeague(l.id)}
                  >
                    <LeagueBadge league={l.id} label={l.label} size={16} />
                    <span>{l.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="pl-profile-editor-section" aria-labelledby={`${id}-privacy`}>
        <h3 id={`${id}-privacy`}>Privacidad</h3>
        <div className="pl-profile-editor-toggle">
          <div>
            <strong id={`${id}-public`}>Perfil público</strong>
            <span id={`${id}-public-desc`}>
              {privacy.publicRecordVisible
                ? "Cualquier socio puede ver tu récord y tus publicaciones."
                : "Tu récord y tus publicaciones solo los ves tú."}
            </span>
          </div>
          <Switch
            aria-labelledby={`${id}-public`}
            aria-describedby={`${id}-public-desc`}
            isSelected={privacy.publicRecordVisible}
            isDisabled={pending || !privacyLoaded}
            onChange={(next) =>
              setPrivacy((prev) => ({ ...prev, publicRecordVisible: next, showInRanking: next ? prev.showInRanking : false }))
            }
          >
            <Switch.Control className="pl-acct-switch-control">
              <Switch.Thumb className="pl-acct-switch-thumb" />
            </Switch.Control>
          </Switch>
        </div>
        <div className="pl-profile-editor-toggle">
          <div>
            <strong id={`${id}-ranking`}>Aparecer en los rankings</strong>
            <span id={`${id}-ranking-desc`}>
              {privacy.publicRecordVisible
                ? "Comparte tu récord para entrar a las tablas de la comunidad."
                : "Necesitas un perfil público para aparecer en los rankings."}
            </span>
          </div>
          <Switch
            aria-labelledby={`${id}-ranking`}
            aria-describedby={`${id}-ranking-desc`}
            isSelected={privacy.showInRanking}
            isDisabled={pending || !privacyLoaded || !privacy.publicRecordVisible}
            onChange={(next) => setPrivacy((prev) => ({ ...prev, showInRanking: next }))}
          >
            <Switch.Control className="pl-acct-switch-control">
              <Switch.Thumb className="pl-acct-switch-thumb" />
            </Switch.Control>
          </Switch>
        </div>
      </section>

      <section className="pl-profile-editor-accounts" aria-labelledby={`${id}-accounts`}>
        <h3 id={`${id}-accounts`}>Cuentas conectadas</h3>
        <div className="pl-profile-editor-provider">
          <XBrandMark />
          <div>
            <strong>X</strong>
            <span>{profile.xUsername ? `@${profile.xUsername}` : xEnabled ? null : "Pronto"}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-label={profile.xUsername ? "Desconectar X" : "Conectar X"}
            isDisabled={pending || (!xEnabled && !profile.xUsername)}
            onPress={() => void updateX()}
          >
            {profile.xUsername ? "Desconectar" : "Conectar"}
          </Button>
        </div>
      </section>

      {error ? <p className="pl-profile-editor-error" role="alert">{error}</p> : null}
      <div className="pl-profile-editor-actions">
        <Button type="button" variant="secondary" isDisabled={pending} onPress={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isDisabled={!ready}>Guardar</Button>
      </div>
    </form>
  );

  const overlayProps = {
    isOpen: open,
    onOpenChange: setOpen,
    variant: "opaque" as const,
    isDismissable: !pending,
    isKeyboardDismissDisabled: pending,
    className: "pl-profile-editor-backdrop",
  };

  return (
    <>
      <button type="button" className="pl-prof-btn pl-prof-btn--primary" onClick={openEditor}>
        Editar perfil
      </button>
      {isMobile ? (
        <Drawer.Backdrop {...overlayProps}>
          <Drawer.Content placement="bottom" className="pl-profile-editor-drawer">
            <Drawer.Dialog className="pl-profile-editor">
              <Drawer.Handle />
              <Drawer.Heading className="pl-profile-editor-title">Editar perfil</Drawer.Heading>
              {fields}
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      ) : (
        <Modal.Backdrop {...overlayProps}>
          <Modal.Container placement="center" scroll="inside">
            <Modal.Dialog className="pl-profile-editor">
              <Modal.Heading className="pl-profile-editor-title">Editar perfil</Modal.Heading>
              {fields}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      )}
    </>
  );
}
