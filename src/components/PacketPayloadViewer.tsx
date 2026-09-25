import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Formatted, collapsible key/value viewer for a raw packet body — used by the packet-history table's
 * "View Details" row expansion (src/screens/ManageDevice.tsx). Every nested object/array gets its own
 * open/closed toggle, remembered per-node so re-opening the row keeps whatever the user had expanded.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function valueClass(value: unknown): string {
  if (value === null || value === undefined) return 'text-ink-2 italic';
  if (typeof value === 'number') return 'text-accent-cyan';
  if (typeof value === 'boolean') return 'text-accent-green';
  if (typeof value === 'string') return 'text-ink-0';
  return 'text-ink-1';
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function JsonNode({
  label,
  value,
  path,
  depth,
  openPaths,
  onToggle,
}: {
  label: string;
  value: JsonValue;
  path: string;
  depth: number;
  openPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;
  const isOpen = openPaths.has(path);
  const entryCount = isObject
    ? Object.keys(value as object).length
    : isArray
      ? (value as JsonValue[]).length
      : 0;

  if (!isExpandable) {
    return (
      <div
        className="flex items-baseline gap-2 py-0.5 pl-5 hover:bg-surface-2/60 rounded"
        style={{ paddingLeft: `${depth * 16 + 20}px` }}
      >
        <span className="text-xs font-mono text-ink-2 shrink-0">{label}:</span>
        <span className={`text-xs font-mono break-all ${valueClass(value)}`}>
          {formatScalar(value)}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(path)}
        className="flex items-center gap-1.5 py-0.5 w-full text-left hover:bg-surface-2/60 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-ink-2 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
        />
        <span className="text-xs font-mono text-ink-2">{label}</span>
        <span className="text-[10.5px] text-ink-2/70">
          {isArray ? `[${entryCount}]` : `{${entryCount}}`}
        </span>
      </button>
      {isOpen && (
        <div>
          {isObject &&
            Object.entries(value as Record<string, JsonValue>).map(([key, val]) => (
              <JsonNode
                key={key}
                label={key}
                value={val}
                path={`${path}.${key}`}
                depth={depth + 1}
                openPaths={openPaths}
                onToggle={onToggle}
              />
            ))}
          {isArray &&
            (value as JsonValue[]).map((val, i) => (
              <JsonNode
                key={i}
                label={String(i)}
                value={val}
                path={`${path}[${i}]`}
                depth={depth + 1}
                openPaths={openPaths}
                onToggle={onToggle}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default function PacketPayloadViewer({
  payload,
  receivedAt,
}: {
  payload: unknown;
  receivedAt?: string | null;
}) {
  // Top-level object keys start open (the packet is shallow enough that this reads well immediately);
  // nested objects (rxInfo[0], txInfo.modulation, …) start closed so the view isn't overwhelming.
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return new Set(['root', ...Object.keys(payload as object).map(k => `root.${k}`)]);
    }
    return new Set(['root']);
  });

  const toggle = (path: string) => {
    setOpenPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isTopLevelObject = payload && typeof payload === 'object' && !Array.isArray(payload);
  const topEntries = isTopLevelObject ? Object.entries(payload as Record<string, JsonValue>) : [];
  const isEmpty = !payload || (isTopLevelObject && topEntries.length === 0);

  return (
    <div className="px-4 sm:px-6 py-4 border-l-2 border-accent-cyan/40">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-2">
          Full packet payload
        </h4>
        {receivedAt && (
          <span className="text-[10.5px] text-ink-2 font-mono">
            received {new Date(receivedAt.replace(' ', 'T')).toLocaleString()}
          </span>
        )}
      </div>
      <div className="bg-surface-1 border border-line-soft rounded-md p-2 max-h-96 overflow-auto">
        {isEmpty ? (
          <p className="text-xs text-ink-2 italic px-2 py-1">Empty payload.</p>
        ) : isTopLevelObject ? (
          // Skip a redundant outer "payload {N}" wrapper — render top-level keys directly.
          topEntries.map(([key, val]) => (
            <JsonNode
              key={key}
              label={key}
              value={val}
              path={`root.${key}`}
              depth={0}
              openPaths={openPaths}
              onToggle={toggle}
            />
          ))
        ) : (
          <JsonNode
            label="payload"
            value={payload as JsonValue}
            path="root"
            depth={0}
            openPaths={openPaths}
            onToggle={toggle}
          />
        )}
      </div>
    </div>
  );
}
