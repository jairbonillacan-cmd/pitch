import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_BASELINE_REL = "scripts/lint-ratchet-baseline.json";
const READ_CONCURRENCY = 64;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  "storybook-static",
  "playwright-report",
  "test-results",
]);

const DEFAULT_SCAN_DIRS = [
  "apps/web/app",
  "apps/web/src",
  "packages/contracts/src",
  "packages/db/src",
  "packages/emails/src",
  "packages/models/src",
  "packages/spacetime/src",
  "packages/ui/src",
  "packages/sports-assets/src",
  "packages/engines-reference/src/adapters",
  "services/ingest/src",
  "services/ai-eval",
  "scripts",
];

const DEFAULT_SCAN_FILES = [
  "apps/web/middleware.ts",
  "apps/web/next.config.mjs",
];

const VENDOR_ADAPTER_ALLOWLIST = new Set([
  "apps/web/src/server/avatar-storage.ts",
]);

const STORYBOOK_CSS_ALLOWLIST = new Set([
  "apps/web/app/legacy-d1-storybook.css",
]);

const API_WRAPPER_EXEMPTIONS = new Set([
  "apps/web/app/api/auth/[...all]/route.ts",
  "apps/web/app/api/webhooks/stripe/route.ts",
  "apps/web/app/api/beta/unlock/route.ts",
  "apps/web/app/api/beta/logout/route.ts",
]);

const RATCHET_RULES = [
  "no-monolithic-use-platform",
  "no-prod-comments",
  "no-slop-wrapper-bloat",
  "no-unsafe-number-cast",
  "no-unsafe-type-assertion",
  "no-view-use-effect",
  "require-api-wrapper",
];

const REGEX_PREFIX_KEYWORDS = new Set([
  "return",
  "throw",
  "case",
  "in",
  "of",
  "instanceof",
  "typeof",
  "void",
  "delete",
  "yield",
  "await",
  "new",
  "else",
  "do",
]);

const REGEX_PREFIX_PUNCTS = new Set([
  "(",
  "[",
  "{",
  ",",
  ";",
  ":",
  "=",
  "!",
  "?",
  "&",
  "|",
  "^",
  "~",
  "+",
  "-",
  "*",
  "%",
  "=>",
]);

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const EMPTY_CATCH_RE = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const VENDOR_SDK_QUICK_RE = /@vercel\/|@google-cloud\/|@cloudflare\/|@neondatabase\/|@aws-sdk\/|aws-sdk/;
const VENDOR_SDK_IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](@vercel\/[^"']+|@google-cloud\/[^"']+|@cloudflare\/[^"']+|@neondatabase\/[^"']+|@aws-sdk\/[^"']+|aws-sdk)["']/g;
const WEB_BARREL_IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](@pitchlab\/ui(?:\/platform)?)["']/g;
const CSS_JANK_BACKDROP_RE =
  /(?<![\w-])(?:-webkit-)?backdrop-filter(?![\w-])|\b(?:webkit)?backdropfilter\b|(?<![\w-])backdrop-blur(?:-[\w[\]./%-]+)?(?![\w-])/gi;
const CSS_JANK_TRANSITION_ALL_RE = /(?<![\w-])transition-all(?![\w-])/g;
const CSS_JANK_BOX_SHADOW_RE =
  /(?<![\w-])transition(?:-property|Property)?\s*:\s*[^;{}]*\bbox-shadow\b/gi;
const FORBIDDEN_UI_COPY_QUICK_RE = /confianza|datos\s+(?:completos|parciales)/i;
const FORBIDDEN_UI_COPY_RE = /\bConfianza\s+\d+|\bDatos\s+(?:completos|parciales)\b/gi;
const FORBIDDEN_MATH_JARGON_QUICK_RE = /fr[eé]chet|armador\s+inteligente\s+geodesic|beta\s*\(\s*\d+\s*,\s*\d+\s*\)/i;
const FORBIDDEN_MATH_JARGON_RE =
  /\bFr[eé]chet[- ]Hoeffding\b|\bArmador\s+Inteligente\s+Geodesic\b|\bBeta\(\s*\d+\s*,\s*\d+\s*\)/gi;
const MILKY_DIALOG_BACKDROP_RE = /::backdrop\s*\{[^}]*var\(--pl-bg\)/gi;
const DUPLICATE_SANITIZE_HREF_RE = /\bfunction\s+sanitizeInternalHref\s*\(/g;
const CURVED_ACCENT_QUICK_RE =
  /pl-sb-rank-cell|pl-st-rank-cell|pl-st-zone-cell|pl-astro-row/;
const CURVED_ACCENT_SELECTOR_RE =
  /\.(?:pl-sb-rank-cell|pl-st-rank-cell|pl-st-zone-cell|pl-astro-row)(?![\w-])/;
const CURVED_ACCENT_PSEUDO_RE = /::?(?:before|after)\b/i;
const CURVED_ACCENT_BORDER_PROPS = new Set([
  "border-left",
  "border-left-width",
  "border-inline-start",
  "border-inline-start-width",
]);
const CURVED_ACCENT_RADIUS_PROPS = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-bottom-left-radius",
  "border-start-start-radius",
  "border-end-start-radius",
]);
const CSS_ZERO_LEN_RE = /^0(?:\.0+)?(?:[a-z%]+)?$/;
const CSS_INACTIVE_BORDER_TOKEN_RE =
  /^(?:0(?:\.0+)?(?:[a-z%]+)?|none|hidden|initial|unset|revert|revert-layer)$/;
