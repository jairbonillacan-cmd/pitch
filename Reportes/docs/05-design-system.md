# 05 — Sistema de diseño (OBSERVADO de tokens CSS)
- Paleta: NFL #1f6bff, NCAA #e63946, oro #f5c26b, turquesa #5ee7ff, ok #58e6a4, bad #ff6b88.
- Lock: fondo #02040a→#160e23; app: light theme (white), dark text; color-scheme dark en lock.
- Tipografía: "SF Pro Display/Text" → -apple-system → BlinkMacSystemFont → Segoe UI → Roboto.
- Radios generosos (cards ~20px), glass/backdrop en paneles flotantes, sombras suaves.
- Safe-areas iOS (env(safe-area-inset)), viewport-fit=cover.
- Breakpoints: media queries móviles (la app es mobile-first/touch, verificada a 1280 y 390px).
- Animaciones: entrada con delays escalonados (--d/--dl), count-up cúbico de %, tilt 3D,
  reveal por scroll (s8 `arm`), respeta prefers-reduced-motion (s8 `rm`).
- Sonido: WebAudio 100% sintetizado (sin samples): PENT=[440…1568] pentatónica, drum/conch/ocarina/sweep/drone.
- Assets: robots/mascotas webp b64, trío JPEG, video robot webm — **protegidos: la reconstrucción
  usa equivalentes propios o placeholders** (ver 16-limitations).
