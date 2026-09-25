// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// TripDetailModal.jsx
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import React, { useState } from 'react';
import {
  X,
  Truck,
  User,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Building2,
  Pencil,
} from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { post, del } from '@utils/apiHelper';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateFleetQueries } from '@utils/fleetCache';
import StopActions from '@components/StopActions';
import TripRouteMap from '@components/TripRouteMap';
import TripEditForm from '@components/TripEditForm';
import AuditLine from '@components/AuditLine';

export default function TripDetailModal({ tripId, onListChanged }) {
  const { closeModal } = useModal();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('overview');

  // While a trip is in progress the sensor (geofence enter/exit) can fill stops and flag "destination
  // reached" on its own; refresh on a slow 2-min safety poll; realtime `trip:update` (flows/05 step 6) refetches it live.
  const { data, isLoading, refetch } = useSimpleQuery(
    `trip-${tripId}`,
    `/api/trips/${tripId}`,
    {},
    {
      refetchInterval: query =>
        (query.state.data as any)?.data?.status === 'in_progress' ? 120000 : false,
    }
  );

  const trip = data?.success ? data.data : null;

  // Keep this modal and the Trips list behind it in step after any change.
  const handleChanged = () => {
    refetch();
    onListChanged?.();
  };

  return (
    <div className="glass-strong  w-[600px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">
            {trip ? trip.trip_reference || `Trip #${trip.id}` : 'Trip Detail'}
          </h2>

          <p className="text-xs text-ink-2 mt-0.5 capitalize">
            {trip?.status?.replace('_', ' ') || 'Loading…'}
            {trip?.purpose ? ` · ${trip.purpose}` : ''}
          </p>
        </div>

        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0">
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-1 px-5 pt-2 border-b border-line">
        {['overview', 'timeline', 'map'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-medium px-3 py-1.5 border-b-2 -mb-px capitalize ${
              tab === t ? 'text-ink-0 border-accent-cyan' : 'text-ink-2 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && <div className="text-xs text-ink-2 text-center py-8">Loading…</div>}

        {!isLoading && trip && tab === 'overview' && (
          <OverviewTab
            trip={trip}
            onChanged={handleChanged}
            onDeleted={() => {
              // The trip no longer exists (and backend sends no socket event for a delete):
              // close this modal and refresh every list that could show it.
              invalidateFleetQueries(queryClient);
              onListChanged?.();
              closeModal();
            }}
          />
        )}

        {!isLoading && trip && tab === 'timeline' && (
          <TimelineTab trip={trip} onChanged={handleChanged} />
        )}

        {!isLoading && trip && tab === 'map' && (
          <TripRouteMap tripId={trip.id} tripStatus={trip.status} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ trip, onChanged, onDeleted }) {
  const u = useUnits();
  const [showComplete, setShowComplete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [editing, setEditing] = useState(false);

  const [odometerEnd, setOdometerEnd] = useState(toDisplayString(u.distance, trip.odometer_end_km));

  const [fuelUsed, setFuelUsed] = useState(toDisplayString(u.volume, trip.fuel_used_liters));

  const [completeNotes, setCompleteNotes] = useState(trip.notes || '');

  const [cancellationReason, setCancellationReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const driverName = trip.driver
    ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim()
    : null;

  const handleStart = async () => {
    setSubmitting(true);

    const response = await post(`/api/trips/${trip.id}/start`, {}, {}, false);

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not start trip.');
      return;
    }

    toast.success('Trip started.');
    onChanged?.();
  };

  const handleComplete = async () => {
    setSubmitting(true);

    const response = await post(
      `/api/trips/${trip.id}/complete`,
      {
        // Optional (owner decision, flows/04 §12.6): backend falls back to GPS distance and only
        // updates the vehicle's odometer when one is given.
        // Typed in the company's unit system; the API takes km and litres.
        odometer_end_km: odometerEnd !== '' ? toMetric(u.distance, odometerEnd) : null,
        fuel_used_liters: fuelUsed ? toMetric(u.volume, fuelUsed) : null,
        notes: completeNotes.trim() || null,
      },
      {},
      false
    );

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not complete trip.');
      return;
    }

    toast.success('Trip completed.');
    setShowComplete(false);
    onChanged?.();
  };

  // DELETE /trips/{id} — only while planned (flows/05 §8); removes its planned stops. No undo.
  const handleDelete = async () => {
    setSubmitting(true);

    const response = await del(`/api/trips/${trip.id}`, {}, false);

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not delete trip.');
      setConfirmDelete(false);
      return;
    }

    toast.success(response?.message || 'Trip deleted.');
    onDeleted?.();
  };

  const handleCancel = async () => {
    if (!cancellationReason.trim()) return;

    setSubmitting(true);

    const response = await post(
      `/api/trips/${trip.id}/cancel`,
      {
        cancellation_reason: cancellationReason.trim(),
      },
      {},
      false
    );

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not cancel trip.');
      return;
    }

    toast.success('Trip cancelled.');
    setShowCancel(false);
    onChanged?.();
  };

  // Only planned / in-progress trips are editable (PUT /trips/{id}).
  const canEdit = trip.status === 'planned' || trip.status === 'in_progress';

  if (editing && canEdit) {
    return (
      <TripEditForm
        trip={trip}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged?.();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <StatusBanner status={trip.status} />
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 flex items-center gap-1 text-xs btn-brand border border-transparent rounded-full px-2.5 py-1.5 hover:bg-surface-2"
          >
            <Pencil size={11} />
            Edit trip
          </button>
        )}
      </div>

      <AuditLine record={trip} className="text-[10px] text-ink-2 -mt-2 mb-3" />

      {trip.status === 'in_progress' && trip.awaiting_completion && (
        <div className="flex items-center justify-between gap-3 text-xs bg-accent-green/10 text-accent-green rounded-md px-3 py-2 mb-4">
          <span>
            Destination reached
            {trip.destination_reached_at
              ? ` at ${new Date(trip.destination_reached_at).toLocaleTimeString()}`
              : ''}
            . Confirm to complete the trip.
          </span>
          <button
            type="button"
            onClick={() => setShowComplete(true)}
            className="shrink-0 border border-accent-green/40 rounded-md px-2.5 py-1 hover:bg-accent-green/10"
          >
            Confirm completion
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <InfoCard
          label="Vehicle"
          value={trip.vehicle?.name || 'Not assigned'}
          icon={<Truck size={13} />}
        />

        <InfoCard label="Driver" value={driverName || 'Not assigned'} icon={<User size={13} />} />

        <InfoCard label="Purpose" value={trip.purpose || 'Not set'} />

        <InfoCard
          label="Planned Distance"
          value={formatQty(u.distance, trip.planned_distance_km, 1, 'Not set')}
        />
      </div>

      <SectionTitle title="Route" />

      <div className="bg-surface-2 rounded-md p-3 mb-4">
        <RoutePoint
          label="Origin"
          address={trip.origin_address}
          latitude={trip.origin_latitude}
          longitude={trip.origin_longitude}
        />

        <div className="border-l border-line h-4 ml-[5px]" />

        <RoutePoint
          label="Destination"
          address={trip.destination_address}
          latitude={trip.destination_latitude}
          longitude={trip.destination_longitude}
        />
      </div>

      {/* PLANNED YARDS */}
      <PlannedYardsSection yards={trip.planned_yards || []} />

      <SectionTitle title="Schedule" />

      <div className="grid grid-cols-2 gap-2 mb-4">
        <InfoCard
          label="Planned Start"
          value={formatDateTime(trip.planned_start_at)}
          icon={<Clock size={12} />}
        />

        <InfoCard
          label="Planned End"
          value={formatDateTime(trip.planned_end_at)}
          icon={<Clock size={12} />}
        />

        <InfoCard label="Actual Start" value={formatDateTime(trip.actual_start_at)} />

        <InfoCard label="Actual End" value={formatDateTime(trip.actual_end_at)} />
      </div>

      {(trip.status === 'completed' ||
        trip.actual_distance_km != null ||
        trip.fuel_used_liters != null ||
        trip.odometer_start_km != null ||
        trip.odometer_end_km != null) && (
        <>
          <SectionTitle title="Trip Results" />

          <div className="grid grid-cols-2 gap-2 mb-4">
            <InfoCard
              label="Actual Distance"
              value={formatQty(u.distance, trip.actual_distance_km, 1, 'Not recorded')}
            />

            <InfoCard
              label="Duration"
              value={
                trip.actual_duration_minutes != null
                  ? formatDuration(trip.actual_duration_minutes)
                  : 'Not recorded'
              }
            />

            <InfoCard
              label="Fuel Used"
              value={formatQty(u.volume, trip.fuel_used_liters, 1, 'Not recorded')}
            />

            <InfoCard
              label="Odometer"
              value={
                trip.odometer_end_km != null
                  ? `${trip.odometer_start_km != null ? toDisplayString(u.distance, trip.odometer_start_km, 1) : '—'} → ${formatQty(u.distance, trip.odometer_end_km, 1)}`
                  : 'Not recorded'
              }
            />
          </div>
        </>
      )}

      {trip.cancellation_reason && (
        <div className="bg-danger/10 border border-danger/20 rounded-md p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-danger mb-1">
            Cancellation Reason
          </div>

          <div className="text-xs text-ink-1">{trip.cancellation_reason}</div>
        </div>
      )}

      {trip.notes && (
        <>
          <SectionTitle title="Notes" />

          <div className="bg-surface-2 rounded-md p-3 mb-4 text-[11px] text-ink-1">
            {trip.notes}
          </div>
        </>
      )}

      {trip.status === 'planned' && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleStart}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-accent-cyan border border-accent-cyan/40 bg-accent-cyan/10 rounded-md py-2 disabled:opacity-40"
          >
            <Play size={12} />
            {submitting ? 'Starting…' : 'Start Trip'}
          </button>

          <button
            onClick={() => setShowCancel(v => !v)}
            disabled={submitting}
            className="text-xs text-danger border border-danger/30 bg-danger/10 rounded-full px-4 py-2 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      {trip.status === 'in_progress' && (
        <div className="mt-4">
          {!showComplete && !showCancel && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowComplete(true)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs text-accent-green border border-accent-green/40 bg-accent-green/10 rounded-md py-2"
              >
                <CheckCircle2 size={12} />
                Complete Trip
              </button>

              <button
                onClick={() => setShowCancel(true)}
                disabled={submitting}
                className="text-xs text-danger border border-danger/30 bg-danger/10 rounded-full px-4 py-2"
              >
                Cancel
              </button>
            </div>
          )}

          {showComplete && (
            <div className="bg-surface-2 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
                Complete Trip
              </div>

              <input
                value={odometerEnd}
                onChange={e => setOdometerEnd(e.target.value)}
                placeholder={`Ending odometer (${u.distance.label}, optional)`}
                type="number"
                step="any"
                className="w-full glass-strong  px-2.5 py-1.5 text-xs text-ink-0 mb-2"
              />

              <input
                value={fuelUsed}
                onChange={e => setFuelUsed(e.target.value)}
                placeholder={`Fuel used (${u.volume.label === 'L' ? 'liters' : 'gallons'})`}
                type="number"
                step="any"
                className="w-full glass-strong  px-2.5 py-1.5 text-xs text-ink-0 mb-2"
              />

              <textarea
                value={completeNotes}
                onChange={e => setCompleteNotes(e.target.value)}
                placeholder="Completion notes"
                rows={2}
                className="w-full glass-strong  px-2.5 py-1.5 text-xs text-ink-0 mb-2 resize-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowComplete(false)}
                  className="flex-1 text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full py-1.5"
                >
                  Back
                </button>

                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="flex-1 text-xs text-accent-green border border-line bg-white hover:bg-surface-2 rounded-full py-1.5 disabled:opacity-40"
                >
                  {submitting ? 'Saving…' : 'Complete'}
                </button>
              </div>
            </div>
          )}

          {showCancel && (
            <CancelForm
              value={cancellationReason}
              onChange={setCancellationReason}
              onCancel={() => setShowCancel(false)}
              onSubmit={handleCancel}
              submitting={submitting}
            />
          )}
        </div>
      )}

      {trip.status === 'planned' && (
        <div className="mt-3 pt-3 border-t border-line-soft">
          {confirmDelete ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-ink-1">
                Delete this trip and its planned stops? This can't be undone — cancel it instead to
                keep a record.
              </span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="text-caption font-medium text-danger border border-danger/40 bg-danger/10 rounded-full px-2.5 py-1 disabled:opacity-40"
              >
                {submitting ? 'Deleting…' : 'Delete trip'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-soft">
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[11px] text-ink-2 hover:text-danger"
            >
              Delete trip…
            </button>
          )}
        </div>
      )}

      {trip.status === 'planned' && showCancel && (
        <div className="mt-2">
          <CancelForm
            value={cancellationReason}
            onChange={setCancellationReason}
            onCancel={() => setShowCancel(false)}
            onSubmit={handleCancel}
            submitting={submitting}
          />
        </div>
      )}
    </div>
  );
}

function PlannedYardsSection({ yards }) {
  return (
    <>
      <SectionTitle title={`Planned Yards${yards.length ? ` (${yards.length})` : ''}`} />

      {yards.length === 0 ? (
        <div className="bg-surface-2 rounded-md p-3 mb-4 text-[11px] text-ink-2 italic">
          No planned yards for this trip.
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {yards
            .slice()
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
            .map((plannedYard, index) => (
              <PlannedYardCard
                key={plannedYard.id || `${plannedYard.yard_id}-${index}`}
                plannedYard={plannedYard}
                index={index}
              />
            ))}
        </div>
      )}
    </>
  );
}

function PlannedYardCard({ plannedYard, index }) {
  const yard = plannedYard.yard;

  const hasActualArrival = !!plannedYard.actual_arrival_at;
  const hasActualDeparture = !!plannedYard.actual_departure_at;

  return (
    <div className="bg-surface-2 rounded-md p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-accent-cyan/10 flex items-center justify-center text-accent-cyan shrink-0">
            <Building2 size={12} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-ink-2">
                Stop {plannedYard.sequence || index + 1}
              </span>

              <span className="text-sm text-ink-0 truncate">
                {yard?.name || `Yard #${plannedYard.yard_id}`}
              </span>
            </div>

            {plannedYard.stop_purpose && (
              <div className="text-[11px] text-ink-2 mt-0.5 capitalize">
                Purpose: {plannedYard.stop_purpose}
              </div>
            )}

            {yard?.address && (
              <div className="flex items-center gap-1 text-[10px] text-ink-2 mt-1">
                <MapPin size={10} />
                {yard.address}
              </div>
            )}
          </div>
        </div>

        <span
          className={`text-[10px] px-1.5 py-0.5 rounded capitalize shrink-0 ${
            plannedYard.status === 'completed'
              ? 'bg-accent-green/10 text-accent-green'
              : plannedYard.status === 'in_progress'
                ? 'bg-accent-cyan/10 text-accent-cyan'
                : plannedYard.status === 'missed'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-surface-3 text-ink-2'
          }`}
        >
          {plannedYard.status || 'planned'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <YardTimeCard label="Planned Arrival" value={plannedYard.planned_arrival_at} />

        <YardTimeCard label="Planned Departure" value={plannedYard.planned_departure_at} />

        <YardTimeCard
          label="Actual Arrival"
          value={plannedYard.actual_arrival_at}
          emptyLabel="Awaiting IoT data"
          actual
          recorded={hasActualArrival}
        />

        <YardTimeCard
          label="Actual Departure"
          value={plannedYard.actual_departure_at}
          emptyLabel="Awaiting IoT data"
          actual
          recorded={hasActualDeparture}
        />
      </div>

      {plannedYard.dwell_time_minutes != null && (
        <div className="mt-2 pt-2 border-t border-line text-[10px] text-ink-2">
          Dwell time:{' '}
          <span className="text-ink-1">{formatDuration(plannedYard.dwell_time_minutes)}</span>
        </div>
      )}

      {plannedYard.actual_source && (
        <div className="mt-1 text-[10px] text-ink-2">
          Actual times source:{' '}
          <span className="text-ink-1 capitalize">
            {plannedYard.actual_source.replace('_', ' ')}
          </span>
        </div>
      )}

      {plannedYard.notes && (
        <div className="mt-2 text-[10px] text-ink-2">
          Notes: <span className="text-ink-1">{plannedYard.notes}</span>
        </div>
      )}
    </div>
  );
}

function YardTimeCard({ label, value, emptyLabel = 'Not set', actual = false, recorded = false }) {
  return (
    <div className="bg-surface-1 rounded-md p-2">
      <div className="text-[9px] text-ink-2 uppercase flex items-center gap-1">
        <Clock size={10} />
        {label}
      </div>

      <div
        className={`text-[10px] mt-1 ${
          actual && recorded ? 'text-accent-green' : actual ? 'text-ink-2 italic' : 'text-ink-0'
        }`}
      >
        {value ? formatDateTime(value) : emptyLabel}
      </div>
    </div>
  );
}

function TimelineTab({ trip, onChanged }) {
  const plannedYards = Array.isArray(trip.planned_yards)
    ? [...trip.planned_yards].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    : [];

  /*
   * Journey:
   *
   * Origin
   *   ↓
   * Yard 1
   *   ↓
   * Yard 2
   *   ↓
   * Destination
   *
   * We determine the current stage from the actual timestamps.
   */

  const stages = [];

  // Origin
  stages.push({
    type: 'origin',
    key: 'origin',
    label: 'Origin',
    address: trip.origin_address,
    plannedArrival: trip.planned_start_at,
    plannedDeparture: trip.planned_start_at,
    actualArrival: null,
    actualDeparture: trip.actual_start_at,
    status: getOriginStatus(trip),
  });

  // Planned yards
  plannedYards.forEach((yardStop, index) => {
    stages.push({
      type: 'yard',
      key: `yard-${yardStop.id || index}`,
      label: yardStop.yard?.name || `Yard ${index + 1}`,
      address: yardStop.yard?.address,
      sequence: yardStop.sequence || index + 1,
      stopPurpose: yardStop.stop_purpose,
      plannedArrival: yardStop.planned_arrival_at,
      plannedDeparture: yardStop.planned_departure_at,
      actualArrival: yardStop.actual_arrival_at,
      actualDeparture: yardStop.actual_departure_at,
      dwellTime: yardStop.dwell_time_minutes,
      status: yardStop.status || 'planned',
      actualSource: yardStop.actual_source,
      stop: yardStop,
    });
  });

  // Destination
  stages.push({
    type: 'destination',
    key: 'destination',
    label: 'Destination',
    address: trip.destination_address,
    plannedArrival: trip.planned_end_at,
    plannedDeparture: null,
    // Only the moment the vehicle actually reached the destination (sensor, flows/05 §6). A trip
    // that was completed without ever getting there must not show its completion time as an arrival.
    actualArrival: trip.destination_reached_at,
    actualDeparture: null,
    status: getDestinationStatus(trip),
  });

  const currentStageIndex = getCurrentStageIndex(stages, trip);

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-3">Trip Journey</div>

      <div className="space-y-0">
        {stages.map((stage, index) => {
          const isCurrent = index === currentStageIndex;
          const isPast = index < currentStageIndex;

          return (
            <JourneyStage
              key={stage.key}
              stage={stage}
              index={index}
              total={stages.length}
              isCurrent={isCurrent}
              isPast={isPast}
              tripId={trip.id}
              tripStatus={trip.status}
              onChanged={onChanged}
            />
          );
        })}
      </div>

      {trip.created_by && typeof trip.created_by === 'object' && (
        <div className="mt-4 pt-3 border-t border-line text-[10px] text-ink-2">
          Created by:{' '}
          <span className="text-ink-1">
            {trip.created_by.first_name} {trip.created_by.last_name}
          </span>
        </div>
      )}
    </div>
  );
}

function JourneyStage({ stage, index, total, isCurrent, isPast, tripId, tripStatus, onChanged }) {
  const isYard = stage.type === 'yard';
  const isOrigin = stage.type === 'origin';
  const isDestination = stage.type === 'destination';

  // A yard stop counts as completed only with evidence (a departure, or arrival once the trip
  // has moved past it) — not merely because a later stage is current, which used to mark
  // skipped stops "Completed" with no times.
  const completed = isYard
    ? !!(
        stage.actualDeparture ||
        stage.status === 'departed' ||
        stage.status === 'completed' ||
        (isPast && stage.actualArrival)
      )
    : !!(stage.actualArrival || stage.actualDeparture || stage.status === 'completed' || isPast);
  const missed = isYard && stage.status === 'missed';

  let icon;

  if (isDestination) {
    icon = <CheckCircle2 size={11} />;
  } else if (isYard) {
    icon = <span className="text-[10px]">Y</span>;
  } else {
    icon = <Play size={10} />;
  }

  return (
    <div className="flex gap-3">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        <div
          className={`
            w-7 h-7 rounded-full flex items-center justify-center shrink-0
            border
            ${
              isCurrent
                ? 'bg-accent-cyan/15 border-accent-cyan text-accent-cyan'
                : completed
                  ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                  : 'bg-surface-2 border-line text-ink-2'
            }
          `}
        >
          {icon}
        </div>

        {index < total - 1 && (
          <div
            className={`
              w-px flex-1 min-h-[55px]
              ${isPast ? 'bg-accent-green/40' : 'bg-line'}
            `}
          />
        )}
      </div>

      {/* Stage content */}
      <div
        className={`
          flex-1 pb-5
          ${isCurrent ? 'rounded-md' : ''}
        `}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className={`
                text-xs font-medium
                ${isCurrent ? 'text-accent-cyan' : 'text-ink-0'}
              `}
            >
              {isOrigin ? 'Origin' : isDestination ? 'Destination' : stage.label}
            </div>

            {stage.address && <div className="text-[10px] text-ink-2 mt-0.5">{stage.address}</div>}

            {isYard && stage.stopPurpose && (
              <div className="text-[10px] text-ink-2 mt-1 capitalize">
                Purpose: {stage.stopPurpose.replace('_', ' ')}
              </div>
            )}
          </div>

          {isCurrent && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan shrink-0">
              Current
            </span>
          )}

          {!isCurrent && completed && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green shrink-0">
              Completed
            </span>
          )}

          {!isCurrent && !completed && missed && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning/10 text-warning shrink-0">
              Missed
            </span>
          )}
        </div>

        {/* Yard timing */}
        {isYard ? (
          <div className="mt-2 space-y-1.5">
            <TimeRow label="Planned arrival" value={stage.plannedArrival} />

            <TimeRow label="Actual arrival" value={stage.actualArrival} actual />

            <TimeRow label="Planned departure" value={stage.plannedDeparture} />

            <TimeRow label="Actual departure" value={stage.actualDeparture} actual />

            {stage.dwellTime != null && (
              <TimeRow label="Dwell time" value={`${stage.dwellTime} min`} raw />
            )}

            {stage.actualSource && (
              <div className="text-[9px] text-ink-2 mt-1">
                Actual times:{' '}
                {{ geofence_auto: 'Sensor', manual: 'Manual', driver_reported: 'Driver' }[
                  stage.actualSource as string
                ] || String(stage.actualSource).replace('_', ' ')}
              </div>
            )}

            {stage.stop && (
              <StopActions
                tripId={tripId}
                stop={stage.stop}
                tripStatus={tripStatus}
                onChanged={onChanged}
              />
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-1.5">
            {isOrigin && (
              <>
                <TimeRow label="Planned start" value={stage.plannedArrival} />

                <TimeRow label="Actual departure" value={stage.actualDeparture} actual />
              </>
            )}

            {isDestination && (
              <>
                <TimeRow label="Planned arrival" value={stage.plannedArrival} />

                <TimeRow label="Actual arrival" value={stage.actualArrival} actual />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TimeRow({ label, value, actual = false, raw = false }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px]">
      <span className="text-ink-2">{label}</span>

      <span className={actual && value ? 'text-ink-0' : 'text-ink-2'}>
        {raw ? value || '—' : value ? formatDateTime(value) : 'Not recorded'}
      </span>
    </div>
  );
}

function getOriginStatus(trip) {
  if (trip.actual_start_at) {
    return 'completed';
  }

  if (trip.status === 'in_progress') {
    return 'current';
  }

  return 'planned';
}

function getDestinationStatus(trip) {
  if (trip.actual_end_at || trip.status === 'completed') {
    return 'completed';
  }

  return 'planned';
}

function getCurrentStageIndex(stages, trip) {
  if (trip.status === 'cancelled') {
    return -1;
  }

  // A finished trip has no "current" stage — every stage is in the past.
  if (trip.status === 'completed') {
    return -1;
  }

  /*
   * Work backwards through the journey.
   *
   * If a yard has actual arrival but no actual departure,
   * the vehicle is currently at that yard.
   *
   * If it has departed, continue to the next stage.
   */
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages[i];

    if (stage.type === 'yard' && stage.actualArrival && !stage.actualDeparture) {
      return i;
    }

    if (stage.type === 'destination' && stage.actualArrival) {
      return i;
    }
  }

  // Trip has started but hasn't reached a yard yet.
  if (trip.status === 'in_progress' || trip.actual_start_at) {
    return 0;
  }

  // Planned trip: origin is the upcoming/current starting point.
  return 0;
}

function StatusBanner({ status }) {
  const configs = {
    planned: {
      icon: <Clock size={13} />,
      text: 'Trip is planned',
      className: 'text-ink-2 bg-surface-2',
    },
    in_progress: {
      icon: <Play size={13} />,
      text: 'Trip is currently in progress',
      className: 'text-accent-cyan bg-accent-cyan/10',
    },
    completed: {
      icon: <CheckCircle2 size={13} />,
      text: 'Trip completed',
      className: 'text-accent-green bg-accent-green/10',
    },
    cancelled: {
      icon: <XCircle size={13} />,
      text: 'Trip cancelled',
      className: 'text-danger bg-danger/10',
    },
  };

  const config = configs[status] || configs.planned;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-3 py-2 mb-4 text-xs ${config.className}`}
    >
      {config.icon}
      {config.text}
    </div>
  );
}

function InfoCard({ label, value, icon }) {
  return (
    <div className="bg-surface-2 rounded-md p-3">
      <div className="text-[10px] text-ink-2 uppercase flex items-center gap-1">
        {icon}
        {label}
      </div>

      <div className="text-xs text-ink-0 mt-1">{value}</div>
    </div>
  );
}

function RoutePoint({ label, address, latitude, longitude }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-3 h-3 rounded-full border-2 border-accent-cyan mt-0.5 shrink-0" />

      <div>
        <div className="text-[10px] text-ink-2 uppercase">{label}</div>

        <div className="text-xs text-ink-0 mt-0.5">{address || 'Not set'}</div>

        {(latitude != null || longitude != null) && (
          <div className="text-[10px] text-ink-2 mt-0.5">
            {latitude ?? '—'}, {longitude ?? '—'}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ title }) {
  return <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">{title}</div>;
}

function CancelForm({ value, onChange, onCancel, onSubmit, submitting }) {
  return (
    <div className="bg-surface-2 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-danger mb-2">Cancel Trip</div>

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Cancellation reason *"
        rows={2}
        className="w-full glass-strong  px-2.5 py-1.5 text-xs text-ink-0 mb-2 resize-none"
      />

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full py-1.5"
        >
          Back
        </button>

        <button
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
          className="flex-1 text-xs text-danger border border-line bg-white hover:bg-surface-2 rounded-full py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Cancelling…' : 'Cancel Trip'}
        </button>
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return 'Not set';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatDuration(minutes) {
  const totalMinutes = Number(minutes);

  if (!Number.isFinite(totalMinutes)) {
    return 'Not recorded';
  }

  if (totalMinutes < 60) {
    return `${totalMinutes.toFixed(0)} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);

  return `${hours}h ${mins}m`;
}

function PlusIcon() {
  return <span className="text-[11px] font-semibold">+</span>;
}
