// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, Fragment } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import Modal from '@mui/material/Modal';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import ShowAndHide from '../FormComponents/ShowAndHide';
import { useFieldArray } from 'react-hook-form';
import { DeviceDefaultValidation } from '../../validation/DeviceDefaultValidation';
import { useTranslation } from 'react-i18next';

export default function DeviceDefaultForm({
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
  const isEditMode = !!incomingWidget;
  console.log('ee', incomingWidget);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAllAttributes, setSelectedAllAttributes] = useState([]);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: yupResolver(DeviceDefaultValidation(t)),
    defaultValues: {
      widget_name: '',
      sections: [
        {
          product: '',
          device: '',
        },
      ],
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'sections',
  });

  // Fix: Reset only once when incomingWidget is available
  useEffect(() => {
    if (incomingWidget && incomingWidget.widget_settings?.length > 0) {
      const firstSection = incomingWidget.widget_settings[0];

      reset({
        widget_name: firstSection.widget_name || '',
        sections: [
          {
            product: String(firstSection.product || ''),
            device: String(firstSection.device || ''),
          },
        ],
      });
    }
  }, [incomingWidget, reset]); // Only depend on incomingWidget and reset

  const onSubmit = async data => {
    console.log('final-device-default', data);

    const widgetSectionWithAllAttributes = selectedAllAttributes.map(item => ({
      attributes: item.value,
      label: item.label,
      product: data.sections[0].product,
      device: data.sections[0].device,
    }));

    const finalPayload = {
      ...data,
      widget_settings: widgetSectionWithAllAttributes,
    };
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
      <button
        onClick={onClose}
        className="absolute top-4 right-4 cursor-pointer text-ink-2 hover:text-ink-0"
        type="button"
        disabled={isSubmitting || isDeleting}
      >
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('deviceDefaultForm.widgetSettings')}
        </h1>
        <p className="text-ink-2 text-sm">{t('deviceDefaultForm.deviceDataDefault')}</p>
      </div>

      <h2 className="font-semibold text-xs uppercase tracking-wider text-ink-2 mb-2">
        {t('deviceDefaultForm.general')}
      </h2>

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
                  placeholder={t('deviceDefaultForm.widgetNamePlaceholder')}
                  error={!!errors.widget_name}
                  helperText={errors.widget_name?.message}
                  disabled={isSubmitting || isDeleting}
                />
              )}
            />
          </div>
        </div>
      </div>

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
            setValue={setValue}
            attributeOptions={attributes}
            setAttributeOptions={setAttributes}
            colorSetting={false}
            showAttributeField={false}
            dirtyFields={dirtyFields}
            incomingWidget={incomingWidget}
            alertSettings={false}
            setSelectedAllAttributes={setSelectedAllAttributes}
            sectionIndex={index} // FIX: Pass the sectionIndex prop
          />
        </Fragment>
      ))}

      {/* Submit Button */}
      <div className="flex mt-4 justify-between">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isDeleting}
            className="text-ink-1 cursor-pointer font-semibold text-xs px-5 py-2 rounded-md hover:bg-surface-3"
          >
            {t('deviceDefaultForm.cancel')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!isEditMode || isSubmitting || isDeleting}
            className={`px-3 text-xs font-semibold rounded-md ${
              isEditMode && !isDeleting
                ? 'text-danger hover:bg-danger/10 cursor-pointer'
                : 'text-ink-2 cursor-not-allowed'
            }`}
          >
            {isDeleting ? t('deviceDefaultForm.removing') : t('deviceDefaultForm.removeWidget')}
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
          {isSubmitting ? t('deviceDefaultForm.saving') : t('deviceDefaultForm.save')}
        </button>
      </div>
    </form>
  );
}
