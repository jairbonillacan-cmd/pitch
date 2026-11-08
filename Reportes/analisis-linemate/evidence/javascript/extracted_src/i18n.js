import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  localeResources,
  supportedLocales,
} from "./linemate-react-common/src/localization/locales";
import { webLocaleResources } from "./localization/web";

const LANGUAGE_STORAGE_KEY = "language";

function resolveInitialLocale() {
  const storedLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

  if (storedLocale && supportedLocales.includes(storedLocale)) {
    return storedLocale;
  }

  // Temporarily force english as starting point
  const browserLocale = (navigator.language || "en").toLowerCase();

  if (supportedLocales.includes(browserLocale)) {
    return browserLocale;
  }

  const baseLanguage = browserLocale.split("-")[0];
  if (supportedLocales.includes(baseLanguage)) {
    return baseLanguage;
  }

  return "en";
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override ?? base;
  }

  const result = { ...base };

  Object.keys(override).forEach((key) => {
    result[key] =
      key in base ? deepMerge(base[key], override[key]) : override[key];
  });

  return result;
}

const resources = Object.fromEntries(
  supportedLocales.map((locale) => [
    locale,
    {
      translation: deepMerge(
        localeResources[locale],
        webLocaleResources[locale] || {}
      ),
    },
  ])
);

i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLocale(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;