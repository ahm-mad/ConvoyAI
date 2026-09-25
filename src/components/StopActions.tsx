/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { post } from '@utils/apiHelper';
import { toIsoInstant, toDatetimeLocal } from '@utils/datetime';
import toast from 'react-hot-toast';

type Mode = 'arrive' | 'depart';

const SOURCE_LABEL: Record<string, string> = {
  geofence_auto: 'Sensor',
  manual: 'Manual',
  driver_reported: 'Driver',
};

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

/**
 * Operator controls for one yard stop on the trip timeline (flows/05 step 4): mark it arrived /
 * departed at an editable time, correct an existing time (a reason is then required, and the earlier
 * value stays in the audit history), and read that history. Backend only accepts this while the trip
 * is in progress or completed; its fixed 422 messages are shown verbatim.
 */
export default function StopActions({
  tripId,
  stop,
  tripStatus,
  onChanged,
}: {
  tripId: string | number;
  stop: any;
  tripStatus: string;
  onChanged?: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const events: any[] = Array.isArray(stop.events) ? stop.events : [];
  const canAct = tripStatus === 'in_progress' || tripStatus === 'completed';
  const hasArrival = !!stop.actual_arrival_at;
  const hasDeparture = !!stop.actual_departure_at;
  const replacing = mode === 'arrive' ? hasArrival : hasDeparture;

  const open = (m: Mode) => {
    setMode(m);
    setTime(toDatetimeLocal(new Date(), true));
    setReason('');
  };

  const submit = async () => {
    if (!mode) return;
    if (replacing && !reason.trim()) {
      toast.error(
        `A reason is required to replace an existing ${mode === 'arrive' ? 'arrival' : 'departure'} time.`
      );

      return;
    }

    setSubmitting(true);
    const response: any = await post(
      `/api/trips/${tripId}/stops/${stop.id}/${mode}`,
      {
        occurred_at: toIsoInstant(time),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(
        response?.errors?.reason?.[0] || response?.message || 'Could not update the stop.'
      );

      return;
    }

    toast.success(response?.message || 'Stop updated.');
    setMode(null);
    onChanged?.();
  };

  if (!canAct && events.length === 0) return null;

  return (
    <div className="mt-2">
      {canAct && !mode && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => open('arrive')}
            className="text-caption font-medium btn-brand border border-transparent rounded-full px-2 py-1 hover:bg-surface-2"
          >
            {hasArrival ? 'Correct arrival' : 'Mark arrived'}
          </button>

          {hasArrival && (
            <button
              type="button"
              onClick={() => open('depart')}
              className="text-caption font-medium text-accent-green border border-line rounded-full px-2 py-1 hover:bg-surface-2"
            >
              {hasDeparture ? 'Correct departure' : 'Mark departed'}
            </button>
          )}

          {events.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              className="text-[10px] text-ink-2 hover:text-ink-0 px-1 py-1"
            >
              {showHistory ? 'Hide history' : `History (${events.length})`}
            </button>
          )}
        </div>
      )}

      {canAct && mode && (
        <div className="bg-surface-2 rounded-md p-2.5 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-2">
            {replacing ? 'Correct' : 'Record'} {mode === 'arrive' ? 'arrival' : 'departure'}
          </div>

          <input
            type="datetime-local"
            step={1}
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0"
          />

          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder={replacing ? 'Reason for the correction *' : 'Reason (optional)'}
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 resize-none"
          />

          {replacing && (
            <div className="text-[10px] text-ink-2">
              The earlier time stays in this stop's history; this becomes the effective time.
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode(null)}
              className="flex-1 text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !time || (replacing && !reason.trim())}
              className="flex-1 text-xs btn-brand border border-transparent rounded-full py-1.5 disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {(showHistory || (!canAct && events.length > 0)) && events.length > 0 && (
        <div className="mt-2 space-y-1">
          {events.map(ev => (
            <div key={ev.id} className="text-[10px] text-ink-2 leading-snug">
              <span className="text-ink-1 capitalize">
                {ev.event_type === 'arrive' ? 'Arrived' : 'Departed'}
              </span>{' '}
              {fmt(ev.occurred_at)} · {SOURCE_LABEL[ev.source] || ev.source}
              {ev.recorded_by &&
                ` · ${ev.recorded_by.first_name || ''} ${ev.recorded_by.last_name || ''}`.trimEnd()}
              {ev.reason && <span className="block italic">“{ev.reason}”</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