const CSS_RESET_VALUE_RE = /^(?:none|initial|unset|revert|revert-layer)$/;
const RAW_SERVER_CONSOLE_RE = /(?<![.\w$])console\s*\.\s*(?:log|info|warn|error)\b/g;
const MONOLITHIC_USE_PLATFORM_RE = /\busePlatform\s*\(/g;
const VIEW_USE_EFFECT_RE = /\b(?:React\.)?use(?:Layout)?Effect\s*\(/g;
const UNSAFE_NUMBER_CAST_RE = /(?<![.\w$])Number\s*\(/g;
const UNSAFE_TYPE_ASSERTION_RE = /\bas\s+(?:any\b|unknown\s+as\b)/g;
const TS_SUPPRESSION_RE = /@ts-(?:ignore|nocheck)\b/g;
const ESLINT_DISABLE_RE = /\beslint-disable(?:-(?:next-)?line)?([^\n]*)/g;
const ESLINT_STRUCTURAL_CAUSE_RE =
  /^\s+[a-z0-9@][a-z0-9@/_-]*(?:\s*,\s*[a-z0-9@][a-z0-9@/_-]*)*\s+--\s+[^\s*][^\n*]{2,}$/i;
const SLOP_TODO_FIXME_RE = /\b(?:TODO|FIXME)\b/g;
const API_WRAPPER_RE =
  /\b(?:withPublicRead|withSessionRead|withMemberMutation|withActivePaseMutation|withAdminMutation|withCronSecret)\s*\(/;
const API_HANDLER_EXPORT_RE =
  /\bexport\s+(?:async\s+)?(?:function|const)\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isTestPath(rel) {
  return /(?:^|\/)(?:tests|__tests__|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

function isStoryPath(rel) {
  return /\.stories\.[cm]?[jt]sx?$/.test(rel);
}

function isGeneratedPath(rel) {
  return /\.generated\.[cm]?[jt]sx?$/.test(rel);
}

function isLintableExt(rel) {
  return /\.(?:ts|tsx|css|mjs)$/.test(rel);
}

function isProdScriptExt(rel) {
  return /\.(?:ts|tsx|mjs)$/.test(rel);
}

function isProdCommentTarget(rel) {
  return (
    isProdScriptExt(rel) &&
    !isTestPath(rel) &&
    !isStoryPath(rel) &&
    !isGeneratedPath(rel) &&
    !/(?:^|\/)next-env\.d\.ts$/.test(rel) &&
    !/(?:^|\/)public\/sw\.js$/.test(rel)
  );
}

function isViewUseEffectTarget(rel) {
  return (
    isProdScriptExt(rel) &&
    !isTestPath(rel) &&
    !isStoryPath(rel) &&
    (rel.startsWith("packages/ui/src/platform/club/") ||
      rel.startsWith("packages/ui/src/platform/public/") ||
      rel.startsWith("apps/web/app/"))
  );
}

function isApiRouteTarget(rel) {
  return /^apps\/web\/app\/api\/(?:.+\/)?route\.ts$/.test(rel) && !API_WRAPPER_EXEMPTIONS.has(rel);
}

function isForbiddenMathJargonTarget(rel) {
  return (
    (rel.startsWith("packages/ui/src/") || rel.startsWith("apps/web/app/")) &&
    !isTestPath(rel) &&
    !isStoryPath(rel) &&
    !rel.startsWith("apps/web/app/motores/")
  );
}

function isCurvedAccentTarget(rel) {
  return rel.endsWith(".css") && rel.startsWith("apps/web/app/") && !STORYBOOK_CSS_ALLOWLIST.has(rel);
}

function isRawServerConsoleTarget(rel) {
  return (
    isProdScriptExt(rel) &&
    rel.startsWith("apps/web/src/server/") &&
    rel !== "apps/web/src/server/safe-logger.ts" &&
    !isTestPath(rel)
  );
}

function isIdentStartCode(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
}

function isIdentPartCode(c) {
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95 ||
    c === 36
  );
}

function isDigitCode(c) {
  return c >= 48 && c <= 57;
}

function isAlphaNumOrUnderscoreCode(c) {
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95
  );
}

function isRegexFlagCode(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

async function walkDirAsync(dir, rootDir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  const subPromises = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = toPosix(relative(rootDir, full));
      if (rel === "scripts/tests") continue;
      subPromises.push(walkDirAsync(full, rootDir));
    } else if (entry.isFile() && isLintableExt(entry.name)) {
      files.push(full);
    }
  }
  if (subPromises.length > 0) {
    const nested = await Promise.all(subPromises);
    for (const chunk of nested) {
      for (const f of chunk) {
        files.push(f);
      }
    }
  }
  return files;
}

function maskPreservingNewlines(segment) {
  if (!segment.includes("\n")) {
    return " ".repeat(segment.length);
  }
  return segment.replace(/[^\n]/g, " ");
}

function buildLineStarts(content) {
  const starts = [0];
  let idx = content.indexOf("\n");
  while (idx !== -1) {
    starts.push(idx + 1);
    idx = content.indexOf("\n", idx + 1);
  }
  return starts;
}

function lineAtOffset(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hi + 1;
}

function formatLinePreview(lines, maxItems = 8) {
  if (lines.length <= maxItems) {
    return lines.join(", ");
  }
  const head = lines.slice(0, maxItems).join(", ");
  return `${head} (+${lines.length - maxItems} más)`;
}

function formatDiagnostic(rule, rel, line, what, why, instead) {
  return `[${rule}] ${rel}:${line} — ${what} | ${why} | USA EN SU LUGAR: ${instead}`;
}

function findSameLineStringEnd(content, startIdx, quoteCode) {
  const len = content.length;
  let j = startIdx + 1;
  while (j < len) {
    const c = content.charCodeAt(j);
    if (c === 92) {
      if (content.charCodeAt(j + 1) === 13 && content.charCodeAt(j + 2) === 10) {
        j += 3;
      } else {
        j += 2;
      }
      continue;
    }
    if (c === quoteCode) {
      return j;
    }
    if (c === 10) {
      return -1;
    }
    j += 1;
  }
  return -1;
}

function findSameLineRegexEnd(content, startIdx) {
  const len = content.length;
  let j = startIdx + 1;
  let inCharClass = false;
  while (j < len) {
    const c = content.charCodeAt(j);
    if (c === 10 || c === 13) {
      return -1;
    }
    if (c === 92) {
      if (j + 1 >= len) return -1;
      const next = content.charCodeAt(j + 1);
      if (next === 10 || next === 13) {
        return -1;
      }
      j += 2;
      continue;
    }
    if (inCharClass) {
      if (c === 93) {
        inCharClass = false;
      }
      j += 1;
      continue;
    }
    if (c === 91) {
      inCharClass = true;
      j += 1;
      continue;
    }
    if (c === 47) {
      let end = j + 1;
      while (end < len && isRegexFlagCode(content.charCodeAt(end))) {
        end += 1;
      }
      return end - 1;
    }
    j += 1;
  }
  return -1;
}

function isTripleSlashReference(content, startIdx) {
  if (
    content.charCodeAt(startIdx + 2) !== 47 ||
    !/^\/\/\/\s*<reference\b/.test(content.slice(startIdx, startIdx + 32))
  ) {
    return false;
  }
  let p = startIdx - 1;
  while (p >= 0) {
    const c = content.charCodeAt(p);
    if (c === 10) break;
    if (c !== 32 && c !== 9 && c !== 13) {
      return false;
    }
    p -= 1;
  }
  return true;
}

function scanCss(content) {
  if (!content.includes("/*") && !content.includes('"') && !content.includes("'")) {
    return {
      codeWithoutComments: content,
      codeWithoutStrings: content,
      codeOnly: content,
      commentLines: [],
      commentSegments: [],
    };
  }

  const len = content.length;
  const noCmt = [];
  const code = [];
  let i = 0;
  let plainStart = 0;

  const flushPlain = (endIdx) => {
    if (endIdx > plainStart) {
      const seg = content.slice(plainStart, endIdx);
      noCmt.push(seg);
      code.push(seg);
    }
  };

  while (i < len) {
    const c = content.charCodeAt(i);
    if (c === 47 && content.charCodeAt(i + 1) === 42) {
      flushPlain(i);
      const closeIdx = content.indexOf("*/", i + 2);
      const end = closeIdx === -1 ? len : closeIdx + 2;
      const masked = maskPreservingNewlines(content.slice(i, end));
      noCmt.push(masked);
      code.push(masked);
      i = end;
      plainStart = i;
      continue;
    }
    if (c === 39 || c === 34) {
      const endIdx = findSameLineStringEnd(content, i, c);
      if (endIdx !== -1) {
        flushPlain(i);
        const seg = content.slice(i, endIdx + 1);
        noCmt.push(seg);
        code.push(maskPreservingNewlines(seg));
        i = endIdx + 1;
        plainStart = i;
        continue;
      }
    }
    i += 1;
  }

  if (plainStart === 0) {
    return {
      codeWithoutComments: content,
      codeWithoutStrings: content,
      codeOnly: content,
      commentLines: [],
      commentSegments: [],
    };
  }

  flushPlain(len);
  const codeWithoutComments = noCmt.join("");
  const codeOnly = code.join("");
  return {
    codeWithoutComments,
    codeWithoutStrings: codeOnly,
    codeOnly,
    commentLines: [],
    commentSegments: [],
  };
}

function countNewlines(segment) {
  let n = 0;
  let idx = segment.indexOf("\n");
  while (idx !== -1) {
    n += 1;
    idx = segment.indexOf("\n", idx + 1);
  }
  return n;
}

export function scanSource(content, isCss = false) {
  if (isCss) {
    return scanCss(content);
  }

  const len = content.length;
  const noCmt = [];
  const noStr = [];
  const code = [];
  const commentLineSet = new Set();
  const commentSegments = [];
  const templateBraceStack = [];
  let inTemplateChunk = false;
  let prevTokenType = "start";
  let prevTokenValue = "";
  let line = 1;
  let i = 0;
  let plainStart = 0;
  let hadComment = false;
  let hadString = false;

  const flushPlain = (endIdx) => {
    if (endIdx > plainStart) {
      const seg = content.slice(plainStart, endIdx);
      noCmt.push(seg);
      noStr.push(seg);
      code.push(seg);
    }
  };

  if (len >= 2 && content.charCodeAt(0) === 35 && content.charCodeAt(1) === 33) {
    const nlIdx = content.indexOf("\n");
    const end = nlIdx === -1 ? len : nlIdx;
    const seg = content.slice(0, end);
    noCmt.push(seg);
    noStr.push(seg);
    code.push(" ".repeat(seg.length));
    hadString = true;
    i = end;
    plainStart = end;
  }

  while (i < len) {
    if (inTemplateChunk) {
      const chunkStart = i;
      while (i < len) {
        const c = content.charCodeAt(i);
        if (c === 92) {
          if (content.charCodeAt(i + 1) === 10) {
            line += 1;
          }
          i += 2;
          continue;
        }
        if (c === 36 && content.charCodeAt(i + 1) === 123) {
          const seg = content.slice(chunkStart, i);
          const masked = maskPreservingNewlines(seg);
          noCmt.push(seg, "${");
          noStr.push(masked, "${");
          code.push(masked, "${");
          templateBraceStack.push(0);
          inTemplateChunk = false;
          prevTokenType = "punct";
          prevTokenValue = "{";
          i += 2;
          plainStart = i;
          break;
        }
        if (c === 96) {
          const seg = content.slice(chunkStart, i + 1);
          const masked = maskPreservingNewlines(seg);
          noCmt.push(seg);
          noStr.push(masked);
          code.push(masked);
          inTemplateChunk = false;
          prevTokenType = "string";
          prevTokenValue = "`";
          i += 1;
          plainStart = i;
          break;
        }
        if (c === 10) {
          line += 1;
        }
        i += 1;
      }
      if (inTemplateChunk) {
        const seg = content.slice(chunkStart, i);
        const masked = maskPreservingNewlines(seg);
        noCmt.push(seg);
        noStr.push(masked);
        code.push(masked);
        inTemplateChunk = false;
        plainStart = i;
      }
      continue;
    }

    const c = content.charCodeAt(i);

    if (c === 32 || c === 9 || c === 13) {
      i += 1;
      continue;
    }
    if (c === 10) {
      line += 1;
      i += 1;
      continue;
    }

    if (c === 47) {
      const next = content.charCodeAt(i + 1);
      if (next === 47) {
        flushPlain(i);
        const nlIdx = content.indexOf("\n", i + 2);
        const end = nlIdx === -1 ? len : nlIdx;
        const seg = content.slice(i, end);
        if (!isTripleSlashReference(content, i)) {
          commentLineSet.add(line);
          commentSegments.push({ line, text: seg });
        }
        const masked = " ".repeat(seg.length);
        noCmt.push(masked);
        noStr.push(seg);
        code.push(masked);
        hadComment = true;
        i = end;
        plainStart = i;
        continue;
      }
      if (next === 42) {
        flushPlain(i);
        const closeIdx = content.indexOf("*/", i + 2);
        const end = closeIdx === -1 ? len : closeIdx + 2;
        const seg = content.slice(i, end);
        const startLine = line;
        commentLineSet.add(line);
        let nlPos = seg.indexOf("\n");
        while (nlPos !== -1) {
          line += 1;
          commentLineSet.add(line);
          nlPos = seg.indexOf("\n", nlPos + 1);
        }
        const blockLines = seg.split("\n");
        for (let k = 0; k < blockLines.length; k += 1) {
          commentSegments.push({ line: startLine + k, text: blockLines[k] });
        }
        const masked = maskPreservingNewlines(seg);
        noCmt.push(masked);
        noStr.push(seg);
        code.push(masked);
        hadComment = true;
        i = end;
        plainStart = i;
        continue;
      }
      const canRegex =
        prevTokenType === "start" ||
        (prevTokenType === "punct" && REGEX_PREFIX_PUNCTS.has(prevTokenValue)) ||
        (prevTokenType === "word" && REGEX_PREFIX_KEYWORDS.has(prevTokenValue));
      if (canRegex) {
        const endIdx = findSameLineRegexEnd(content, i);
        if (endIdx !== -1) {
          flushPlain(i);
          const seg = content.slice(i, endIdx + 1);
          const masked = " ".repeat(seg.length);
          noCmt.push(seg);
          noStr.push(masked);
          code.push(masked);
          hadString = true;
          prevTokenType = "regex";
          prevTokenValue = "/";
          i = endIdx + 1;
          plainStart = i;
          continue;
        }
      }
      prevTokenType = "punct";
      prevTokenValue = "/";
      i += 1;
      continue;
    }

    if (c === 96) {
      flushPlain(i);
      noCmt.push("`");
      noStr.push(" ");
      code.push(" ");
      hadString = true;
      inTemplateChunk = true;
      i += 1;
      plainStart = i;
      continue;
    }

    if (c === 39 || c === 34) {
      const isJsxApostrophe = c === 39 && i > 0 && isAlphaNumOrUnderscoreCode(content.charCodeAt(i - 1));
      if (!isJsxApostrophe) {
        const endIdx = findSameLineStringEnd(content, i, c);
        if (endIdx !== -1) {
          flushPlain(i);
          const seg = content.slice(i, endIdx + 1);
          line += countNewlines(seg);
          const masked = maskPreservingNewlines(seg);
          noCmt.push(seg);
          noStr.push(masked);
          code.push(masked);
          hadString = true;
          prevTokenType = "string";
          prevTokenValue = c === 39 ? "'" : '"';
          i = endIdx + 1;
          plainStart = i;
          continue;
        }
      }
      prevTokenType = "punct";
      prevTokenValue = c === 39 ? "'" : '"';
      i += 1;
      continue;
    }

    if (isIdentStartCode(c)) {
      const wordStart = i;
      i += 1;
      while (i < len && isIdentPartCode(content.charCodeAt(i))) {
        i += 1;
      }
      prevTokenType = "word";
      prevTokenValue = content.slice(wordStart, i);
      continue;
    }

    if (isDigitCode(c)) {
      const numStart = i;
      i += 1;
      while (i < len && isAlphaNumOrUnderscoreCode(content.charCodeAt(i))) {
        i += 1;
      }
      prevTokenType = "number";
      prevTokenValue = content.slice(numStart, i);
      continue;
    }

    if (c === 61 && content.charCodeAt(i + 1) === 62) {
      prevTokenType = "punct";
      prevTokenValue = "=>";
      i += 2;
      continue;
    }

    if (c === 43 && content.charCodeAt(i + 1) === 43) {
      prevTokenType = "punct";
      prevTokenValue = "++";
      i += 2;
      continue;
    }

    if (c === 45 && content.charCodeAt(i + 1) === 45) {
      prevTokenType = "punct";
      prevTokenValue = "--";
      i += 2;
      continue;
    }

    if (c === 123) {
      if (templateBraceStack.length > 0) {
        templateBraceStack[templateBraceStack.length - 1] += 1;
      }
      prevTokenType = "punct";
      prevTokenValue = "{";
      i += 1;
      continue;
    }

    if (c === 125) {
      if (templateBraceStack.length > 0) {
        const depth = templateBraceStack[templateBraceStack.length - 1];
        if (depth === 0) {
          flushPlain(i + 1);
          templateBraceStack.pop();
          inTemplateChunk = true;
          i += 1;
          plainStart = i;
          continue;
        }
        templateBraceStack[templateBraceStack.length - 1] = depth - 1;
      }
      prevTokenType = "punct";
      prevTokenValue = "}";
      i += 1;
      continue;
    }

    prevTokenType = "punct";
    prevTokenValue = content[i];
    i += 1;
  }

  if (!hadComment && !hadString) {
    return {
      codeWithoutComments: content,
      codeWithoutStrings: content,
      codeOnly: content,
      commentLines: [],
      commentSegments: [],
    };
  }

  flushPlain(len);
  return {
    codeWithoutComments: hadComment ? noCmt.join("") : content,
    codeWithoutStrings: hadString ? noStr.join("") : content,
    codeOnly: code.join(""),
    commentLines: commentLineSet.size > 0 ? [...commentLineSet].sort((a, b) => a - b) : [],
    commentSegments,
  };
}

function collectSlopWrapperBloatLines(commentSegments) {
  const lines = [];
  for (const segment of commentSegments) {
    const text = segment.text;
    if (text.includes("@ts-")) {
      TS_SUPPRESSION_RE.lastIndex = 0;
      while (TS_SUPPRESSION_RE.exec(text) !== null) {
        lines.push(segment.line);
      }
    }
    if (text.includes("eslint-disable")) {
      ESLINT_DISABLE_RE.lastIndex = 0;
      let m;
      while ((m = ESLINT_DISABLE_RE.exec(text)) !== null) {
        const rest = m[1].replace(/\*\/\s*$/, "").trimEnd();
        if (!ESLINT_STRUCTURAL_CAUSE_RE.test(rest)) {
          lines.push(segment.line);
        }
      }
    }
    if (text.includes("TODO") || text.includes("FIXME")) {
      SLOP_TODO_FIXME_RE.lastIndex = 0;
      while (SLOP_TODO_FIXME_RE.exec(text) !== null) {
        lines.push(segment.line);
      }
    }
  }
  return lines;
}

function collectMatchLines(text, regex, getLineStarts) {
  const matches = [];
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push({
      line: lineAtOffset(getLineStarts(), m.index),
      value: m[1] ?? m[0],
    });
  }
  return matches;
}

function stripBalancedParens(text) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      if (depth > 0) depth -= 1;
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

function splitTopLevelCommas(selectorText) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i];
    if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")" && parenDepth > 0) {
      parenDepth -= 1;
    } else if (ch === "[") {
      bracketDepth += 1;
    } else if (ch === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
    } else if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
      const part = selectorText.slice(start, i).trim();
      if (part.length > 0) parts.push(part);
      start = i + 1;
    }
  }
  const tail = selectorText.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

