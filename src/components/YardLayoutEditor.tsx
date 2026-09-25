/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import { useState, useRef, type ChangeEvent, type MouseEvent } from 'react';
import { X, Upload, Plus } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import OptionSelect from '@components/OptionSelect';
import AuditLine from '@components/AuditLine';
import { post, put, del } from '@utils/apiHelper';
import DeleteControl from '@components/records/DeleteControl';
import YardEditForm from '@components/YardEditForm';
import DeactivateControls from '@components/DeactivateControls';
import toast from 'react-hot-toast';
import { conflictMessage, expectedUpdatedAt } from '@utils/fleetConflict';
import { token } from '@lib/design/tokens';

/**
 * Real yard layout editor — same interaction pattern as FloorPlanEditor
 * (upload, click-to-place), applied to parking slots instead of sensors,
 * plus check-in/check-out ("the slip concept"). Consumes
 * GET /api/yards/{id} exactly as built in the backend phase — including
 * the layout.url and vehicleProfile.image_url accessors added while
 * building this, after finding the raw response wouldn't have included
 * usable URLs at all.
 */
export default function YardLayoutEditor({
  yardId,
  yardName,
}: {
  yardId: string | number;
  yardName?: string;
}) {
  const u = useUnits();
  const { closeModal } = useModal();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [placingSlot, setPlacingSlot] = useState(false);
  const [pendingSlotNumber, setPendingSlotNumber] = useState('');
  const [pendingMaxLength, setPendingMaxLength] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState<any>(null);
  const [checkInVehicleId, setCheckInVehicleId] = useState('');
  const [editingYard, setEditingYard] = useState(false);
  const [editingSlot, setEditingSlot] = useState(false);
  const [slotNumberEdit, setSlotNumberEdit] = useState('');
  const [slotMaxEdit, setSlotMaxEdit] = useState('');
  const [movingSlot, setMovingSlot] = useState(false);

  const { data, isLoading, refetch } = useSimpleQuery(`yard-${yardId}`, `/api/yards/${yardId}`);
  const yard: any = data?.success ? data.data : null;
  const layout = yard?.layout;
  const slots: any[] = yard?.slots || [];
  const selectedSlot = slots.find((s: any) => s.id === selectedSlotId);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    const response = await post(
      `/api/yards/${yardId}/layout`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
      false
    );

    setUploading(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not upload layout.');

      return;
    }

    toast.success(response?.message || 'Layout uploaded.');
    refetch();
  };

  // Remove the layout image (B4): idempotent; slots keep their relative positions.
  const handleRemoveLayout = async () => {
    const response: any = await del(`/api/yards/${yardId}/layout`, {}, false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not remove the layout.');

      return;
    }

    toast.success('Layout removed.');
    refetch();
  };

  // Delete an empty slot (B4). Backend refuses a slot with a vehicle in it, or with any check-in history
  // (deliberately conservative — owner: keep refusing for now, "deactivate slot" later); its 422 is shown as-is.
  const handleDeleteSlot = async (slotId: string | number) => {
    const response: any = await del(`/api/yard-slots/${slotId}`, {}, false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not delete the slot.');

      return;
    }

    toast.success('Slot deleted.');
    setSelectedSlotId(null);
    refetch();
  };

  const handleSaveSlot = async () => {
    if (!selectedSlot || !slotNumberEdit.trim()) return;

    const response: any = await put(
      `/api/yard-slots/${selectedSlot.id}`,
      {
        slot_number: slotNumberEdit.trim(),
        max_length_m: slotMaxEdit.trim() ? toMetric(u.length, slotMaxEdit) : null,
        ...expectedUpdatedAt(selectedSlot),
      },
      {},
      false
    );

    if (response?.error || response?.success === false) {
      toast.error(conflictMessage(response) || response?.message || 'Could not update the slot.');
      if (response?.status === 409) refetch();

      return;
    }

    toast.success('Slot updated.');
    setEditingSlot(false);
    refetch();
  };

  const handleImageClick = async (e: MouseEvent<HTMLImageElement>) => {
    // Move mode: the next click on the layout is the slot's new position.
    if (movingSlot && selectedSlot && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const response: any = await put(
        `/api/yard-slots/${selectedSlot.id}`,
        {
          position_x: (e.clientX - rect.left) / rect.width,
          position_y: (e.clientY - rect.top) / rect.height,
          ...expectedUpdatedAt(selectedSlot),
        },
        {},
        false
      );

      if (response?.error || response?.success === false) {
        toast.error(conflictMessage(response) || response?.message || 'Could not move the slot.');
        if (response?.status === 409) refetch();

        return;
      }

      toast.success('Slot moved.');
      setMovingSlot(false);
      refetch();

      return;
    }

    if (!placingSlot || !imageRef.current || !pendingSlotNumber.trim()) return;

    const rect = imageRef.current.getBoundingClientRect();
    const position_x = (e.clientX - rect.left) / rect.width;
    const position_y = (e.clientY - rect.top) / rect.height;

    const response = await post(
      `/api/yards/${yardId}/slots`,
      {
        slot_number: pendingSlotNumber.trim(),
        position_x,
        position_y,
        max_length_m: pendingMaxLength.trim() ? toMetric(u.length, pendingMaxLength) : null,
      },
      {},
      false
    );

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not create slot.');

      return;
    }

    toast.success(`${pendingSlotNumber} placed.`);
    setPlacingSlot(false);
    setPendingSlotNumber('');
    setPendingMaxLength('');
    refetch();
  };

  const handleCheckIn = async () => {
    if (!checkInVehicleId || !selectedSlot) return;

    const response = await post(
      `/api/yard-slots/${selectedSlot.id}/check-in`,
      { vehicle_id: checkInVehicleId },
      {},
      false
    );

    if (response?.error || response?.success === false) {
      // Surfaces the real size-validation message from
      // YardController::checkIn() directly — not a generic error, the
      // actual reason (e.g. "exceeds the slot's maximum length").
      toast.error(response?.message || 'Could not check in.');

      return;
    }

    toast.success('Checked in.');
    setCheckInVehicleId('');
    refetch();
  };

  const handleCheckOut = async () => {
    if (!selectedSlot) return;

    const response = await post(`/api/yard-slots/${selectedSlot.id}/check-out`, {}, {}, false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not check out.');

      return;
    }

    toast.success('Checked out.');
    refetch();
  };

  return (
    <div className="glass-strong  w-[900px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">Yard — {yardName}</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {placingSlot
              ? 'Click anywhere on the layout to place this slot.'
              : movingSlot
                ? 'Click the layout where this slot should move to.'
                : 'Click a slot to check in or check out a vehicle.'}
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0">
          <X size={18} />
        </button>
      </div>

      {/* Edit / deactivate the yard itself (flows/05 §8). */}
      {yard && (
        <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-line-soft">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditingYard(v => !v)} className="btn-soft">
              {editingYard ? 'Back to layout' : 'Edit yard'}
            </button>
            {yard.radius_m != null && (
              <span className="text-[11px] text-ink-2">
                Detection radius {formatQty(u.length, yard.radius_m, 0)}
              </span>
            )}
            {layout && !editingYard && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-soft disabled:opacity-40"
                >
                  {uploading ? 'Uploading…' : 'Replace layout image'}
                </button>
                <DeleteControl
                  label="Remove layout"
                  question="Remove the layout image? Slots keep their positions."
                  onConfirm={handleRemoveLayout}
                />
              </>
            )}
          </div>
          <DeactivateControls
            basePath={`/api/yards/${yardId}`}
            inactive={yard.is_active === false}
            entityLabel="yard"
            onChanged={refetch}
            allowDelete
          />
        </div>
      )}

      {yard && (
        <div className="px-5 py-1 border-b border-line-soft">
          <AuditLine record={yard} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4 bg-surface-2 flex items-center justify-center">
          {isLoading && <div className="text-xs text-ink-2">Loading…</div>}

          {!isLoading && yard && editingYard && (
            <YardEditForm
              yard={yard}
              onCancel={() => setEditingYard(false)}
              onSaved={() => {
                setEditingYard(false);
                refetch();
              }}
            />
          )}

          {!isLoading && !editingYard && !layout && (
            <div className="text-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex flex-col items-center gap-2 border-2 border-dashed border-line rounded-md px-10 py-8 text-ink-2 hover:border-accent-cyan hover:text-ink-1 transition-colors"
              >
                <Upload size={20} />
                <span className="text-xs">
                  {uploading ? 'Uploading…' : 'Upload a yard layout image'}
                </span>
              </button>
            </div>
          )}

          {!isLoading && !editingYard && layout && (
            <div className="relative inline-block">
              <img
                ref={imageRef}
                src={layout.url}
                alt="Yard layout"
                onClick={handleImageClick}
                className={`max-w-full max-h-[60vh] ${placingSlot ? 'cursor-crosshair' : 'cursor-default'}`}
              />
              {slots
                .filter((s: any) => s.position_x !== null && s.position_y !== null)
                .map((s: any) => {
                  const occupied = !!s.current_event;

                  return (
                    <button
                      key={s.id}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedSlotId(s.id);
                      }}
                      title={s.slot_number}
                      className="absolute w-4 h-4 -ml-2 -mt-2 rounded-sm border-2 flex items-center justify-center text-[7px] font-mono"
                      style={{
                        left: `${s.position_x * 100}%`,
                        top: `${s.position_y * 100}%`,
                        background: occupied ? 'rgba(41,211,255,0.3)' : 'rgba(23,214,140,0.15)',
                        borderColor: occupied ? token('--color-brand') : token('--color-success'),
                        color: 'var(--color-ink-0)',
                      }}
                    />
                  );
                })}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        <div className="w-64 flex-shrink-0 border-l border-line-soft p-3 overflow-y-auto">
          {layout && !placingSlot && (
            <button
              onClick={() => setPlacingSlot(true)}
              className="flex items-center gap-1.5 text-xs btn-brand border border-transparent rounded-full px-2.5 py-1.5 mb-3 w-full justify-center hover:bg-surface-2"
            >
              <Plus size={12} /> Add Slot
            </button>
          )}

          {placingSlot && (
            <div className="bg-surface-2 rounded-md p-2.5 mb-3">
              <label className="text-[10px] uppercase text-ink-2">Slot number</label>
              <input
                value={pendingSlotNumber}
                onChange={e => setPendingSlotNumber(e.target.value)}
                placeholder="e.g. Slot 7"
                className="w-full mt-1 mb-2 bg-surface-1 border border-line rounded px-2 py-1 text-xs text-ink-0"
              />
              <label className="text-[10px] uppercase text-ink-2">
                Max length ({u.length.label}, optional)
              </label>
              <input
                value={pendingMaxLength}
                onChange={e => setPendingMaxLength(e.target.value)}
                placeholder="e.g. 8"
                className="w-full mt-1 bg-surface-1 border border-line rounded px-2 py-1 text-xs text-ink-0"
              />
              <button
                onClick={() => setPlacingSlot(false)}
                className="text-[10px] text-ink-2 mt-2 underline"
              >
                Cancel
              </button>
            </div>
          )}

          {!selectedSlot && (
            <div className="text-[11px] text-ink-2 italic">Select a slot to see detail.</div>
          )}

          {selectedSlot && (
            <div>
              <div className="text-xs font-semibold text-ink-0 mb-1">
                {selectedSlot.slot_number}
                {selectedSlot.max_length_m && (
                  <span className="text-ink-2 font-normal">
                    {' '}
                    — max {formatQty(u.length, selectedSlot.max_length_m)}
                  </span>
                )}
              </div>
              <AuditLine record={selectedSlot} className="text-[10px] text-ink-2 mb-2" />

              {/* Edit slot details / move it on the layout (PUT /yard-slots/{id}). */}
              {editingSlot ? (
                <div className="bg-surface-2 rounded-md p-2.5 mb-2">
                  <label className="text-[10px] uppercase text-ink-2">Slot number</label>
                  <input
                    value={slotNumberEdit}
                    onChange={e => setSlotNumberEdit(e.target.value)}
                    className="w-full mt-1 mb-2 bg-surface-1 border border-line rounded px-2 py-1 text-xs text-ink-0"
                  />
                  <label className="text-[10px] uppercase text-ink-2">
                    Max length ({u.length.label})
                  </label>
                  <input
                    value={slotMaxEdit}
                    onChange={e => setSlotMaxEdit(e.target.value)}
                    type="number"
                    className="w-full mt-1 mb-2 bg-surface-1 border border-line rounded px-2 py-1 text-xs text-ink-0"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingSlot(false)}
                      className="flex-1 text-[11px] text-ink-2 border border-line rounded py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSlot}
                      disabled={!slotNumberEdit.trim()}
                      className="flex-1 text-[11px] text-accent-cyan border border-line rounded py-1 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSlotNumberEdit(selectedSlot.slot_number ?? '');
                      setSlotMaxEdit(toDisplayString(u.length, selectedSlot.max_length_m, 2));
                      setEditingSlot(true);
                    }}
                    className="text-caption font-medium btn-brand border border-transparent rounded-full px-2 py-1 hover:bg-surface-2"
                  >
                    Edit slot
                  </button>
                  {layout && (
                    <button
                      type="button"
                      onClick={() => setMovingSlot(v => !v)}
                      className="text-caption font-medium btn-brand border border-transparent rounded-full px-2 py-1 hover:bg-surface-2"
                    >
                      {movingSlot ? 'Cancel move' : 'Move slot'}
                    </button>
                  )}
                  <DeleteControl
                    label="Delete slot"
                    compact
                    question="Delete this slot?"
                    onConfirm={() => handleDeleteSlot(selectedSlot.id)}
                  />
                </div>
              )}

              {selectedSlot.current_event ? (
                <div className="bg-surface-2 rounded-md p-2.5 mt-2">
                  <div className="text-xs text-ink-0">
                    {selectedSlot.current_event.vehicle?.name}
                  </div>
                  <div className="text-[10px] text-ink-2 mt-1">
                    {selectedSlot.current_event.vehicle?.vehicle_category || 'Category not set'}
                  </div>
                  <div className="text-[10px] text-ink-2 mt-1">
                    Checked in {new Date(selectedSlot.current_event.checked_in_at).toLocaleString()}
                  </div>
                  <button
                    onClick={handleCheckOut}
                    className="w-full mt-2 text-xs text-danger border border-danger/40 bg-danger/10 rounded-full py-1.5"
                  >
                    Check Out
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  {/* `checked_in` = already in some yard slot (backend 422s a second check-in). */}
                  <OptionSelect
                    kind="vehicles"
                    value={checkInVehicleId}
                    onChange={setCheckInVehicleId}
                    itemFilter={v => !v.checked_in}
                    placeholder="Select vehicle"
                    emptyLabel="No vehicles available"
                    wrapperClassName="w-full"
                    className="w-full bg-surface-2 border border-line rounded px-2 py-1.5 text-xs text-ink-0"
                    getOption={v => {
                      const tooLong =
                        v.length_m != null &&
                        selectedSlot.max_length_m != null &&
                        Number(v.length_m) > Number(selectedSlot.max_length_m);

                      return {
                        label: `${v.name || `Vehicle #${v.id}`}${v.vehicle_category ? ` · ${v.vehicle_category}` : ''} (#${v.id})${tooLong ? ` — too long (${v.length_m}m)` : ''}`,
                        disabled: tooLong,
                      };
                    }}
                  />
                  <button
                    onClick={handleCheckIn}
                    disabled={!checkInVehicleId}
                    className="w-full mt-2 text-xs btn-brand border border-transparent rounded-full py-1.5 disabled:opacity-40"
                  >
                    Check In
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
