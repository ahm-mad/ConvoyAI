import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Tables from '../components/Tables';
import { get } from '../utils/apiHelper';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DashboardAnalytics {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  active_in_last_24h: number;
  recently_active_devices: any[];
  offline_devices_list: any[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SkeletonCard = () => (
  <div className="bg-surface-1 border-r border-line-soft last:border-r-0 p-3 animate-pulse">
    <div className="h-2.5 bg-surface-3 rounded w-20 mb-3"></div>
    <div className="h-5 bg-surface-3 rounded w-14"></div>
  </div>
);

const SkeletonTableHeader = () => (
  <div className="px-4 py-3 border-b border-line-soft bg-white/50">
    <div className="grid grid-cols-2 gap-x-4">
      <div className="h-2.5 bg-surface-3 rounded w-16 animate-pulse"></div>
      <div className="h-2.5 bg-surface-3 rounded w-20 ml-auto animate-pulse"></div>
    </div>
  </div>
);

const SkeletonTableRow = () => (
  <div className="px-4 py-3 border-b border-line-soft last:border-b-0">
    <div className="grid grid-cols-2 gap-x-4">
      <div className="flex items-center gap-2.5">
        <div className="w-1.5 h-1.5 bg-surface-3 rounded-full animate-pulse"></div>
        <div className="h-2.5 bg-surface-3 rounded w-28 animate-pulse"></div>
      </div>
      <div className="flex justify-end">
        <div className="h-2.5 bg-surface-3 rounded w-20 animate-pulse"></div>
      </div>
    </div>
  </div>
);

const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
  <div className="glass overflow-hidden">
    <SkeletonTableHeader />
    <div>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonTableRow key={index} />
      ))}
    </div>
  </div>
);

const DashboardSkeleton = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen p-4">
      <div className="w-full space-y-6">
        {/* Instrument strip skeleton */}
        <div>
          <div className="h-4 bg-surface-3 rounded w-28 mb-4 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border border-line-soft rounded-md overflow-hidden">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>

        {/* Device Tables Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <div className="h-3.5 bg-surface-3 rounded w-40 mb-3 animate-pulse"></div>
            <SkeletonTable rows={5} />
          </div>

          <div>
            <div className="h-3.5 bg-surface-3 rounded w-32 mb-3 animate-pulse"></div>
            <SkeletonTable rows={4} />
          </div>
        </div>
      </div>
    </div>
  );
};

const Home = () => {
  const { t } = useTranslation();

  // State management
  const [dashboardData, setDashboardData] = useState<DashboardAnalytics>({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    active_in_last_24h: 0,
    recently_active_devices: [],
    offline_devices_list: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard analytics
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await get('/api/dashboard/analytics');

        if (response.error) {
          setError(response.message ?? 'Failed to load dashboard data');
          return;
        }

        if (response.success && response.data) {
          setDashboardData(response.data);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const columns = [
    {
      field: 'name',
      headerName: t('Home.table.device'),
      className: 'text-xs font-mono text-ink-0 font-medium',
    },
    {
      field: 'last_heard',
      headerName: t('Home.table.lastHeard'),
      className: 'text-xs font-mono text-ink-2 text-right',
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderDeviceCell = (value: any, column: any, row: any) => {
    if (column.field === 'name') {
      return (
        <div className="flex items-center gap-2.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${row.last_heard_at ? 'bg-accent-green shadow-[0_0_4px_var(--color-accent-green)]' : 'bg-ink-2'}`}
          ></div>
          <span>{value}</span>
        </div>
      );
    }

    if (column.field === 'last_heard') {
      return <div className="text-right w-full">{value}</div>;
    }

    return value;
  };

  // Loading state - Show skeleton
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="w-full flex items-center justify-center py-20">
          <div className="text-danger text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="w-full space-y-6">
        {/* Instrument strip */}
        <div>
          <h1 className="page-title mb-5">{t('Home.title')}</h1>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="glass p-5">
              <div className="eyebrow mb-2">{t('Home.totalDevices')}</div>
              <div className="kpi-value text-ink-0">{dashboardData.total_devices}</div>
            </div>
            <div className="glass p-5">
              <div className="flex items-center gap-1.5 eyebrow mb-2">
                <div className="w-1.5 h-1.5 bg-accent-green rounded-full shadow-[0_0_4px_var(--color-accent-green)]"></div>
                {t('Home.onlineDevices')}
              </div>
              <div className="kpi-value text-accent-green">{dashboardData.online_devices}</div>
              <div className="card-subtitle mt-1">{t('Home.onlineDevicesHint')}</div>
            </div>
            <div className="glass p-5">
              <div className="flex items-center gap-1.5 eyebrow mb-2">
                <div className="w-1.5 h-1.5 bg-ink-2 rounded-full"></div>
                {t('Home.offlineDevices')}
              </div>
              <div className="kpi-value text-ink-0">{dashboardData.offline_devices}</div>
              <div className="card-subtitle mt-1">{t('Home.offlineDevicesHint')}</div>
            </div>
            <div className="glass p-5">
              <div className="eyebrow mb-2">{t('Home.activeInLast24h')}</div>
              <div className="kpi-value text-accent-cyan">{dashboardData.active_in_last_24h}</div>
              <div className="card-subtitle mt-1">{t('Home.activeInLast24hHint')}</div>
            </div>
          </div>
        </div>

        {/* Device Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Recently Active Devices */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="card-title">{t('Home.recentlyActiveDevices')}</h3>
            </div>
            <div className="glass overflow-hidden">
              <div className="px-4 py-3 border-b border-line-soft bg-white/50">
                <div className="grid grid-cols-2 gap-x-4">
                  <div className="text-[10px] font-medium text-ink-2 uppercase tracking-wider">
                    {t('Home.table.device')}
                  </div>
                  <div className="text-[10px] font-medium text-ink-2 uppercase tracking-wider text-right">
                    {t('Home.table.lastHeard')}
                  </div>
                </div>
              </div>
              <Tables
                data={dashboardData.recently_active_devices}
                columns={columns}
                enablePagination={false}
                className="!rounded-none !border-0 !bg-transparent !shadow-none"
                renderCell={renderDeviceCell}
              />
            </div>
          </div>

          {/* Offline Devices */}
          <div>
            <h3 className="card-title mb-3">{t('Home.offlineDevicesTitle')}</h3>
            <div className="glass overflow-hidden">
              <div className="px-4 py-3 border-b border-line-soft bg-white/50">
                <div className="grid grid-cols-2 gap-x-4">
                  <div className="text-[10px] font-medium text-ink-2 uppercase tracking-wider">
                    {t('Home.table.device')}
                  </div>
                  <div className="text-[10px] font-medium text-ink-2 uppercase tracking-wider text-right">
                    {t('Home.table.lastHeard')}
                  </div>
                </div>
              </div>
              <Tables
                data={dashboardData.offline_devices_list}
                columns={columns}
                enablePagination={true}
                itemsPerPage={4}
                className="!rounded-none !border-0 !bg-transparent !shadow-none"
                renderCell={renderDeviceCell}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
