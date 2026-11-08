# 16 — Limitaciones y transparencia
1. **Proceso humano de datos**: la cosecha semanal (PFR/DK/CBS/Yahoo→arrays) no es observable;
   la reconstrucción congela la instantánea del 7 nov 2026 y documenta el flujo (blueprint §9).
2. **Assets protegidos**: robots, mascotas, video y trío de la intro son del original; la
   reconstrucción usará equivalentes propios salvo autorización del propietario.
3. **NCAA pick rule**: RESUELTO — la regla de 3 ramas se extrajo del código (OBSERVADO) y el
   batch verifica Δ=0 en 32 juegos. (Histórico: la primera inferencia "umbral 55%" era incorrecta.)
4. **news dataset**: el array de noticias no se extrajo (nombre/estructura pendiente de localizar en s4).
5. **Código muerto del original no reproducido**: __START (0 consumidores), CMB (return "").
6. **Puente window.claude**: sin host que lo provea, la persistencia es localStorage (igual que
   la web pública). La integración DB/LLM queda tras el mismo contrato.
7. **UI no implementada aún** (ver 12): lock/home/tableros/boleto/IA/simulador.
10. **Backtest histórico**: sólo existen los registros auditados embebidos (NFL 1-0, NCAA 4-1);
    el replay exacto requiere instantáneas históricas de R/lesiones que el artefacto no conserva
    (el replay con la instantánea actual da 2-3 en NCAA — dependencia del dato-en-su-momento).
8. **No se recuperó ni se afirma haber recuperado** código de servidor o parámetros privados:
   toda la app es cliente y el motor reconstruido proviene de JS público, verificado por ejecución.
