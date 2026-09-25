// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';

const ConfirmDelete = ({
  itemName,
  onConfirm,
  onCancel,
}: {
  itemName?: any;
  onConfirm?: any;
  onCancel?: any;
  // Accepted for compatibility with call sites that pass them; this component
  // renders its title/message from i18n and ignores these.
  title?: any;
  message?: any;
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-2">
      <h2 className="text-2xl mb-3 font-bold text-ink-0 font-display">
        {t('confirmDelete.title')}
      </h2>
      <p className="text-center text-ink-1 mt-3 mb-6">
        {t('confirmDelete.message', { item: itemName })}
      </p>
      <div className="mt-4 flex gap-4 justify-center">
        <Button variant="secondary" onClick={onCancel}>
          {t('confirmDelete.cancel')}
        </Button>
        <button
          onClick={onConfirm}
          className="cursor-pointer px-4 py-2 bg-danger text-white font-medium rounded-lg hover:brightness-110 transition-all"
        >
          {t('confirmDelete.delete')}
        </button>
      </div>
    </div>
  );
};

export default ConfirmDelete;