function extractRightmostCompound(selector) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let i = selector.length - 1;
  while (i >= 0) {
    const ch = selector[i];
    if (ch === ")") {
      parenDepth += 1;
    } else if (ch === "(" && parenDepth > 0) {
      parenDepth -= 1;
    } else if (ch === "]") {
      bracketDepth += 1;
    } else if (ch === "[" && bracketDepth > 0) {
      bracketDepth -= 1;
    } else if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === ">" || ch === "+" || ch === "~")
    ) {
      break;
    }
    i -= 1;
  }
  return selector.slice(i + 1);
}

function findCurvedAccentSelector(selectorText) {
  const trimmed = selectorText.trim();
  if (trimmed.length === 0 || trimmed.startsWith("@")) {
    return null;
  }
  if (!CURVED_ACCENT_QUICK_RE.test(trimmed)) {
    return null;
  }
  for (const part of splitTopLevelCommas(trimmed)) {
    if (!CURVED_ACCENT_QUICK_RE.test(part)) continue;
    const subject = extractRightmostCompound(part);
    if (CURVED_ACCENT_PSEUDO_RE.test(subject)) continue;
    const match = CURVED_ACCENT_SELECTOR_RE.exec(subject);
    if (match) {
      return match[0];
    }
  }
  return null;
}

