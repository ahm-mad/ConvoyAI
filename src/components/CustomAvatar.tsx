// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Person as PersonIcon } from '@components/ui/icons';
import React, { useRef, useState } from 'react';
import Avatar from '@mui/material/Avatar';
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
      <Avatar
        alt={alt}
        src={src || undefined}
        variant={variant}
        onClick={handleAvatarClick}
        sx={{
          width: size,
          height: size,
          cursor: onClick !== noop ? 'pointer' : 'default',
          ...(initial && {
            bgcolor: 'var(--color-accent-cyan)',
            color: 'var(--color-surface-0)',
            fontWeight: 600,
            fontSize: Math.round(size * 0.45),
          }),
          ...sx,
        }}
        className={className}
      >
        {/* never let MUI fall back to alt[0] ("U") — initial, else a generic person glyph */}
        {initial || <PersonIcon sx={{ fontSize: Math.round(size * 0.65) }} />}
      </Avatar>
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
