import en from "./en/index.js";
import enGB from "./en-GB/index.js";
import es from "./es/index.js";
import fr from "./fr/index.js";
import de from "./de/index.js";
import pt from "./pt/index.js";
import it from "./it/index.js";

export const defaultLocale = "en";

export const localeResources = {
  en,
  //"en-GB": enGB,
  es,
  fr,
  de,
  pt,
  it,
};

export const supportedLocales = Object.keys(localeResources);

export const localeLabels = {
  en: "English (US)",
  //"en-GB": "English (UK)",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português (Brasil)",
  it: "Italiano",
};