function isActiveLeftBorderValue(rawValue) {
  const cleaned = rawValue.replace(/!\s*important\s*$/i, "").trim().toLowerCase();
  if (cleaned.length === 0) return false;
  const tokens = stripBalancedParens(cleaned)
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return false;
  return !tokens.some((token) => CSS_INACTIVE_BORDER_TOKEN_RE.test(token));
}

function isActiveBorderRadiusValue(rawValue) {
  const cleaned = rawValue.replace(/!\s*important\s*$/i, "").trim().toLowerCase();
  if (cleaned.length === 0 || CSS_RESET_VALUE_RE.test(cleaned)) return false;
  const tokens = stripBalancedParens(cleaned)
    .split(/[\s/]+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return false;
  return tokens.some((token) => !CSS_ZERO_LEN_RE.test(token));
}

function findParentStyleSelector(stack) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const sel = stack[i].selector;
    if (sel.length > 0 && !sel.startsWith("@")) {
      return sel;
    }
  }
  return null;
}

function resolveNestedSelector(rawSelector, stack) {
  if (!rawSelector.includes("&")) {
    return rawSelector;
  }
  const parentSel = findParentStyleSelector(stack);
  if (!parentSel) {
    return rawSelector;
  }
  const parentParts = splitTopLevelCommas(parentSel);
  const childParts = splitTopLevelCommas(rawSelector);
  const resolved = [];
  for (const parentPart of parentParts) {
    for (const childPart of childParts) {
      resolved.push(childPart.replace(/&/g, parentPart));
    }
  }
  return resolved.join(", ");
}

