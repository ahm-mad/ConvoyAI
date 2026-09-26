/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from '@lib/router-compat';
import Button from '../components/Button';
import GlobalInput from '@components/Input';
import EmailAction from '../components/EmailAction';
import SmsAction from '../components/SmsAction';
import SystemNotificationAction from '../components/SystemNotificationAction';
import ConditionRow from '../components/ConditionRow';
import * as Switch from '@radix-ui/react-switch';
import { post, get, put } from '../utils/apiHelper';
import AddNewRuleBuilderSkeleton from '../components/AddNewRuleSkeleton';
import { useUser } from '@contexts/UserContext';

import AddnewRuleDemo from '../ConvoyDemo/AddnewRuleDemo';
import { isFirstDemo } from '../utils/DemoHelper';

interface RuleCondition {
  selectedProduct: any;
  selectedAttribute: string;
  selectedCondition: string;
  conditionValue: string;
  logicalOperator: string;
}

interface RuleFormValues {
  ruleName: string;
  is_active: boolean;
  executionInterval: string;
  allowRetriggering: boolean;
  conditions: RuleCondition[];
  actions: {
    sendEmail: boolean;
    sendMessage: boolean;
    systemNotification: boolean;
  };
  emailData: {
    to: any[];
    newRecipient: string;
    subject: string;
    message: string;
  };
  smsData: {
    to: any[];
    newRecipient: string;
    message: string;
  };
  notificationData: {
    message: string;
  };
}

