// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import GlobalInput from '@components/Input';
import SelectRadix from '@components/Select';
import CustomButton from '@components/Button';
import { useModal } from '@contexts/ModalContext';
import { useUser } from '@contexts/UserContext';
import { IconMapper } from '@utils/IconMapper';
import { post, put, get } from '@utils/apiHelper';
import { yupResolver } from '@hookform/resolvers/yup';
import { addEditEntityModalSchema } from '@validation/AddEditEntityModalValidation';
import { useTranslation } from 'react-i18next';

const iconOptions = [
  { label: 'Building', value: 'BuildingIcon', icon: IconMapper['BuildingIcon'] },
  { label: 'Factory', value: 'FactoryIcon', icon: IconMapper['FactoryIcon'] },
  { label: 'Farm', value: 'FarmIcon', icon: IconMapper['FarmIcon'] },
  { label: 'Machine', value: 'MachineIcon', icon: IconMapper['MachineIcon'] },
  { label: 'Boat', value: 'BoatIcon', icon: IconMapper['BoatIcon'] },
  { label: 'General', value: 'GeneralIcon', icon: IconMapper['GeneralIcon'] },
];

const isDeviceAssignedOptions = [
  { label: 'None', value: '0' },
  { label: 'Assign Device', value: '1' },
];

