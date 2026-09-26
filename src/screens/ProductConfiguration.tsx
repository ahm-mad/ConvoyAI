/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CheckCircleOutline as CheckCircleOutlineIcon,
  HighlightOff as HighlightOffIcon,
} from '@components/ui/icons';
import { useState, useEffect } from 'react';
import { useNavigate } from '@lib/router-compat';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import GlobalInput from '../components/Input';
import TextArea from '../forms/FormComponents/TextArea';
import Buttton from '../components/Button';
import { ProductConfigurationSchema } from '../validation/ProductConfigurationValidation';
import { useToast } from '@contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { extractKeysFromPacket } from '@utils/extractKeys';
import { get, post } from '@utils/apiHelper';
import { dismissPacketToast } from '@utils/packetToastManager';
import { useModal } from '@contexts/ModalContext';
import AttributeModal from '../components/AttributeModal';
import ConfirmDelete from '../components/ConfirmDeleteProduct';
import AiIcon from '../assets/icons/MUIicons/AiIcon';
import SettingIcon from '@assets/icons/MUIicons/SettingIcon';
import DropdownMenuRadix from '../components/DropDownMenuRadix';
import { IoShieldCheckmarkOutline, IoLocationOutline } from 'react-icons/io5';
import ProductConfigurationSkeleton from '@components/ProductConfigurationSkeleton';
import { fakeProductConfiguration } from '@root/src/utils/fakeBackend/Data';
import ProductConfigurationDemo from '../ConvoyDemo/ProductConfigurationDemo';
import { isFirstDemo } from '../utils/DemoHelper';

interface ProductConfigurationProps {
  id?: string;
}

interface ProductConfigFormValues {
  product_name: string;
  token: string;
  attributes: any[];
  user_preferences: any[];
}

// GPS roles backend recognises (POST /attribute/preference/mark-role). Position
// detection is role-only — the attribute's label no longer matters.
const LOCATION_ROLES = [
  { value: 'latitude', label: 'Latitude' },
  { value: 'longitude', label: 'Longitude' },
  { value: 'speed', label: 'Speed' },
  { value: 'heading', label: 'Heading' },
] as const;

const roleLabel = (role: string | null | undefined) =>
  LOCATION_ROLES.find(r => r.value === role)?.label ?? role ?? '';

