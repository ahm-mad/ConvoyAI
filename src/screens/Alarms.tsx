/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { post } from '@utils/apiHelper';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const STATE_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'cleared', label: 'Cleared' },
];

export default function Alarms() {
  const [state, setState] = useState('active');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useSimpleQuery(`alarms-${state}-${page}`, '/api/alarms', {
    state,
    page,
    per_page: 20,
  });

  const alarms: any[] = data?.data?.data || [];
  const pagination: any = data?.data || {};

  const handleAcknowledge = async (alarmId: any) => {
    const response = await post(`/api/alarms/${alarmId}/acknowledge`, {}, {}, false);
    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not acknowledge this alarm.');

      return;
    }
    toast.success('Alarm acknowledged.');
    queryClient.invalidateQueries({ queryKey: [`alarms-active-${page}`] });
    queryClient.invalidateQueries({ queryKey: [`alarms-acknowledged-${page}`] });
  };

  return (
    <div className="flex flex-col p-5 h-full">
      <div className="mb-4">
        <h1 className="text-[15px] font-semibold text-ink-0 font-display">Alarms</h1>
        <p className="text-xs text-ink-2 mt-0.5">
          Persistent condition state — independent of whatever notifications a rule also sends.
        </p>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-line">
        {STATE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setState(tab.key);
              setPage(1);
            }}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              state === tab.key
                ? 'border-accent-cyan text-ink-0'
                : 'border-transparent text-ink-2 hover:text-ink-1'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-xs text-ink-2 py-8 text-center">Loading alarms…</div>}

      {!isLoading && alarms.length === 0 && (
        <div className="text-xs text-ink-2 py-12 text-center border border-dashed border-line rounded-md">
          No {state} alarms.
        </div>
      )}

      {!isLoading && alarms.length > 0 && (
        <div className="space-y-2 overflow-y-auto">
          {alarms.map(alarm => (
            <AlarmRow key={alarm.id} alarm={alarm} onAcknowledge={handleAcknowledge} />
          ))}
        </div>
      )}

      {pagination.last_page > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-xs text-ink-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-2 py-1 border border-line rounded disabled:opacity-40"
          >
            Previous
          </button>
          <span className="font-mono text-ink-2">
            Page {pagination.current_page || page} of {pagination.last_page}
          </span>
          <button
            disabled={page >= pagination.last_page}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 border border-line rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function AlarmRow({ alarm, onAcknowledge }: { alarm?: any; onAcknowledge: (id: any) => void }) {
  const stateIcon = (
    {
      active: <AlertTriangle size={15} className="text-danger" />,
      acknowledged: <Clock size={15} className="text-warning" />,
      cleared: <CheckCircle2 size={15} className="text-accent-green" />,
    } as Record<string, ReactNode>
  )[alarm.state];

  return (
    <div className="flex items-center justify-between bg-surface-1 border border-line-soft rounded-md px-3.5 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        {stateIcon}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-0 truncate">
            {alarm.rule?.name || 'Unknown rule'}
          </div>
          <div className="text-[11px] text-ink-2 truncate">
            {alarm.device?.name || alarm.device?.device_unique_identifier || 'Unknown device'} ·
            triggered {new Date(alarm.triggered_at).toLocaleString()}
          </div>
        </div>
      </div>
      {alarm.state === 'active' && (
        <button
          onClick={() => onAcknowledge(alarm.id)}
          className="text-xs font-medium text-accent-cyan border border-line rounded-md px-3 py-1.5 hover:bg-surface-2 transition-colors flex-shrink-0"
        >
          Acknowledge
        </button>
      )}
      {alarm.state === 'acknowledged' && alarm.acknowledged_by && (
        <span className="text-[11px] text-ink-2 flex-shrink-0">
          by {alarm.acknowledged_by?.first_name || 'someone'}
        </span>
      )}
    </div>
  );
}
