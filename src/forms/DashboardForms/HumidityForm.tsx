// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, Fragment } from 'react';
// import CancelIcon from '@assets/icons/ReactIcon/CloesIcon';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { BatteryFormSchema } from '@validation/BatteryFormValidation';
import ShowAndHide from '../FormComponents/ShowAndHide';
import { useTranslation } from 'react-i18next';
import { useFieldArray } from 'react-hook-form';
import FormDemo from '@root/src/ConvoyDemo/FormDemo';
import { isFirstDemo } from '@utils/DemoHelper';

export default function HumidityForm({
  onClose,
  handleModalSubmit,
  incomingWidget,
  handleDeleteWidget,
  products,
  devices,
  attributes,
  setProducts,
  setDevices,
  setAttributes,
}) {
  console.log('BatteryForm Component Rendered!');

  console.log('🧠 BatteryForm mounted');
  console.log('🧾 incomingWidget (initial):', incomingWidget);

  const { t } = useTranslation();
  const isEditMode = !!incomingWidget;

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoStart, setDemoStart] = useState(false);

  useEffect(() => {
    if (isFirstDemo('WidgetFormDemo')) {
      setDemoStart(false);
    }
  }, []);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: yupResolver(BatteryFormSchema(t)),
    defaultValues: {
      widget_name: '',
      sections: [
        {
          product: '',
          device: '',
          attributes: '',
          unit: '',
          conditions: [
            {
              selectedProduct: '',
              selectedAttribute: '',
              selectedCondition: t('conditions.equalTo'),
              conditionValue: '',
              logicalOperator: t('newRule.if'),
            },
          ],
          max_value: '',
          enabled: false,
          value_color: '#000000',
        },
      ],
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'sections',
  });

  useEffect(() => {
    if (!incomingWidget) return;

    console.log('Resetting form with incomingWidget:', incomingWidget);

    reset({
      widget_name: incomingWidget?.widget_settings?.[0]?.widget_name || '',
      sections:
        incomingWidget?.widget_settings?.map(section => ({
          product: String(section.product || ''),

          device: String(section.device || ''),
          attributes: section.attributes || '',
          label: section.label || '',
          conditions: section?.conditions || section.rule?.conditions || [],
          max_value: section.max_value || '',
          unit: section.unit || '',
          value_color: section.value_color || '#000000',
          enabled: section.enabled ?? section.rule?.is_for_all === 1 ?? false,
        })) || [],
    });
  }, [incomingWidget, reset]);

  const onSubmit = async data => {
    console.log('final-battery-form', data);
    const finalPayload = { ...data, widget_settings: data.sections };

    try {
      setIsSubmitting(true);
      await handleModalSubmit(finalPayload);
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (isDeleting || !isEditMode) return;

    setIsDeleting(true);
    try {
      await handleDeleteWidget();
    } catch (error) {
      console.error('Error deleting widget:', error);
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-transparent w-[60vw]">
      {/* Close Button */}
      {demoStart && <FormDemo setValue={setValue} products={products} sectionIndex={0} />}
      <button
        type="button"
        onClick={onClose}
        disabled={isSubmitting || isDeleting}
        className="absolute top-4 right-4 text-ink-2 cursor-pointer hover:text-ink-0"
      >
        {/* <CancelIcon className={`w-6 h-6`} /> */}
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('batteryForm.widgetSettings')}
        </h1>
        <p className="text-ink-2 text-sm">Humidity</p>
      </div>

      {/* General Section */}
      <h2 className="font-semibold text-xs uppercase tracking-wider text-ink-2 mb-2">
        {t('batteryForm.general')}
      </h2>

      {/* Input Fields */}
      <div className="flex flex-col gap-4">
        <div className="p-4  rounded-xl">
          <div className="bg-surface-2 rounded-md">
            <Controller
              name="widget_name"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="wgt-name"
                  className="w-full rounded-sm text-lg p-4 focus:outline-none"
                  placeholder={t('batteryForm.widgetNamePlaceholder')}
                  disabled={isSubmitting || isDeleting}
                  error={!!errors.widget_name}
                  helperText={errors.widget_name?.message}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Settings Section */}
      {fields.map((field, index) => (
        <Fragment key={field.id}>
          <ShowAndHide
            errors={errors}
            watch={watch}
            control={control}
            productOptions={products}
            setProductOptions={setProducts}
            deviceOptions={devices}
            setDeviceOptions={setDevices}
            attributeOptions={attributes}
            setAttributeOptions={setAttributes}
            setValue={setValue}
            showValueColor={true}
            showMaxValueField={true}
            showUnitField={true}
            dirtyFields={dirtyFields}
            incomingWidget={incomingWidget}
            disabled={isSubmitting || isDeleting}
            sectionIndex={index}
          />
        </Fragment>
      ))}

      {/* Submit Button */}
      <div className="flex mt-4 justify-between">
        <div className="flex gap-4">
          <button
            onClick={onClose}
            type="button"
            disabled={isSubmitting || isDeleting}
            className="text-ink-1 font-semibold text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3"
          >
            {t('batteryForm.cancel')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!isEditMode || isSubmitting || isDeleting}
            className={`px-3 text-xs font-semibold rounded-md ${
              isEditMode && !isDeleting
                ? 'text-danger-text hover:bg-danger/10 cursor-pointer'
                : 'text-ink-2 cursor-not-allowed'
            }`}
          >
            {isDeleting ? t('batteryForm.removing') : t('batteryForm.removeWidget')}
          </button>
        </div>
        <button
          id="save-form"
          type="submit"
          disabled={isSubmitting || isDeleting}
          className={`brand-gradient-bg on-gradient h-9 px-5 text-xs font-semibold rounded-md transition-all ${
            isSubmitting || isDeleting
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 cursor-pointer'
          }`}
        >
          {isSubmitting ? t('batteryForm.saving') : t('batteryForm.save')}
        </button>
      </div>
    </form>
  );
}