function ProductConfiguration({ id: propId }: ProductConfigurationProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [highlightedAttributes, setHighlightedAttributes] = useState<any[]>([]);
  const [selectedAttributeForModal, setSelectedAttributeForModal] = useState<any>(null);
  const [uniqueAttribute, setUniqueAttribute] = useState<any>(null);
  const [loadingUniqueAttribute, setLoadingUniqueAttribute] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastToastMessage, setLastToastMessage] = useState(''); // Track last toast to prevent duplicates
  const { openModal, closeModal } = useModal();
  const [demoStart, setDemoStart] = useState(false);
  const [demoData] = useState(fakeProductConfiguration);
  const toast = useToast();
  const webHookLink = 'https://api.convoyai.app/api/webhook';

  // Safe toast function to prevent duplicates
  const showToast = (type: 'success' | 'error', message: string) => {
    const toastKey = `${type}-${message}`;
    if (lastToastMessage !== toastKey) {
      setLastToastMessage(toastKey);
      toast[type](message);

      // Clear after 3 seconds to allow same message again later
      setTimeout(() => {
        setLastToastMessage('');
      }, 3000);
    }
  };

  const productID = propId;

  useEffect(() => {
    if (isFirstDemo('productConfigDemo')) {
      setDemoStart(false);
    }
  }, []);

  const {
    data: productConfiguration,
    isLoading,
    error,
    refetch,
  } = useSimpleQuery(`productConfiguration-${productID}`, `/api/product-settings/${productID}`, {
    enabled: !demoStart,
  });

  const effectiveConfiguration: any = demoStart ? demoData : productConfiguration;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<ProductConfigFormValues>({
    resolver: yupResolver(ProductConfigurationSchema(t)) as any,
    defaultValues: {
      product_name: '',
      token: '',
      attributes: [],
      user_preferences: [],
    },
  });

  const totalAttributes = watch('attributes');
  const selectedAttributes = watch('user_preferences');
  const incomingToken = watch('token');
  const productName = watch('product_name');

  const activeRoles = new Set<string>(
    (effectiveConfiguration?.user_preference_attributes ?? [])
      .map((attr: any) => attr.attribute_role)
      .filter(Boolean)
  );
  const hasGpsRoles = activeRoles.has('latitude') && activeRoles.has('longitude');

  const isAttributeSaved = (attributeKey: string) => {
    return effectiveConfiguration?.user_preference_attributes?.some(
      (attr: any) => attr.attribute_key === attributeKey
    );
  };

  const markAsUniqueAPI = async (attributeKey: string) => {
    const payload = {
      product_id: productID,
      attribute_key: attributeKey,
    };

    const response = await post('/api/attribute/preference/marked-as-unique', payload);
    if ((response as any).message.includes('successfully')) {
      setUniqueAttribute(attributeKey);
      refetch();
    }
    return response;
  };

  const preferenceOf = (attributeKey: string) =>
    effectiveConfiguration?.user_preference_attributes?.find(
      (attr: any) => attr.attribute_key === attributeKey
    );

  const roleOf = (attributeKey: string): string | null =>
    preferenceOf(attributeKey)?.attribute_role ?? null;

  const labelOfKey = (attributeKey: string) =>
    totalAttributes?.find((a: any) => a.value === attributeKey)?.label ?? attributeKey;

  const handleMarkRole = async (item: any, role: string) => {
    setLoadingUniqueAttribute(item.value);

    try {
      const response: any = await post(
        '/api/attribute/preference/mark-role',
        { product_id: Number(productID), attribute_key: item.value, role },
        {},
        false
      );

      // Business-rule 422/404 messages (e.g. "…is the unique identifier…") are
      // fixed strings — show them verbatim.
      if (response?.error || response?.success === false) {
        showToast('error', response?.message || 'Could not mark this attribute as a location.');

        return;
      }

      const replaced = response?.data?.replaced_attribute_key;

      showToast(
        'success',
        replaced
          ? `${roleLabel(role)} moved from "${labelOfKey(replaced)}" to "${item.label}".`
          : `"${item.label}" marked as ${roleLabel(role)}.`
      );
      refetch();
    } finally {
      setLoadingUniqueAttribute(null);
    }
  };

  const handleClearRole = async (item: any) => {
    setLoadingUniqueAttribute(item.value);

    try {
      const response: any = await post(
        '/api/attribute/preference/unmark-role',
        { product_id: Number(productID), attribute_key: item.value },
        {},
        false
      );

      if (response?.error || response?.success === false) {
        showToast('error', response?.message || 'Could not clear the location role.');

        return;
      }

      showToast('success', `Location role cleared for "${item.label}".`);
      refetch();
    } finally {
      setLoadingUniqueAttribute(null);
    }
  };

  const handleMarkAsUniqueFromDropdown = async (item: any) => {
    setLoadingUniqueAttribute(item.value);

    try {
      await markAsUniqueAPI(item.value);
      console.log('Successfully marked as unique:', item.value);
    } catch (error) {
      console.error('Error in handleMarkAsUniqueFromDropdown:', error);
    } finally {
      setLoadingUniqueAttribute(null);
    }
  };

  const handleSelect = (item: any) => {
    const hasSettings = effectiveConfiguration?.user_preference_attributes?.some(
      (attr: any) => attr.attribute_key === item.value
    );

    const isCurrentlySelected = selectedAttributes?.some(
      (selected: any) => selected?.value === item?.value
    );

    // A location attribute must stay selected, or this form's Save would switch
    // position tracking off. Clearing the role (⚙ menu) is the way to deselect.
    const role = roleOf(item.value);

    if (role && isCurrentlySelected) {
      showToast(
        'error',
        `"${item.label}" is the ${roleLabel(role)} attribute, so it stays selected. Clear its location role from the ⚙ menu first.`
      );
      return;
    }

    if (!isCurrentlySelected && !hasSettings) {
      showToast(
        'error',
        `Please configure settings for "${item.label}" first before selecting it.`
      );
      return;
    }

    clearErrors('user_preferences');

    const newSelected = isCurrentlySelected
      ? selectedAttributes?.filter((selected: any) => selected?.value !== item?.value)
      : [...selectedAttributes, item];

    setValue('user_preferences', newSelected);
  };

  const fetchAttributeSettings = async (attributeKey: string) => {
    const attributeData = effectiveConfiguration?.user_preference_attributes?.find(
      (attr: any) => attr.attribute_key === attributeKey
    );

    if (!attributeData) {
      console.warn('Attribute not found in user preferences:', attributeKey);
      return null;
    }

    const response = await get(`/api/attribute/preference/setting/${attributeData.id}`);
    return response;
  };

  const handleFieldClick = (item: any) => {
    handleSelect(item);
  };

  const handleConfigureAttributeFromDropdown = async (item: any) => {
    const isUnique = uniqueAttribute === item.value;

    if (isUnique) {
      console.log('Unique attributes cannot be configured');
      return;
    }

    const isSelected = selectedAttributes?.some((selected: any) => selected?.value === item?.value);

    // A location attribute that was only marked (no label/unit yet) has no
    // saved settings — open the modal as a fresh configuration, not an edit.
    const roleOnly = !!roleOf(item.value) && !preferenceOf(item.value)?.label;

    if (!isSelected || roleOnly) {
      setSelectedAttributeForModal(item);
      handleModal(item);
    } else {
      console.log('Fetching settings for attribute:', item.value);
      const existingSettings = await fetchAttributeSettings(item.value);
      console.log('Received existing settings:', existingSettings);

      const hasExistingSettings = existingSettings?.productAttributeSetting?.id;

      if (!hasExistingSettings) {
        showToast('error', existingSettings?.message || 'Please configure this attribute first.');
        return;
      }
      setSelectedAttributeForModal(item);
      handleModal(item, existingSettings);
    }
  };

  const handleModalSave = async (
    attributeData: any,
    selectedAttribute: any,
    _productName?: any
  ) => {
    console.log('Modal data saved:', attributeData);
    closeModal();

    const currentSelected = watch('user_preferences') || [];
    const isAlreadySelected = currentSelected.some(
      (attr: any) => attr.value === selectedAttribute.value
    );

    if (!isAlreadySelected) {
      const newSelected = [...currentSelected, selectedAttribute];
      setValue('user_preferences', newSelected);
      console.log('Auto-selected attribute after save:', selectedAttribute.value);
    }

    refetch();
  };

  // Attribute's saved settings were removed entirely (AttributeModal's
  // "Remove configuration") — unselect it too, since a selected attribute
  // with no settings would just fail this form's own "configure it first"
  // check on next submit.
  const handleModalDelete = (selectedAttribute: any) => {
    closeModal();

    const currentSelected = watch('user_preferences') || [];
    const newSelected = currentSelected.filter(
      (attr: any) => attr.value !== selectedAttribute.value
    );
    setValue('user_preferences', newSelected);

    refetch();
    showToast('success', `Removed configuration for "${selectedAttribute.label}".`);
  };

  const onSubmit = async (data: ProductConfigFormValues) => {
    // Check if already submitting
    if (isSubmitting) {
      console.log('Already submitting, ignoring duplicate submission');
      return;
    }

    console.log('Form submitted with:', data);

    // Check for unique attribute FIRST
    if (!uniqueAttribute) {
      showToast('error', 'Please mark at least one attribute as Unique Identifier (UUID).');
      setError('user_preferences', {
        type: 'manual',
        message: 'Unique Identifier is required.',
      });
      return;
    }

    const selectedAttributesWithoutSettings: any[] = [];
    data.user_preferences.forEach((selectedAttr: any) => {
      const hasSettings = effectiveConfiguration?.user_preference_attributes?.some(
        (savedAttr: any) => savedAttr.attribute_key === selectedAttr.value
      );
      if (!hasSettings) {
        selectedAttributesWithoutSettings.push(selectedAttr.label);
      }
    });

    if (selectedAttributesWithoutSettings.length > 0) {
      selectedAttributesWithoutSettings.forEach((attrLabel: any, index: number) => {
        setError(`user_preferences.${index}` as any, {
          type: 'manual',
          message: `Settings not saved for "${attrLabel}". Please configure this attribute first.`,
        });
      });
      showToast(
        'error',
        `Please configure settings for: ${selectedAttributesWithoutSettings.join(', ')}`
      );
      return;
    }

    const preferenceToggle: Record<string, number> = {};

    if (effectiveConfiguration?.user_preference_attributes) {
      effectiveConfiguration.user_preference_attributes.forEach((userPrefAttr: any) => {
        const isSelected = data.user_preferences.some(
          (pref: any) => pref.value === userPrefAttr.attribute_key
        );
        preferenceToggle[userPrefAttr.id] = isSelected ? 1 : 0;
      });
    }

    console.log('Generated preference_toggle:', preferenceToggle);

    const payload = {
      ...data,
      user_preferences: data.user_preferences.map((p: any) => p.value),
      preference_toggle: preferenceToggle,
    };

    console.log('Final Payload:', payload);

    // Set submitting state
    setIsSubmitting(true);

    try {
      await post(`/api/store-product-settings`, { ...payload, product_id: productID });
      // showToast('success', 'Configuration saved successfully!');
      refetch();
    } catch (error) {
      console.error('Error saving configuration:', error);
      // showToast('error', 'Failed to save configuration');
    } finally {
      // Reset submitting state after a small delay to prevent rapid resubmissions
      // setTimeout(() => {
      setIsSubmitting(false);
      // }, 1000);
    }
  };

  const fetchHighlightedAttributes = async (keys: string[]) => {
    const res = await post(
      '/api/highlight-attributes',
      {
        keys,
        context: effectiveConfiguration?.product_name,
      },
      {},
      false
    );
    setHighlightedAttributes(res.highlighted_keys || []);
  };

  async function handleCopy(incomingText: string) {
    if (!incomingText) return;
    try {
      await navigator.clipboard.writeText(incomingText);
      showToast('success', 'Copied to clipboard!');
    } catch (err) {
      showToast('error', 'Failed to copy');
    }
  }

  const handleDeleteConfirm = async () => {
    const result = await post('/api/products/bulk/destroy', {
      product_ids: [productID],
    });

    closeModal();
    navigate('/manage-product');
  };

  const handleDeleteModal = () => {
    console.log('Delete modal triggered');
    console.log('Product name:', productName);

    openModal(
      <ConfirmDelete itemName={productName} onConfirm={handleDeleteConfirm} onCancel={closeModal} />
    );
  };

  useEffect(() => {
    if (effectiveConfiguration?.product_name) {
      setValue('product_name', effectiveConfiguration?.product_name || '');
      setValue('token', effectiveConfiguration?.token || '');
      const extracted = extractKeysFromPacket(effectiveConfiguration?.raw_packet);
      console.log('Extracted attributes:', extracted);
      setValue('attributes', extracted);

      if (effectiveConfiguration?.user_preference_attributes) {
        const uniqueAttr = effectiveConfiguration.user_preference_attributes.find(
          (attr: any) => attr.is_unique_identifier === true
        );
        if (uniqueAttr) {
          setUniqueAttribute(uniqueAttr.attribute_key);
          console.log('Setting unique attribute from API:', uniqueAttr.attribute_key);
        } else {
          setUniqueAttribute(null);
        }

        const selectedUserPreference = extracted.filter((item: any) => {
          return effectiveConfiguration.user_preference_attributes.some(
            (savedUserpreference: any) => {
              return (
                savedUserpreference.attribute_key === item.value &&
                savedUserpreference.is_selected === 1
              );
            }
          );
        });

        const updatedSelectedPrefs = selectedUserPreference.map((pref: any) => {
          const apiPref = effectiveConfiguration.user_preference_attributes.find(
            (apiItem: any) => apiItem.attribute_key === pref.value
          );
          return {
            ...pref,
            label: apiPref?.label || pref.label,
          };
        });

        console.log('Selected preferences with API labels:', updatedSelectedPrefs);
        setValue('user_preferences', updatedSelectedPrefs);
      } else {
        setUniqueAttribute(null);
      }

      fetchHighlightedAttributes(extracted.map((a: any) => a.value));
    }
  }, [effectiveConfiguration, setValue]);

  useEffect(() => {
    if (productID && productID !== 'undefined') {
      dismissPacketToast(productID);
    }
  }, [productID]);

  const handleModal = (selectedAttribute: any = null, existingSettings: any = null) => {
    setSelectedAttributeForModal(selectedAttribute);
    openModal(
      <AttributeModal
        closeModal={closeModal}
        selectedAttribute={selectedAttribute}
        productName={productName}
        productId={productID}
        existingSettings={existingSettings}
        onSave={(data: any) => handleModalSave(data, selectedAttribute, productName)}
        onDelete={() => handleModalDelete(selectedAttribute)}
      />
    );
  };

  if (isLoading) {
    return <ProductConfigurationSkeleton />;
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault();

        if (!isSubmitting) {
          handleSubmit(onSubmit)(e);
        }
      }}
      className="p-8 flex flex-col gap-6"
    >
      {demoStart && <ProductConfigurationDemo />}

      <div className="grid grid-cols-12 max-xl:grid-cols-8 gap-4">
        {/* Product Name */}
        <div className="col-span-12 md:col-span-3">
          <label className="block mb-2 text-text-dark font-semibold">
            {t('product-configuration.product_name')}:
          </label>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="w-[80%] max-xl:w-[100%]">
            <Controller
              name="product_name"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  id="prd-conf-name"
                  placeholder={t('product-configuration.product_name')}
                  size="small"
                  fullWidth
                  style={{ width: '100%' }}
                  error={!!errors.product_name}
                  helperText={errors.product_name?.message}
                />
              )}
            />
          </div>
        </div>

        {/* Webhook Link */}
        <div className="col-span-12 md:col-span-3">
          <label className="block mb-2 text-text-dark font-semibold">
            {t('product-configuration.webhook_link')}:
          </label>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div
            className="w-full xl:w-1/2 max-xl:w-[100%] bg-surface-2 rounded-md border border-line-soft p-2 flex flex-wrap justify-between gap-2"
            id="webhook-link"
          >
            <div className="text-text-dark my-auto overflow-hidden flex-grow">{webHookLink}</div>
            <div className="flex gap-2 flex-wrap">
              <Buttton
                sx={{
                  borderRadius: '7px',
                  width: 'auto',
                  minWidth: '50px',
                  height: '32px',
                  backgroundColor: 'var(--color-primary)',
                  '&:hover': {
                    boxShadow: 'none',
                    backgroundColor: 'var(--color-primary-dark)',
                  },
                }}
                onClick={() => handleCopy(webHookLink)}
              >
                {t('product-configuration.copy')}
              </Buttton>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-3">
          <label className="block mb-2 text-text-dark font-semibold">
            {t('product-configuration.webhook_token')}:
          </label>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div
            className="w-full xl:w-1/2 max-xl:w-[100%] bg-surface-2 rounded-md border border-line-soft p-2 flex flex-wrap justify-between gap-2"
            id="webhook-token"
          >
            <div className="text-text-dark text-sm my-auto w-[80%] overflow-hidden">
              {incomingToken}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Buttton
                sx={{
                  borderRadius: '7px',
                  width: 'auto',
                  minWidth: '50px',
                  height: '32px',
                  backgroundColor: 'var(--color-primary)',
                  '&:hover': {
                    boxShadow: 'none',
                    backgroundColor: 'var(--color-primary-dark)',
                  },
                }}
                onClick={() => handleCopy(incomingToken)}
              >
                {t('product-configuration.copy')}
              </Buttton>
            </div>
          </div>
        </div>

        {/* Attributes Displayed */}
        <div className="col-span-12 xl:col-span-3 max-xl:col-span-10">
          <div className="text-text-dark font-semibold not-first-of-type:font-semibold mb-2">
            {t('product-configuration.attributes_displayed')}:
          </div>
          <p className="text-text-dark text-sm">{t('product-configuration.uncheck_info_1')}</p>
          <p className="text-text-dark text-sm">{t('product-configuration.uncheck_info_2')}</p>
          {errors.attributes && (
            <p className="text-danger-text text-xs mt-1">{errors.attributes.message}</p>
          )}
        </div>

        <div className="col-span-12 overflow-x-hidden md:col-span-9" id="att-selection">
          <div className="rounded-xl">
            {totalAttributes?.length > 0 && (
              <div
                className={`mb-3 rounded-lg border px-3 py-2 text-xs max-xl:w-[100%] xl:w-[80%] ${
                  hasGpsRoles
                    ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
                    : 'border-line bg-surface-2 text-ink-2'
                }`}
              >
                {hasGpsRoles ? (
                  <>
                    GPS tracking on —{' '}
                    {LOCATION_ROLES.filter(r => activeRoles.has(r.value))
                      .map(r => `${r.label} ✓`)
                      .join(' · ')}
                  </>
                ) : (
                  <>
                    GPS tracking off — only needed for GPS trackers. To store positions, mark one
                    attribute as Latitude and one as Longitude from its ⚙ menu.
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col max-xl:w-[100%] xl:w-[80%] md:grid-cols-2 gap-3">
              {totalAttributes?.length == 0
                ? t('product-configuration.packet-info')
                : totalAttributes?.map((item: any) => {
                    const isSelected = selectedAttributes?.some(
                      (selected: any) => selected?.value === item?.value
                    );
                    const isAiSuggested = highlightedAttributes.some(
                      (attr: any) => attr.toLowerCase() === item.value.toLowerCase()
                    );
                    const isUnique = uniqueAttribute === item.value;
                    const isLoading = loadingUniqueAttribute === item.value;

                    const hasSettings = effectiveConfiguration?.user_preference_attributes?.some(
                      (attr: any) => attr.attribute_key === item.value
                    );

                    const role = roleOf(item.value);

                    const dropdownOptions = [
                      ...(isUnique
                        ? []
                        : [
                            {
                              label: (
                                <div
                                  className="flex items-center justify-center gap-1 mt-1"
                                  id="configure-att"
                                >
                                  <SettingIcon size="small" className="" />
                                  <span className="text-sm font-medium">Configure Attribute</span>
                                </div>
                              ),
                              onClick: () => handleConfigureAttributeFromDropdown(item),
                            },
                          ]),

                      ...(isUnique
                        ? [
                            {
                              label: (
                                <div className="flex items-center cursor-not-allowed justify-center gap-1 mt-1 opacity-50">
                                  <SettingIcon size="small" className="" />
                                  <span className="text-sm font-medium">Configure Attribute</span>
                                </div>
                              ),
                              onClick: () => console.log('Unique attributes cannot be configured'),
                              className: 'cursor-not-allowed opacity-50 bg-surface-2',
                            },
                          ]
                        : []),

                      // Location roles (backend rejects a role on the unique identifier).
                      ...(isUnique
                        ? []
                        : LOCATION_ROLES.filter(r => r.value !== role).map(r => ({
                            label: (
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <IoLocationOutline size={18} />
                                <span className="text-sm font-medium">
                                  Mark as location · {r.label}
                                </span>
                              </div>
                            ),
                            onClick: () => handleMarkRole(item, r.value),
                          }))),

                      ...(role
                        ? [
                            {
                              label: (
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <IoLocationOutline size={18} />
                                  <span className="text-sm font-medium">Clear location role</span>
                                </div>
                              ),
                              onClick: () => handleClearRole(item),
                              className: 'text-danger-text',
                            },
                          ]
                        : []),

                      // Backend rejects the unique identifier on a location attribute.
                      ...(role
                        ? []
                        : [
                            {
                              label: (
                                <div
                                  className="flex items-center justify-center gap-1 mt-1"
                                  id="mark-unique"
                                >
                                  <IoShieldCheckmarkOutline size={20} className="" />
                                  <span className="text-sm font-medium">
                                    {isUnique
                                      ? 'Mark as unique identifier '
                                      : 'Mark as unique identifier'}
                                  </span>
                                </div>
                              ),
                              onClick: isUnique
                                ? () => console.log('Already marked as unique')
                                : () => handleMarkAsUniqueFromDropdown(item),
                              className: `text-accent-green hover:bg-accent-green/10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
                                isUnique
                                  ? 'cursor-not-allowed bg-accent-green/10'
                                  : 'hover:bg-surface-3'
                              }`,
                            },
                          ]),
                    ];

                    return (
                      <div key={item.value} className="relative">
                        <div
                          id={item.value === 'deviceInfo.devEui' ? 'unique-att' : 'att'}
                          className={`flex items-center gap-2 p-2 rounded-lg shadow-sm transition-all cursor-pointer ${
                            isUnique
                              ? 'border-2 border-accent-green bg-accent-green/10'
                              : isSelected
                                ? 'border-[1px] border-primary text-primary bg-background-lighter'
                                : 'border-[1px] border-background'
                          }`}
                          onClick={() => handleFieldClick(item)}
                        >
                          <div>
                            {isUnique ? (
                              <IoShieldCheckmarkOutline className="text-accent-green text-xl" />
                            ) : isSelected ? (
                              <CheckCircleOutlineIcon className="text-primary" />
                            ) : (
                              <HighlightOffIcon className="text-ink-2" />
                            )}
                          </div>

                          <div className="flex-grow">
                            <span
                              className={`${isUnique ? 'text-accent-green font-medium' : 'text-ink-0'}`}
                            >
                              {item.label} ({String(item.actualValue)})
                            </span>
                            {isUnique && (
                              <span className="text-accent-green ml-2 font-mono text-xs">
                                (UUID)
                              </span>
                            )}
                            {role && (
                              <span className="ml-2 rounded bg-accent-cyan/10 px-1.5 py-0.5 font-mono text-xs text-brand-text">
                                {roleLabel(role)}
                              </span>
                            )}
                          </div>

                          <div
                            className="flex items-center gap-2"
                            onClick={e => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                          >
                            <DropdownMenuRadix
                              trigger={
                                <button
                                  id={
                                    item.value === 'deviceInfo.devEui'
                                      ? 'setting-btn'
                                      : 'att-setting'
                                  }
                                  type="button"
                                  className={`flex items-center border-none outline-none focus:outline-none focus:ring-0 gap-1 px-2 py-1 cursor-pointer rounded text-xs font-medium transition-all ${
                                    isUnique
                                      ? 'text-accent-green hover:brightness-125'
                                      : 'text-ink-2 hover:text-ink-0'
                                  }`}
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <div className="w-3 h-3 border-ink-2 border-t-transparent rounded-full focus:outline-none focus:ring-0 border-none animate-spin"></div>
                                  ) : (
                                    <SettingIcon />
                                  )}
                                </button>
                              }
                              options={dropdownOptions}
                              side="bottom"
                              align="end"
                            />
                          </div>
                        </div>

                        {isAiSuggested && (
                          <div className="absolute top-2 -right-28 flex items-center gap-1">
                            <span className="text-xs text-brand-text font-semibold whitespace-nowrap">
                              AI Suggested
                            </span>
                            <AiIcon
                              size="small"
                              className="text-warning animate-pulse duration-300"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-3">
          <label className="block mb-2 text-text-dark font-semibold">
            {t('product-configuration.rawPacket')}
          </label>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="max-xl:w-[100%] xl:w-[50%]">
            <TextArea
              id="message"
              rows={15}
              value={
                effectiveConfiguration?.raw_packet
                  ? JSON.stringify(effectiveConfiguration?.raw_packet, null, 2)
                  : ''
              }
              onClick={(e: any) => handleCopy(e.target.value)}
              placeholder={t('product-configuration.rawPacketMessage')}
              readOnly={true}
              className="border-line h-full cursor-copy"
            />
          </div>
        </div>

        {/* Remove Product */}
        <div className="col-span-12 md:col-span-3">
          <label className="block mb-2 text-text-dark font-semibold">
            {t('product-configuration.remove_product')}:
          </label>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="flex flex-wrap gap-2 items-center">
            <Buttton
              type="button"
              sx={{
                bgcolor: 'error.light',
                '&:hover': { boxShadow: 'none', backgroundColor: 'error.dark' },
              }}
              onClick={e => {
                e.preventDefault();
                console.log('Remove button clicked');
                handleDeleteModal();
              }}
            >
              {t('product-configuration.remove_product')}
            </Buttton>
            <div className="text-danger-text text-xs items-center">
              {t('product-configuration.action_undo_warning')}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-4" id="save-config">
        <Buttton type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save & Validate'}
        </Buttton>
      </div>
    </form>
  );
}

export default ProductConfiguration;
