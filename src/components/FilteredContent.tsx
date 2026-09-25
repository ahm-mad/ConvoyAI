// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Close as CloseIcon } from '@components/ui/icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SearchField from './SearchField';
import CheckBox from './CheckBox';

const FilterContent = ({ title, onClick, options = [] }) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const { t } = useTranslation();

  const handleSelectAll = () => {
    setSelectedItems(options.map(option => option.label));
  };

  const handleDeselectAll = () => {
    setSelectedItems([]);
  };

  const handleCheckboxChange = label => {
    setSelectedItems(prev =>
      prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
    );
  };

  return (
    <div className="border border-line-soft rounded-md bg-surface-1">
      <div className="p-2">
        <div className="flex justify-between items-center">
          <div className="font-medium text-ink-0">{title}</div>
          <div onClick={onClick} className="cursor-pointer px-1 rounded-sm hover:bg-surface-3">
            <CloseIcon className="p-1 text-ink-2" />
          </div>
        </div>

        {/* Search & Action Buttons */}
        <div className="mt-4 flex justify-between">
          <SearchField className="w-[173px]" />
          <button
            onClick={handleSelectAll}
            className="bg-surface-2 hover:bg-surface-3 text-ink-1 text-[12px] p-1 px-[10px] rounded-md"
          >
            {t('filterContent.select')}{' '}
            <span className="flex justify-center">{t('filterContent.all')}</span>
          </button>
          <button
            onClick={handleDeselectAll}
            className="bg-surface-2 hover:bg-surface-3 text-ink-1 text-[12px] p-1 rounded-md"
          >
            {t('filterContent.deselect')}{' '}
            <span className="flex justify-center">{t('filterContent.all')}</span>
          </button>
        </div>
      </div>

      <div className="p-2">
        {options.length > 0 &&
          options.map(option => (
            <CheckBox
              key={option.label}
              label={option.label}
              checked={selectedItems.includes(option.label)}
              onChange={() => handleCheckboxChange(option.label)}
            />
          ))}
      </div>

      <div className="bottom-0 h-8 w-full p-2 bg-accent-cyan/10 rounded-b-md">
        <h3 className="text-accent-cyan text-sm">
          {t('filterContent.item', { count: selectedItems.length })}
        </h3>
      </div>
    </div>
  );
};

export default FilterContent;
