// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import GlobalInput from './Input';
import Button from '../components/Button';

const ConfirmDeleteProduct = ({ itemName, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');

  // Check if the entered text matches the product name (case insensitive)
  const isConfirmValid = confirmText.toLowerCase().trim() === itemName.toLowerCase().trim();

  const handleConfirm = () => {
    if (isConfirmValid) {
      onConfirm();
    }
  };

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-2">
      <h2 className="text-lg mb-3 font-semibold text-ink-0 font-display">
        {t('confirmDelete.title')}
      </h2>
      <p className="text-center text-ink-1 text-sm mt-3 mb-2">
        {t('confirmDelete.message', { item: itemName })}
      </p>

      {/* Confirmation Input Field */}
      <div className="w-full mb-6">
        <p className="text-xs  text-ink-1 mb-2">
          Type <span className="font-semibold  text-danger">"{itemName}"</span> to confirm deletion:
        </p>
        <GlobalInput
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={`Type "${itemName}" here`}
          error={confirmText && !isConfirmValid}
          height="h-9"
          helperText={
            confirmText && !isConfirmValid
              ? `Product name doesn't match. Please type exactly: "${itemName}"`
              : ''
          }
          size="small"
          className={
            confirmText && isConfirmValid
              ? 'border-accent-green focus:border-accent-green focus:shadow-[0_0_0_2px_rgba(23,214,140,0.2)]'
              : ''
          }
        />
      </div>

      <div className="mt-4 flex justify-center gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {t('confirmDelete.cancel')}
        </Button>
        <button
          onClick={handleConfirm}
          disabled={!isConfirmValid}
          className={`cursor-pointer px-5 py-2 text-xs font-semibold rounded-md transition-all ${
            isConfirmValid
              ? 'bg-danger text-white hover:brightness-110'
              : 'bg-surface-3 text-ink-2 cursor-not-allowed opacity-50'
          }`}
        >
          {t('confirmDelete.delete')}
        </button>
      </div>
    </div>
  );
};

export default ConfirmDeleteProduct;
