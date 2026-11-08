import React, { useContext, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

import "../components/App.scss";
import "./GenerateTrend.scss";

import Button from "../components/Button";
import GlobalContext from "../components/GlobalContext";
import TrendContent from "../components/TrendContent";
import { getTheme, setTheme } from "../react-web-utils";
import { API_HOST } from "../react-web-constants";
import { getPlayerName, jsonOrDefault } from "../linemate-react-common/src/util";
import { getMarketDescriptionFromTrend } from "../linemate-react-common/src/betting-utils";

const getTrendEntriesFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const rawTrendIds = params.get("trendIds") || params.get("trendsIds") || "";

  return rawTrendIds
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [league, trendId] = entry.split("|").map((value) => value?.trim());

      return {
        league: league?.toLowerCase(),
        trendId,
        key: `${league?.toLowerCase()}|${trendId}`,
      };
    })
    .filter((entry) => entry.league && entry.trendId);
};

const waitForRender = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

const downloadDataUrl = (dataUrl, fileName) => {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

const preloadImage = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve();
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  });

const waitForImageElement = async (image) => {
  const src = image.currentSrc || image.src;

  if (!src) {
    return;
  }

  if (!image.complete) {
    await new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }

  if (image.decode) {
    await image.decode().catch(() => {});
  }

  await preloadImage(src);
};

const waitForCaptureAssets = async (node) => {
  if (!node) {
    return;
  }

  const images = Array.from(node.querySelectorAll("img"));

  await Promise.all(images.map(waitForImageElement));

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await waitForPaint();
  await sleep(600);
};

const slugifyFilePart = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getTrendSubjectFilePart = (trend) => {
  if (trend.type === "player") {
    return getPlayerName(trend.player);
  }

  return trend.team?.code || trend.team?.name || "team";
};

const getFileDatePart = () => {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

const getTrendMarketFilePart = (trend, league, preferredProviders) => {
  const marketDescription = getMarketDescriptionFromTrend(
    league,
    trend,
    preferredProviders
  );

  if (marketDescription) {
    return marketDescription;
  }

  return [
    trend.outcome,
    Number(trend.line) ? trend.line : null,
    trend.market?.displayName || trend.market?.name,
  ].filter(Boolean).join(" ");
};

const buildTrendImageFileName = (trend, league, preferredProviders, themeName) => {
  const subject = slugifyFilePart(getTrendSubjectFilePart(trend));
  const market = slugifyFilePart(getTrendMarketFilePart(trend, league, preferredProviders));
  const date = getFileDatePart();
  const theme = slugifyFilePart(themeName);

  return [subject, market, date, theme].filter(Boolean).join("-") + ".png";
};

function GenerateTrend() {
  const context = useContext(GlobalContext);
  const [loading, setLoading] = useState(false);
  const [trends, setTrends] = useState([]);
  const [exportTheme, setExportTheme] = useState(getTheme());
  const [status, setStatus] = useState("");
  const cardRefs = useRef({});

  const trendEntries = useMemo(() => getTrendEntriesFromQuery(), []);

  const fetchTrend = ({ league, trendId, key }) =>
    fetch(`${API_HOST}/api/${league}/v1/trends/straights/${trendId}`)
      .then((response) => jsonOrDefault(response, null))
      .then((trend) => (
        trend
          ? { ...trend, league, requestedTrendId: trendId, requestedTrendKey: key }
          : null
      ));

  const generateImages = async () => {
    if (trendEntries.length === 0) {
      setStatus("Add trendIds to the URL, for example ?trendIds=mlb|3218982d8d129389,nba|f8e9232j2j912j");
      return;
    }

    const originalTheme = getTheme();
    const themesToGenerate = Array.from(new Set([originalTheme, "light"]));

    setLoading(true);
    setStatus(`Fetching ${trendEntries.length} trend${trendEntries.length === 1 ? "" : "s"}...`);

    try {
      const fetchedTrends = (await Promise.all(trendEntries.map(fetchTrend))).filter(Boolean);

      const captureTheme = async (themeName) => {
        cardRefs.current = {};
        setTheme(themeName);
        setExportTheme(themeName);
        setTrends(fetchedTrends);
        setStatus(`Rendering ${themeName} card${fetchedTrends.length === 1 ? "" : "s"}...`);

        await waitForRender();
        await sleep(800);
        await waitForPaint();

        const nodesToCapture = fetchedTrends
          .map((trend) => {
            const trendKey = trend.requestedTrendKey || `${trend.league}|${trend.requestedTrendId || trend.trendId || trend.id}`;
            return { trend, trendKey, node: cardRefs.current[trendKey] };
          })
          .filter(({ node }) => Boolean(node));

        await Promise.all(nodesToCapture.map(({ node }) => waitForCaptureAssets(node)));

        const captureOptions = {
          cacheBust: true,
          includeQueryParams: true,
          pixelRatio: 4,
        };

        if (nodesToCapture[0]?.node) {
          await toPng(nodesToCapture[0].node, captureOptions).catch(() => null);
          await sleep(500);
          await waitForPaint();
        }

        for (const { trend, node } of nodesToCapture) {
          const dataUrl = await toPng(node, captureOptions);

          downloadDataUrl(
            dataUrl,
            buildTrendImageFileName(
              trend,
              trend.league,
              [],
              themeName
            )
          );
        }
      };

      for (const themeName of themesToGenerate) {
        await captureTheme(themeName);
      }

      setTheme(originalTheme);
      setExportTheme(originalTheme);
      setStatus(`Downloaded ${fetchedTrends.length * themesToGenerate.length} image${fetchedTrends.length * themesToGenerate.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong generating the trend image.");
      setTheme(originalTheme);
      setExportTheme(originalTheme);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generate-trend-page">
      <div className="generate-trend-control-panel">
        <p className="text-style-h-2-semibold color-fig-default">Generate trend images</p>
        <p className="text-style-body-normal color-fig-subtle">
          {trendEntries.length > 0
            ? `${trendEntries.length} trend ID${trendEntries.length === 1 ? "" : "s"} found.`
            : "No trendIds query param found."}
        </p>

        <Button
          text={loading ? "Generating..." : "Generate and download"}
          typography="lg"
          type="primary"
          enabled={!loading}
          onClick={generateImages}
        />

        {status && (
          <p className="text-style-caption-normal color-fig-subtle">{status}</p>
        )}
      </div>

      <div className="generate-trend-render-area">
        {trends.map((trend) => {
          const trendKey = trend.requestedTrendKey || `${trend.league}|${trend.requestedTrendId || trend.trendId || trend.id}`;

          return (
            <div
              key={trendKey}
              ref={(element) => {
                if (element) {
                  cardRefs.current[trendKey] = element;
                } else {
                  delete cardRefs.current[trendKey];
                }
              }}
              className={`generate-trend-card theme-${exportTheme}`}
            >
              <TrendContent card={trend} league={trend.league} preferredProvidersOverride={[]} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GenerateTrend;