function evaluateCurvedAccentBlock(block) {
  const matchedSelector = findCurvedAccentSelector(block.selector);
  if (!matchedSelector) return null;

  const activeBorderProps = new Set();
  const activeRadiusProps = new Set();

  for (const decl of block.ownDecls) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1);

    if (prop === "border") {
      if (!isActiveLeftBorderValue(val)) {
        activeBorderProps.clear();
      }
      continue;
    }

    if (CURVED_ACCENT_BORDER_PROPS.has(prop)) {
      if (isActiveLeftBorderValue(val)) {
        activeBorderProps.add(prop);
      } else {
        activeBorderProps.delete(prop);
        if (prop === "border-left") activeBorderProps.delete("border-left-width");
        if (prop === "border-inline-start") activeBorderProps.delete("border-inline-start-width");
      }
      continue;
    }

    if (CURVED_ACCENT_RADIUS_PROPS.has(prop)) {
      if (isActiveBorderRadiusValue(val)) {
        activeRadiusProps.add(prop);
      } else if (prop === "border-radius") {
        activeRadiusProps.clear();
      } else {
        activeRadiusProps.delete(prop);
      }
    }
  }

  if (activeBorderProps.size > 0 && activeRadiusProps.size > 0) {
    return {
      offset: block.selectorOffset,
      value: matchedSelector,
    };
  }
  return null;
}

function collectCurvedAccentSlopHits(codeOnly, getLineStarts) {
  const hits = [];
  const stack = [];
  const len = codeOnly.length;
  let tokenStart = 0;

  for (let i = 0; i < len; i += 1) {
    const c = codeOnly.charCodeAt(i);
    if (c === 123) {
      const rawPrelude = codeOnly.slice(tokenStart, i);
      const leadingWs = rawPrelude.length - rawPrelude.trimStart().length;
      const selectorOffset = tokenStart + leadingWs;
      const rawSelector = rawPrelude.trim();
      const selector = resolveNestedSelector(rawSelector, stack);
      stack.push({ selector, selectorOffset, ownDecls: [] });
      tokenStart = i + 1;
      continue;
    }
    if (c === 59) {
      if (stack.length > 0) {
        const decl = codeOnly.slice(tokenStart, i).trim();
        if (decl.length > 0 && !decl.startsWith("@")) {
          stack[stack.length - 1].ownDecls.push(decl);
        }
      }
      tokenStart = i + 1;
      continue;
    }
    if (c === 125) {
      if (stack.length > 0) {
        const tailDecl = codeOnly.slice(tokenStart, i).trim();
        const block = stack.pop();
        if (tailDecl.length > 0 && !tailDecl.startsWith("@")) {
          block.ownDecls.push(tailDecl);
        }
        const hit = evaluateCurvedAccentBlock(block);
        if (hit) {
          hits.push({
            line: lineAtOffset(getLineStarts(), hit.offset),
            value: hit.value,
          });
        }
      }
      tokenStart = i + 1;
    }
  }

  hits.sort((a, b) => a.line - b.line);
  return hits;
}

function emptyBaseline() {
  const rules = {};
  for (const rule of RATCHET_RULES) {
    rules[rule] = {};
  }
  return { version: 1, rules };
}

function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    return emptyBaseline();
  }
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  const normalized = emptyBaseline();
  if (parsed && typeof parsed === "object" && parsed.rules && typeof parsed.rules === "object") {
    for (const rule of RATCHET_RULES) {
      const entries = parsed.rules[rule];
      if (entries && typeof entries === "object") {
        for (const [fileRel, count] of Object.entries(entries)) {
          if (typeof count === "number" && Number.isInteger(count) && count > 0) {
            normalized.rules[rule][toPosix(fileRel)] = count;
          }
        }
      }
    }
  }
  return normalized;
}

function sortBaseline(baseline) {
  const sorted = { version: 1, rules: {} };
  for (const rule of RATCHET_RULES) {
    const entries = baseline.rules[rule] ?? {};
    const ordered = {};
    for (const key of Object.keys(entries).sort()) {
      const val = entries[key];
      if (typeof val === "number" && Number.isInteger(val) && val > 0) {
        ordered[key] = val;
      }
    }
    sorted.rules[rule] = ordered;
  }
  return sorted;
}

function writeBaseline(baselinePath, baseline) {
  const sorted = sortBaseline(baseline);
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  return sorted;
}

async function discoverRepoFiles(rootDir) {
  const chunks = await Promise.all(
    DEFAULT_SCAN_DIRS.map((dirRel) => walkDirAsync(join(rootDir, dirRel), rootDir)),
  );
  const seen = new Set();
  const files = [];
  for (const chunk of chunks) {
    for (const full of chunk) {
      if (!seen.has(full)) {
        seen.add(full);
        files.push(full);
      }
    }
  }
  for (const fileRel of DEFAULT_SCAN_FILES) {
    const full = join(rootDir, fileRel);
    if (existsSync(full) && !seen.has(full)) {
      seen.add(full);
      files.push(full);
    }
  }
  files.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
  return files;
}

async function readFilesInBatches(filePaths) {
  const contents = new Array(filePaths.length);
  for (let start = 0; start < filePaths.length; start += READ_CONCURRENCY) {
    const end = Math.min(start + READ_CONCURRENCY, filePaths.length);
    const slice = filePaths.slice(start, end);
    const batch = await Promise.all(slice.map((filePath) => readFile(filePath, "utf8")));
    for (let k = 0; k < batch.length; k += 1) {
      contents[start + k] = batch[k];
    }
  }
  return contents;
}

