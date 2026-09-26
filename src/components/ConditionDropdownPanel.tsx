import React, { useState } from 'react';
import { Controller } from 'react-hook-form';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ConditionalDropdown = ({
  index,
  control,
  deviceOptions,
  fieldOptions,
  currentDevice,
  currentField,
  onDeviceChange,
  onFieldChange,
  hasError = false, // New prop to indicate validation error
  id,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState('main');
  const [isAnimating, setIsAnimating] = useState(false);
  const [attributeWarning, setAttributeWarning] = useState('');

  const changePanel = newPanel => {
    setIsAnimating(true);
    setTimeout(() => {
      setActivePanel(newPanel);
      setIsAnimating(false);
      setAttributeWarning('');
    }, 150);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setActivePanel('main');
    setAttributeWarning('');
  };

  const handleProductSelect = product => {
    onDeviceChange(product);
    changePanel('main');
  };

  const handleAttributeSelect = attribute => {
    onFieldChange(attribute);
    closeDropdown();
  };

  const handleAttributePanelClick = () => {
    if (!currentDevice || currentDevice === t('newRule.pleaseChoose')) {
      // setAttributeWarning(t('newRule.pleaseSelectProductFirst'));
    } else {
      changePanel('attribute');
    }
  };

  const getDisplayText = () => {
    if (
      currentDevice &&
      currentDevice !== t('newRule.pleaseChoose') &&
      currentField &&
      currentField !== t('newRule.pleaseChoose')
    ) {
      return currentField;
    }
    return t('newRule.pleaseChoose');
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className={`cursor-pointer px-3 py-2 rounded-md text-sm transition-colors border outline-none ${
          hasError
            ? 'bg-danger/10 text-danger hover:bg-danger/15 border-danger/30'
            : 'bg-surface-2 text-ink-1 hover:bg-surface-3 hover:text-ink-0 border-line'
        }`}
      >
        {getDisplayText()}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={closeDropdown} />

          {/* Dropdown Container */}
          <div className="absolute top-full left-0 mt-2 w-[280px] bg-surface-2 border border-line rounded-lg shadow-lg z-20 overflow-hidden">
            <div
              className="relative w-full h-full overflow-hidden"
              style={{
                height:
                  activePanel === 'main'
                    ? '160px'
                    : activePanel === 'product'
                      ? `${Math.min(deviceOptions?.length * 48 + 64 || 200, 280)}px`
                      : `${Math.min(fieldOptions?.length * 48 + 64 || 200, 280)}px`,
              }}
            >
              {/* Main Panel */}
              <div
                className={`absolute inset-0 w-full h-full transition-transform duration-300 ease-in-out ${
                  activePanel === 'main' ? 'transform translate-x-0' : 'transform -translate-x-full'
                }`}
              >
                <div className="w-full h-full p-4 space-y-3">
                  {/* Product Selection Row */}
                  <div
                    id="row-select-product"
                    className="flex items-center justify-between px-2 py-2 hover:bg-surface-3 cursor-pointer rounded-md transition-colors"
                    onClick={() => changePanel('product')}
                  >
                    <div className="flex-1">
                      <div className="text-xs text-ink-2 mb-1">{t('newRule.product')}</div>
                      <div
                        className={`text-sm truncate ${
                          (!currentDevice || currentDevice === t('newRule.pleaseChoose')) &&
                          hasError
                            ? 'text-danger'
                            : 'text-ink-1'
                        }`}
                      >
                        {currentDevice || t('newRule.pleaseChoose')}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-2 flex-shrink-0" />
                  </div>

                  {/* Attribute Selection Row */}
                  <div
                    id="row-select-attribute"
                    className="flex items-center justify-between px-2 py-2 cursor-pointer rounded-md hover:bg-surface-3 transition-colors"
                    onClick={handleAttributePanelClick}
                  >
                    <div className="flex-1">
                      <div className="text-xs text-ink-2 mb-1">{t('newRule.attribute')}</div>
                      <div
                        className={`text-sm truncate ${
                          (!currentField || currentField === t('newRule.pleaseChoose')) && hasError
                            ? 'text-danger'
                            : 'text-ink-1'
                        }`}
                      >
                        {currentField || t('newRule.pleaseChoose')}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-2 flex-shrink-0" />
                  </div>

                  {/* Warning Message */}
                  {attributeWarning && (
                    <div className="px-2 py-1">
                      <p className="text-danger-text text-xs">{attributeWarning}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Selection Panel */}
              <div
                className={`absolute inset-0 w-full h-full transition-transform duration-300 ease-in-out ${
                  activePanel === 'product'
                    ? 'transform translate-x-0'
                    : 'transform translate-x-full'
                }`}
              >
                <div className="w-full h-full flex flex-col">
                  {/* Header */}
                  <div className="p-4 border-b border-line flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => changePanel('main')}
                        className="flex cursor-pointer items-center text-ink-1 hover:text-ink-0 mr-3 transition-colors"
                      >
                        <ChevronLeft className="w-4  cursor-pointer h-4 mr-1" />
                        {t('newRule.back')}
                      </button>
                      <span className="text-sm font-medium text-ink-1">{t('newRule.product')}</span>
                    </div>
                  </div>

                  {/* Product Options */}
                  <div className="flex-1 overflow-y-auto">
                    {deviceOptions &&
                      deviceOptions.map((product, productIndex) => (
                        <button
                          key={productIndex}
                          id={`dropdown-product-${productIndex}`}
                          type="button"
                          className="w-full text-left p-3 hover:bg-surface-3 cursor-pointer text-sm text-ink-1 hover:text-ink-0 transition-colors"
                          onClick={() => handleProductSelect(product)}
                        >
                          {product}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Attribute Selection Panel */}
              <div
                className={`absolute inset-0 w-full h-full transition-transform duration-300 ease-in-out ${
                  activePanel === 'attribute'
                    ? 'transform translate-x-0'
                    : 'transform translate-x-full'
                }`}
              >
                <div className="w-full h-full flex flex-col">
                  {/* Header */}
                  <div className="p-4 border-b border-line flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => changePanel('main')}
                        className="flex items-center cursor-pointer text-ink-1 hover:text-ink-0 mr-3 transition-colors"
                      >
                        <ChevronLeft className="w-4 cursor-pointer h-4 mr-1" />
                        {t('newRule.back')}
                      </button>
                      <span className="text-sm font-medium text-ink-1">
                        {t('newRule.attribute')}
                      </span>
                    </div>
                  </div>

                  {/* Attribute Options */}
                  <div className="flex-1 overflow-y-auto">
                    {fieldOptions &&
                      fieldOptions.map((attribute, attributeIndex) => (
                        <button
                          key={attributeIndex}
                          id={`dropdown-attribute-${attributeIndex}`}
                          type="button"
                          className="w-full text-left p-3 hover:bg-surface-3 cursor-pointer text-sm text-ink-1 hover:text-ink-0 transition-colors"
                          onClick={() => handleAttributeSelect(attribute)}
                        >
                          {attribute}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ConditionalDropdown;
