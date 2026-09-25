import {
  CheckCircleOutline as CheckCircleOutlineIcon,
  HighlightOff as HighlightOffIcon,
} from '@components/ui/icons';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
export default function FourthStepForm({ formData, setFormData }) {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState(formData?.step4?.data?.selectedItems || []);

  const attributes = [
    { id: 1, attribute: 'Acceleration' },
    { id: 2, attribute: 'Humidity' },
    { id: 3, attribute: 'Luminosity' },
    { id: 4, attribute: 'Temperature' },
  ];

  const handleSelect = item => {
    console.log('ff', item);
    setSelectedItems(prev => {
      const newSelected = prev.some(selected => selected.id === item.id)
        ? prev.filter(selected => selected.id !== item.id)
        : [...prev, item];

      updateFormData(newSelected);

      return newSelected;
    });
  };

  const updateFormData = selected => {
    setFormData(prev => ({
      ...prev,
      step4: {
        isFilled: selected.length > 0,
        data: {
          selectedItems: selected,
        },
      },
    }));
  };

  // Sync with parent formData on mount
  useEffect(() => {
    if (formData?.step4?.data?.selectedItems) {
      setSelectedItems(formData.step4.data.selectedItems);
    } else {
      // Initialize step4 in formData if it doesn't exist
      setFormData(prev => ({
        ...prev,
        step4: {
          isFilled: false,
          data: {
            selectedItems: [],
          },
        },
      }));
    }
  }, []);

  return (
    <div className="mt-4">
      <div>
        <h2 className="text-lg font-semibold">{t('FourthStepForm.title')}</h2>
        <p className="text-sm text-text-medium">{t('FourthStepForm.subtitle')}</p>
      </div>
      <div className="mt-4">
        <div className="bg-background-lighter p-4 rounded-xl">
          <div className="flex flex-wrap max-md:flex-nowrap max-md:flex-col gap-3">
            {attributes.map(item => {
              const isSelected = selectedItems.some(selected => selected.id === item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`w-[calc(50%-6px)] max-md:w-full flex items-center gap-2 cursor-pointer border-[1px] p-2 rounded-lg shadow-sm transition-all ${
                    isSelected
                      ? 'border-primary text-primary bg-background-lighter'
                      : 'border-background'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircleOutlineIcon className="text-primary" />
                  ) : (
                    <HighlightOffIcon className="text-text-medium" />
                  )}
                  {item.attribute}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
