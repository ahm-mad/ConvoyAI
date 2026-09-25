// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import Button from './Button';
const ConfirmModal = ({
  title = 'Confirm action',
  message = '',
  itemName = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonColor = 'bg-danger hover:brightness-110',
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="glass-strong  p-6 max-w-sm mx-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
        <h3 className="text-lg font-medium text-ink-0 mb-2 font-display">{title}</h3>

        <div className="text-ink-1 mb-6">
          {message && <p>{message}</p>}
          {itemName && !message && <p>Are you sure you want to proceed with "{itemName}"?</p>}
          {!message && !itemName && <p>Are you sure you want to proceed?</p>}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 cursor-pointer text-sm font-medium text-white rounded-lg transition-all ${confirmButtonColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
