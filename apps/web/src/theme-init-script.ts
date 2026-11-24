import { LIGHT_THEME_TOKENS, STAGE_DARK_TOKENS } from "@pitchlab/tokens";

export const DARK_THEME_COLOR = STAGE_DARK_TOKENS["--pl-glass-nav"];
export const LIGHT_THEME_COLOR = LIGHT_THEME_TOKENS["--background-elevated"];

export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;d.dataset.style="solid";var mode="dark";try{var t=localStorage.getItem("pl-theme");if(t==="light"||t==="dark"||t==="system"){mode=t;}else{var rp=localStorage.getItem("pl-prefs-v1");if(rp){var p=JSON.parse(rp);if(p&&(p.themeMode==="light"||p.themeMode==="dark"||p.themeMode==="system")){mode=p.themeMode;}}}}catch(e){mode="dark";}var theme=mode==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):mode;d.dataset.theme=theme;d.dataset.themeMode=mode;d.style.colorScheme=theme;var cm=document.querySelector('meta[name="color-scheme"]');if(cm){cm.content=mode==="system"?"dark light":theme;}var c=theme==="light"?${JSON.stringify(LIGHT_THEME_COLOR)}:${JSON.stringify(DARK_THEME_COLOR)};var m=document.querySelector('meta[name="theme-color"]:not([media])');if(m){m.content=c;}})();`;