export default function NewRule() {
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [productAttributes, setProductAttributes] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<any>(null);
  const [showActions, setShowActions] = useState(false);
  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();

  const { t } = useTranslation();
  const isEditing = Boolean(ruleId);

  const [loading, setLoading] = useState(isEditing);
  const [demoStart, setDemoStart] = useState(false);

  useEffect(() => {
    if (isFirstDemo('AddNewRuleDemo')) {
      setDemoStart(false);
    }
  }, []);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<RuleFormValues>({
    defaultValues: {
      ruleName: '',
      is_active: false,
      executionInterval: '60',
      allowRetriggering: false,
      conditions: [
        {
          selectedProduct: null, // Now stores product ID instead of name
          selectedAttribute: t('newRule.pleaseChoose'),
          selectedCondition: t('conditions.equalTo'),
          conditionValue: '',
          logicalOperator: t('newRule.if'),
        },
      ],
      actions: {
        sendEmail: false,
        sendMessage: false,
        systemNotification: false,
      },
      emailData: {
        to: [],
        newRecipient: '',
        subject: '',
        message: '',
      },
      smsData: {
        to: [],
        newRecipient: '',
        message: '',
      },
      notificationData: {
        message: '',
      },
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'conditions',
  });

  const watchedActions = watch('actions');
  const watchedConditions = watch('conditions');

  const conditionOptions = [
    t('conditions.lessThan'),
    t('conditions.lessThanOrEqual'),
    t('conditions.equalTo'),
    t('conditions.notEqualTo'),
    t('conditions.greaterThanOrEqual'),
    t('conditions.greaterThan'),
  ];

  // Product Settings Functions
  const fetchProductSettings = async (productId: any) => {
    if (!productId) return;

    try {
      const response = await get(`/api/product-settings/${productId}`);
      console.log('Product Settings for ID', response);

      setProductAttributes(prev => ({
        ...prev,
        [productId]: response?.data || response,
      }));

      return response?.data || response;
    } catch (error) {
      console.error('Failed to fetch product settings for ID', productId, ':', error);
    }
  };

  const getProductSettings = (productId: any) => {
    return productAttributes[productId] || null;
  };

  const createAttributeMapping = (attributes: any[]) => {
    if (!attributes || !Array.isArray(attributes)) return [];

    return attributes
      .filter(
        (attr: any) =>
          typeof attr === 'object' && attr.label && attr.attribute_key && attr.is_selected === 1
      )
      .map((attr: any) => ({
        displayName: attr.label,
        originalPath: attr.attribute_key,
      }));
  };

  const getAttributeOptionsForProduct = (productId: any) => {
    const settings = getProductSettings(productId);

    if (!settings?.user_preference_attributes) return [];

    const attributes = settings.user_preference_attributes;

    if (Array.isArray(attributes)) {
      const mapping = createAttributeMapping(attributes);
      return mapping.map(item => item?.displayName);
    }
  };

  const getOriginalAttributeName = (displayName: any, productId: any) => {
    const settings = getProductSettings(productId);

    if (!settings?.user_preference_attributes) return displayName;

    const attributes = settings.user_preference_attributes;

    if (Array.isArray(attributes)) {
      const mapping = createAttributeMapping(attributes);
      console.log('dd', mapping);
      const found = mapping.find((item: any) => item.displayName === displayName);
      return found ? found.originalPath : displayName;
    }

    const attributeArray = attributes.split(',').map((attr: any) => attr.trim());
    const mapping = createAttributeMapping(attributeArray);
    const found = mapping.find((item: any) => item.displayName === displayName);
    return found ? found.originalPath : displayName;
  };

  const getDisplayNameFromAttributeKey = (attributeKey: any, productId: any) => {
    const settings = getProductSettings(productId);

    if (!settings?.user_preference_attributes) return attributeKey;

    const attributes = settings.user_preference_attributes;

    if (Array.isArray(attributes)) {
      const found = attributes.find(
        (attr: any) => typeof attr === 'object' && attr.attribute_key === attributeKey
      );
      return found ? found.label : '';
    }
  };

  // Helper function to get product name by ID
  const getProductNameById = (productId: any) => {
    const product = productOptions.find(p => p.id === productId);
    return product ? product.name : null;
  };

  // Event Handlers
  const handleProductChange = async (index: number, productName: any) => {
    const selectedProductObj = productOptions.find(p => p.name === productName);

    if (index === 0) {
      setSelectedProductId(selectedProductObj?.id || null);

      fields.forEach((_, fieldIndex) => {
        setValue(`conditions.${fieldIndex}.selectedProduct` as any, selectedProductObj?.id || null);
        setValue(`conditions.${fieldIndex}.selectedAttribute` as any, t('newRule.pleaseChoose'));
      });
    }

    if (selectedProductObj?.id && !productAttributes[selectedProductObj.id]) {
      const settings = await fetchProductSettings(selectedProductObj.id);
      console.log(`Settings for product ${productName}:`, settings);
    }
  };

  const handleAttributeChange = (index: number, attribute: any) => {
    setValue(`conditions.${index}.selectedAttribute` as any, attribute);
  };

  const addCondition = () => {
    append({
      selectedProduct: selectedProductId, // Store product ID directly
      selectedAttribute: t('newRule.pleaseChoose'),
      selectedCondition: t('conditions.equalTo'),
      conditionValue: '',
      logicalOperator: t('logicalOperators.and'),
    });
  };

  const onCancel = () => {
    console.log('Form cancelled');
    navigate('/rule-builder');
  };

  // Render Functions
  const renderConditions = () => {
    return fields.map((field, index) => {
      const productIdToUse = selectedProductId || watchedConditions[index]?.selectedProduct;
      const currentAttributeOptions = getAttributeOptionsForProduct(productIdToUse);

      return (
        <ConditionRow
          key={field.id}
          field={field}
          index={index}
          control={control}
          watchedConditions={watchedConditions}
          conditionOptions={conditionOptions}
          productOptions={productOptions}
          currentAttributeOptions={currentAttributeOptions}
          selectedProductId={selectedProductId}
          fieldsLength={fields.length}
          handleProductChange={handleProductChange}
          handleAttributeChange={handleAttributeChange}
          remove={remove}
          getProductNameById={getProductNameById} // Pass helper function
        />
      );
    });
  };

  // Form Submit Handler
  const onSubmit = async (data: RuleFormValues) => {
    if (isSubmitting) return;

    console.log('Original form data:', data);
    setIsSubmitting(true);

    try {
      const currentValues = watch();

      // Handle pending email recipient
      if (currentValues.emailData?.newRecipient && currentValues.emailData.newRecipient.trim()) {
        const email = currentValues.emailData.newRecipient.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(email) && !data.emailData.to.includes(email)) {
          data.emailData.to = [...data.emailData.to, email];
        }
        setValue('emailData.newRecipient', '');
      }

      if (currentValues.smsData?.newRecipient && currentValues.smsData.newRecipient.trim()) {
        const phone = currentValues.smsData.newRecipient.trim();
        const phoneRegex = /^[+]?[\d\s\-\(\)]{10,}$/;
        if (phoneRegex.test(phone) && !data.smsData.to.includes(phone)) {
          data.smsData.to = [...data.smsData.to, phone];
        }
        setValue('smsData.newRecipient', '');
      }

      const processedData = {
        ...data,
        conditions: data.conditions.map(condition => {
          const originalAttribute = getOriginalAttributeName(
            condition.selectedAttribute,
            selectedProductId
          );

          console.log(
            `Converting attribute: "${condition.selectedAttribute}" -> "${originalAttribute}"`
          );

          return {
            ...condition,
            selectedProduct: condition.selectedProduct, // This now contains the product ID
            selectedAttribute: originalAttribute,
          };
        }),
      };

      if (isEditing) {
        await put(`/api/rules/${ruleId}`, processedData);
        console.log('Rule updated successfully');
      } else {
        await post('/api/rules/store', processedData);
        console.log('Rule created successfully');
      }

      setValue('emailData.newRecipient', '');
      setValue('smsData.newRecipient', '');

      navigate('/rule-builder');
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} rule:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        if (!user?.id) return;

        const response = await get(`/api/products?user_id=${user.id}`);
        setProductOptions(response?.data?.data || []);
      } catch (error) {
        console.error('Failed to fetch products:', error);
      }
    };

    fetchProducts();
  }, [user?.id]);

  useEffect(() => {
    if (!ruleId || productOptions.length === 0) return;
    setLoading(true);

    get(`/api/rules/${ruleId}`)
      .then(async response => {
        const data = response.data?.rule || response.rule || response;

        const firstCondition = data.conditions?.[0];
        let globalProductId = null;

        if (firstCondition) {
          // If selectedProduct is already an ID, use it directly
          // If it's a name, find the corresponding ID
          if (
            typeof firstCondition.selectedProduct === 'number' ||
            (typeof firstCondition.selectedProduct === 'string' &&
              productOptions.some(p => p.id.toString() === firstCondition.selectedProduct))
          ) {
            globalProductId = parseInt(firstCondition.selectedProduct);
          } else {
            const matchedProduct = productOptions.find(
              p => p.name === firstCondition.selectedProduct
            );
            globalProductId = matchedProduct?.id || null;
          }
          setSelectedProductId(globalProductId);
        }

        // Fetch product settings first if needed
        if (globalProductId && !productAttributes[globalProductId]) {
          await fetchProductSettings(globalProductId);
        }

        // Process conditions with proper attribute mapping
        const mappedConditions = (data.conditions || []).map((condition: any) => {
          let productId: any;

          // Handle both old format (product name) and new format (product ID)
          if (
            typeof condition.selectedProduct === 'number' ||
            (typeof condition.selectedProduct === 'string' &&
              productOptions.some(p => p.id.toString() === condition.selectedProduct))
          ) {
            productId = parseInt(condition.selectedProduct);
          } else {
            const matchedProduct = productOptions.find(p => p.name === condition.selectedProduct);
            productId = matchedProduct?.id || globalProductId;
          }

          // Use the new function to get display name from attribute_key
          const displayAttribute = condition.selectedAttribute
            ? getDisplayNameFromAttributeKey(condition.selectedAttribute, productId)
            : t('newRule.pleaseChoose');

          return {
            selectedProduct: productId, // Store product ID directly
            selectedAttribute: displayAttribute,
            selectedCondition: condition.selectedCondition || t('conditions.equalTo'),
            conditionValue: condition.conditionValue || '',
            logicalOperator: condition.logicalOperator || t('newRule.if'),
          };
        });

        // Actions mapping
        const mappedActions = {
          sendEmail: data.actions?.sendEmail ?? false,
          sendMessage: data.actions?.sendMessage ?? false,
          systemNotification: data.actions?.systemNotification ?? false,
        };

        // Email / SMS / Notification prefill
        const mappedEmailData = {
          to: data.email_data?.to || data.emailData?.to || [],
          newRecipient: '',
          subject: data.email_data?.subject || data.emailData?.subject || '',
          message: data.email_data?.message || data.emailData?.message || '',
        };

        const mappedSmsData = {
          to: data.sms_data?.to || data.smsData?.to || [],
          newRecipient: '',
          message: data.sms_data?.message || data.smsData?.message || '',
        };

        const mappedNotificationData = {
          message: data.notification_data?.message || data.notificationData?.message || '',
        };

        // Final mapped object
        const mappedData = {
          ruleName: data.name || data.ruleName || '',
          is_active: data.is_active ?? data.enabled ?? true,
          executionInterval: String(data.execution_interval || data.executionInterval || '60'),
          allowRetriggering: data.allow_retriggering ?? data.allowRetriggering ?? false,
          conditions: mappedConditions,
          actions: mappedActions,
          emailData: mappedEmailData,
          smsData: mappedSmsData,
          notificationData: mappedNotificationData,
        };

        console.log('Mapped Data for Form:', mappedData);
        reset(mappedData);

        if (
          mappedActions.sendEmail ||
          mappedActions.sendMessage ||
          mappedActions.systemNotification ||
          mappedEmailData.to.length > 0 ||
          mappedSmsData.to.length > 0 ||
          mappedNotificationData.message
        ) {
          setShowActions(true);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch rule:', err);
        setLoading(false);
      });
  }, [ruleId, reset, t, productOptions, productAttributes]);

  if (loading) {
    return <AddNewRuleBuilderSkeleton />;
  }

  return (
    <div className="bg-surface-0">
      {demoStart && <AddnewRuleDemo />}
      <div className="bg-surface-1 mx-auto">
        <div className="px-4 sm:px-6 py-3">
          <h1 className="text-lg font-semibold text-ink-0 font-display">
            {isEditing ? t('newRule.editTitle') : t('newRule.title')}
          </h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-4 sm:px-6 space-y-6">
          {/* Rule Name */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">{t('newRule.name')}</label>
            <Controller
              name="ruleName"
              control={control}
              rules={{
                required: t('newRule.nameRequired'),
                minLength: { value: 3, message: t('newRule.nameMinLength') },
              }}
              render={({ field, fieldState }) => (
                <div>
                  <GlobalInput
                    {...field}
                    id="add-rule-name"
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    size="small"
                    type="text"
                    placeholder={t('newRule.namePlaceholder')}
                  />
                </div>
              )}
            />
          </div>

          {/* Rule Enable/Disable Switch */}
          <div>
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <div className="flex">
                  <label className="flex items-center cursor-pointer">
                    <Switch.Root
                      id="rule-state"
                      className="w-11 h-[24px] px-[2px] bg-surface-3 rounded-full relative shadow-sm focus:outline-none cursor-pointer focus:ring-offset-2 data-[state=checked]:bg-accent-cyan transition-colors duration-200"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    >
                      <Switch.Thumb className="block w-[18px] h-[18px] bg-surface-1 rounded-full shadow-lg transform transition-transform duration-200 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-5" />
                    </Switch.Root>
                  </label>
                </div>
              )}
            />
          </div>

          <div className="border-t border-line" />

          {/* Conditions Section */}
          <div>
            <h3 className="text-lg font-medium text-ink-0 mb-4 font-display">
              {t('newRule.conditions')}
            </h3>
            <div className="space-y-4">
              {renderConditions()}

              <div className="flex items-center">
                <button
                  id="add-condition"
                  type="button"
                  onClick={addCondition}
                  disabled={isSubmitting || !selectedProductId}
                  className="flex items-center justify-center w-8 h-8 cursor-pointer bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink-0 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {!selectedProductId && (
                  <span className="ml-2 text-xs text-ink-2">Please select a product first</span>
                )}
              </div>
            </div>
          </div>

          {/* Actions Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-ink-1 font-medium">{t('newRule.then')}</span>
              <button
                id="notify"
                type="button"
                onClick={() => setShowActions(!showActions)}
                disabled={isSubmitting}
                className="flex items-center justify-center w-8 h-8 cursor-pointer bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink-0 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {showActions && (
              <div className="ml-0 sm:ml-16 space-y-4">
                <Controller
                  name="actions.sendEmail"
                  control={control}
                  render={({ field: actionField }) => (
                    <EmailAction
                      isEnabled={actionField.value}
                      onToggle={() => actionField.onChange(!actionField.value)}
                      control={control}
                    />
                  )}
                />

                <Controller
                  name="actions.sendMessage"
                  control={control}
                  render={({ field: actionField }) => (
                    <SmsAction
                      isEnabled={actionField.value}
                      onToggle={() => actionField.onChange(!actionField.value)}
                      control={control}
                    />
                  )}
                />

                <Controller
                  name="actions.systemNotification"
                  control={control}
                  render={({ field: actionField }) => (
                    <SystemNotificationAction
                      isEnabled={actionField.value}
                      onToggle={() => actionField.onChange(!actionField.value)}
                      control={control}
                    />
                  )}
                />
              </div>
            )}
          </div>

          <div className="border-t border-line" />

          {/* Execution Settings */}
          <div
            id="message-recursion"
            className="flex flex-col sm:flex-row items-start sm:items-center gap-2"
          >
            <span className="text-sm text-ink-1">{t('newRule.performActions')}</span>
            <Controller
              name="executionInterval"
              control={control}
              rules={{
                required: t('newRule.executionIntervalRequired'),
                min: { value: 1, message: t('newRule.executionIntervalMin') },
              }}
              render={({ field, fieldState }) => (
                <div>
                  <input
                    {...field}
                    id="add-time"
                    type="number"
                    className={`w-16 px-2 py-1 border rounded-md text-sm text-center bg-surface-2 text-ink-0 focus:outline-none focus:border-accent-cyan ${
                      fieldState.error ? 'border-danger' : 'border-line'
                    }`}
                    min="1"
                    disabled={isSubmitting}
                  />
                  {fieldState.error && (
                    <p className="text-danger-text text-xs mt-1">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
            <span className="text-sm text-ink-1">{t('newRule.seconds')}</span>
          </div>

          {/* Retriggering Checkbox */}
          <div>
            <Controller
              name="allowRetriggering"
              control={control}
              render={({ field }) => (
                <label className="flex items-center cursor-pointer">
                  <input
                    id="mark-retrigger"
                    type="checkbox"
                    checked={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                    className="w-4 h-4 mr-3 accent-accent-cyan border-line rounded disabled:opacity-50"
                  />
                  <span className="text-sm text-ink-1">{t('newRule.allowRetriggering')}</span>
                </label>
              )}
            />
          </div>

          <div
            id="create-cancel"
            className="flex flex-col  mb-4 sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-4"
          >
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 on-gradient text-sm rounded-lg transition-all ${
                isSubmitting
                  ? 'brand-gradient-bg opacity-50 cursor-not-allowed'
                  : 'brand-gradient-bg cursor-pointer hover:brightness-110'
              }`}
            >
              {isSubmitting
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                  ? t('newRule.updateRule')
                  : t('newRule.createRule')}
            </button>
            <Button variant="secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
              {t('newRule.cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