export default function AddEditEntityModal({ mode, onSave, node, productData }) {
  const { closeModal } = useModal();
  const { user } = useUser();
  const { t } = useTranslation();
  const [availableDevices, setAvailableDevices] = useState([]);
  const [updateFields, setUpdateFields] = useState(true);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    // resolver: yupResolver(addEditEntityModalSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      icon: iconOptions[0].value,
      type: '',
      isDeviceAssigned: '0',
      selectedDevice: '',
      selectedProduct: '',
    },
  });

  const isDeviceAssigned = watch('isDeviceAssigned');
  const selectedProduct = watch('selectedProduct');

  useEffect(() => {
    if (mode === 'edit' && node && productData && updateFields) {
      reset({
        name: node?.data?.name || '',
        icon: node?.icon || iconOptions[0].value,
        type: node?.data?.type || node?.data?.component_type || '',
        isDeviceAssigned: String(node?.data?.inventory_check) ?? '0',
        selectedProduct: String(node?.data?.product_id) ?? '',
        selectedDevice: String(node?.data?.device_id) ?? '',
      });
    }
  }, [mode, node, reset, productData, availableDevices]);

  useEffect(() => {
    if (!selectedProduct || selectedProduct === 'undefined' || selectedProduct === 'null') return;
    (async () => {
      const response = await get(`/api/devices/product/${selectedProduct}`);
      if (response.success) {
        const assignedIds = response.assigned_device_ids || [];
        const currentDeviceId = String(node?.data?.device_id || '');
        console.log(currentDeviceId, '875847');
        const devices = response.data
          .filter(device => {
            const deviceId = String(device.id);

            return !assignedIds.includes(deviceId) || deviceId === currentDeviceId;
          })
          .map(device => ({
            label: device.device_unique_identifier,
            value: String(device.id),
          }));

        setAvailableDevices(devices);
      }
    })();
  }, [selectedProduct, node]);

  useEffect(() => {
    if (!updateFields && isDeviceAssigned == '0') {
      setValue('selectedProduct', '');
      setValue('selectedDevice', '');
    }
    if (mode == 'addAsset' || (node?.isTopMost == true && mode == 'edit')) {
      setValue('type', node?.data?.type || node?.data?.component_type || '');
      setValue('icon', node?.icon || iconOptions[0].value);
    }
  }, [isDeviceAssigned]);

  const onSubmit = async data => {
    try {
      const formattedPayload = {
        name: data.name,
        icon: data.icon,
        [node ? 'component_type' : 'type']: data.type,
        inventory_check: isDeviceAssigned,
        company_id: user?.company_id,
        ...(mode == 'addAsset'
          ? {}
          : mode === 'addChild' && node.isTopMost
            ? { parent_id: null }
            : mode === 'edit' && !node.isTopMost
              ? { parent_id: node?.data?.parent_id }
              : { parent_id: node?.data?.id }),
        product_id: data.selectedProduct,
        device_id: data.selectedDevice,
      };

      const apiPayload =
        node && mode !== 'edit' ? { components: [formattedPayload] } : formattedPayload;

      if (mode === 'edit') {
        const endpoint = node.isTopMost ? `/api/assets/${node.id}` : `/api/components/${node.id}`;
        await put(endpoint, apiPayload);
      } else {
        const endpoint = node ? `/api/assets/${node.data.asset_id}/components` : `/api/assets`;
        await post(endpoint, apiPayload);
      }

      onSave();
      closeModal();
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6   w-full max-w-full sm:max-w-[600px] mx-auto overflow-x-hidden">
      <div className="overflow-y-auto overflow-x-hidden max-h-[90vh]">
        <h3 className="text-lg font-semibold text-ink-0 text-center sm:text-left font-display">
          {mode === 'edit' ? 'Edit component' : 'Add component'}
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col space-y-5">
          {/* Name */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
            <div className="font-medium text-sm text-ink-1 sm:w-[180px] sm:flex-shrink-0">
              Component name:
            </div>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  size="small"
                  height="h-[35px]"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Enter component name"
                  error={errors.name?.message}
                  helperText={errors.name?.message}
                  className="w-full"
                />
              )}
            />
          </div>

          {/* Type */}
          {(mode == 'addAsset' || (node?.isTopMost == true && mode == 'edit')) && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
              <div className="font-medium text-sm text-ink-1 sm:w-[180px] sm:flex-shrink-0">
                Component Type:
              </div>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <SelectRadix
                    placeholder={t('componentType')}
                    value={field.value}
                    options={iconOptions}
                    onValueChange={field.onChange}
                    className="w-full"
                    renderOption={opt => <div className="flex gap-2 items-center">{opt.label}</div>}
                    renderValue={val => {
                      const selected = iconOptions.find(o => o.value === val);
                      return <div className="flex gap-2 items-center">{selected?.label}</div>;
                    }}
                  />
                )}
              />
            </div>
          )}

          {/* Icon */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
            <div className="font-medium text-sm text-ink-1 sm:w-[180px] sm:flex-shrink-0">
              Component Icon:
            </div>
            <Controller
              name="icon"
              control={control}
              render={({ field }) => (
                <SelectRadix
                  value={field.value}
                  options={iconOptions}
                  onValueChange={field.onChange}
                  className="w-full"
                  renderOption={opt => (
                    <div className="flex gap-2 items-center">
                      {opt.icon} {opt.label}
                    </div>
                  )}
                  renderValue={val => {
                    const selected = iconOptions.find(o => o.value === val);
                    return (
                      <div className="flex gap-2 items-center">
                        {selected?.icon} {selected?.label}
                      </div>
                    );
                  }}
                />
              )}
            />
          </div>

          {/* Device Assignment */}
          {(node?.isTopMost == false || mode == 'addChild') && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                <div className="font-medium text-sm text-ink-1 sm:w-[180px] sm:flex-shrink-0">
                  Device Assignment:
                </div>
                <div className="w-full" onMouseDown={() => setUpdateFields(false)}>
                  <Controller
                    name="isDeviceAssigned"
                    control={control}
                    render={({ field }) => (
                      <SelectRadix
                        placeholder="Select whether to assign device"
                        value={String(field.value)}
                        options={isDeviceAssignedOptions}
                        onValueChange={field.onChange}
                        className="w-full"
                      />
                    )}
                  />
                </div>
              </div>

              {/* Product Selection */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                <div className="font-medium text-sm text-ink-1 sm:w-[180px] sm:flex-shrink-0">
                  Select Product:
                </div>
                <div className="w-full" onMouseDown={() => setUpdateFields(false)}>
                  <Controller
                    name="selectedProduct"
                    control={control}
                    render={({ field }) => (
                      <SelectRadix
                        placeholder="Select product"
                        value={field.value}
                        options={productData?.data?.data?.map(product => ({
                          value: String(product.id),
                          label: product.name,
                        }))}
                        onValueChange={field.onChange}
                        disabled={isDeviceAssigned == '0'}
                        error={errors.selectedProduct?.message}
                        helperText={errors.selectedProduct?.message}
                        className="w-full"
                      />
                    )}
                  />
                </div>
              </div>

              {/* Device Selection */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                <div className="font-medium text-sm text-ink-1 sm:w-[180px] sm:flex-shrink-0">
                  Select Device:
                </div>
                <Controller
                  name="selectedDevice"
                  control={control}
                  render={({ field }) => (
                    <SelectRadix
                      label={t('selectDevice')}
                      placeholder="Select device"
                      value={field.value}
                      options={availableDevices}
                      onValueChange={field.onChange}
                      disabled={isDeviceAssigned == '0'}
                      error={errors.selectedDevice?.message}
                      helperText={errors.selectedDevice?.message}
                      className="w-full"
                    />
                  )}
                />
              </div>
            </>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-4 border-t border-line">
            <CustomButton
              type="submit"
              variant="primary"
              className="px-4 py-2 w-full sm:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('saving') : mode === 'edit' ? t('update') : t('save')}
            </CustomButton>
          </div>
        </form>
      </div>
    </div>
  );
}
