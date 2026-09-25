// schemas/ruleFormSchema.js
import * as yup from 'yup';

export const ruleFormSchema = yup.object().shape({
  ruleName: yup
    .string()
    .required('Rule name is required')
    .min(3, 'Rule name must be at least 3 characters')
    .max(100, 'Rule name must not exceed 100 characters')
    .trim(),

  is_active: yup.boolean().default(false),

  executionInterval: yup
    .string()
    .required('Execution interval is required')
    .test('is-positive', 'Execution interval must be at least 1 second', value => {
      const num = parseInt(value);
      return !isNaN(num) && num >= 1;
    }),

  allowRetriggering: yup.boolean().default(false),

  conditions: yup
    .array()
    .of(
      yup.object().shape({
        selectedProduct: yup
          .string()
          .required('Please select a product')
          .test('not-placeholder', 'Please select a product', value => {
            return value && value !== 'Please Choose' && value !== 'pleaseChoose';
          }),

        selectedProductId: yup.number().nullable().required('Product ID is required'),

        selectedAttribute: yup
          .string()
          .required('Please select an attribute')
          .test('not-placeholder', 'Please select an attribute', value => {
            return value && value !== 'Please Choose' && value !== 'pleaseChoose';
          }),

        selectedCondition: yup.string().required('Please select a condition'),

        conditionValue: yup
          .string()
          .required('Condition value is required')
          .test('is-number', 'Condition value must be a valid number', value => {
            return value && !isNaN(Number(value));
          }),
        // Negative values allowed - no min validation

        logicalOperator: yup.string().required(),
      })
    )
    .min(1, 'At least one condition is required'),

  actions: yup
    .object()
    .shape({
      sendEmail: yup.boolean().default(false),
      sendMessage: yup.boolean().default(false),
      systemNotification: yup.boolean().default(false),
    })
    .test('at-least-one', 'At least one action must be selected', actions => {
      return actions.sendEmail || actions.sendMessage || actions.systemNotification;
    }),

  emailData: yup
    .object()
    .shape({
      to: yup.array().of(yup.string().email('Invalid email address')).default([]),
      newRecipient: yup.string().default(''),
      subject: yup.string().default(''),
      message: yup.string().default(''),
    })
    .default({}),

  smsData: yup
    .object()
    .shape({
      to: yup.array().of(yup.string().min(10, 'Invalid phone number')).default([]),
      newRecipient: yup.string().default(''),
      message: yup.string().default(''),
    })
    .default({}),

  notificationData: yup
    .object()
    .shape({
      message: yup.string().default(''),
    })
    .default({}),
});

// Default form values
export const defaultFormValues = {
  ruleName: '',
  is_active: false,
  executionInterval: '60',
  allowRetriggering: false,
  conditions: [
    {
      selectedProduct: 'Please Choose',
      selectedProductId: null,
      selectedAttribute: 'Please Choose',
      selectedCondition: 'Equal To',
      conditionValue: '',
      logicalOperator: 'If',
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
};

// Condition options
export const conditionOptions = [
  'Less Than',
  'Less Than Or Equal',
  'Equal To',
  'Not Equal To',
  'Greater Than Or Equal',
  'Greater Than',
];

// Logical operators
export const logicalOperators = {
  AND: 'And',
  OR: 'Or',
  IF: 'If',
};

// Email validation regex
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex
export const phoneRegex = /^[+]?[\d\s\-\(\)]{10,}$/;

// Helper function to validate single field
export const validateField = async (fieldName, value, schema = ruleFormSchema) => {
  try {
    await schema.validateAt(fieldName, { [fieldName]: value });
    return { isValid: true, error: null };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
};

// Helper function to validate entire form
export const validateForm = async data => {
  try {
    await ruleFormSchema.validate(data, { abortEarly: false });
    return { isValid: true, errors: {} };
  } catch (error) {
    const errors = {};
    error.inner?.forEach(err => {
      errors[err.path] = err.message;
    });
    return { isValid: false, errors };
  }
};
