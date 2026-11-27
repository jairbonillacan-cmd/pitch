import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "../../../apps/web/app/astryx-pitchlab.css";
import "../../../apps/web/app/globals.css";
import "../../../apps/web/app/legacy-d1-storybook.css";
import "./heroui-storybook.css";
import "../../../apps/web/app/community-v2.css";
import "../../../apps/web/app/community-social.css";
import "../../../apps/web/app/account-v2.css";
import "../../../apps/web/app/record-v2.css";
import "../../../apps/web/app/blog.css";
import "../../../apps/web/app/public-mobile-nav.css";
import "../../../apps/web/app/login-motion.css";
import "../../../apps/web/app/precio-motion.css";
import "../../../apps/web/app/pre-match.css";
import "../../../apps/web/app/live.css";
import "../../../apps/web/app/data-health.css";
import "../../../apps/web/app/sport-outlook.css";
import "../../../apps/web/app/picks-screener.css";
import "../../../apps/web/app/atomic-kit.css";
import "../../../apps/web/app/shell-ergonomics.css";
import "../../../apps/web/app/sofascore-kit.css";
import "../../../apps/web/app/parlays-builder.css";
import "../../../apps/web/app/props-betlab.css";
import "../../../apps/web/app/momios-compare.css";
import "../../../apps/web/app/tipster-admin.css";
import "../../../apps/web/app/editorial-verificacion.css";
import "../../../apps/web/app/alerts-referees.css";
import "../../../apps/web/app/match-deep-panels.css";

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
