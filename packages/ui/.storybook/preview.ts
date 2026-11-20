import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "../../../apps/web/app/astryx-pitchlab.css";
import "../../../apps/web/app/globals.css";
import "../../../apps/web/app/legacy-d1-storybook.css";
import "@heroui/styles/components/card.css";
import "@heroui/styles/components/chip.css";
import "@heroui/styles/components/tabs.css";
import "../../../apps/web/app/community-v2.css";
import "../../../apps/web/app/community-social.css";
import "../../../apps/web/app/account-v2.css";
import "../../../apps/web/app/record-v2.css";
import "../../../apps/web/app/blog.css";
import "../../../apps/web/app/login-motion.css";
import "../../../apps/web/app/precio-motion.css";
import "../../../apps/web/app/pre-match.css";
import "../../../apps/web/app/live.css";
import "../../../apps/web/app/data-health.css";
import "../../../apps/web/app/sport-outlook.css";
import "../../../apps/web/app/picks-screener.css";
import "../../../apps/web/app/atomic-kit.css";
import "../../../apps/web/app/shell-ergonomics.css";

/* Tema de PitchLab en la barra de Storybook: cambia data-theme en <html>
   sobre el modo sólido unificado, que leen los tokens, shadcn y HeroUI a la vez. */
export const globalTypes = {
  theme: {
    description: "Tema de PitchLab",
    toolbar: {
      title: "Tema",
      icon: "mirror",
      items: [
        { value: "dark", title: "Oscuro" },
        { value: "light", title: "Claro" },
      ],
      dynamicTitle: true,
    },
  },
};

export const initialGlobals = { theme: "dark" };

export const decorators = [
  (Story: () => unknown, context: { globals: { theme?: string } }) => {
    const theme = context.globals.theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-style", "solid");
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = "var(--pl-stage-bg, var(--background-primary))";
    return Story();
  },
];

export const parameters = {
  layout: "padded",
  backgrounds: { disable: true },
};
