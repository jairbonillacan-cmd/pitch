import "../../../apps/web/app/globals.css";

/* Tema de PitchLab en la barra de Storybook: igual que en la app, cambia
   data-theme en <html>, que leen los tokens, shadcn y HeroUI a la vez. */
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
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = "var(--background-primary)";
    return Story();
  },
];

export const parameters = {
  layout: "padded",
  backgrounds: { disable: true },
};
