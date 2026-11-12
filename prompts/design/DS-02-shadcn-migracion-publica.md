# Prompt DS-02 — Migrar landing, login, crear cuenta y barra flotante a shadcn/ui

> Para: GPT (Codex u otro agente con acceso al repo y a la terminal). Prompt **autocontenido**: no conoces la conversación en la que se decidió esto; todo lo necesario está aquí y en los archivos citados.
> Rama: `feat/pre-mvp`. Base: commit `b9fc834` o posterior.

## A. Rol

Eres un ingeniero frontend senior. Migras controles existentes a las primitivas shadcn/ui que ya viven en el repo **sin cambiar el diseño aprobado**. No rediseñas, no cambias textos y no agregas funciones.

## B. Contexto

- PitchLab es un SaaS de probabilidades deportivas (pitchlab.mx). El pre-MVP está en Next.js 15 (App Router), monorepo pnpm + Turborepo.
- **ADR-019** (`docs/architecture/adr/ADR-019-shadcn-ui-mira-base-ui-con-tokens-pitchlab.md`): primitivas shadcn/ui con preset **Mira** sobre **Base UI**, adaptadas a los tokens de marca. **Léelo completo antes de empezar.**
- Ya migrado y funcionando (úsalo como referencia de estilo y de patrones):
  - Primitivas en `packages/ui/src/components/ui/`: `button.tsx`, `badge.tsx`, `dialog.tsx`, `tabs.tsx`, `tooltip.tsx`, `toggle-group.tsx`, exportadas desde `packages/ui/src/index.ts`.
  - Diálogo de análisis y PIN (`packages/ui/src/shells.tsx`: `AnalysisDialog`, `PinPad`), «Mejores selecciones» y etiquetas (`packages/ui/src/sports.tsx`), filtro de día y botones del header del panel (`apps/web/src/client/panel-client.tsx`).
- CSS: `apps/web/app/globals.css` declara las capas `theme → base → legacy → components → utilities`. Tailwind v4 **sin preflight**. El CSS aprobado (diseño D1) vive dentro de `@layer legacy`. Las utilidades de los componentes shadcn ganan a `legacy`.

## C. Marca

- Solo tokens (`--brand-primary`, `--surface-*`, `--text-*`, `--border-*`, `--radius-*`, `--glow`, etc.). Las variables de shadcn (`bg-primary`, `text-muted-foreground`, `border-border`…) ya apuntan a esos tokens.
- **Prohibido:** colores hex, `rgb()`, la paleta de Tailwind (`bg-zinc-*`, `text-gray-*`…), sombras o radios inventados. `node scripts/lint-codebase.mjs` falla si aparece un hex.
- Voz y textos: no cambies ningún texto visible. FD-16: nunca nombres de proveedores de datos ni de algoritmos en la UI.

## D. Objetivo

Reemplazar los controles hechos a mano que quedan por las primitivas shadcn del repo, conservando la apariencia, los textos, los selectores de prueba y el comportamiento.

## E. Rutas y archivos

| Ruta | Archivo | Qué migrar |
|---|---|---|
| `/` | `apps/web/src/client/landing-client.tsx` | Botones `btn btn-primary` y `btn btn-ghost` → `Button`. Etiquetas `tag`, `status tag tag-ok` → `Badge` (variante equivalente). Selector de partidos de la demo (`#picks .pick` con `aria-pressed`) → `ToggleGroup` / `ToggleGroupItem` |
| `/login` | `apps/web/src/client/login-client.tsx` | `btn btn-primary btn-block btn-beta` y `btn btn-secondary btn-block` → `Button` de ancho completo |
| `/signup` | `apps/web/src/client/signup-client.tsx` | Igual que login |
| Todas las públicas | `packages/ui/src/shells.tsx` → `FloatingNav`, `PublicFooter` | `btn btn-ghost`, `btn btn-primary signup`, `btn btn-primary beta-access` → `Button`. `tag tag-model`, `tag tag-info` → `Badge` |
| Todas | `packages/ui/src/primitives.tsx` | `ThemeToggle` (`btn btn-ghost btn-icon theme-btn`) → `Button variant="ghost" size="icon"`. Los usos de `btn btn-secondary` → `Button variant="secondary"`. `Tag` → reimplementar con `Badge` conservando su API (`variant`, `dot`) |
| `/app/*` | `apps/web/src/client/panel-client.tsx` | Selector de liga (`lchip league-tab`): mantener como enlaces de navegación, pero con `Button variant="outline"` y `render={<a/>}` o `<button>` según hoy; la liga actual con `aria-current="page"` |

No migres: tablas de mercados, `MatchCard`, gráficas, el teclado del PIN (ya está dentro de un Dialog shadcn) ni formularios bloqueados (`fieldset disabled`), salvo sus botones.

## F. Diseño

- El resultado debe verse **igual** que hoy en oscuro y claro. Compara con capturas antes y después.
- Botón primario: `Button` (variante `default`) ya trae el anillo `--glow` en hover; si el botón tiene flecha, marca el icono con `data-icon="arrow"` para que avance 3 px.
- Barra flotante: botones en píldora (`rounded-full`) como hoy.
- Ancho completo en login y crear cuenta: `className="w-full"`.
- Si una variante que necesitas no existe (por ejemplo `pill`), **agrégala en la primitiva** (`button.tsx` o `badge.tsx`) con tokens, no la repitas en cada uso.

## G. Interacciones

- Conserva cada `onClick`, `href`, `aria-*`, `data-*` e `id` existentes.
- Enlaces con apariencia de botón: `<Button render={<a href="…" />} nativeButton={false}>`. Ver el ejemplo de «Cómo funciona» en `panel-client.tsx`.
- `ToggleGroup` de la demo: una sola selección siempre activa. Copia el patrón de `#day-chips` en `panel-client.tsx`: `value={[actual]}` y en `onValueChange` ignora la deselección.

