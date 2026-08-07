// Generates the deterministic browser-safe ISO 4217 registry used by CMS money fields.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml";
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/api/src/registry/iso-4217.generated.ts",
);

/** Downloads the authoritative registry without introducing a runtime network dependency. */
async function loadRegistryXml() {
  const response = await fetch(SOURCE_URL, {
    headers: { accept: "application/xml" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`ISO 4217 registry download failed with HTTP ${response.status}.`);
  }
  return response.text();
}

/** Parses and deduplicates active alphabetic codes with numeric minor units. */
function parseRegistry(xml) {
  const publishedMatch = /<ISO_4217\s+Pblshd="([0-9]{4}-[0-9]{2}-[0-9]{2})">/u.exec(xml);
  if (!publishedMatch?.[1]) throw new Error("ISO 4217 registry is missing its publication date.");

  const currencies = new Map();
  for (const entryMatch of xml.matchAll(/<CcyNtry>([\s\S]*?)<\/CcyNtry>/gu)) {
    const fragment = entryMatch[1] ?? "";
    const codeMatch = /<Ccy>([A-Z]{3})<\/Ccy>/u.exec(fragment);
    const minorMatch = /<CcyMnrUnts>([^<]+)<\/CcyMnrUnts>/u.exec(fragment);
    if (!codeMatch?.[1] || !minorMatch?.[1]) continue;

    const code = codeMatch[1];
    const minorUnitText = minorMatch[1].trim();
    if (code === "XTS" || code === "XXX" || !/^\d+$/u.test(minorUnitText)) continue;

    const minorUnit = Number(minorUnitText);
    if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 18) {
      throw new Error(`ISO 4217 currency ${code} has unsupported minor unit ${minorUnitText}.`);
    }

    const existing = currencies.get(code);
    if (existing !== undefined && existing !== minorUnit) {
      throw new Error(`ISO 4217 currency ${code} has inconsistent minor units.`);
    }
    currencies.set(code, minorUnit);
  }

  if (currencies.size < 100) throw new Error("ISO 4217 registry parsed too few currencies.");
  return { publishedAt: publishedMatch[1], currencies };
}

/** Renders a deterministic TypeScript artifact with no generated runtime logic. */
function renderRegistry(registry) {
  const codes = [...registry.currencies.keys()].sort();
  const rows = [];
  for (const code of codes) {
    rows.push(`  ${code}: ${registry.currencies.get(code)},`);
  }

  return `// Generated ISO 4217 currency/minor-unit profile for CMS money validation.\n// Source: ${SOURCE_URL}\n// Published: ${registry.publishedAt}\n\nexport const iso4217RegistryProfile = "iso-4217@${registry.publishedAt}" as const;\n\nexport const iso4217MinorUnits = {\n${rows.join("\n")}\n} as const;\n\nexport type Iso4217CurrencyCode = keyof typeof iso4217MinorUnits;\n`;
}

const registry = parseRegistry(await loadRegistryXml());
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, renderRegistry(registry), "utf8");
console.log(
  `Updated ${outputPath} with ${registry.currencies.size} currencies from ${registry.publishedAt}.`,
);
