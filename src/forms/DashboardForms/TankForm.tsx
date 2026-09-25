// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, Fragment } from 'react';
// import CancelIcon from '@assets/icons/ReactIcon/CloesIcon';
import IconWrapper from '@utils/ReactIconDynamicImport';
import GlobalInput from '@components/Input';
import ShowAndHide from '../FormComponents/ShowAndHide';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { TankLevelValidation } from '../../validation/TankLevelValidation';
import { useTranslation } from 'react-i18next';
import { useFieldArray } from 'react-hook-form';
import RectangularTank from '../../assets/svg/RectangularTank';
import HorizontalCylindricalTank from '../../assets/svg/HorizontalCylindricalTank';
import SphericalTank from '../../assets/svg/SphericalTank';
import VerticalCylindricalFlatTank from '../../assets/svg/VerticalCylindricalFlatTank';
import VerticalCylindricalConicalTank from '../../assets/svg/VerticalCylindricalConicalTank';

export default function TankForm({
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
  // const [selectedIndex, setSelectedIndex] = useState( 0);
  useEffect(() => {
    console.log('devices seen innnnn TankForm:', devices);
  }, [devices]);
  const isEditMode = !!incomingWidget;

  const tankTypes = [
    {
      key: 'RectangularTank',
      displayName: t('tankForm.rectangularTank'),
      component: <RectangularTank />,
    },
    {
      key: 'HorizontalCylindricalTank',
      displayName: t('tankForm.horizontalCylindricalTank'),
      component: <HorizontalCylindricalTank />,
    },
    {
      key: 'SphericalTank',
      displayName: t('tankForm.sphericalTank'),
      component: <SphericalTank />,
    },
    {
      key: 'VerticalCylindricalFlatTank',
      displayName: t('tankForm.verticalCylindricalFlatTank'),
      component: <VerticalCylindricalFlatTank />,
    },
    {
      key: 'VerticalCylindricalConicalTank',
      displayName: t('tankForm.verticalCylindricalConicalTank'),
      component: <VerticalCylindricalConicalTank />,
    },
  ];

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: yupResolver(TankLevelValidation(t)),
    defaultValues: {
      widget_name: '',
      // tankTypeName: incomingWidget?.tankTypeName || tankTypes[0].name,
      // selectedTankType: incomingWidget?.selectedTankType || 0,
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
          tank_type: tankTypes[0].key,
          enabled: incomingWidget?.enabled || false,

          // text_color: '#000000',
          value_color: '#000000',
          // background_color: '#ffffff',
        },
      ],
    },
  });
  console.log('pop', incomingWidget, products);
  const selectedTankType = watch(`sections.0.tank_type`);

  const { fields } = useFieldArray({
    control,
    name: 'sections',
  });

  useEffect(() => {
    if (incomingWidget && products?.length > 0) {
      reset({
        widget_name: incomingWidget?.widget_settings?.[0].widget_name || '',
        sections: incomingWidget?.widget_settings?.map(section => ({
          product: String(section.product) || '',
          device: String(section.device) || '',
          attributes: section.attributes || '',
          unit: section.unit || '',
          conditions: section?.rule?.conditions,
          max_value: section.max_value || '',
          tank_type: section.tank_type || tankTypes[0].key,
          // text_color: section.text_color || '#000000',
          value_color: section.value_color || '#000000',
          enabled: Boolean(section.rule?.is_for_all),
          // background_color: section.background_color || '#ffffff',
        })),
      });
    }
  }, [incomingWidget, products, devices, reset]);

  // Handle SVG selection - FIXED VERSION
  const handleSVGSelection = tank => {
    setValue('sections.0.tank_type', tank.key);
  };

  const onSubmit = async data => {
    console.log('🔴 STEP 1 - Form data:', data);
    console.log('🔴 STEP 2 - sections array:', data.sections);
    console.log('🔴 STEP 3 - tank_type in section:', data.sections[0]?.tank_type);

    const finalPayload = {
      widget_name: data.widget_name,
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
        className="absolute top-4 right-4 text-ink-2 cursor-pointer hover:text-ink-0"
        disabled={isSubmitting || isDeleting}
      >
        {/* <CancelIcon className={`w-6 h-6`} /> */}
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('tankForm.widgetSettings')}
        </h1>
        <p className="text-ink-2 text-sm">{t('tankForm.tankLevel')}</p>
      </div>

      <h2 className="font-semibold text-xs uppercase tracking-wider text-ink-2 mb-2">
        {t('tankForm.general')}
      </h2>

      <div className="flex flex-col gap-4">
        <div className="p-4  rounded-xl">
          <div className="bg-surface-2 rounded-md">
            <Controller
              name="widget_name"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  className="w-full rounded-sm text-lg p-4 focus:outline-none"
                  placeholder={t('tankForm.widgetName')}
                  disabled={isSubmitting || isDeleting}
                  error={!!errors.widget_name}
                  helperText={errors.widget_name?.message}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Hidden Controllers to track tank type in form state */}
      <Controller
        name="tank_type"
        control={control}
        render={({ field: { value, ...rest } }) => (
          <input type="hidden" {...rest} value={value ?? ''} />
        )}
      />
      {/* <Controller
        name="selectedTankType"
        control={control}
        render={({ field }) => <input type="hidden" {...field} />}
      /> */}

      {/* Settings Section */}
      {fields.map((field, index) => (
        <Fragment key={field.id}>
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
            incomingWidget={incomingWidget}
            showUnitField={true}
            setValue={setValue}
            showMaxValueField={true}
            plusBtn={false}
            sectionIndex={index}
            // BackgroundColor = {true}
            // showTextColor={true}
            // BackgroundColor={true}
            showValueColor={true}
            // fields={fields}
          />
        </Fragment>
      ))}

      <h1 className="font-bold mt-4">{t('tankForm.tankType')}</h1>

      {/* Display selected tank type name */}
      {/* {selectedIndex !== null && ( */}
      <p className="text-xs text-ink-2 mt-2">
        {t('tankForm.selected')}
        {tankTypes.find(tank => tank.key === selectedTankType)?.displayName ??
          tankTypes[0].displayName}
      </p>
      {/* )} */}

      <div className="flex mt-4 mb-7 flex-wrap">
        {tankTypes.map(tank => (
          <div
            key={tank.key}
            className={`cursor-pointer hover:border-line transition duration-200 rounded-2xl ${
              selectedTankType === tank.key
                ? 'border border-accent-cyan bg-accent-cyan/5'
                : 'border border-transparent'
            }`}
            onClick={() => handleSVGSelection(tank)}
            title={tank.displayName}
          >
            <div className="w-52">{tank.component}</div>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      <div className="flex mt-4 justify-between">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-1 font-semibold text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3"
            disabled={isSubmitting || isDeleting}
          >
            {t('tankForm.cancel')}
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
            {isDeleting ? t('tankForm.removing') : t('tankForm.removeWidget')}
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
          {isSubmitting ? t('tankForm.saving') : t('tankForm.save')}
        </button>
      </div>
    </form>
  );
}
