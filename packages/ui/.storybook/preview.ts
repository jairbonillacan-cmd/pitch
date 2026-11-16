import "../../../apps/web/app/globals.css";

/* Tema y estilo de PitchLab en la barra de Storybook: igual que en la app, cambian
   data-theme y data-style en <html>, que leen los tokens, shadcn y HeroUI a la vez. */
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
  visualStyle: {
    description: "Estilo de PitchLab (cristal o sólido)",
    toolbar: {
      title: "Estilo",
      icon: "paintbrush",
      items: [
        { value: "glass", title: "Cristal" },
        { value: "solid", title: "Sólido" },
      ],
      dynamicTitle: true,
    },
  },
};

export const initialGlobals = { theme: "dark", visualStyle: "glass" };

export const decorators = [
  (Story: () => unknown, context: { globals: { theme?: string; visualStyle?: string } }) => {
    const theme = context.globals.theme === "light" ? "light" : "dark";
    const style = context.globals.visualStyle === "solid" ? "solid" : "glass";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-style", style);
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = "var(--background-primary)";
    return Story();
  },
];

export const parameters = {
  layout: "padded",
  backgrounds: { disable: true },
};
