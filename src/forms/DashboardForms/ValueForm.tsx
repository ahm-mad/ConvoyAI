// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Delete as DeleteIcon } from '@components/ui/icons';
import React, { useState, useEffect, Fragment } from 'react';

// import CancelIcon from '@assets/icons/ReactIcon/CloesIcon';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';

import SelectReuseAble from '@components/Select';
import GlobalInput from '../../components/Input';
import ReuseAbleSetting from '../FormComponents/ReuseAbleSetting';
import GlobalToggle from '../FormComponents/ToggleBtn';
import { Controller, useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { ValueValidation } from '../../validation/ValueValidation';
import ShowAndHide from '../FormComponents/ShowAndHide';
import AddBtnIcon from '../../assets/icons/MUIicons/AddBtnIcon';

import { useTranslation } from 'react-i18next';

export default function ValueForm({
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
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: yupResolver(ValueValidation(t)),
    defaultValues: {
      widget_name: '',
      widget_id: '',
      sections: [
        {
          product: '',
          device: '',
          attributes: '',
          icon: '',
          unit: '',
          conditions: [
            {
              logicalOperator: t('newRule.if'),
              selectedCondition: t('conditions.equalTo'),
              conditionValue: '',
            },
          ],
          enabled: incomingWidget?.enabled || false,
          // decimal: '',
          // showTimestamp: false,
          text_color: '#000000',
          value_color: '#000000',
          background_color: '#ffffff',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'sections',
  });

  useEffect(() => {
    if (incomingWidget && products?.length > 0) {
      console.log('fffdsdfds', incomingWidget);
      reset({
        widget_name: incomingWidget?.widget_settings?.[0]?.widget_name || '',
        widget_id: incomingWidget?.widget_id || '',
        sections: incomingWidget?.widget_settings?.map(section => ({
          product: String(section.product) || '',
          device: String(section.device) || '',
          attributes: section.attributes || '',
          icon: section.icon || '',
          unit: section.unit || '',
          conditions: section.rule.conditions,
          enabled: section.enabled ?? section.rule?.is_for_all === 1 ?? false,
          text_color: section.text_color || '#000000',
          value_color: section.value_color || '#000000',
          background_color: section.background_color || '#ffffff',
        })),
      });
    }
  }, [incomingWidget, products, devices, reset]);

  const handleAddSection = () => {
    append({
      product: '',
      device: '',
      attributes: '',
      icon: '',
      unit: '',
      conditions: [
        {
          logicalOperator: t('newRule.if'),
          selectedCondition: t('conditions.equalTo'),
          conditionValue: '',
        },
      ],
      enabled: false,
      // decimal: '',
      // showTimestamp: false,
      text_color: '#000000',
      value_color: '#000000',
      background_color: '#ffffff',
    });
  };
  console.log('pop', incomingWidget, products, devices);
  const handleDeleteSection = index => {
    remove(index);
  };

  const onSubmit = async data => {
    console.log('ab', data);
    const finalPayload = {
      ...data,
      widget_settings: data.sections,
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
        type="button"
        onClick={onClose}
        className="absolute top-4 cursor-pointer right-4 text-ink-2 hover:text-ink-0"
        disabled={isSubmitting || isDeleting}
      >
        {/* <CancelIcon className={`w-6 h-6`} /> */}
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('valueForm.widgetSettings')}
        </h1>
        <p className="text-ink-2 text-sm">{t('valueForm.value')}</p>
      </div>

      <h2 className="text-lg font-semibold">{t('valueForm.general')}</h2>

      <div className="flex flex-col gap-4">
        <div className="p-4 rounded-xl">
          <div className="bg-surface-2 rounded-md">
            <Controller
              name="widget_name"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  className="w-full rounded-sm text-lg p-4 focus:outline-none"
                  placeholder={t('valueForm.widgetNamePlaceholder')}
                  disabled={isSubmitting || isDeleting}
                  error={!!errors.widget_name}
                  helperText={errors.widget_name?.message}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Settings Section with Add Button */}

      <div className="flex mt-4 justify-end">
        <button
          type="button"
          onClick={handleAddSection}
          className="group relative inline-flex items-center justify-center cursor-pointer w-10 h-10 brand-gradient-bg hover:brightness-110 on-gradient rounded-full transition-all duration-200 focus:outline-none  disabled:opacity-50 disabled:cursor-not-allowed"
          title="Add Section"
          disabled={isSubmitting || isDeleting}
        >
          <AddBtnIcon className="w-6 h-6 transition-transform duration-200 group-hover:rotate-90" />

          {/* Tooltip */}
          {/* <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
            Add Section
          </span> */}
        </button>
      </div>

      {/* Render Multiple Sections */}
      {fields.map((field, index) => (
        <div key={field.id} className="mt-2">
          <ShowAndHide
            errors={errors}
            dirtyFields={dirtyFields}
            watch={watch}
            control={control}
            productOptions={products}
            setProductOptions={setProducts}
            deviceOptions={devices}
            setDeviceOptions={setDevices}
            attributeOptions={attributes}
            setAttributeOptions={setAttributes}
            showIconField={true}
            showUnitField={true}
            sectionIndex={index}
            showTextColor={true}
            setValue={setValue}
            showBackgroundColor={true}
            incomingWidget={incomingWidget}
            showValueColor={true}
            onDeleteSection={() => handleDeleteSection(index)}
            canDelete={fields.length > 1}
          />
        </div>
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
            {t('valueForm.cancel')}
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
            {isDeleting ? t('valueForm.removing') : t('valueForm.removeWidget')}
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
          {isSubmitting ? t('valueForm.saving') : t('valueForm.save')}
        </button>
      </div>
    </form>
  );
}
