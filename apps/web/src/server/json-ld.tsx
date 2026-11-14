import React from "react";

/** Datos estructurados (schema.org) para buscadores. Escapa `<` para no cerrar el `<script>`. */
export function JsonLd({ data }: { data: Record<string, unknown> | ReadonlyArray<Record<string, unknown>> }): React.JSX.Element {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
