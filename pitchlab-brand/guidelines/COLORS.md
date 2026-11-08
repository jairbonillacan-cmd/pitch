# Paleta PitchLab

| Token | Nombre | HEX | RGB | Función | Permitido | Restricción |
|---|---|---|---|---|---|---|
| brand-primary | Pulso | #B49AFF | 180, 154, 255 | Acción primaria y firma | Un CTA dominante por región, foco y marca sobre oscuro | Texto Tinta sobre relleno; reservar fuera de series y estados |
| brand-secondary | Iris | #5940B2 | 89, 64, 178 | Firma sobre claro | Isotipo sobre Hielo o blanco | Evitar como texto o control sobre oscuro |
| brand-accent | Eco | #71C9F1 | 113, 201, 241 | Segunda serie comparativa | Comparadores y series con etiqueta y trazo discontinuo | Reservar Info para mensajes de estado |
| background-primary | Tinta | #0B1020 | 11, 16, 32 | Lienzo y texto inverso | App, fondos de firma y texto sobre Pulso | Para texto inverso usar solo sobre fondos claros comprobados |
| background-secondary | Órbita | #10172A | 16, 23, 42 | Navegación | Sidebar, topbar y menú móvil | Separar del lienzo con borde o espacio |
| background-elevated | Umbral | #1A2440 | 26, 36, 64 | Elevación | Diálogos, menús y popovers | Evitar apilar más de dos niveles de superficie |
| surface-default | Pizarra | #151E34 | 21, 30, 52 | Paneles | Cards, tablas y formularios | Agrupar por estructura, sin alternar colores arbitrariamente |
| surface-hover | Bruma | #222D49 | 34, 45, 73 | Interacción hover | Filas, botones secundarios y filtros | Acompañar la interacción con foco visible |
| surface-active | Iris nocturno | #302650 | 48, 38, 80 | Selección persistente | Filtros, pestañas y navegación activa | Añadir etiqueta o indicador y aria-current/aria-selected |
| text-primary | Hielo | #F3F5FD | 243, 245, 253 | Lectura principal | Encabezados, métricas y copy | Sobre superficies oscuras |
| text-secondary | Niebla | #B8C1D7 | 184, 193, 215 | Lectura secundaria | Descripción, ejes, leyenda y ayuda | Conservar jerarquía con peso y tamaño |
| text-muted | Peltre | #98A4BF | 152, 164, 191 | Metadatos legibles | Fuentes, fechas y notas | Evitar opacidad extra en texto informativo |
| border-default | Arista | #33405D | 51, 64, 93 | División ornamental | Separadores internos o cards estáticas | Usar Arista firme si el contorno identifica un control |
| border-strong | Arista firme | #73819F | 115, 129, 159 | Contorno funcional | Controles secundarios, inputs y límites activos | Usar sobre fondos oscuros del sistema |
| success | Menta | #66D9AE | 102, 217, 174 | Operación completada | Estado con icono y texto | Evitar para comunicar rendimiento por defecto |
| warning | Ámbar | #FFC473 | 255, 196, 115 | Atención | Datos parciales o fuera de ventana | Acompañar con motivo visible |
| danger | Coral | #FF9BAA | 255, 155, 170 | Error | Error de proceso o campo | Añadir explicación y recuperación |
| info | Azul guía | #A9BFFF | 169, 191, 255 | Aviso informativo | Disponibilidad, metodología, cambios de fuente | Evitar como segunda serie |
| canvas-light | Blanco | #FFFFFF | 255, 255, 255 | Fondo claro de firma | Documentación o fondos corporativos | Usar firma con Iris y Tinta |
| chart-model | Índigo claro | #D9DFFF | 217, 223, 255 | Serie principal | Modelo o serie enfocada con trazo sólido | Agregar etiqueta directa o leyenda |

En las seis superficies oscuras, los mínimos son Hielo 12,53:1, Niebla 7,57:1 y Peltre 5,45:1. Pulso conserva 5,85:1 como foco. Tinta sobre Pulso alcanza 8,12:1. Iris sobre blanco alcanza 7,50:1. Arista firme conserva 3,49:1 en contornos funcionales. Arista es decorativo. El CSV incluye las 68 combinaciones verificadas.

[Auditoría de contraste](../tokens/contrast-audit.csv) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
