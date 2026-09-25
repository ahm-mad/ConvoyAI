// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Person as PersonIcon } from '@components/ui/icons';
import React, { useRef, useState } from 'react';
import { getAvatarInitial } from '@utils/avatar';

export default function CustomAvatar({
  alt = '',
  // Person's name (first name preferred). Shown as an initial letter when there is no `src`, or the
  // image fails to load. Without it MUI would fall back to the first letter of `alt` (the old "U").
  name = '',
  src = '',
  size = 40,
  variant = 'circular',
  onClick = () => {},
  onImageChange = (_file?: any) => {},
  canUpload = false,
  sx = {},
  className = '',
}) {
  const noop = () => {};
  const fileInputRef = useRef(null);

  const handleAvatarClick = () => {
    if (canUpload && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      onClick();
    }
  };

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (file) {
      onImageChange(file);
    }
    e.target.value = '';
  };

  const initial = getAvatarInitial(name);

  return (
    <div className="relative inline-block">
      <div
        role={onClick !== noop || canUpload ? 'button' : undefined}
        onClick={handleAvatarClick}
        className={`grid shrink-0 select-none place-items-center overflow-hidden font-semibold text-white ${variant === 'circular' ? 'rounded-full' : 'rounded-card'} ${onClick !== noop || canUpload ? 'cursor-pointer' : ''} ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.45),
          background: initial || !src ? 'var(--gradient-avatar)' : undefined,
          ...sx,
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="size-full object-cover" />
        ) : (
          initial || <PersonIcon sx={{ fontSize: Math.round(size * 0.65) }} />
        )}
      </div>
      {canUpload && (
        <input
          type="file"
          accept="image/jpeg, image/jpg, image/png"
          onChange={handleFileChange}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
