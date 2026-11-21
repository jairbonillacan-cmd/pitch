import { LIGHT_THEME_TOKENS, STAGE_DARK_TOKENS } from "@pitchlab/tokens";

export const DARK_THEME_COLOR = STAGE_DARK_TOKENS["--pl-glass-nav"];
export const LIGHT_THEME_COLOR = LIGHT_THEME_TOKENS["--background-elevated"];

export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;d.dataset.style="solid";var theme="dark";try{var t=localStorage.getItem("pl-theme");theme=(t==="light"||t==="dark")?t:"dark";}catch(e){theme="dark";}d.dataset.theme=theme;d.style.colorScheme=theme;var c=theme==="light"?${JSON.stringify(LIGHT_THEME_COLOR)}:${JSON.stringify(DARK_THEME_COLOR)};var m=document.querySelector('meta[name="theme-color"]:not([media])');if(m){m.content=c;}})();`;
