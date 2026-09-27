/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { AlertTriangle, CheckCircle2, RefreshCw, Radio, Webhook, Plug } from 'lucide-react';
import Flash from '@components/ui/Flash';

/**
 * Real UI for GET /api/connectors/health (ConnectorHealthController). Deliberately its own page rather than embedded in
 * per-product ProtocolIntegration — this reports the CENTRAL platform MQTT/webhook adapters' health, a different concept
 * from a specific product's own connection configuration, and conflating the two in one screen would be misleading.
 */
export default function ConnectorHealthPage() {
  const { data, isLoading, isFetching, refetch } = useSimpleQuery(
    'connector-health',
    '/api/connectors/health',
    {},
    { refetchInterval: 15000 }
  );

  const connectors: Record<string, any> = data?.data || {};
  const list = Object.entries(connectors);
  const running = list.filter(([, h]) => h?.connected).length;
  const errors = list.reduce((t, [, h]) => t + (Number(h?.errors_total) || 0), 0);
  const received = list.reduce((t, [, h]) => t + (Number(h?.messages_received_total) || 0), 0);

  return (
    <div className="flex flex-col gap-5 p-1 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Devices</div>
          <h1 className="page-display mt-1">Connector health</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-1">
            The central platform connectors that bring device data in. This is not a single
            product&apos;s own connection settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} aria-hidden /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="glass px-6 py-10 text-center text-sm text-ink-2">
          Loading connector health…
        </div>
      ) : (
        <>
          <div className="glass grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Summary label="Connectors" value={list.length} />
            <Summary label="Running" value={running} tone="ok" />
            <Summary label="Messages received" value={received.toLocaleString()} />
            <Summary
              label="Errors"
              value={errors.toLocaleString()}
              tone={errors ? 'warn' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {list.map(([name, health]) => (
              <ConnectorCard key={name} name={name} health={health} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// CSS capitalize() turns the "mqtt" key into "Mqtt" — wrong for an acronym; an explicit map for the small known set.
const CONNECTOR_LABELS: Record<string, string> = {
  mqtt: 'MQTT',
  webhook: 'Webhook',
};

const ICONS: Record<string, typeof Plug> = { mqtt: Radio, webhook: Webhook };

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={`kpi-value mt-1 ${tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-danger-text' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function ConnectorCard({ name, health }: { name: string; health?: any }) {
  const connected = !!health?.connected;
  const state: string = health?.state || (connected ? 'running' : 'unknown');
  const failed = state === 'error' || !!health?.error;
  const Icon = ICONS[name] ?? Plug;
  const received = Number(health?.messages_received_total) || 0;
  const errs = Number(health?.errors_total) || 0;
  const errorRate = received > 0 ? Math.min(100, (errs / received) * 100) : 0;

  return (
    <section
      className="glass-strong p-6"
      aria-label={`${CONNECTOR_LABELS[name] || name} connector`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`icon-tile grid size-11 place-items-center rounded-2xl bg-brand-wash text-brand ${connected ? 'icon-live' : ''} ${failed ? 'icon-tile--danger' : ''}`}
          >
            <Icon size={20} aria-hidden />
          </span>
          <div>
            <h2 className="card-title">
              {CONNECTOR_LABELS[name] || name.charAt(0).toUpperCase() + name.slice(1)}
            </h2>
            <p className="text-[12.5px] text-ink-2">Central platform connector</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold capitalize ${
            failed
              ? 'bg-danger/10 text-danger-text'
              : connected
                ? 'bg-success/10 text-success'
                : 'bg-surface-3 text-ink-1'
          }`}
        >
          {failed ? (
            <AlertTriangle size={13} aria-hidden />
          ) : connected ? (
            <CheckCircle2 size={13} aria-hidden />
          ) : null}
          {connected && !failed ? 'Running' : state}
        </span>
      </div>

      {health?.error ? (
        <div className="mt-5 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger-text">
          {health.error}
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat label="Messages received" value={health?.messages_received_total} live />
            <Stat label="Messages sent" value={health?.messages_sent_total} />
            <Stat label="Errors" value={health?.errors_total} warn={errs > 0} />
            <Stat label="Reconnects" value={health?.reconnects_total} />
          </dl>

          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between text-[12px] text-ink-2">
              <span>Error rate</span>
              <span className="font-semibold tabular-nums text-ink-0">
                {errorRate === 0 ? '0%' : `${errorRate.toFixed(errorRate < 1 ? 2 : 1)}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(errorRate, connected ? 2 : 0)}%`,
                  background: errorRate > 1 ? 'var(--color-danger)' : 'var(--gradient-brand)',
                }}
              />
            </div>
          </div>
        </>
      )}

      {health?.capabilities && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line-soft pt-4">
          {Object.entries(health.capabilities)
            .filter(([, v]) => v === true)
            .map(([cap]) => (
              <span
                key={cap}
                className="rounded-full bg-brand-wash px-2.5 py-1 text-[11px] font-semibold capitalize text-brand-ink"
              >
                {cap
                  .replace(/^(supports_|is_)/, '')
                  .replace(/_/g, ' ')
                  .trim()}
              </span>
            ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
  live,
}: {
  label: string;
  value?: number | string | null;
  warn?: boolean;
  live?: boolean;
}) {
  const shown = value === undefined || value === null ? '—' : Number(value).toLocaleString();

  return (
    <div>
      <dt className="text-[12px] text-ink-2">{label}</dt>
      <dd className={`kpi-value mt-0.5 ${warn ? 'text-danger-text' : ''}`}>
        {live ? <Flash value={shown} /> : shown}
      </dd>
    </div>
  );
}
