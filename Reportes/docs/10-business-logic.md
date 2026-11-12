# 10 — Lógica de negocio
- Acceso: PIN [REDACTED_PIN] hardcodeado (CODE); 2 etapas; sin bloqueo por intentos; sin sesión.
- Boleto: selección toggle por clave k="NFL:dom:H-A|mercado"; warn si 2 legs del mismo juego
  (probabilidad combinada tratada como independiente puede estar inflada);
  parlay p=∏pᵢ, cuota=∏dᵢ o override (spov); EV por boleto; REGISTRAR crea bet st="p".
- Historial: resolver w/l/v (v=nula, profit 0), deshacer → p; borrar con doble click (arm).
- Cuotas: decimal o americana (decO); break-even mostrado: "necesitas cuota ≥ 1/p".
- Odds cache AV.odds con límite 800 entradas (FIFO).
- IA: prompt fijo (español, ≤100 palabras, solo datos de pantalla, "no consejo de apuesta");
  fallback local por regex: bajas/pick/fórmula/matching de líneas.
- 🤖 chip de DINERO usa el motor en vivo (no dato almacenado).
- DINERO: fuerte si dinero−boletos≥12; público si boletos≥75; disclaimer de casa única.