## H. Datos

Sin cambios de datos ni de contratos.

## I. Fixtures

Usa los snapshots versionados de `data/snapshots/` tal como están.

## J. Responsive

- **Trampa conocida (ADR-019):** las utilidades ganan a `legacy`. Toda regla D1 que oculte, muestre o reubique un elemento que migres (por ejemplo `display: none` dentro de un `@media` en `globals.css`) **deja de aplicar**. Antes de migrar cada elemento, busca sus clases en `globals.css` dentro de `@media` y exprésalas con utilidades responsivas (`hidden md:inline-flex`). Ejemplo resuelto: `.app-header .method`.
- Puntos de control: 375, 768, 1200 y 1440 px. En ninguno puede haber scroll horizontal (`document.documentElement.scrollWidth === innerWidth`).
- Objetivos táctiles de al menos 44 px. Los tamaños `default` e `icon` de `Button` ya lo cumplen; no uses `sm` en controles primarios en móvil.

## K. Accesibilidad

- Base UI resuelve roles, `aria-pressed` y teclado; no los dupliques a mano.
- Foco visible en todos los controles (anillo `ring`).
- Pasa axe sin violaciones (el E2E ya lo corre en `/` y en `/metodologia`).

## L. Dependencias

No agregues dependencias. Si de verdad necesitas una primitiva nueva de shadcn, sigue el procedimiento de ADR-019 («Cómo agregar un componente»): se genera con el preset Mira en una carpeta temporal **fuera del repo** y se copia el archivo adaptado.

## M. Ownership (puedes modificar)

- `apps/web/src/client/landing-client.tsx`, `login-client.tsx`, `signup-client.tsx`, `panel-client.tsx` (solo el selector de liga)
- `packages/ui/src/shells.tsx` (solo `FloatingNav` y `PublicFooter`)
- `packages/ui/src/primitives.tsx`
- `packages/ui/src/components/ui/*.tsx` (solo para agregar variantes)
- `apps/web/app/globals.css` (solo para borrar reglas `legacy` que queden sin uso o mover reglas responsivas a utilidades)
- `apps/web/e2e/pre-mvp.spec.ts` y `packages/ui/tests/ui.test.tsx` (solo si un selector deja de existir; prefiere conservar el selector)
- `packages/ui/src/ui.stories.tsx`

## N. Restricciones (no puedes modificar)

- `packages/models`, `services/ingest`, `packages/contracts`, `data/`, `packages/sports-assets` y `packages/tokens`.
- El diálogo de análisis y el PIN (ya migrados).
- Ningún texto visible ni ningún dato.
- **El árbol puede tener cambios sin commitear de otro agente** (por ejemplo en `packages/sports-assets`, `services/ingest`, `Reportes/`). No los toques, no los reviertas y no los incluyas en tus commits: agrega solo tus archivos con `git add <ruta>`.
- No hagas push a `main`, ni force-push, ni cambies la configuración de CI.

## O. Pruebas

Corre todo desde la raíz, en este orden:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm --filter @pitchlab/web e2e
```

- Si hay un `next dev` corriendo en el puerto 3000, detenlo antes de `pnpm build`: comparten la carpeta `.next`.
- Selectores que **deben seguir existiendo** (los usa el E2E): `.btn-beta`, `[data-theme-toggle]`, `#picks .pick` con `aria-pressed`, `.league-tab[data-league='nfl']`, `#leagues`, `.notice`, `form.auth-form button[type='submit']`, `.badge-fallback`. Si migras un elemento que tiene una de estas clases o atributos, pásala al componente nuevo (`className` o `data-*`).
- Agrega a `packages/ui/tests/ui.test.tsx` una prueba que renderice `Tag` y `ThemeToggle` migrados y compruebe `data-slot`.

## P. Criterios de aceptación

1. `grep -rn 'className="[^"]*\bbtn\b' apps/web/src packages/ui/src` no devuelve resultados (todas las clases `.btn` reemplazadas).
2. `grep -rn 'className="[^"]*\btag\b' apps/web/src packages/ui/src` solo devuelve el propio `Badge`/`Tag` migrado.
3. Build, pruebas unitarias y los 12 E2E (escritorio y móvil) en verde.
4. Capturas antes/después de `/`, `/login`, `/signup` y `/app/premier-league` en oscuro y claro, a 1440 y 375 px, sin diferencias visibles salvo las que justifiques.
5. Sin scroll horizontal en ningún ancho.
6. Lint de codebase en verde (sin hex).
7. Si después de migrar quedan reglas de `globals.css` sin uso (`.btn-*`, `.tag-*`, `.chip`), bórralas y explica cuáles en el handoff.

## Q. Entregables

- Uno o dos commits en `feat/pre-mvp` con mensajes en español, que terminen con la línea `Co-Authored-By` del agente que los hace.
- Push a `origin feat/pre-mvp` (actualiza el PR #1).
- Las capturas antes/después adjuntas en el handoff.

## R. Handoff

Agrega al final de `docs/execution/PROJECT_STATE.md` una entrada con este formato:

```markdown
### DS-02 · Migración pública a shadcn/ui — <fecha> — Rama `feat/pre-mvp`
- **Hecho:** …
- **No hecho / fuera de alcance:** …
- **Decisiones tomadas (y por qué):** …
- **Riesgos o deuda:** … (incluye toda regla D1 responsiva que moviste a utilidades)
- **Cómo probarlo:** comandos exactos.
```

Si `PROJECT_STATE.md` tiene cambios sin commitear de otro agente, no lo incluyas en tu commit: escribe tu entrada en el mensaje del commit y avisa en tu respuesta final.
