/**
 * Ported from `PayloadMapper::map()`/`preview()` (Laravel) — see
 * `migration/reference/deep-dives/ingestion.md` §4 for the byte-for-byte
 * write-up this implements. Pure, stateless: no DB, no module ownership
 * (D-0049) — module 2.1's `/attribute/preference/mapping-preview` is the
 * only caller today; module 2.4 (real ingestion) will reuse this
 * unchanged later, exactly mirroring Laravel's own single-shared-service
 * design (the whole point of `previewMapping()` reusing the real
 * `PayloadMapper` is that the preview can never drift from live ingestion
 * behavior).
 *
 * Algorithm, in order:
 * 1. Top-level string pre-decode: any **top-level** string value in the
 *    raw packet that, trimmed, starts with `{` is attempted as JSON and
 *    replaced in place if it parses. One level only — not recursive, and
 *    only top-level fields (a device nesting a JSON-string two levels
 *    down is not decoded — confirmed boundary, not a bug, per the
 *    deep-dive).
 * 2. Dot-flatten (`Arr::dot` equivalent): non-empty objects/arrays
 *    recurse into `"a.b.c"` keys; anything else (including empty
 *    objects/arrays) becomes a leaf holding that value as-is.
 * 3. Filter the flattened map down to keys present in `attributeKeys` —
 *    this is `cleaned`, what actually gets written to `DeviceValue`.
 *    `flattened` (unfiltered) is what the rules engine's device-rule
 *    path evaluates against — a real, load-bearing distinction the
 *    deep-dive calls out explicitly, not a shortcut.
 */
export interface PayloadMapResult {
  /** Every leaf, dot-flattened, unfiltered — what rule evaluation reads. */
  flattened: Record<string, unknown>;
  /** `flattened`, filtered to `attributeKeys` — what `DeviceValue` stores. */
  cleaned: Record<string, unknown>;
  /** Flattened keys that matched an attribute key (same key set as `cleaned`, ordered). */
  matchedKeys: string[];
  /** Every flattened key, matched or not — for "what's actually in this payload." */
  availableKeys: string[];
}

function preDecodeTopLevelJsonStrings(rawPacket: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...rawPacket };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      result[key] = JSON.parse(trimmed);
    } catch {
      // Not valid JSON — leave the original string value in place.
    }
  }
  return result;
}

function isNonEmptyObjectOrArray(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

function dotFlatten(value: unknown, prefix: string, out: Record<string, unknown>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      dotFlattenEntry(String(index), item, prefix, out);
    });
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    dotFlattenEntry(key, item, prefix, out);
  }
}

function dotFlattenEntry(
  key: string,
  value: unknown,
  prefix: string,
  out: Record<string, unknown>
): void {
  const path = prefix ? `${prefix}.${key}` : key;
  if (isNonEmptyObjectOrArray(value)) {
    dotFlatten(value, path, out);
  } else {
    out[path] = value;
  }
}

export function mapPayload(
  rawPacket: Record<string, unknown>,
  attributeKeys: string[]
): PayloadMapResult {
  const preDecoded = preDecodeTopLevelJsonStrings(rawPacket);

  const flattened: Record<string, unknown> = {};
  dotFlatten(preDecoded, '', flattened);

  const attributeKeySet = new Set(attributeKeys);
  const cleaned: Record<string, unknown> = {};
  const matchedKeys: string[] = [];
  for (const key of Object.keys(flattened)) {
    if (attributeKeySet.has(key)) {
      cleaned[key] = flattened[key];
      matchedKeys.push(key);
    }
  }

  return { flattened, cleaned, matchedKeys, availableKeys: Object.keys(flattened) };
}
