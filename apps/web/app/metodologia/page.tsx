import React from "react";
import { LegalShell } from "../../src/client/legal-shell.js";
import { MODEL_EVALUATION, formatMetric, formatPercent } from "../../src/server/model-metrics.js";
import { loadAllActiveLeagueSnapshots, PRODUCT_LEAGUES } from "../../src/server/snapshots.js";

export const dynamic = "force-dynamic";


function formatCut(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(date);
}

export const metadata = {
  title: "Metodología · PitchLab",
  description:
    "Cómo estima PitchLab sus probabilidades: fuerza ajustada por rival, proyección de goles, incertidumbre y evaluación pública del modelo.",
};

export default function MetodologiaPage(): React.JSX.Element {
  const snapshots = loadAllActiveLeagueSnapshots();
  const coverage = PRODUCT_LEAGUES.map((key) => {
    const envelope = snapshots[key];
    const data = envelope.data;
    return {
      key,
      label: data?.leagueLabel ?? key,
      season: data?.season ?? "—",
      period: data?.roundLabel ?? "—",
      games: data?.games.length ?? 0,
      cut: formatCut(envelope.generatedAt ?? data?.generatedAt),
      ready: envelope.state === "ready" && (data?.games.length ?? 0) > 0,
    };
  });

  return (
    <LegalShell
      eyebrow="Modelo PitchLab"
      title="Metodología y evaluación del modelo"
    >
      <p>
        PitchLab estima <strong>probabilidades</strong>, no resultados. Cada partido publicado
        muestra la probabilidad de cada mercado, su cuota justa (1 ÷ probabilidad) y un rango de
        incertidumbre. No hay picks con premio, ni apuestas, ni promesas de ganancia.
      </p>

      <h2>1. Qué calculamos</h2>
      <ul>
        <li>
          <strong>Fuerza de ataque y defensa</strong> por equipo, ajustada por la calidad del rival
          y por localía. Dos equipos con los mismos goles no reciben la misma fuerza si sus
          calendarios son distintos.
        </li>
        <li>
          <strong>Peso temporal</strong>: los partidos recientes cuentan más que los de hace meses,
          sin borrar la información anterior.
        </li>
        <li>
          <strong>Proyección de goles</strong> (o puntos, en fútbol americano) por equipo y por
          partido. De ahí sale el marcador más probable y el total esperado.
        </li>
        <li>
          <strong>Distribución completa de marcadores</strong>: se evalúan todos los resultados
          posibles de la rejilla y se derivan los mercados (ganador, doble oportunidad, totales,
          ambos anotan, goles por equipo y marcador exacto).
        </li>
        <li>
          <strong>Cuota justa</strong> = 1 ÷ probabilidad. No incluye margen de casa: no somos una
          casa de apuestas.
        </li>
      </ul>

      <h2>2. Qué no hace el modelo</h2>
      <ul>
        <li>No usa las cuotas de las casas como entrada. El precio no decide la probabilidad.</li>
        <li>No incorpora lesiones, alineaciones, clima ni decisiones arbitrales.</li>
        <li>No promete aciertos ni ganancias, y no sugiere cuánto apostar.</li>
        <li>No ajusta el pasado: un análisis publicado no se recalcula (queda archivado con su hora).</li>
      </ul>

      <h2>3. Incertidumbre visible</h2>
      <p>
        Cada análisis incluye un <strong>rango del 90 %</strong> para el resultado y para la
        proyección. Con pocos partidos jugados el rango es ancho, y se muestra así: preferimos un
        intervalo honesto a una cifra falsa de precisión. El tamaño de la muestra y la hora de
        corte aparecen siempre al lado de las cifras.
      </p>

      <h2>4. Cómo evaluamos el modelo</h2>
      <p>
        La evaluación es <strong>retro y walk-forward</strong>: para predecir cada jornada o semana
        solo se usan los partidos anteriores a su fecha, igual que si el modelo se hubiera
        publicado ese día. Medimos log-loss y Brier (menor es mejor) y el acierto del favorito.
        La referencia es qué ocurre si se reproducen las frecuencias simples de la liga
        (&laquo;referencia ingenua&raquo;).
      </p>
      <table className="mtable">
        <thead>
          <tr>
            <th>Liga</th>
            <th className="r">Partidos</th>
            <th className="r">Log-loss</th>
            <th className="r">Log-loss ingenuo</th>
            <th className="r">Brier</th>
            <th className="r">Acierto</th>
            <th className="r">Calibración (ECE)</th>
          </tr>
        </thead>
        <tbody>
          {MODEL_EVALUATION.rows.map((row) => (
            <tr key={row.league}>
              <td>{row.league}</td>
              <td className="r">{row.n}</td>
              <td className="r">{formatMetric(row.logLoss)}</td>
              <td className="r">{formatMetric(row.naiveLogLoss)}</td>
              <td className="r">{formatMetric(row.brier)}</td>
              <td className="r">{formatPercent(row.accuracy)}</td>
              <td className="r">{formatPercent(row.ece)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.85em", opacity: 0.8 }}>
        Ventana: {MODEL_EVALUATION.window}. Generado el {MODEL_EVALUATION.generatedAt}. Es una
        evaluación retro: <strong>no cuenta como historial de aciertos</strong> y puede cambiar cuando
        se recalcule con más datos.
      </p>
      <p>
        El modelo es <strong>{MODEL_EVALUATION.status}</strong>: supera a la referencia ingenua,
        pero todavía no ha demostrado superar la referencia de mercado con significancia
        estadística. Por eso ninguna probabilidad se presenta como recomendación y la etiqueta
        &laquo;Modelo PitchLab · en validación&raquo; es visible en cada análisis.
      </p>
      <p>
        La columna <strong>ECE</strong> mide qué tan cerca está la probabilidad anunciada de la
        frecuencia real: 2 % es muy buena, 5 % aceptable y 10 % mala. Hoy estamos en 4,9 % (fútbol)
        y 5,0 % (NFL). Probamos una capa de calibración por temperatura: en fútbol mejora el
        log-loss pero empeora el ECE, y en NFL no mejora, así que <strong>no se aplica</strong>.
        Preferimos publicar el error antes que esconderlo con un parche que no está probado.
      </p>

      <h2>5. Datos y frescura</h2>
      <p>
        Los calendarios y marcadores vienen de fuentes abiertas con licencia explícita; la
        atribución completa está en{" "}
        <a href="/legal/creditos">Créditos y licencias</a>. Cada liga muestra su hora de corte y el
        número de partidos usados. Si una fuente falla, la liga queda como &laquo;Pronto&raquo;
        antes que mostrar una cifra vieja como si fuera nueva.
      </p>
      <table className="mtable">
        <caption style={{ textAlign: "left", opacity: 0.75, paddingBottom: 8 }}>
          Cobertura y hora de corte de cada liga en la beta.
        </caption>
        <thead>
          <tr>
            <th scope="col">Liga</th>
            <th scope="col">Temporada</th>
            <th>Jornada</th>
            <th className="r">Partidos</th>
            <th>Corte (CDMX)</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.season}</td>
              <td>{row.period}</td>
              <td className="r">{row.games}</td>
              <td>{row.cut}</td>
              <td>{row.ready ? "Publicado" : "Pronto"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>6. Limitaciones conocidas</h2>
      <ul>
        <li>Sin datos de lesiones ni alineaciones, la incertidumbre real es mayor que la declarada.</li>
        <li>Al inicio de temporada, con pocos partidos, el modelo se apoya en el promedio de la liga.</li>
        <li>Los ascensos y descensos cambian la composición de una liga y reducen la muestra útil.</li>
        <li>
          Los mercados derivados comparten la misma proyección de goles: si esa proyección está
          sesgada, todos los mercados lo están en la misma dirección.
        </li>
      </ul>

      <h2>7. Compromiso</h2>
      <p>
        Sin promesas de ganancia, sin afiliados y sin apuestas con dinero real. Las cifras son
        estimaciones estadísticas con fuente y hora. Solo para mayores de 18 años. Si el juego
        deja de ser un juego, busca ayuda en la página de{" "}
        <a href="/legal/juego-responsable">juego responsable</a>.
      </p>
    </LegalShell>
  );
}
