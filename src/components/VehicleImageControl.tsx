/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState, type ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { post, del } from '@utils/apiHelper';
import DeleteControl from '@components/records/DeleteControl';
import { invalidateFleetQueries } from '@utils/fleetCache';

const MAX_BYTES = 10 * 1024 * 1024; // backend limit: 10 MB

/**
 * Vehicle photo with "Upload / Change photo" (POST /vehicles/{id}/image, multipart `image`).
 * A photo can also be removed (DELETE /vehicles/{id}/image, backend B4 — idempotent).
 */
export default function VehicleImageControl({
  vehicleId,
  imageUrl,
  onChanged,
}: {
  vehicleId: string | number;
  imageUrl?: string | null;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    e.target.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG, WebP…).');

      return;
    }

    if (file.size > MAX_BYTES) {
      toast.error('That image is larger than 10 MB. Please choose a smaller one.');

      return;
    }

    setUploading(true);
    const formData = new FormData();

    formData.append('image', file);

    const response: any = await post(
      `/api/vehicles/${vehicleId}/image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
      false
    );

    setUploading(false);

    if (response?.error || response?.success === false) {
      const detail = response?.errors ? Object.values(response.errors).flat().join(' ') : '';

      toast.error(detail || response?.message || 'Could not upload the photo.');

      return;
    }

    toast.success('Photo updated.');
    invalidateFleetQueries(qc);
    onChanged?.();
  };

  const remove = async () => {
    const response: any = await del(`/api/vehicles/${vehicleId}/image`, {}, false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not remove the photo.');

      return;
    }

    toast.success('Photo removed.');
    invalidateFleetQueries(qc);
    onChanged?.();
  };

  return (
    <div className="flex flex-col items-start gap-1 shrink-0">
      <div className="relative shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-14 h-14 rounded-md object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-md bg-surface-3 flex items-center justify-center text-ink-2 text-xl">
            🚚
          </div>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          title={imageUrl ? 'Change photo' : 'Upload photo'}
          aria-label={imageUrl ? 'Change vehicle photo' : 'Upload vehicle photo'}
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-1 border border-line flex items-center justify-center text-accent-cyan hover:bg-surface-2 disabled:opacity-50"
        >
          <Camera size={10} />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        {uploading && (
          <div className="absolute inset-0 rounded-md bg-black/50 flex items-center justify-center text-[9px] text-white">
            Uploading…
          </div>
        )}
      </div>
      {imageUrl && (
        <DeleteControl
          compact
          label="Remove photo"
          question="Remove the photo?"
          onConfirm={remove}
        />
      )}
    </div>
  );
}
