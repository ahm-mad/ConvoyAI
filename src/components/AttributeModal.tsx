// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Delete as DeleteIcon } from '@components/ui/icons';
import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, ListChecks, Tag, X, Trash2, AlertTriangle } from 'lucide-react';
import { Controller, useForm, useFieldArray } from 'react-hook-form';
import GlobalInput from './Input';
import SelectReuseAble from './Select';
import SelectRadix from './Select';
import Button from './Button';
import { useTranslation } from 'react-i18next';
import AddBtnIcon from '../assets/icons/MUIicons/AddBtnIcon';
// Widget-type selection UI removed from this modal (2026-09-22, owner) — the widget/grid dashboard and
// 3D building view are redundant for now. We keep sending the backend a widget_type so the payload shape
// is unchanged and nothing downstream breaks; DEFAULT_WIDGET_TYPE is just the first entry of the old
// picker's list. Restore the full picker (git history has it) when the widget dashboard comes back.
import { widgetsIconMapper } from '@utils/IconMapper';
import { get, post, put, del } from '@utils/apiHelper';

const DEFAULT_WIDGET_TYPE = widgetsIconMapper[0]?.name ?? 'Temperature';

function AttributeModal({
  closeModal,
  selectedAttribute,
  onSave,
  onDelete,
  productId,
  productName,
  existingSettings,
}) {
  const { t } = useTranslation();
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Only an already-saved attribute (opened via "Configure Attribute" on a
  // selected/configured attribute) has a real id to delete — a brand-new,
  // not-yet-saved attribute has nothing on the server to remove.
  const attributeId = existingSettings?.productAttributeData?.id;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      label: '',
      unit: '',
      alertSettings: {
        conditions: [
          {
            logicalOperator: 'IF',
            selectedCondition: 'equal to',
            conditionValue: '',
          },
        ],
      },
    },
    mode: 'onChange',
    shouldUnregister: false,
  });

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
    replace: replaceConditions,
  } = useFieldArray({
    control,
    name: 'alertSettings.conditions',
    keyName: 'id',
  });

  // Units options
  const unitOptions = [
    { label: 'Temperature (°C)', value: '°C' },
    { label: 'Temperature (°F)', value: '°F' },
    { label: 'Humidity (%)', value: '%' },
    { label: 'Pressure (hPa)', value: 'hPa' },
    { label: 'Battery Level (V)', value: 'V' },
    { label: 'Speed (m/s)', value: 'm/s' },
    { label: 'Speed (km/h)', value: 'km/h' },
    { label: 'Acceleration (m/s²)', value: 'm/s²' },
    { label: 'Distance (m)', value: 'm' },
    { label: 'Distance (km)', value: 'km' },
    { label: 'Current (A)', value: 'A' },
    { label: 'Power (W)', value: 'W' },
    { label: 'Energy (kWh)', value: 'kWh' },
    { label: 'Light Intensity (lux)', value: 'lux' },
    { label: 'CO2 (ppm)', value: 'ppm' },
    { label: 'Air Quality (AQI)', value: 'AQI' },
    { label: 'Sound Level (dB)', value: 'dB' },
    { label: 'Weight (kg)', value: 'kg' },
  ];

  // Load existing settings or initialize new form
  useEffect(() => {
    if (existingSettings) {
      const { productAttributeSetting, ruleConditions, widgetType } = existingSettings;

      // Widget type is no longer user-chosen; keep an already-saved value (back-compat), else default.
      setSelectedWidget(widgetType || DEFAULT_WIDGET_TYPE);

      // Format conditions from API response
      let formattedConditions = [];
      if (ruleConditions && ruleConditions.length > 0) {
        formattedConditions = ruleConditions.map((condition, index) => ({
          logicalOperator: index === 0 ? 'If' : condition.logicalOperator || 'And',
          selectedCondition: condition.selectedCondition || 'equal to',
          conditionValue: condition.conditionValue || '',
        }));
      } else {
        // Default condition if none exist
        formattedConditions = [
          {
            logicalOperator: 'If',
            selectedCondition: 'equal to',
            conditionValue: '',
          },
        ];
      }

      const formData = {
        label: productAttributeSetting?.label || '',
        unit: existingSettings?.productAttributeSettingUnit || '',
        alertSettings: {
          conditions: formattedConditions,
        },
      };

      // Reset form with loaded data
      reset(formData);
      replaceConditions(formattedConditions);

      setIsDataLoaded(true);
    } else {
      // Initialize new attribute with default values
      const defaultFormData = {
        label: '',
        unit: '',
        alertSettings: {
          conditions: [
            {
              logicalOperator: 'If',
              selectedCondition: 'equal to',
              conditionValue: '',
            },
          ],
        },
      };

      reset(defaultFormData);
      replaceConditions(defaultFormData.alertSettings.conditions);
      setSelectedWidget(DEFAULT_WIDGET_TYPE);
      setIsDataLoaded(true);
    }
  }, [existingSettings, reset, replaceConditions]);

  // Watch form values for validation
  const labelValue = watch('label');
  const conditionValues = watch('alertSettings.conditions');

  // Add new condition to the list
  const handleAddCondition = () => {
    appendCondition({
      logicalOperator: 'And',
      selectedCondition: 'equal to',
      conditionValue: '',
    });
  };

  // Form validation check
  const isFormValid = () => {
    const hasLabel = labelValue && labelValue.trim().length >= 2;
    const hasValidConditions = conditionValues?.every(
      condition => condition.conditionValue && condition.conditionValue.toString().trim() !== ''
    );
    const hasNoErrors = Object.keys(errors).length === 0;

    return hasLabel && hasValidConditions && hasNoErrors;
  };

  // Handle form submission
  const onSubmit = async data => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const payload = {
        label: data.label,
        unit: data.unit,
        attribute_key: selectedAttribute?.value || '',
        widget_type: selectedWidget,
        alert_settings: {
          // Attribute-level conditions are never surfaced in the Rule Builder list.
          enabled: false,
          conditions: data.alertSettings.conditions.map(condition => ({
            ...condition,
            selectedProduct: productId,
            selectedAttribute: selectedAttribute?.value || '',
          })),
        },
        assign_uuid: data.UUID || false,
        product_id: productId,
        product_name: productName,
      };

      // Determine API endpoint and method
      const apiEndpoint =
        existingSettings && attributeId
          ? `/api/attribute/preference/setting/${attributeId}`
          : '/api/attribute/preference/setting/store';

      const apiMethod = existingSettings && attributeId ? 'put' : 'post';

      console.log(`Making ${apiMethod.toUpperCase()} request to:`, apiEndpoint);

      // Make API call
      const response = await (apiMethod === 'put'
        ? put(apiEndpoint, payload)
        : post(apiEndpoint, payload));

      console.log('API Response:', response);
      if (!response.message.includes('successfully')) {
        closeModal();
        return;
      }
      // Prepare data for parent component
      const formDataWithWidget = {
        ...data,
        selectedWidget: selectedWidget,
        apiResponse: response,
        productName: productName,
        productId: productId,
      };

      // Call parent's onSave callback
      if (onSave) {
        onSave(formDataWithWidget, selectedAttribute);
      }

      closeModal();
    } catch (error) {
      console.error('API Error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Removes this attribute's saved configuration entirely (server confirms
  // it also cascades any linked widget + Rule Builder rule) — reverts the
  // attribute back to unconfigured/unselected, distinct from just editing it.
  const handleDelete = async () => {
    if (!attributeId || isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await del(`/api/attribute/preference/setting/${attributeId}`);
      if (!response?.success) {
        console.error('Failed to delete attribute preference:', response);
        return;
      }
      if (onDelete) {
        onDelete(selectedAttribute);
      }
      closeModal();
    } catch (error) {
      console.error('API Error deleting attribute preference:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Validation rules for form fields
  const validationRules = {
    label: {
      required: 'Attribute label is required',
      minLength: {
        value: 2,
        message: 'Label must be at least 2 characters long',
      },
      maxLength: {
        value: 50,
        message: 'Label cannot exceed 50 characters',
      },
    },
    conditionValue: {
      required: 'Value is required',
      validate: value => {
        if (!value || value.toString().trim() === '') {
          return 'Value is required';
        }
        return true;
      },
    },
  };

  const logicalOperatorOptions = [
    { label: 'And', value: 'And' },
    { label: 'Or', value: 'Or' },
  ];

  const conditionOptions = [
    { label: 'Less Than', value: 'less than' },
    { label: 'Equal To', value: 'equal to' },
    { label: 'Not Equal To', value: 'not equal to' },
    { label: 'Greater Than', value: 'greater than' },
    { label: 'Less Than Or Equal', value: 'lessThanOrEqual' },
    { label: 'Greater Than Or Equal', value: 'greaterThanOrEqual' },
  ];

  // Don't render until data is loaded
  if (!isDataLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-ink-2 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative w-[620px] max-w-[95vw] rounded-xl shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent-cyan/10 text-accent-cyan shrink-0">
            <SlidersHorizontal className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-ink-0 font-display leading-tight">
              {t('attributeSettings.title')}
            </h2>
            {selectedAttribute?.label && (
              <p className="text-xs text-ink-2 leading-tight mt-0.5">{selectedAttribute.label}</p>
            )}
          </div>
        </div>
        <button
          onClick={closeModal}
          disabled={isSubmitting}
          className="flex items-center justify-center w-8 h-8 rounded-full text-ink-1 hover:text-ink-0 hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        {/* Main Form Section */}
        <div className="border border-line-soft w-full p-3 sm:p-4 rounded-md">
          {/* Label and Unit Fields */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-2">
            {/* Attribute Label */}
            <div className="w-full sm:w-1/2 relative">
              <label className="block mb-2 text-sm font-medium text-ink-1">
                Enter Attribute Label
              </label>
              <Controller
                name="label"
                control={control}
                rules={validationRules.label}
                render={({ field }) => (
                  <div className="relative">
                    <GlobalInput
                      {...field}
                      id="entr-label"
                      name="label"
                      size="small"
                      placeholder="Enter attribute label"
                      error={!!errors.label}
                      helperText={errors.label?.message}
                      disabled={isSubmitting}
                    />
                    <div className="h-5 mt-1">{/* Error message space */}</div>
                  </div>
                )}
              />
            </div>

            {/* Unit Selection */}
            <div className="w-full sm:w-1/2 relative">
              <label className="block mb-2 text-sm font-medium text-ink-1">Select unit</label>
              <Controller
                name="unit"
                control={control}
                render={({ field }) => (
                  <div className="relative">
                    <SelectRadix
                      id="att-unit"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select unit"
                      options={unitOptions}
                      size="small"
                      disabled={isSubmitting}
                      error={!!errors.unit}
                      helperText={errors.unit?.message}
                      className="w-full"
                    />
                  </div>
                )}
              />
            </div>
          </div>

          {/* Alert Settings Section */}
          <div className="mt-4 pt-4 sm:pt-6">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h3 className="flex items-center gap-1.5 text-sm sm:text-base font-semibold text-ink-0 uppercase tracking-wider">
                <ListChecks className="w-4 h-4 text-accent-cyan" />
                Alert settings
              </h3>
            </div>

            <div className="border border-line-soft rounded-md p-3 sm:p-4">
              {/* Conditional Rules Header */}
              <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                <h4 className="font-semibold text-ink-1 text-xs uppercase tracking-wider">
                  Conditional rules
                </h4>
                <button
                  type="button"
                  onClick={handleAddCondition}
                  disabled={isSubmitting}
                  className="brand-gradient-bg hover:brightness-110 on-gradient rounded-full w-7 h-7 cursor-pointer flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  title="Add Condition"
                  aria-label="Add condition"
                >
                  <AddBtnIcon className="w-5 h-5 on-gradient transition-transform duration-200 group-hover:rotate-90" />
                </button>
              </div>

              {/* Conditions List */}
              <div className="space-y-3 sm:space-y-4">
                {conditionFields?.map((condition, conditionIndex) => (
                  <div
                    id="att-condition"
                    className="flex flex-col gap-3 sm:gap-4 p-3 bg-surface-2 rounded-md border border-line-soft"
                    key={condition.id}
                  >
                    {/* Row 1: Logical Operator and Attribute */}
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      {/* Logical Operator or "IF" */}
                      <div className="w-full sm:w-24 md:w-28">
                        <label className="block text-xs font-medium text-ink-2 mb-1">
                          {conditionIndex === 0 ? 'Condition' : 'Operator'}
                        </label>
                        {conditionIndex === 0 ? (
                          <div
                            id="if-con"
                            className="h-9 flex items-center justify-center bg-surface-3 border border-line rounded-md px-3"
                          >
                            <span className="font-medium text-ink-0 text-sm">If</span>
                          </div>
                        ) : (
                          <Controller
                            name={`alertSettings.conditions.${conditionIndex}.logicalOperator`}
                            control={control}
                            render={({ field }) => (
                              <SelectRadix
                                value={field.value}
                                onValueChange={field.onChange}
                                heightProp="90px"
                                disabled={isSubmitting}
                                label=""
                                className="bg-surface-1 w-full"
                                options={logicalOperatorOptions}
                              />
                            )}
                          />
                        )}
                      </div>

                      {/* Attribute Display */}
                      <div className="flex-1" id="sel-att">
                        <label className="block text-xs font-medium text-ink-2 mb-1">
                          Attribute
                        </label>
                        <div className="h-9 flex items-center">
                          <span className="flex items-center gap-1.5 bg-accent-cyan/10 text-brand-text px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                            <Tag className="w-3.5 h-3.5 shrink-0" />
                            <span className="overflow-hidden text-ellipsis">
                              {selectedAttribute?.label || 'Selected Attribute'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Condition and Value */}
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      {/* Condition Dropdown */}
                      <div className="w-full sm:flex-1">
                        <label className="block text-xs font-medium text-ink-2 mb-1">
                          Condition
                        </label>
                        <Controller
                          name={`alertSettings.conditions.${conditionIndex}.selectedCondition`}
                          control={control}
                          render={({ field }) => (
                            <SelectRadix
                              id="selc-range"
                              value={field.value}
                              onValueChange={field.onChange}
                              label=""
                              heightProp="90px"
                              className="bg-surface-1 w-full"
                              options={conditionOptions}
                              disabled={isSubmitting}
                            />
                          )}
                        />
                      </div>

                      {/* Condition Value Input */}
                      <div className="w-full sm:w-32 md:w-36 relative">
                        <label className="block text-xs font-medium text-ink-2 mb-1">Value</label>
                        <Controller
                          name={`alertSettings.conditions.${conditionIndex}.conditionValue`}
                          control={control}
                          rules={validationRules.conditionValue}
                          render={({ field }) => (
                            <div className="relative">
                              <GlobalInput
                                {...field}
                                id="att-val"
                                className="w-full rounded-sm focus:outline-none"
                                type="number"
                                placeholder="Value"
                                error={
                                  !!errors.alertSettings?.conditions?.[conditionIndex]
                                    ?.conditionValue
                                }
                                height="h-9"
                                disabled={isSubmitting}
                              />
                              {errors.alertSettings?.conditions?.[conditionIndex]
                                ?.conditionValue && (
                                <div className="absolute top-full left-0 z-10 mt-1">
                                  <p className="text-danger-text text-xs px-1 py-0.5 rounded whitespace-nowrap">
                                    {
                                      errors.alertSettings.conditions[conditionIndex].conditionValue
                                        .message
                                    }
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        />
                      </div>

                      {/* Delete Button */}
                      {conditionFields.length > 1 && (
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => !isSubmitting && removeCondition(conditionIndex)}
                            disabled={isSubmitting}
                            className={`p-2 text-danger-text hover:brightness-125 transition-colors duration-200 ${
                              isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            aria-label="Delete condition"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Remove-configuration confirmation — replaces the footer entirely
            while open, rather than stacking a second modal (this app's
            ModalContext only holds one at a time). */}
        {showDeleteConfirm ? (
          <div className="pt-4 border-t border-line">
            <div className="flex items-start gap-2 p-3 rounded-md bg-danger/5 border border-danger/20 text-sm text-danger-text">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Remove this attribute&apos;s configuration? This also deletes any Rule Builder rule
                using it. This can&apos;t be undone.
              </span>
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button
                variant="secondary"
                size="large"
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="large"
                type="button"
                loading={isDeleting}
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? 'Removing...' : 'Remove configuration'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center pt-4 border-t border-line">
            {attributeId ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-2 py-1.5 -ml-2 rounded-md text-xs font-medium text-ink-2 hover:text-danger-text hover:bg-danger/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove configuration
              </button>
            ) : (
              <span />
            )}
            <Button
              id="submit-modal"
              type="submit"
              size="large"
              fullWidth
              className="sm:w-auto"
              loading={isSubmitting}
              disabled={!isFormValid() || isSubmitting}
              title={
                isSubmitting
                  ? 'Saving...'
                  : !labelValue || labelValue.trim().length < 2
                    ? 'Please enter a valid attribute label'
                    : !conditionValues?.every(
                          condition =>
                            condition.conditionValue &&
                            condition.conditionValue.toString().trim() !== ''
                        )
                      ? 'Please fill in all condition values'
                      : Object.keys(errors).length > 0
                        ? 'Please fix validation errors'
                        : 'Save attribute settings'
              }
            >
              {isSubmitting ? 'Saving...' : t('attributeSettings.saveButton')}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

export default AttributeModal;
