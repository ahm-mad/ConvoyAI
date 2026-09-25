// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { MixChartValidation } from '../../validation/MixChartValidation';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import SelectRadix from '@components/Select';
import GlobalInput from '../../components/Input';
import { get } from '../../utils/apiHelper';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { mapExtractedKeys } from '@utils/mapExtractedKeys';

export default function MixChartForm({
  onClose,
  handleModalSubmit,
  incomingWidget,
  handleDeleteWidget,
  products,
  devices,
}) {
  const { t } = useTranslation();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceOptionsMap, setDeviceOptionsMap] = useState({});
  const [attributeOptionsMap, setAttributeOptionsMap] = useState({});
  const [loadingDevicesMap, setLoadingDevicesMap] = useState({});
  // Store attribute units map for each section
  const [attributeUnitsMap, setAttributeUnitsMap] = useState({});

  // Track if form has been initialized
  const hasInitialized = useRef(false);

  const isEditMode = !!incomingWidget;

  const formattedProducts = useMemo(() => {
    if (
      products?.length > 0 &&
      products[0].hasOwnProperty('label') &&
      products[0].hasOwnProperty('value')
    ) {
      return products;
    }
    return [];
  }, [products]);

  const intervalOptions = [
    { value: 'daily', label: 'daily' },
    { value: 'weekly', label: 'weekly' },
    { value: 'monthly', label: 'monthly' },
  ];

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(MixChartValidation(t)),
    defaultValues: {
      widget_name: '',
      graph_interval: '',
      sections: [
        {
          y_axis_label: '',
          product: '',
          device: '',
          attributes: '',
          unit: '',
          graph_type: '',
          text_color: '#3B82F6',
        },
      ],
    },
  });

  const handleProductChange = async (productId, index, fieldOnChange) => {
    fieldOnChange(productId);

    if (!productId) {
      setLoadingDevicesMap(prev => ({ ...prev, [index]: false }));
      return;
    }

    setLoadingDevicesMap(prev => ({ ...prev, [index]: true }));
    setValue(`sections.${index}.device`, '');

    try {
      const response = await get(`/api/devices/product/${productId}`);
      if (response.success) {
        const availableDevices = response.data?.map(device => ({
          label: device.device_unique_identifier,
          value: String(device.id),
        }));
        const userPreferences = mapExtractedKeys(response?.userPreference);

        setDeviceOptionsMap(prev => ({ ...prev, [index]: availableDevices }));
        setAttributeOptionsMap(prev => ({ ...prev, [index]: userPreferences }));

        // Create a map of attribute_key -> unit from userPreference for this section
        const unitsMap = {};
        response?.userPreference?.forEach(pref => {
          unitsMap[pref.attribute_key] = pref.unit;
        });
        setAttributeUnitsMap(prev => ({ ...prev, [index]: unitsMap }));
        console.log('Units Map for section', index, ':', unitsMap);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoadingDevicesMap(prev => ({ ...prev, [index]: false }));
    }
  };

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'sections',
  });

  useEffect(() => {
    hasInitialized.current = false;
  }, [incomingWidget?.id]);

  // Main initialization effect
  useEffect(() => {
    if (!incomingWidget || !products?.length || hasInitialized.current) {
      return;
    }

    // Normalize interval value
    const rawInterval = incomingWidget?.graph_interval || '';
    const graphInterval = rawInterval.toLowerCase().trim();

    console.log('Raw interval:', rawInterval);
    console.log('Normalized interval:', graphInterval);

    const sectionsWithDevicesAndAttributes =
      incomingWidget?.widget_settings?.map((section, index) => {
        const sectionData = {
          y_axis_label: section.y_axis_label || section.yAxisTitle || '',
          product: String(section.product || section.product_id || '') || '',
          device: String(section.device || section.device_id || '') || '',
          attributes: String(section.attributes || section.attribute || '') || '',
          unit: section.unit || '',
          graph_type: section.graph_type || '',
          text_color: section.text_color || '#3B82F6',
        };

        console.log(sectionData, '84738748');

        if (section.product) {
          setLoadingDevicesMap(prev => ({ ...prev, [index]: true }));

          get(`/api/devices/product/${section.product}`)
            .then(response => {
              if (response?.success) {
                const availableDevices = response.data?.map(device => ({
                  label: device.device_unique_identifier,
                  value: String(device.id),
                }));
                const userPreferences = mapExtractedKeys(response?.userPreference);

                setDeviceOptionsMap(prev => ({ ...prev, [index]: availableDevices }));
                setAttributeOptionsMap(prev => ({ ...prev, [index]: userPreferences }));

                // Store units map for this section
                const unitsMap = {};
                response?.userPreference?.forEach(pref => {
                  unitsMap[pref.attribute_key] = pref.unit;
                });
                setAttributeUnitsMap(prev => ({ ...prev, [index]: unitsMap }));
              }
            })
            .catch(error => console.error('Error loading devices:', error))
            .finally(() => {
              setLoadingDevicesMap(prev => ({ ...prev, [index]: false }));
            });
        }

        return sectionData;
      }) || [];

    const formData = {
      widget_name: incomingWidget?.widget_settings?.[0]?.widget_name || '',
      graph_interval: graphInterval,
      sections: sectionsWithDevicesAndAttributes,
    };

    console.log('Resetting form with:', formData);

    // Reset form
    reset(formData);

    setValue('graph_interval', graphInterval, {
      shouldValidate: false,
      shouldDirty: false,
    });

    hasInitialized.current = true;
  }, [incomingWidget?.id, products]);

  const ChartTypes = [
    { label: 'Bar Chart', value: 'barGraph' },
    { label: 'Line Chart', value: 'lineGraph' },
  ];

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
    { label: 'Air Quality AQI)', value: 'AQI' },
    { label: 'Sound Level (dB)', value: 'dB' },
    { label: 'Weight (kg)', value: 'kg' },
  ];

  const onSubmit = async data => {
    console.log('final-mix-chart-payload', data);
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

  const handleAddSection = () => {
    append({
      y_axis_label: '',
      product: '',
      device: '',
      attributes: '',
      unit: '',
      graph_type: '',
      text_color: '#000000',
    });
  };

  const handleDeleteSection = index => {
    remove(index);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-transparent w-[60vw] max-w-full">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-ink-2 cursor-pointer hover:text-ink-0"
        disabled={isSubmitting || isDeleting}
      >
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('chart_bar.widgetSettings')}
        </h1>
        <p className="text-ink-2 text-sm">{t('chart_bar.mixChart')}</p>
      </div>

      <h2 className="font-semibold text-xs uppercase tracking-wider text-ink-2 mb-2">
        {t('chart_bar.general')}
      </h2>

      <div className="flex flex-col md:flex-row gap-4 w-full">
        <div className="bg-surface-2 w-full rounded-md">
          <Controller
            name="widget_name"
            control={control}
            render={({ field }) => (
              <InputField
                {...field}
                className="w-full rounded-sm text-lg p-4 focus:outline-none"
                placeholder={t('chart_bar.widgetNamePlaceholder')}
                height="h-[50px]"
                textSize="text-sm md:text-[15.5px]"
                error={!!errors.widget_name}
                helperText={errors.widget_name?.message}
                disabled={isSubmitting || isDeleting}
              />
            )}
          />
        </div>
        <div className="bg-surface-2 w-full rounded-md">
          <Controller
            name="graph_interval"
            control={control}
            render={({ field }) => {
              console.log('Rendering graph_interval with value:', field.value);
              return (
                <SelectRadix
                  key={`interval-${field.value}`}
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  className="bg-surface-1"
                  placeholder="Select Interval"
                  options={intervalOptions}
                  size="large"
                  error={!!errors?.graph_interval}
                  helperText={errors?.graph_interval?.message}
                  disabled={isSubmitting || isDeleting}
                />
              );
            }}
          />
        </div>
      </div>

      <div className="">
        <div className="text-sm md:text-base text-ink-0 font-semibold uppercase tracking-wider mt-4">
          {t('chart_bar.charts')}
        </div>

        <div className="rounded-xl mt-2">
          <div className="mt-4 flex flex-col gap-4">
            {fields.map((field, index) => {
              return (
                <div
                  key={field.id}
                  className="border border-line-soft rounded-md p-3 md:p-4 mb-4 bg-surface-1"
                >
                  <div className="flex justify-end items-center mb-3">
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSection(index)}
                        className="text-danger hover:brightness-125 cursor-pointer p-1 rounded opacity-50 hover:opacity-100 transition-opacity"
                        disabled={isSubmitting || isDeleting}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-y-4 md:gap-y-6">
                    <div className="flex gap-4 justify-start">
                      <div className="w-full">
                        <Controller
                          name={`sections.${index}.y_axis_label`}
                          control={control}
                          render={({ field }) => (
                            <GlobalInput
                              {...field}
                              className="bg-background-lightest"
                              height="h-[50px]"
                              textSize="text-sm md:text-[15.5px]"
                              fullWidth={true}
                              placeholder={t('chart_bar.yAxisLabelPlaceholder')}
                              error={!!errors.sections?.[index]?.y_axis_label}
                              helperText={errors.sections?.[index]?.y_axis_label?.message}
                              disabled={isSubmitting || isDeleting}
                            />
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="w-full md:w-1/2">
                        <Controller
                          name={`sections.${index}.product`}
                          control={control}
                          render={({ field }) => (
                            <SelectRadix
                              value={field.value}
                              onValueChange={newValue =>
                                handleProductChange(newValue, index, field.onChange)
                              }
                              className="bg-surface-1"
                              placeholder={t('chart_bar.selectProduct')}
                              options={formattedProducts}
                              size="large"
                              error={!!errors.sections?.[index]?.product}
                              helperText={errors.sections?.[index]?.product?.message}
                              disabled={isSubmitting || isDeleting}
                            />
                          )}
                        />
                      </div>

                      <div className="w-full md:w-1/2">
                        <Controller
                          name={`sections.${index}.device`}
                          control={control}
                          render={({ field }) => (
                            <div className="relative">
                              <SelectRadix
                                value={field.value}
                                onValueChange={field.onChange}
                                className={`bg-surface-1 ${loadingDevicesMap[index] ? 'opacity-70' : ''}`}
                                placeholder={
                                  loadingDevicesMap[index] ? '' : t('chart_bar.selectDevice')
                                }
                                options={deviceOptionsMap[index] || []}
                                size="large"
                                error={!!errors.sections?.[index]?.device}
                                helperText={errors.sections?.[index]?.device?.message}
                                disabled={
                                  !watch(`sections.${index}.product`) ||
                                  loadingDevicesMap[index] ||
                                  isSubmitting ||
                                  isDeleting
                                }
                              />
                              {loadingDevicesMap[index] && (
                                <div className="absolute left-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-line border-t-accent-cyan"></div>
                                </div>
                              )}
                            </div>
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="w-full lg:w-1/3">
                        <Controller
                          name={`sections.${index}.attributes`}
                          control={control}
                          render={({ field }) => (
                            <SelectRadix
                              value={field.value}
                              onValueChange={val => {
                                field.onChange(val);

                                // Automatically set the unit based on the selected attribute
                                const unitForAttribute = attributeUnitsMap[index]?.[val];

                                if (unitForAttribute) {
                                  setValue(`sections.${index}.unit`, unitForAttribute, {
                                    shouldDirty: true,
                                  });
                                  console.log(
                                    `Auto-set unit for section ${index}:`,
                                    unitForAttribute
                                  );
                                }
                              }}
                              className="bg-surface-1"
                              placeholder={t('chart_bar.selectAttributes')}
                              options={attributeOptionsMap[index] || []}
                              size="large"
                              error={!!errors.sections?.[index]?.attributes}
                              helperText={errors.sections?.[index]?.attributes?.message}
                              disabled={
                                !watch(`sections.${index}.device`) || isSubmitting || isDeleting
                              }
                            />
                          )}
                        />
                      </div>
                      <div className="w-full lg:w-1/3">
                        <Controller
                          name={`sections.${index}.unit`}
                          control={control}
                          render={({ field }) => (
                            <SelectRadix
                              value={field.value}
                              onValueChange={field.onChange}
                              className="bg-surface-1"
                              placeholder={t('chart_bar.unit')}
                              options={unitOptions}
                              size="large"
                              error={!!errors.sections?.[index]?.unit}
                              helperText={errors.sections?.[index]?.unit?.message}
                              disabled={
                                !watch(`sections.${index}.device`) || isSubmitting || isDeleting
                              }
                            />
                          )}
                        />
                      </div>
                      <div className="w-full lg:w-1/3">
                        <Controller
                          name={`sections.${index}.graph_type`}
                          control={control}
                          render={({ field }) => (
                            <SelectRadix
                              value={field.value}
                              onValueChange={field.onChange}
                              className="bg-surface-1"
                              placeholder={t('chart_bar.selectChartType')}
                              options={ChartTypes}
                              size="large"
                              error={!!errors.sections?.[index]?.graph_type}
                              helperText={errors.sections?.[index]?.graph_type?.message}
                              disabled={
                                !watch(`sections.${index}.attributes`) || isSubmitting || isDeleting
                              }
                            />
                          )}
                        />
                      </div>

                      <div className="w-full lg:w-auto">
                        <Controller
                          name={`sections.${index}.text_color`}
                          control={control}
                          render={({ field }) => (
                            <GlobalInput
                              {...field}
                              type="color"
                              height="h-[48px]"
                              className="cursor-pointer w-full lg:w-16"
                              error={!!errors.sections?.[index]?.text_color}
                              helperText={errors.sections?.[index]?.text_color?.message}
                              disabled={isSubmitting || isDeleting}
                            />
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {fields.length - 1 === index && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={handleAddSection}
                        className="bg-accent-cyan/5 hover:bg-accent-cyan/10 border cursor-pointer w-full md:w-1/2 border-accent-cyan/25 hover:border-accent-cyan/40 rounded-md px-4 py-2 text-accent-cyan font-medium transition-all duration-200 flex items-center justify-center gap-2 mt-4 text-sm"
                        disabled={isSubmitting || isDeleting}
                      >
                        {t('chart_bar.addData')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row mt-4 gap-4 md:gap-0 md:justify-between">
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-1 font-semibold text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3 text-sm md:text-base"
            disabled={isSubmitting || isDeleting}
          >
            {t('chart_bar.cancel')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!isEditMode || isSubmitting || isDeleting}
            className={`px-1 font-bold rounded text-sm md:text-base ${
              isEditMode && !isDeleting
                ? 'text-danger hover:bg-danger/10 cursor-pointer'
                : 'text-ink-2 cursor-not-allowed'
            }`}
          >
            {isDeleting ? t('chart_bar.removing') : t('chart_bar.removeWidget')}
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
          {isSubmitting ? t('chart_bar.saving') : t('chart_bar.save')}
        </button>
      </div>
    </form>
  );
}
