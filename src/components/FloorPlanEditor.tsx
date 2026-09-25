// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useQueryClient } from '@tanstack/react-query';
import { post, put } from '@utils/apiHelper';
import toast from 'react-hot-toast';
import FloorPlan3DViewer from '@components/FloorPlan3DViewer';

/**
 * Phase 1 of "drop a 2D floor plan, place sensors on it, turn into 3D
 * later." Deliberately a standalone editor rather than added into
 * AddEditEntityModal.jsx (the real, already-working component-creation
 * flow) — positioning is a separate action from creating, works on
 * sensors that already exist, and doesn't risk the working creation form.
 */
export default function FloorPlanEditor({ componentId, componentName }) {
  const { closeModal } = useModal();
  const queryClient = useQueryClient();
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);

  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState('edit'); // 'edit' | '3d'
  const [floorLevel, setFloorLevel] = useState(0);

  const { data, isLoading, refetch } = useSimpleQuery(
    `floor-plan-${componentId}`,
    `/api/floor-plans/component/${componentId}`
  );

  const floorPlan = data?.success ? data.data : null;
  const positioned = floorPlan?.positioned_components || [];
  const positionedIds = new Set(positioned.map(c => Number(c.id)));

  // Every device under this component's full subtree (any depth), not just
  // immediate children — GET /devices/{id}?type=component already resolves
  // the whole subtree server-side. Each device's last child_id_N is the
  // leaf component it's actually attached to (the id positioning acts on).
  const { data: subtreeDevicesData } = useSimpleQuery(
    `floor-devices-${componentId}`,
    `/api/devices/${componentId}?type=component`
  );
  const unpositioned = (subtreeDevicesData?.devices || [])
    .map(d => {
      const childIdKeys = Object.keys(d)
        .filter(k => /^child_id_\d+$/.test(k))
        .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
      const leafComponentId = Number(d[childIdKeys[childIdKeys.length - 1]]);
      return { id: leafComponentId, name: d.name, deveui: d.uuid };
    })
    .filter(d => !positionedIds.has(d.id));

  const handleUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('asset_component_id', componentId);
    formData.append('floor_level', floorLevel);
    formData.append('image', file);

    const response = await post(
      '/api/floor-plans',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
      false
    );

    setUploading(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not upload floor plan.');

      return;
    }

    toast.success('Floor plan uploaded.');
    refetch();
  };

  const handleImageClick = async e => {
    if (!selectedComponentId || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const position_x = (e.clientX - rect.left) / rect.width;
    const position_y = (e.clientY - rect.top) / rect.height;

    const response = await put(
      `/api/components/${selectedComponentId}`,
      { floor_plan_id: floorPlan.id, position_x, position_y },
      {},
      false
    );

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not place sensor.');

      return;
    }

    toast.success('Sensor positioned.');
    setSelectedComponentId(null);
    refetch();
    queryClient.invalidateQueries({ queryKey: [`floor-devices-${componentId}`] });
  };

  // Previously an already-positioned marker had zero interaction — a
  // misclick during placement had no way to be corrected. Removing a
  // position sends the sensor back to the "unpositioned" list, reusing
  // the existing select-then-click flow to re-place it correctly, rather
  // than building a separate drag-to-move interaction.
  const handleRemovePosition = async (e, compId) => {
    e.stopPropagation();

    const response = await put(
      `/api/components/${compId}`,
      { floor_plan_id: null, position_x: null, position_y: null },
      {},
      false
    );

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not remove this position.');

      return;
    }

    toast.success('Position removed — sensor is back in the unpositioned list.');
    refetch();
    queryClient.invalidateQueries({ queryKey: [`floor-devices-${componentId}`] });
  };

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md w-[760px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">Floor Plan — {componentName}</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {selectedComponentId
              ? 'Click anywhere on the floor plan to place the selected sensor.'
              : 'Select a sensor below, then click its position on the floor plan.'}
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0">
          <X size={18} />
        </button>
      </div>

      {floorPlan && (
        <div className="flex gap-1 px-5 pt-2 border-b border-line">
          <button
            onClick={() => setView('edit')}
            className={`text-xs font-medium px-3 py-1.5 border-b-2 -mb-px ${
              view === 'edit' ? 'text-ink-0 border-accent-cyan' : 'text-ink-2 border-transparent'
            }`}
          >
            Edit Positions
          </button>
          <button
            onClick={() => setView('3d')}
            className={`text-xs font-medium px-3 py-1.5 border-b-2 -mb-px ${
              view === '3d' ? 'text-ink-0 border-accent-cyan' : 'text-ink-2 border-transparent'
            }`}
          >
            View in 3D
          </button>
        </div>
      )}

      {view === '3d' && floorPlan ? (
        <div className="flex-1 p-4">
          <FloorPlan3DViewer componentId={componentId} componentName={componentName} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4 bg-surface-2 flex items-center justify-center">
            {isLoading && <div className="text-xs text-ink-2">Loading…</div>}

            {!isLoading && !floorPlan && (
              <div className="text-center">
                <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1.5">
                  Floor level (for stacking order in the 3D building view)
                </label>
                <input
                  type="number"
                  value={floorLevel}
                  onChange={e => setFloorLevel(parseInt(e.target.value, 10) || 0)}
                  className="w-20 bg-surface-1 border border-line rounded-md px-2 py-1 text-xs text-ink-0 text-center mb-3"
                />
                <br />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex flex-col items-center gap-2 border-2 border-dashed border-line rounded-md px-10 py-8 text-ink-2 hover:border-accent-cyan hover:text-ink-1 transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-xs">
                    {uploading ? 'Uploading…' : 'Upload a floor plan image'}
                  </span>
                </button>
              </div>
            )}

            {!isLoading && floorPlan && (
              <div className="relative inline-block">
                <img
                  ref={imageRef}
                  src={floorPlan.url}
                  alt="Floor plan"
                  onClick={handleImageClick}
                  className={`max-w-full max-h-[60vh] ${selectedComponentId ? 'cursor-crosshair' : 'cursor-default'}`}
                />
                {positioned.map(c => (
                  <div
                    key={c.id}
                    title={`${c.name} — click to remove position`}
                    onClick={e => handleRemovePosition(e, c.id)}
                    className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-accent-cyan border-2 border-surface-0 shadow-[0_0_6px_var(--color-accent-cyan)] cursor-pointer hover:scale-125 hover:bg-danger transition-transform"
                    style={{ left: `${c.position_x * 100}%`, top: `${c.position_y * 100}%` }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="w-56 border-l border-line-soft overflow-y-auto p-3 flex-shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
              Unpositioned sensors ({unpositioned.length})
            </div>
            {unpositioned.length === 0 && (
              <div className="text-[11px] text-ink-2 italic">
                {floorPlan
                  ? 'All sensors on this floor are positioned.'
                  : 'Upload a floor plan first.'}
              </div>
            )}
            {unpositioned.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedComponentId(c.id)}
                disabled={!floorPlan}
                className={`w-full text-left text-xs px-2.5 py-2 rounded-md mb-1.5 border transition-colors ${
                  selectedComponentId === c.id
                    ? 'border-accent-cyan bg-surface-3 text-ink-0'
                    : 'border-line-soft bg-surface-1 text-ink-1 hover:bg-surface-2'
                }`}
              >
                {c.name}
                {c.deveui && <span className="text-ink-2"> — {c.deveui}</span>}
              </button>
            ))}

            {floorPlan && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-[10.5px] text-ink-2 hover:text-ink-1 mt-3 underline"
              >
                Replace floor plan
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
