// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useMemo } from 'react';
import Cropper from 'react-easy-crop';
import Button from '@components/Button';

function getCroppedImg(imageSrc, cropPixels, maxSizeInBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = cropPixels.width;
      canvas.height = cropPixels.height;
      const ctx = canvas.getContext('2d');

      // Background ko transparent ya white rakhen (optional)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        image,
        cropPixels.x,
        cropPixels.y,
        cropPixels.width,
        cropPixels.height,
        0,
        0,
        cropPixels.width,
        cropPixels.height
      );

      // Quality ko adjust karke size control karen
      let quality = 0.9;
      const tryCompress = q => {
        canvas.toBlob(
          blob => {
            if (!blob) return reject(new Error('Canvas empty'));

            // Agar size limit se zyada hai, quality kam karen
            if (blob.size > maxSizeInBytes && q > 0.1) {
              tryCompress(q - 0.1);
            } else {
              const file = new File([blob], 'cropped.jpg', {
                type: 'image/jpeg', // JPEG use karen PNG ki jagah
              });
              resolve(file);
            }
          },
          'image/jpeg', // JPEG format use karen
          q // Quality parameter
        );
      };

      tryCompress(quality);
    };
    image.onerror = reject;
  });
}

export default function ImageCropModal({ file, onCancel, onComplete }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [loading, setLoading] = useState(false);

  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);

  const onCropComplete = (_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const handleDone = async () => {
    if (!croppedAreaPixels) return;

    setLoading(true);
    try {
      const croppedFile = await getCroppedImg(imageUrl, croppedAreaPixels, 1024 * 1024);
      const previewUrl = URL.createObjectURL(croppedFile);

      // Debug ke liye size check karen
      console.log('Cropped file size:', (croppedFile.size / 1024).toFixed(2), 'KB');

      onComplete({ file: croppedFile, previewUrl });
    } catch (error) {
      console.error('Crop error:', error);
      alert('Image crop karne mein error aaya. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-1000">
      <div className="bg-surface-1 border border-line-soft rounded-md p-4 w-[400px] h-[450px] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
        <div className="relative flex-1">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            cropShape="round"
            aspect={1}
            cropSize={{ width: 200, height: 200 }}
            restrictPosition={true}
            minZoom={0.5}
            maxZoom={5}
            zoomSpeed={0.1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex w-auto items-center gap-2 mt-2">
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom ?? ''}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full accent-accent-cyan"
          />
        </div>
        <div className="flex justify-end gap-3 mt-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleDone} disabled={loading}>
            {loading ? 'Processing...' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  );
}