function evaluateFile(rel, content) {
  const isCss = rel.endsWith(".css");
  const scanned = scanSource(content, isCss);
  let cachedLineStarts = null;
  const getLineStarts = () => {
    if (cachedLineStarts === null) {
      cachedLineStarts = buildLineStarts(content);
    }
    return cachedLineStarts;
  };
  const immediateErrors = [];
  const ratchetMeasurements = {};

  if (
    !rel.startsWith("packages/tokens/") &&
    !rel.startsWith("packages/emails/src/") &&
    !rel.endsWith("registry.generated.ts") &&
    scanned.codeWithoutComments.includes("#")
  ) {
    for (const hit of collectMatchLines(scanned.codeWithoutComments, HEX_COLOR_RE, getLineStarts)) {
      immediateErrors.push(
        formatDiagnostic(
          "no-hex-outside-tokens",
          rel,
          hit.line,
          `Color hexadecimal literal (${hit.value}) fuera de packages/tokens/`,
          "Rompe el sistema de temas oscuro/claro y la gobernanza de tokens de marca",
          "tokens CSS var(--pl-*) definidos en @pitchlab/tokens",
        ),
      );
    }
  }

  if (!isCss) {
    if (scanned.codeWithoutStrings.includes("catch")) {
      for (const hit of collectMatchLines(scanned.codeWithoutStrings, EMPTY_CATCH_RE, getLineStarts)) {
        immediateErrors.push(
          formatDiagnostic(
            "no-empty-catch",
            rel,
            hit.line,
            "Bloque catch vacío detectado",
            "Oculta fallos silenciosos en tiempo de ejecución y degrada la observabilidad",
            "manejo explícito del error, valor de respaldo tipado o safeLogger en apps/web/src/server/safe-logger.ts",
          ),
        );
      }
    }

    if (!VENDOR_ADAPTER_ALLOWLIST.has(rel) && VENDOR_SDK_QUICK_RE.test(scanned.codeWithoutComments)) {
      for (const hit of collectMatchLines(scanned.codeWithoutComments, VENDOR_SDK_IMPORT_RE, getLineStarts)) {
        immediateErrors.push(
          formatDiagnostic(
            "no-cloud-sdk-lockin",
            rel,
            hit.line,
            `Import de SDK cloud propietario (${hit.value}) fuera de adaptador aislado`,
            "Viola ADR-050 de portabilidad e independencia de proveedor",
            "estándares abiertos (postgres.js + Drizzle SQL, S3 SigV4 vía node:crypto o HTTP estándar) o adaptador aislado opt-in",
          ),
        );
      }
    }

    if (rel.startsWith("apps/web/") && scanned.codeWithoutComments.includes("@pitchlab/ui")) {
      for (const hit of collectMatchLines(scanned.codeWithoutComments, WEB_BARREL_IMPORT_RE, getLineStarts)) {
        immediateErrors.push(
          formatDiagnostic(
            "no-web-barrels",
            rel,
            hit.line,
            `Import desde barrel prohibido (${hit.value}) en apps/web/`,
            "Arrastra el grafo completo de @pitchlab/ui, infla el JS cliente y viola ADR-051",
            "subpath explícito como @pitchlab/ui/atomic, @pitchlab/ui/picks-catalog, @pitchlab/ui/picks-components o @pitchlab/ui/primitives",
          ),
        );
      }
    }
  }

  if (
    (rel.startsWith("apps/web/") || rel.startsWith("packages/ui/src/")) &&
    (rel.endsWith(".css") || rel.endsWith(".tsx")) &&
    !isStoryPath(rel) &&
    !STORYBOOK_CSS_ALLOWLIST.has(rel)
  ) {
    const noCmt = scanned.codeWithoutComments;
    if (/backdrop/i.test(noCmt)) {
      for (const hit of collectMatchLines(noCmt, CSS_JANK_BACKDROP_RE, getLineStarts)) {
        immediateErrors.push(
          formatDiagnostic(
            "no-css-jank",
            rel,
            hit.line,
            `Propiedad o utilidad con jank de compositor (${hit.value})`,
            "Dispara repaints costosos en GPU/móvil y viola el presupuesto cero-jank de ADR-051/ADR-052",
            "superficies sólidas con tokens --pl-* y transiciones sobre transform, opacity, border-color, background-color o color",
          ),
        );
      }
    }
    if (/transition/i.test(noCmt)) {
      if (noCmt.includes("transition-all")) {
        for (const hit of collectMatchLines(noCmt, CSS_JANK_TRANSITION_ALL_RE, getLineStarts)) {
          immediateErrors.push(
            formatDiagnostic(
              "no-css-jank",
              rel,
              hit.line,
              `Utilidad de transición indiscriminada (${hit.value})`,
              "Anima propiedades de layout/paint costosas y viola el presupuesto cero-jank de ADR-051/ADR-052",
              "transiciones explícitas únicamente sobre transform, opacity, border-color, background-color o color",
            ),
          );
        }
      }
      if (/box-shadow/i.test(noCmt)) {
        for (const hit of collectMatchLines(noCmt, CSS_JANK_BOX_SHADOW_RE, getLineStarts)) {
          immediateErrors.push(
            formatDiagnostic(
              "no-css-jank",
              rel,
              hit.line,
              "Transición animada sobre box-shadow detectada",
              "Fuerza repaints continuos por frame en móvil y viola el presupuesto cero-jank de ADR-051/ADR-052",
              "transiciones explícitas únicamente sobre transform, opacity, border-color, background-color o color",
            ),
          );
        }
      }
    }
  }

  if (
    (rel.startsWith("packages/ui/src/") || rel.startsWith("apps/web/")) &&
    !isTestPath(rel) &&
    !isStoryPath(rel) &&
    FORBIDDEN_UI_COPY_QUICK_RE.test(scanned.codeWithoutComments)
  ) {
    for (const hit of collectMatchLines(scanned.codeWithoutComments, FORBIDDEN_UI_COPY_RE, getLineStarts)) {
      immediateErrors.push(
        formatDiagnostic(
          "no-forbidden-ui-copy",
          rel,
          hit.line,
          `Copy editorial prohibido (${hit.value}) en interfaz`,
          "Oculta la calibración probabilística real y viola el diseño plano editorial de ADR-054",
          "probabilidad calibrada Spacetime, momio justo (fairOdds) y evidencia verificable en MatchPicksEvidenceBoard",
        ),
      );
    }
  }

  if (
    isForbiddenMathJargonTarget(rel) &&
    FORBIDDEN_MATH_JARGON_QUICK_RE.test(scanned.codeWithoutComments)
  ) {
    for (const hit of collectMatchLines(
      scanned.codeWithoutComments,
      FORBIDDEN_MATH_JARGON_RE,
      getLineStarts,
    )) {
      immediateErrors.push(
        formatDiagnostic(
          "no-forbidden-math-jargon",
          rel,
          hit.line,
          `Jerga matemática o interna prohibida (${hit.value}) en interfaz`,
          "Expone terminología académica o nombres internos erradicados del copy visible (Ola 7 / ADR-061)",
          "lenguaje editorial claro orientado al usuario (Armador de Parlays, límite de correlación o Motor Spacetime)",
        ),
      );
    }
  }

  if (isCurvedAccentTarget(rel) && CURVED_ACCENT_QUICK_RE.test(scanned.codeOnly)) {
    for (const hit of collectCurvedAccentSlopHits(scanned.codeOnly, getLineStarts)) {
      immediateErrors.push(
        formatDiagnostic(
          "no-curved-accent-slop",
          rel,
          hit.line,
          `Borde curvo de acento detectado en ${hit.value} (border-left/border-inline-start + border-radius)`,
          "Genera artefactos visuales curvos en filas o celdas de ranking (Ola 7 / ADR-060)",
          "barra vertical recta de 3px en pseudo-elemento ::before con border-radius: 0 en la celda",
        ),
      );
    }
  }

  if (isCurvedAccentTarget(rel) && scanned.codeOnly.includes("::backdrop")) {
    for (const hit of collectMatchLines(scanned.codeOnly, MILKY_DIALOG_BACKDROP_RE, getLineStarts)) {
      immediateErrors.push(
        formatDiagnostic(
          "no-milky-light-dialog-backdrop",
          rel,
          hit.line,
          "Regla ::backdrop usa var(--pl-bg), lo que produce un velo blanco lechoso en tema claro",
          "En tema claro --pl-bg es blanco alabastro y arruina el contraste del fondo modal",
          "var(--pl-modal-backdrop)",
        ),
      );
    }
  }

  if (
    isProdScriptExt(rel) &&
    !isTestPath(rel) &&
    !isStoryPath(rel) &&
    rel !== "packages/ui/src/platform/navigation-helpers.ts" &&
    scanned.codeOnly.includes("sanitizeInternalHref")
  ) {
    for (const hit of collectMatchLines(scanned.codeOnly, DUPLICATE_SANITIZE_HREF_RE, getLineStarts)) {
      immediateErrors.push(
        formatDiagnostic(
          "no-duplicate-sanitize-internal-href",
          rel,
          hit.line,
          "Copia local duplicada de sanitizeInternalHref detectada",
          "Las copias locales omiten validaciones de barra invertida (/\\) y caracteres de control (open redirect)",
          'import { sanitizeInternalHref } from "../navigation-helpers"',
        ),
      );
    }
  }

  if (isRawServerConsoleTarget(rel) && scanned.codeOnly.includes("console")) {
    for (const hit of collectMatchLines(scanned.codeOnly, RAW_SERVER_CONSOLE_RE, getLineStarts)) {
      immediateErrors.push(
        formatDiagnostic(
          "no-raw-server-console",
          rel,
          hit.line,
          `Llamada cruda a ${hit.value} en módulo de servidor`,
          "Puede filtrar PII, tokens o credenciales sin redacción en logs y viola ADR-057/ADR-061",
          "logSecurityEvent de apps/web/src/server/safe-logger.ts",
        ),
      );
    }
  }

  if (
    isProdScriptExt(rel) &&
    rel !== "packages/ui/src/platform/platform-provider.tsx" &&
    !isStoryPath(rel) &&
    !isTestPath(rel) &&
    scanned.codeOnly.includes("usePlatform")
  ) {
    const hits = collectMatchLines(scanned.codeOnly, MONOLITHIC_USE_PLATFORM_RE, getLineStarts);
    if (hits.length > 0) {
      ratchetMeasurements["no-monolithic-use-platform"] = {
        count: hits.length,
        lines: hits.map((h) => h.line),
      };
    }
  }

  if (isProdCommentTarget(rel) && scanned.commentLines.length > 0) {
    ratchetMeasurements["no-prod-comments"] = {
      count: scanned.commentLines.length,
      lines: scanned.commentLines,
    };
  }

  if (isViewUseEffectTarget(rel) && scanned.codeOnly.includes("Effect")) {
    const hits = collectMatchLines(scanned.codeOnly, VIEW_USE_EFFECT_RE, getLineStarts);
    if (hits.length > 0) {
      ratchetMeasurements["no-view-use-effect"] = {
        count: hits.length,
        lines: hits.map((h) => h.line),
      };
    }
  }

  if (isProdCommentTarget(rel) && scanned.codeOnly.includes("Number")) {
    const hits = collectMatchLines(scanned.codeOnly, UNSAFE_NUMBER_CAST_RE, getLineStarts);
    if (hits.length > 0) {
      ratchetMeasurements["no-unsafe-number-cast"] = {
        count: hits.length,
        lines: hits.map((h) => h.line),
      };
    }
  }

  if (isProdCommentTarget(rel) && scanned.codeOnly.includes("as")) {
    const hits = collectMatchLines(scanned.codeOnly, UNSAFE_TYPE_ASSERTION_RE, getLineStarts);
    if (hits.length > 0) {
      ratchetMeasurements["no-unsafe-type-assertion"] = {
        count: hits.length,
        lines: hits.map((h) => h.line),
      };
    }
  }

  if (isProdCommentTarget(rel) && scanned.commentSegments.length > 0) {
    const bloatLines = collectSlopWrapperBloatLines(scanned.commentSegments);
    if (bloatLines.length > 0) {
      ratchetMeasurements["no-slop-wrapper-bloat"] = {
        count: bloatLines.length,
        lines: bloatLines,
      };
    }
  }

  if (isApiRouteTarget(rel) && !API_WRAPPER_RE.test(scanned.codeOnly)) {
    const exportMatch = API_HANDLER_EXPORT_RE.exec(scanned.codeOnly);
    const handlerLine = exportMatch ? lineAtOffset(getLineStarts(), exportMatch.index) : 1;
    ratchetMeasurements["require-api-wrapper"] = {
      count: 1,
      lines: [handlerLine],
    };
  }

  return { immediateErrors, ratchetMeasurements };
}

