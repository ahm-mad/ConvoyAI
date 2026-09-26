'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@contexts/UserContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useFleetSettings } from '@hooks/useFleetSettings';

const clock = (tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return '';
  }
};

/** Slim workspace status strip under every page: company, company timezone + clock, units, connection. */
export default function StatusBar() {
  const { user } = useUser();
  const { settings, error, isLoading } = useFleetSettings();
  const company = useSimpleQuery<any>(
    'companyData',
    `/api/companies/${user?.company_id}`,
    {},
    {
      enabled: !!user?.company_id,
      staleTime: 300_000,
    }
  );
  const tz = settings?.timezone ?? 'UTC';
  const [now, setNow] = useState(() => clock(tz));

  useEffect(() => {
    setNow(clock(tz));
    const t = setInterval(() => setNow(clock(tz)), 30_000);

    return () => clearInterval(t);
  }, [tz]);

  const online = !error && !isLoading;

  return (
    <footer className="status-bar">
      <div className="status-bar__inner">
        <span className="status-bar__item">
          <span className={`status-dot ${online ? 'status-dot--ok' : 'status-dot--warn'}`} />
          {isLoading ? 'Connecting…' : online ? 'All systems operational' : 'Reduced service'}
        </span>
        {company.data?.data?.name && (
          <span className="status-bar__item">Workspace · {company.data.data.name}</span>
        )}
        {settings && (
          <span className="status-bar__item">
            {tz} · {now}
          </span>
        )}
        {settings && (
          <span className="status-bar__item">Units · {settings.unit_system ?? 'metric'}</span>
        )}
        <span className="status-bar__spacer" />
        <Link href="/documentation" className="status-bar__link">
          Documentation
        </Link>
        <span className="status-bar__item">
          <kbd className="status-bar__kbd">⌘K</kbd> search
        </span>
        <span className="status-bar__item">
          <kbd className="status-bar__kbd">?</kbd> shortcuts
        </span>
        <span className="status-bar__item">ConvoyAI 1.0</span>
      </div>
    </footer>
  );
}
