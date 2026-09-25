// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { Fragment, useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import GlobalInput from '../../components/Input';
import CircleChevronUp from '@assets/icons/ReactIcon/CircleChevronUp';
import CircleChevronDown from '@assets/icons/ReactIcon/CircleChevronDown';
import SelectRadix from '@components/Select';
import GlobalToggle from './ToggleBtn';
import { useTranslation } from 'react-i18next';
import { get } from '@utils/apiHelper';
import DeleteIcon from '@mui/icons-material/Delete';
import { mapExtractedKeys } from '@utils/mapExtractedKeys';
import IconWrapper, { iconMap } from '@utils/ReactIconDynamicImport';
import AddBtnIcon from '../../assets/icons/MUIicons/AddBtnIcon';
import { useFieldArray } from 'react-hook-form';
import { Value } from '@radix-ui/react-select';

const isDemo = JSON.parse(localStorage.getItem('user') || '{}')?.isDemo ?? false;

function ShowAndHide({
  errors,
  dirtyFields,
  control,
  watch,
  productOptions,
  deviceOptions,
  setDeviceOptions,
  attributeOptions,
  setAttributeOptions,
  incomingWidget,
  showIconField = false,
  showUnitField = false,
  showAttributeField = true,
  setSelectedAllAttributes = () => {},
  colorSetting = isDemo ? false : true,
  setValue,
  onDeleteSection,
  canDelete = false,
  showBackgroundColor = false,
  sectionIndex = 0,
  showMaxValueField = false,
  showTextColor = false,
  showValueColor = false,
  alertSettings = isDemo ? false : true,
}) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [localDeviceOptions, setLocalDeviceOptions] = useState([]);
  const [localAttributeOptions, setLocalAttributeOptions] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  // Store the raw user preferences with unit information
  const [attributeUnitsMap, setAttributeUnitsMap] = useState({});

  const product = watch(`sections.${sectionIndex}.product`);
  const device = watch(`sections.${sectionIndex}.device`);
  const attribute = watch(`sections.${sectionIndex}.attributes`);
  const label = watch(`sections.${sectionIndex}.label`);

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
  } = useFieldArray({ control, name: `sections.${sectionIndex}.conditions` });

  const handleAddCondition = () => {
    appendCondition({
      selectedProduct: product ?? '',
      selectedAttribute: attribute ?? '',
      selectedCondition: t('conditions.equalTo'),
      conditionValue: '',
      logicalOperator: t('logicalOperators.and'),
    });
  };

  function handleDeleteCondition(conditionIndex) {
    console.log('innnndex', conditionIndex);
    removeCondition(conditionIndex);
    if (conditionIndex === 0) {
      setValue(`sections.${sectionIndex}.conditions.0.logicalOperator`, t('newRule.if'), {
        shouldDirty: true,
      });
    }
  }

  console.log('conditionFields', conditionFields);

  useEffect(() => {
    if (!product) {
      setIsLoadingDevices(false);
      return;
    }

    setIsLoadingDevices(true);

    (async () => {
      try {
        const response = await get(`/api/devices/product/${product}`);
        console.log('res', response);
        if (response.success) {
          const availableDevices = response?.data?.map(device => ({
            label: device.device_unique_identifier,
            value: String(device.id),
          }));
          console.log('availableDevices', availableDevices);
          setLocalDeviceOptions(availableDevices);
          console.log('boss1', response?.userPreference);

          const userPreferences = mapExtractedKeys(response?.userPreference);
          console.log('bhai', userPreferences);
          setLocalAttributeOptions(userPreferences);
          setSelectedAllAttributes(userPreferences);

          // Create a map of attribute_key -> unit from userPreference
          const unitsMap = {};
          response?.userPreference?.forEach(pref => {
            console.log('info', pref);
            unitsMap[pref.attribute_key] = pref.unit;
          });
          setAttributeUnitsMap(unitsMap);
          console.log('Units Map:', unitsMap);
        }
      } catch (error) {
        console.error('Error fetching devices:', error);
      } finally {
        setIsLoadingDevices(false);
      }
    })();
  }, [product]);

  console.log('Attttt', attribute);
  useEffect(() => {
    if (attribute) {
      conditionFields?.forEach((field, index) => {
        setValue(`sections.${sectionIndex}.conditions.${index}.selectedProduct`, product);
        setValue(`sections.${sectionIndex}.conditions.${index}.selectedAttribute`, attribute);

        console.log('parking', attribute);
      });
    }
  }, [attribute]);

  console.log('incomingWidget', incomingWidget);

  const toggleSize = () => {
    setIsExpanded(!isExpanded);
  };
  console.log('popto', productOptions);
  console.log('popto-product', product);

  const iconOptions = Object.keys(iconMap).map(key => ({
    label: key,
    value: key,
  }));

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

  const logicalOperatorOptions = [
    { label: t('logicalOperators.and'), value: t('logicalOperators.and') },
    { label: t('logicalOperators.or'), value: t('logicalOperators.or') },
  ];

  const conditionOptions = [
    { label: t('conditions.lessThan'), value: t('conditions.lessThan') },
    { label: t('conditions.lessThanOrEqual'), value: t('conditions.lessThanOrEqual') },
    { label: t('conditions.equalTo'), value: t('conditions.equalTo') },
    { label: t('conditions.notEqualTo'), value: t('conditions.notEqualTo') },
    { label: t('conditions.greaterThan'), value: t('conditions.greaterThan') },
    { label: t('conditions.greaterThanOrEqual'), value: t('conditions.greaterThanOrEqual') },
  ];

  const demoProducts = productOptions?.length > 0 ? productOptions : [];
  // : [{ label: 'Demo Product', value: 'demo-product' }];

  const demoDevices = localDeviceOptions?.length > 0 ? localDeviceOptions : [];
  // : [{ label: 'Demo Device', value: 'demo-device' }];

  const demoAttribute = localAttributeOptions?.length > 0 ? localAttributeOptions : [];
  // : [{ label: 'Demo Attribute', value: 'demo-attribute' }];

  return (
    <>
      <h2 className="font-semibold text-sm text-ink-0 uppercase tracking-wider">
        {t('showAndHide.Setting')}
      </h2>
      <div
        className={` border-line-soft border  mt-4 rounded-md p-3 w-auto h-auto transition-all duration-300 bg-surface-1`}
      >
        <div className="flex justify-between">
          {isExpanded ? (
            <CircleChevronUp className={`text-ink-2 cursor-pointer w-6 h-6`} onClick={toggleSize} />
          ) : (
            <CircleChevronDown
              className={`text-ink-2 cursor-pointer w-6 h-6`}
              onClick={toggleSize}
            />
          )}

          {canDelete && (
            <DeleteIcon onClick={onDeleteSection} className="text-danger cursor-pointer" />
          )}
        </div>

        {isExpanded && (
          <>
            <div className="flex mt-4 flex-col  gap-5">
              <Controller
                name={`sections.${sectionIndex}.product`}
                control={control}
                render={({ field }) => (
                  <SelectRadix
                    id="sel-prd"
                    value={field.value}
                    onValueChange={field.onChange}
                    error={!!errors.sections?.[sectionIndex]?.product}
                    helperText={errors.sections?.[sectionIndex]?.product?.message}
                    placeholder={t('showAndHide.selectProduct')}
                    size="large"
                    className={`bg-surface-2`}
                    options={demoProducts}
                  />
                )}
              />

              <Controller
                name={`sections.${sectionIndex}.device`}
                control={control}
                render={({ field }) => (
                  <div className="relative h-[52px]">
                    <SelectRadix
                      id="sel-device"
                      value={field.value}
                      onValueChange={field.onChange}
                      error={!!errors.sections?.[sectionIndex]?.device}
                      helperText={errors.sections?.[sectionIndex]?.device?.message}
                      placeholder={isLoadingDevices ? '' : t('showAndHide.selectDevice')}
                      disabled={!product || isLoadingDevices}
                      size="large"
                      className={`bg-surface-2 ${isLoadingDevices ? 'opacity-70' : ''}`}
                      options={demoDevices}
                    />
                    {isLoadingDevices && (
                      <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-line border-t-accent-cyan"></div>
                      </div>
                    )}
                  </div>
                )}
              />

              {showAttributeField && (
                <Controller
                  name={`sections.${sectionIndex}.attributes`}
                  control={control}
                  render={({ field }) => (
                    <SelectRadix
                      id="sel-att"
                      value={field.value}
                      onValueChange={val => {
                        field.onChange(val);

                        // Set the label
                        const selectedOption = localAttributeOptions?.find(o => o.value == val);
                        setValue(`sections.${sectionIndex}.label`, selectedOption?.label ?? '');

                        // Automatically set the unit based on the selected attribute
                        const unitForAttribute = attributeUnitsMap[val];

                        if (unitForAttribute && showUnitField) {
                          setValue(`sections.${sectionIndex}.unit`, unitForAttribute, {
                            shouldDirty: true,
                          });
                        }
                      }}
                      error={!!errors.sections?.[sectionIndex]?.attributes}
                      helperText={errors.sections?.[sectionIndex]?.attributes?.message}
                      placeholder={t('showAndHide.selectAttribute')}
                      disabled={!device}
                      size="large"
                      className={`bg-surface-2`}
                      options={demoAttribute}
                    />
                  )}
                />
              )}

              {showIconField && (
                <Controller
                  name={`sections.${sectionIndex}.icon`}
                  control={control}
                  render={({ field }) => (
                    <SelectRadix
                      value={field.value}
                      onValueChange={field.onChange}
                      error={!!errors.sections?.[sectionIndex]?.icon}
                      helperText={errors.sections?.[sectionIndex]?.icon?.message}
                      placeholder={t('valueForm.icon')}
                      size="large"
                      className="bg-surface-2"
                      options={iconOptions.map(opt => ({
                        ...opt,
                        label: (
                          <div className="flex items-center gap-2">
                            <IconWrapper name={opt.label} className="w-5 h-5" />
                            <span className="capitalize">{opt.label}</span>
                          </div>
                        ),
                      }))}
                    />
                  )}
                />
              )}

              {showUnitField && (
                <Controller
                  name={`sections.${sectionIndex}.unit`}
                  control={control}
                  render={({ field }) => (
                    <SelectRadix
                      id="att-unit"
                      value={field.value}
                      onValueChange={field.onChange}
                      error={!!errors.sections?.[sectionIndex]?.unit}
                      helperText={errors.sections?.[sectionIndex]?.unit?.message}
                      placeholder={t('showAndHide.unit')}
                      size="large"
                      className={`bg-surface-2`}
                      options={unitOptions}
                    />
                  )}
                />
              )}

              {alertSettings && (
                <Fragment>
                  <div className="mt-1 ">
                    <div className="flex flex-wrap justify-between items-center  mb-4">
                      <h1 className="font-bold">Alert Settings</h1>
                      <button
                        type="button"
                        onClick={handleAddCondition}
                        className="brand-gradient-bg hover:brightness-110 on-gradient rounded-full w-7 h-7 cursor-pointer flex items-center justify-center transition-all duration-200 mt-2 sm:mt-0"
                        title="Add Condition"
                      >
                        <AddBtnIcon className="w-5 h-5 on-gradient transition-transform duration-200 group-hover:rotate-90" />
                      </button>
                    </div>

                    {conditionFields?.map((condition, conditionIndex) => {
                      return (
                        <div
                          className="flex flex-col  sm:flex-row my-3 gap-3 sm:gap-4 lg:gap-6 items-start sm:items-center text-ink-1 p-3 sm:p-0 bg-surface-2 sm:bg-transparent rounded-md sm:rounded-none"
                          key={condition.id}
                        >
                          <div className="w-full sm:w-20 md:w-24" id="condition">
                            <label className="block text-xs  font-medium text-ink-2 mb-1 sm:hidden">
                              {conditionIndex === 0 ? 'Condition' : 'Operator'}
                            </label>
                            {conditionIndex === 0 ? (
                              <span className="sm:ml-1">{t('newRule.if')}</span>
                            ) : (
                              <Controller
                                name={`sections.${sectionIndex}.conditions.${conditionIndex}.logicalOperator`}
                                control={control}
                                render={({ field }) => (
                                  <SelectRadix
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    heightProp="90px"
                                    disabled={conditionIndex == 0}
                                    label=""
                                    className="bg-surface-2 w-full"
                                    options={logicalOperatorOptions}
                                  />
                                )}
                              />
                            )}
                          </div>
                          <div className="flex max-sm:flex-col max-sm:items-start items-center   gap-2 w-full sm:w-auto">
                            <span className="text-xs sm:hidden text-ink-2   font-medium">
                              Attribute
                            </span>
                            <span className="bg-danger/10 text-danger px-2   sm:px-[10px] py-[7px] rounded-md text-sm font-medium whitespace-nowrap">
                              {label ||
                                incomingWidget?.widget_settings?.[sectionIndex]?.label ||
                                attribute ||
                                'attribute'}
                            </span>
                          </div>

                          <span className="hidden sm:inline text-sm font-medium">is</span>

                          <div className="w-full sm:w-32  md:w-36 lg:w-48">
                            <label className="block text-xs font-medium text-ink-2 mb-1 sm:hidden">
                              Condition
                            </label>
                            <Controller
                              name={`sections.${sectionIndex}.conditions.${conditionIndex}.selectedCondition`}
                              control={control}
                              render={({ field }) => (
                                <SelectRadix
                                  id="sel-range"
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  label=""
                                  heightProp="90px"
                                  className="bg-surface-2   w-full"
                                  options={conditionOptions}
                                />
                              )}
                            />
                          </div>

                          <div className="w-full  sm:w-24 md:w-28 lg:w-32">
                            <label className="block text-xs font-medium  text-ink-2 mb-1 sm:hidden">
                              Value
                            </label>
                            <Controller
                              name={`sections.${sectionIndex}.conditions.${conditionIndex}.conditionValue`}
                              control={control}
                              render={({ field }) => (
                                <GlobalInput
                                  {...field}
                                  id="att-val"
                                  className="w-full rounded-sm focus:outline-none"
                                  placeholder={t('newRule.value')}
                                  error={
                                    !!errors.sections?.[sectionIndex]?.conditions?.[conditionIndex]
                                      ?.conditionValue
                                  }
                                  height="h-8"
                                />
                              )}
                            />
                          </div>

                          {conditionFields.length > 1 && (
                            <div className="flex justify-end  w-full sm:w-auto mt-2 sm:mt-0">
                              <DeleteIcon
                                onClick={() => handleDeleteCondition(conditionIndex)}
                                className="text-danger cursor-pointer hover:brightness-125 transition-colors duration-200"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <p className="font-[14px] text-ink-2">
                        {t('showAndHide.alertSettingsExport')}
                      </p>
                      <div className="">
                        <Controller
                          name={`sections.${sectionIndex}.enabled`}
                          control={control}
                          render={({ field: { onChange, value } }) => (
                            <GlobalToggle
                              checked={value}
                              onChange={onChange}
                              trackColor="#ccc"
                              thumbColor="#fff"
                              checkedThumbColor="#fff"
                            />
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </Fragment>
              )}

              {colorSetting && (
                <>
                  <h1 className="font-bold">{t('showAndHide.color')}</h1>

                  <div
                    className={`flex gap-8  items-start ${showMaxValueField ? 'justify-center' : 'justify-start'}`}
                  >
                    {showMaxValueField && (
                      <div className="w-1/2 mt-6">
                        <Controller
                          name={`sections.${sectionIndex}.max_value`}
                          control={control}
                          render={({ field }) => (
                            <GlobalInput
                              {...field}
                              id="color-val"
                              type="number"
                              error={!!errors.sections?.[sectionIndex]?.maxvalue}
                              helperText={errors.sections?.[sectionIndex]?.maxvalue?.message}
                              placeholder={t('showAndHide.maxValue')}
                              size="large"
                              className={`bg-surface-2`}
                            />
                          )}
                        />
                      </div>
                    )}

                    <div className="flex justify-start  gap-8">
                      {showTextColor && (
                        <div className="flex flex-col items-center">
                          <h3 className="mb-1    text-sm font-medium">{t('showAndHide.text')}</h3>
                          <Controller
                            name={`sections.${sectionIndex}.text_color`}
                            control={control}
                            render={({ field }) => (
                              <GlobalInput
                                {...field}
                                type="color"
                                error={!!errors.sections?.[sectionIndex]?.text_color}
                                helperText={errors.sections?.[sectionIndex]?.text_color?.message}
                                width="20px"
                                className=" w-12  h-12 bg-surface-2 cursor-pointer"
                              />
                            )}
                          />
                        </div>
                      )}

                      {showValueColor && (
                        <div className="flex flex-col items-center">
                          <h3 className="mb-1 text-sm font-medium">{t('showAndHide.value')}</h3>
                          <Controller
                            name={`sections.${sectionIndex}.value_color`}
                            control={control}
                            render={({ field }) => (
                              <GlobalInput
                                {...field}
                                id="selc-color"
                                type="color"
                                error={!!errors.sections?.[sectionIndex]?.value_color}
                                helperText={errors.sections?.[sectionIndex]?.value_color?.message}
                                width="20px"
                                textSize=""
                                className="  bg-surface-2  cursor-pointer"
                              />
                            )}
                          />
                        </div>
                      )}

                      {showBackgroundColor && (
                        <div className="flex flex-col items-center">
                          <h3 className="mb-1  text-sm font-medium">
                            {t('showAndHide.background')}
                          </h3>
                          <Controller
                            name={`sections.${sectionIndex}.background_color`}
                            control={control}
                            render={({ field }) => (
                              <GlobalInput
                                {...field}
                                type="color"
                                error={!!errors.sections?.[sectionIndex]?.background_color}
                                helperText={
                                  errors.sections?.[sectionIndex]?.background_color?.message
                                }
                                width="20px"
                                className="w-12 h-12 bg-surface-2 cursor-pointer"
                              />
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default ShowAndHide;