function buildRatchetDiagnostic(rule, rel, measurement, allowed) {
  const firstLine = measurement.lines[0] ?? 1;
  const preview = formatLinePreview(measurement.lines);
  const count = measurement.count;

  if (rule === "no-monolithic-use-platform") {
    return formatDiagnostic(
      rule,
      rel,
      firstLine,
      `Uso de hook monolítico usePlatform (${count} encontrado(s), límite ${allowed}; líneas: ${preview})`,
      "Suscribe el componente a todo el contexto global y provoca re-renders masivos (ADR-052)",
      "hooks divididos usePlatformCore, usePlatformActions, useParlayState, useSocialState, useOverlayState, useJournalEntries o useWatchlistGameIds",
    );
  }
  if (rule === "no-prod-comments") {
    return formatDiagnostic(
      rule,
      rel,
      firstLine,
      `${count} línea(s) de comentario literal en producción (límite ${allowed}; líneas: ${preview})`,
      "Los comentarios en producción se desactualizan y multiplican slop en flujos /swarm (Constraint-First)",
      "nombres expresivos, tipos nominales en @pitchlab/contracts, tests descriptivos o ADRs en docs/architecture/adr/",
    );
  }
  if (rule === "no-view-use-effect") {
    return formatDiagnostic(
      rule,
      rel,
      firstLine,
      `Llamada a useEffect/useLayoutEffect en vista (${count} encontrada(s), límite ${allowed}; líneas: ${preview})`,
      "Introduce sincronización imperativa frágil, efectos duplicados y race conditions en vistas React",
      "estado derivado puro en render, handlers explícitos o hooks auditados con AbortController en packages/ui/src/platform/hooks/* o apps/web/src/client/*",
    );
  }
  if (rule === "no-unsafe-number-cast") {
    return formatDiagnostic(
      rule,
      rel,
      firstLine,
      `Coerción numérica laxa detectada (${count} encontrada(s), límite ${allowed}; líneas: ${preview})`,
      "Convierte null, cadenas vacías o booleanos silenciosamente a 0/1 y propaga NaN/Infinity",
      "parseStrictFiniteNumber, parsePositiveDecimalOdds o parseUnitProbability de @pitchlab/contracts",
    );
  }
  if (rule === "no-unsafe-type-assertion") {
    return formatDiagnostic(
      rule,
      rel,
      firstLine,
      `Aserción de tipo insegura (as any / as unknown as) detectada (${count} encontrada(s), límite ${allowed}; líneas: ${preview})`,
      "Anula el chequeo estático de TypeScript y oculta violaciones de contrato en tiempo de ejecución (Unslop)",
      "narrowing real, type guard o parseStrictFiniteNumber / esquemas Zod de @pitchlab/contracts",
    );
  }
  if (rule === "no-slop-wrapper-bloat") {
    return formatDiagnostic(
      rule,
      rel,
      firstLine,
      `Supresión de compilador/linter o marcador pendiente detectado (${count} encontrado(s), límite ${allowed}; líneas: ${preview})`,
      "Encubre deuda técnica o errores de tipo sin corregir la causa raíz y contamina el contexto (Unslop)",
      "narrowing/tipos reales sin @ts-ignore/@ts-nocheck, eslint-disable con regla y causa estructural (-- razón), o resolver TODO/FIXME antes de integrar",
    );
  }
  return formatDiagnostic(
    "require-api-wrapper",
    rel,
    firstLine,
    `Ruta API sin wrapper canónico de seguridad (encontrada sin wrapper, límite ${allowed})`,
    "Expone el endpoint sin garantía uniforme de sesión, CSRF, rate-limit ni política Cero-Fuga (Nivel ALTO)",
    "withPublicRead, withSessionRead, withMemberMutation, withActivePaseMutation, withAdminMutation o withCronSecret de apps/web/src/server/api-guards.ts",
  );
}

