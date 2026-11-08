# 03 — Grafo de navegación/estados
```text
LOCK(stage=1) ──click/tecla──► LOCK(stage=2) ──7779──► success() ──► APP
APP: home-1 ◄─lv1()─ home-2 ──openSport(i)──► iframe srcdoc NFL/NCAA
iframe ──{av:"ready"}──► shell {av:"cfg"} (bank,th,odds,inSlip)
iframe ──{av:"odd",k,v} / {av:"add",pk} / "home"──► shell (slip/odds/close)
Tabs dentro del iframe: g↔s↔w↔n↔e↔j↔m (paneles show/hide, sin recarga)
BOLETO: openSlip/closeSlip (overlay); tabs b/h/c internos
IA: open/close (aip hidden toggle); Escape cierra (capture, stopImmediatePropagation en boleto)
Teclado: dígitos/⌫ en lock; Escape/Backspace navega atrás (home/iframe)
Persistencia por acción: cuotas→save("odds"), slip→save("slip"), bets→saveBet+save("slip"),
  cfg→save("cfg") — debounce 500ms → localStorage azteca_av o Claude DB (data/users/<id>)
```
Recarga: el lock SIEMPRE reaparece (no hay sesión persistente); el estado del boleto sobrevive vía azteca_av.
