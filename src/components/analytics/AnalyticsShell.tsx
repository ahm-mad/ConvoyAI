import type { ReactNode } from 'react';
import PageScroller from './PageScroller';
import FilterBar from './FilterBar';
import ScopeBar from './ScopeBar';
import type { AnalyticsScope, ScopeField } from './useAnalyticsScope';
import type { useAnalyticsFilters } from './useAnalyticsFilters';

/**
 * Frame of every Fleet analytics page: back link, title, page switcher (the range / compare filters are
 * carried across pages in the URL), the shared filter bar, and the page's own scroll container.
 * Preview navigation — the existing Fleet tab bar is untouched until the owner approves the restructure.
 */
export default function AnalyticsShell({
  title,
  subtitle,
  filters,
  onRefresh,
  fetching,
  updatedAt,
  comparable = true,
  scope,
  scopeHints,
  intervalControl = false,
  children,
}: {
  title: string;
  subtitle: string;
  /** Omit on point-in-time pages (no date range applies) — the filter bar and range text are dropped. */
  filters?: ReturnType<typeof useAnalyticsFilters>;
  onRefresh?: () => void;
  fetching?: boolean;
  updatedAt?: string;
  /** Set false on pages whose data cannot compare two periods: no Compare switch, no "compared with" text. */
  comparable?: boolean;
  /** The page's scope filters (vehicle category / vehicle / yard / driver): a row under the date range. */
  scope?: AnalyticsScope;
  /** What each scope field means on this page. */
  scopeHints?: Partial<Record<ScopeField, string>>;
  /** Show the "group by" (day / week / month) control — for pages whose charts are per-period series. */
  intervalControl?: boolean;
  children: ReactNode;
}) {
  const f = filters;

  return (
    <PageScroller>
      <div className="w-full pt-3 pb-12 flex flex-col gap-6">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="text-[13px] text-ink-1 mt-1">
            {subtitle}
            {f ? ` · ${f.label}` : ''}
            {comparable && f?.compare ? ` · compared ${f.prevLabel.replace('vs ', 'with ')}` : ''}
          </p>
        </div>

        {f && (
          <FilterBar
            preset={f.preset}
            from={f.from}
            to={f.to}
            today={f.today}
            compare={f.compare}
            prevLabel={f.prevLabel}
            timezone={f.timezone}
            onPreset={f.setPreset}
            onCustom={f.setCustom}
            onCompare={f.setCompare}
            compareMode={f.compareMode}
            onCompareMode={f.setCompareMode}
            interval={
              intervalControl
                ? { value: f.intervalChoice, options: f.intervalOptions, onChange: f.setInterval }
                : undefined
            }
            hideCompare={!comparable}
            onRefresh={onRefresh ?? (() => undefined)}
            fetching={!!fetching}
            updatedAt={updatedAt}
          />
        )}

        {scope && <ScopeBar scope={scope} hints={scopeHints} />}

        {children}
      </div>
    </PageScroller>
  );
}