function parseListArg(raw) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseCliArgs(argv) {
  const opts = {
    files: [],
    strictFiles: [],
    initBaseline: false,
    shrinkBaseline: false,
    rootDir: DEFAULT_ROOT,
    baselinePath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--init-baseline") {
      opts.initBaseline = true;
    } else if (arg === "--shrink-baseline") {
      opts.shrinkBaseline = true;
    } else if (arg === "--files" && i + 1 < argv.length) {
      opts.files.push(...parseListArg(argv[i + 1]));
      i += 1;
    } else if (arg.startsWith("--files=")) {
      opts.files.push(...parseListArg(arg.slice("--files=".length)));
    } else if (arg === "--strict-files" && i + 1 < argv.length) {
      opts.strictFiles.push(...parseListArg(argv[i + 1]));
      i += 1;
    } else if (arg.startsWith("--strict-files=")) {
      opts.strictFiles.push(...parseListArg(arg.slice("--strict-files=".length)));
    } else if (arg === "--root" && i + 1 < argv.length) {
      opts.rootDir = resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--root=")) {
      opts.rootDir = resolve(arg.slice("--root=".length));
    } else if (arg === "--baseline" && i + 1 < argv.length) {
      opts.baselinePath = resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--baseline=")) {
      opts.baselinePath = resolve(arg.slice("--baseline=".length));
    } else {
      throw new Error(`Flag CLI desconocida o incompleta: ${arg}`);
    }
  }

  if (!opts.baselinePath) {
    opts.baselinePath = join(opts.rootDir, DEFAULT_BASELINE_REL);
  }
  return opts;
}

export async function runLint(options) {
  const startedAt = performance.now();
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const baselinePath = options.baselinePath ?? join(rootDir, DEFAULT_BASELINE_REL);
  const initBaseline = Boolean(options.initBaseline);
  const shrinkBaseline = Boolean(options.shrinkBaseline);
  const explicitFiles = options.files ?? [];
  const strictFiles = options.strictFiles ?? [];

  if (initBaseline && shrinkBaseline) {
    throw new Error("No se puede combinar --init-baseline con --shrink-baseline.");
  }
  if ((initBaseline || shrinkBaseline) && (explicitFiles.length > 0 || strictFiles.length > 0)) {
    throw new Error("--init-baseline y --shrink-baseline requieren escaneo completo sin --files ni --strict-files.");
  }

  const targetedMode = explicitFiles.length > 0 || strictFiles.length > 0;
  const strictSet = new Set();
  const filesModeSet = new Set();
  const targetFiles = [];
  const seenFull = new Set();
  const errors = [];

  if (targetedMode) {
    const addTarget = (rawPath, isStrict) => {
      const full = resolve(rootDir, rawPath);
      const rel = toPosix(relative(rootDir, full));
      if (!existsSync(full)) {
        errors.push(
          formatDiagnostic(
            "cli-target",
            rel,
            1,
            `Archivo objetivo inexistente (${rawPath})`,
            "No es posible verificar archivos ausentes en el inner loop",
            "ruta relativa válida desde la raíz del repositorio",
          ),
        );
        return;
      }
      if (isStrict) {
        strictSet.add(rel);
      } else {
        filesModeSet.add(rel);
      }
      if (!seenFull.has(full)) {
        seenFull.add(full);
        targetFiles.push(full);
      }
    };
    for (const f of explicitFiles) addTarget(f, false);
    for (const f of strictFiles) addTarget(f, true);
  } else {
    targetFiles.push(...(await discoverRepoFiles(rootDir)));
  }

  const baseline = initBaseline ? emptyBaseline() : loadBaseline(baselinePath);
  const observedCounts = emptyBaseline();
  const lintableTargets = [];
  for (const full of targetFiles) {
    const rel = toPosix(relative(rootDir, full));
    if (isLintableExt(rel)) {
      lintableTargets.push({ full, rel });
    }
  }

  const fileContents = await readFilesInBatches(lintableTargets.map((item) => item.full));

  for (let idx = 0; idx < lintableTargets.length; idx += 1) {
    const { rel } = lintableTargets[idx];
    const content = fileContents[idx];
    const { immediateErrors, ratchetMeasurements } = evaluateFile(rel, content);
    errors.push(...immediateErrors);

    for (const rule of RATCHET_RULES) {
      const measurement = ratchetMeasurements[rule];
      const count = measurement ? measurement.count : 0;
      if (count > 0) {
        observedCounts.rules[rule][rel] = count;
      }

      if (initBaseline) {
        if (count > 0) {
          baseline.rules[rule][rel] = count;
        }
        continue;
      }

      const forceZero =
        strictSet.has(rel) || (rule === "no-prod-comments" && filesModeSet.has(rel));
      const allowed = forceZero ? 0 : (baseline.rules[rule][rel] ?? 0);

      if (count > allowed) {
        errors.push(buildRatchetDiagnostic(rule, rel, measurement, allowed));
      }
    }
  }

  let baselineSummary = null;
  let shrinkStats = null;

  if (initBaseline) {
    const written = writeBaseline(baselinePath, baseline);
    baselineSummary = {};
    for (const rule of RATCHET_RULES) {
      const entries = Object.values(written.rules[rule]);
      baselineSummary[rule] = {
        files: entries.length,
        total: entries.reduce((acc, n) => acc + n, 0),
      };
    }
  } else if (shrinkBaseline) {
    let entriesRemoved = 0;
    let entriesReduced = 0;
    let totalDelta = 0;
    const updated = emptyBaseline();

    for (const rule of RATCHET_RULES) {
      for (const [rel, prevAllowed] of Object.entries(baseline.rules[rule])) {
        const current = observedCounts.rules[rule][rel] ?? 0;
        if (current === 0) {
          entriesRemoved += 1;
          totalDelta += prevAllowed;
        } else if (current < prevAllowed) {
          updated.rules[rule][rel] = current;
          entriesReduced += 1;
          totalDelta += prevAllowed - current;
        } else {
          updated.rules[rule][rel] = prevAllowed;
        }
      }
    }

    writeBaseline(baselinePath, updated);
    shrinkStats = { entriesRemoved, entriesReduced, totalDelta };
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  return {
    ok: errors.length === 0,
    errors,
    filesChecked: lintableTargets.length,
    elapsedMs,
    baselineSummary,
    shrinkStats,
  };
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const result = await runLint(opts);

  if (result.baselineSummary) {
    const parts = RATCHET_RULES.map(
      (r) => `${r}=${result.baselineSummary[r].total}(${result.baselineSummary[r].files}f)`,
    );
    console.log(`BASELINE [lint-codebase]: ${parts.join(" | ")}`);
  }

  if (result.shrinkStats) {
    const { entriesRemoved, entriesReduced, totalDelta } = result.shrinkStats;
    console.log(
      `SHRINK [lint-codebase]: eliminadas=${entriesRemoved}, reducidas=${entriesReduced}, deuda_eliminada=${totalDelta}`,
    );
  }

  if (!result.ok) {
    console.error(`Errores de lint encontrados (${result.errors.length}):`);
    for (const err of result.errors) {
      console.error(err);
    }
    process.exit(1);
  }

  console.log(
    `OK [lint-codebase]: ${result.filesChecked} archivo(s) verificados en ${result.elapsedMs} ms (0 violaciones).`,
  );
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  await main();
}
