// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, Fragment } from 'react';
// import CancelIcon from '@assets/icons/ReactIcon/CloesIcon';
import IconWrapper from '@utils/ReactIconDynamicImport';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import InputField from '@components/Input';
import { useFieldArray } from 'react-hook-form';
import ShowAndHide from '../FormComponents/ShowAndHide';
import { SignalStrengthValidation } from '../../validation/SignalStrengthValidation';
import { useTranslation } from 'react-i18next';

export default function DoorStatusForm({
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
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = !!incomingWidget;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: yupResolver(SignalStrengthValidation(t)),
    defaultValues: {
      widget_name: '',
      // product: incomingWidget?.product || '',
      // device: incomingWidget?.device || '',
      // attributes: incomingWidget?.attributes || '',
      // showTimestamp: incomingWidget?.showTimestamp || false,
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
          enabled: incomingWidget?.enabled || false,
          // max_value: incomingWidget?.maxvalue || '',
          // showTimestamp: incomingWidget?.showTimestamp || false,
          // text_color: '#000000',
          value_color: '#000000',
          // background_color: '#ffffff',
        },
      ],
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'sections',
  });

  useEffect(() => {
    if (incomingWidget) {
      reset({
        widget_name: incomingWidget?.widget_settings?.[0].widget_name || '',
        sections: incomingWidget?.widget_settings?.map(section => ({
          product: String(section.product) || '',
          device: String(section.device) || '',
          attributes: section.attributes || '',
          conditions: section?.rule?.conditions,
          // icon: section.icon || '',
          unit: section.unit || '',
          enabled: section.enabled ?? section.rule?.is_for_all === 1 ?? false,
          // text_color: section.text_color || '#000000',
          value_color: section.value_color || '#000000',
          // background_color: section.background_color || '#ffffff',
        })),
      });
    }
  }, [incomingWidget, products, devices, reset]);

  const onSubmit = async data => {
    console.log('final-door-status-form', data);
    const finalPayload = { ...data, widget_settings: data.sections };

    console.log(finalPayload, 'ishq');

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
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 cursor-pointer text-ink-2 hover:text-ink-0"
        disabled={isSubmitting || isDeleting}
      >
        {/* <CancelIcon className={`w-6 h-6`} /> */}
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('signalform.widget_settings')}
        </h1>
        <p className="text-ink-2 text-sm">Door Status</p> {/*trans */}
      </div>

      {/* General Section */}
      <h2 className="font-semibold text-xs uppercase tracking-wider text-ink-2 mb-2">
        {t('signalform.general')}
      </h2>

      {/* Input Fields */}
      <div className="flex flex-col gap-4">
        <div className="p-4 rounded-xl">
          <div className="bg-surface-2 rounded-md">
            <Controller
              name="widget_name"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  className="w-full rounded-sm text-lg p-4 focus:outline-none"
                  placeholder={t('signalform.widget_name_placeholder')}
                  disabled={isSubmitting || isDeleting}
                  error={!!errors.widget_name}
                  helperText={errors.widget_name?.message}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Settings Section - Using your existing ShowAndHide component */}
      {fields.map((field, index) => (
        <Fragment key={field.id}>
          <ShowAndHide
            errors={errors}
            watch={watch}
            control={control}
            productOptions={products}
            setProductOptions={setProducts}
            deviceOptions={devices}
            setValue={setValue}
            setDeviceOptions={setDevices}
            attributeOptions={attributes}
            setAttributeOptions={setAttributes}
            showValueColor={true}
            showUnitField={true}
            dirtyFields={dirtyFields}
            incomingWidget={incomingWidget}
            disabled={isSubmitting || isDeleting}
          />
        </Fragment>
      ))}

      {/* Submit Button */}
      <div className="flex mt-4 justify-between">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-1 font-semibold text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3"
            disabled={isSubmitting || isDeleting}
          >
            {t('signalform.cancel')}
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
            {isDeleting ? t('signalform.removing') : t('signalform.remove_widget')}
          </button>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || isDeleting}
          className={`brand-gradient-bg on-gradient h-9 px-5 text-xs font-semibold rounded-md transition-all ${
            isSubmitting || isDeleting
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 cursor-pointer'
          }`}
        >
          {isSubmitting ? t('signalform.saving') : t('signalform.save')}
        </button>
      </div>
    </form>
  );
}
