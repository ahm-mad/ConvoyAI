/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { RefreshCw } from 'lucide-react';

/**
 * Real UI for GET /api/connectors/health, built earlier this session
 * (ConnectorHealthController) and never given a frontend surface until
 * now. Deliberately its own page rather than embedded in per-product
 * ProtocolIntegration.jsx — this reports the CENTRAL platform MQTT/webhook
 * adapters' health, a different concept from a specific product's own
 * connection configuration, and conflating the two in one screen would be
 * misleading.
 */
export default function ConnectorHealthPage() {
  const { data, isLoading, isFetching, refetch } = useSimpleQuery(
    'connector-health',
    '/api/connectors/health'
  );

  const connectors: any = data?.data || {};

  return (
    <div className="flex flex-col p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Connector Health</h1>
          <p className="text-xs text-ink-2 mt-0.5">
            Central platform connectors — not a specific product's own connection settings.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-ink-2 hover:text-ink-0 border border-line rounded-md p-1.5"
          title="Refresh"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && (
        <div className="text-xs text-ink-2 py-8 text-center">Loading connector health…</div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(connectors).map(([name, health]) => (
            <ConnectorCard key={name} name={name} health={health} />
          ))}
        </div>
      )}
    </div>
  );
}

// CSS capitalize() only ever uppercases the first letter, which turns the
// "mqtt" connector key into "Mqtt" — wrong for an acronym. Explicit map
// rather than acronym-detection logic since the connector set is small and
// known (mqtt, webhook today).
const CONNECTOR_LABELS: Record<string, string> = {
  mqtt: 'MQTT',
  webhook: 'Webhook',
};

function ConnectorCard({ name, health }: { name: string; health?: any }) {
  const connected = health?.connected;
  const state = health?.state || 'unknown';

  const dotClass = connected ? 'bg-accent-green' : state === 'error' ? 'bg-danger' : 'bg-ink-2';

  return (
    <div className="glass-strong  p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-ink-0">
          {CONNECTOR_LABELS[name] || name.charAt(0).toUpperCase() + name.slice(1)}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          <span className="text-xs text-ink-2 capitalize">{state}</span>
        </div>
      </div>

      {health?.error ? (
        <div className="text-xs text-danger-text">{health.error}</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <Stat label="Messages received" value={health?.messages_received_total ?? '—'} />
          <Stat label="Messages sent" value={health?.messages_sent_total ?? '—'} />
          <Stat label="Errors" value={health?.errors_total ?? '—'} />
          <Stat label="Reconnects" value={health?.reconnects_total ?? '—'} />
        </div>
      )}

      {health?.capabilities && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line-soft">
          {Object.entries(health.capabilities)
            .filter(([, v]) => v === true)
            .map(([cap]) => (
              <span
                key={cap}
                className="text-[9px] uppercase tracking-wide text-ink-2 bg-surface-2 px-1.5 py-0.5 rounded"
              >
                {cap
                  .replace(/^(supports_|is_)/, '')
                  .replace(/_/g, ' ')
                  .trim()}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label?: ReactNode; value?: ReactNode }) {
  return (
    <div>
      <div className="text-ink-2">{label}</div>
      <div className="font-mono text-ink-0">{value}</div>
    </div>
  );
}
