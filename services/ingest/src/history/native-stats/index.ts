/**
 * Punto de entrada del módulo de enriquecimiento desde native-stats.org.
 *
 * Lo que se exporta es lo que otros módulos y tests pueden usar: parsers puros (sin red),
 * resolución de equipos, cotejo contra el corpus y el constructor del dataset. El CLI y
 * el reporte quedan fuera a propósito: son la capa de operación.
 */
export * from "./html.js";
export * from "./parse.js";
export * from "./resolve.js";
export * from "./join.js";
export * from "./schema.js";
export * from "./builder.js";
