// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { Controller } from 'react-hook-form';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConditionSelect from '@components/CustomSelect';
import ConditionalDropdown from '../components/ConditionDropdownPanel';

const ConditionRow = ({
  field,
  index,
  control,
  watchedConditions,
  conditionOptions,
  productOptions,
  currentAttributeOptions,
  selectedProductId,
  fieldsLength,
  handleProductChange,
  handleAttributeChange,
  remove,
  getProductNameById, // New prop to get product name from ID
}) => {
  const { t } = useTranslation();

  const isFirst = index === 0;
  const currentCondition = watchedConditions[index];

  // Get the current product name for display
  const getCurrentProductName = () => {
    if (currentCondition?.selectedProduct) {
      return getProductNameById(currentCondition.selectedProduct) || t('newRule.pleaseChoose');
    }
    return t('newRule.pleaseChoose');
  };

  return (
    <div key={field.id} className="mb-8">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
        <div className="w-16 flex items-center h-10">
          {isFirst ? (
            <span className="text-sm text-ink-1">{t('newRule.if')}</span>
          ) : (
            <Controller
              name={`conditions.${index}.logicalOperator`}
              control={control}
              render={({ field: controllerField }) => (
                <ConditionSelect
                  id="logical-operation"
                  value={controllerField.value}
                  onChange={controllerField.onChange}
                  options={[t('logicalOperators.and'), t('logicalOperators.or')]}
                  placeholder={t('newRule.selectProduct')}
                  hideChevron={true}
                  className=""
                />
              )}
            />
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full items-start sm:items-center">
          <div className="flex relative">
            {isFirst ? (
              <Controller
                name={`conditions.${index}.selectedProduct`}
                control={control}
                render={({ field: productField, fieldState: productFieldState }) => (
                  <Controller
                    name={`conditions.${index}.selectedAttribute`}
                    control={control}
                    rules={{
                      validate: value => {
                        if (!value || value === t('newRule.pleaseChoose')) {
                          return t('newRule.attributeRequired');
                        }
                        return true;
                      },
                    }}
                    render={({ field: attributeField, fieldState: attributeFieldState }) => (
                      <div className="relative">
                        <ConditionalDropdown
                          id="select-product"
                          index={index}
                          control={control}
                          deviceOptions={productOptions.map(p => p.name)}
                          fieldOptions={currentAttributeOptions}
                          currentDevice={getCurrentProductName()} // Use helper function
                          currentField={currentCondition?.selectedAttribute}
                          onDeviceChange={product => {
                            // Find the product ID and pass it to the handler
                            const selectedProductObj = productOptions.find(p => p.name === product);
                            handleProductChange(index, product);
                            productField.onChange(selectedProductObj?.id || null); // Store ID in form
                          }}
                          onFieldChange={attribute => {
                            handleAttributeChange(index, attribute);
                            attributeField.onChange(attribute);
                          }}
                          hasError={!!productFieldState.error || !!attributeFieldState.error}
                        />

                        {attributeFieldState.error && (
                          <div className="absolute top-full left-0 z-10 mt-1">
                            <p className="text-danger-text text-xs bg-surface-2 px-1 whitespace-nowrap border-danger/30">
                              {attributeFieldState.error.message}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  />
                )}
              />
            ) : (
              <Controller
                name={`conditions.${index}.selectedAttribute`}
                control={control}
                rules={{
                  validate: value => {
                    if (!value || value === t('newRule.pleaseChoose')) {
                      return t('newRule.attributeRequired');
                    }
                    return true;
                  },
                }}
                render={({ field: attributeField, fieldState: attributeFieldState }) => (
                  <div className="relative">
                    <ConditionSelect
                      value={
                        attributeField.value === t('newRule.pleaseChoose') || !attributeField.value
                          ? ''
                          : attributeField.value
                      }
                      onChange={value => {
                        const finalValue = value || t('newRule.pleaseChoose');
                        handleAttributeChange(index, finalValue);
                        attributeField.onChange(finalValue);
                      }}
                      OptionClass="overflow-y-auto h-12"
                      options={currentAttributeOptions}
                      placeholder="Select an attribute"
                      className={`min-w-[100px] cursor-pointer ${attributeFieldState.error ? 'border-danger' : ''}`}
                    />

                    {attributeFieldState.error && (
                      <div className="absolute top-full left-0 z-10 mt-1">
                        <p className="text-danger-text text-xs bg-surface-2 px-1 whitespace-nowrap border-danger/30">
                          {attributeFieldState.error.message}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              />
            )}
          </div>

          <div className="text-sm text-ink-1 flex items-center h-10">{t('newRule.is')}</div>

          <div className="min-w-[120px]">
            <Controller
              name={`conditions.${index}.selectedCondition`}
              control={control}
              render={({ field: controllerField }) => (
                <ConditionSelect
                  id="select-range"
                  value={controllerField.value}
                  onChange={controllerField.onChange}
                  options={conditionOptions}
                  placeholder={t('newRule.selectCondition')}
                />
              )}
            />
          </div>

          <div className="w-full sm:w-[150px] relative">
            <Controller
              name={`conditions.${index}.conditionValue`}
              control={control}
              rules={{
                required: t('newRule.valueRequired'),
                min: { value: 0, message: t('newRule.valuePositive') },
              }}
              render={({ field: { value, ...rest }, fieldState }) => (
                <div className="relative">
                  <input
                    {...rest}
                    // {...controllerField}
                    id="add-att-value"
                    type="number"
                    value={value ?? ''}
                    className={`w-full px-3 py-2 bg-surface-2 text-ink-0 border rounded-md text-sm focus:outline-none focus:border-accent-cyan transition-all ${
                      fieldState.error ? 'border-danger focus:ring-danger/30' : 'border-line'
                    }`}
                    placeholder={t('newRule.value')}
                  />

                  {fieldState.error && (
                    <div className="absolute top-full left-0 z-10">
                      <p className="text-danger-text text-xs px-2 py-1 border-danger/30 whitespace-nowrap">
                        {fieldState.error.message}
                      </p>
                    </div>
                  )}
                </div>
              )}
            />
          </div>

          {fieldsLength > 1 && (
            <div className="flex items-center h-10">
              <button
                type="button"
                onClick={() => remove(index)}
                className="flex items-center justify-center w-8 h-8 text-ink-2 cursor-pointer hover:text-ink-0 hover:bg-surface-3 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConditionRow;
