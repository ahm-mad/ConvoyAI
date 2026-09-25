// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import * as yup from 'yup';

export const NewRuleFormSchema = t => {
  return yup.object().shape({
    ruleName: yup
      .string()
      .required(t ? t('validation.ruleNameRequired') : 'Rule name is required')
      .min(3, t ? t('validation.ruleNameMinLength') : 'Rule name must be at least 3 characters')
      .max(50, t ? t('validation.ruleNameMaxLength') : 'Rule name must not exceed 50 characters'),

    executionInterval: yup
      .number()
      .required(t ? t('validation.executionIntervalRequired') : 'Execution interval is required')
      .min(
        1,
        t ? t('validation.executionIntervalMin') : 'Execution interval must be at least 1 second'
      )
      .max(
        3600,
        t ? t('validation.executionIntervalMax') : 'Execution interval must not exceed 3600 seconds'
      ),

    allowRetriggering: yup.boolean().default(false),

    // Email validation when sendEmail is enabled
    emailData: yup.object().when('actions.sendEmail', {
      is: true,
      then: schema =>
        schema.shape({
          to: yup
            .array()
            .of(yup.string().email(t ? t('validation.invalidEmail') : 'Invalid email address'))
            .min(
              1,
              t
                ? t('validation.emailRecipientRequired')
                : 'At least one email recipient is required'
            ),
          subject: yup
            .string()
            .required(t ? t('validation.emailSubjectRequired') : 'Email subject is required')
            .max(
              100,
              t ? t('validation.emailSubjectMaxLength') : 'Subject must not exceed 100 characters'
            ),
          message: yup
            .string()
            .required(t ? t('validation.emailMessageRequired') : 'Email message is required')
            .max(
              1000,
              t ? t('validation.emailMessageMaxLength') : 'Message must not exceed 1000 characters'
            ),
        }),
      otherwise: schema => schema.notRequired(),
    }),

    // SMS validation when sendMessage is enabled
    smsData: yup.object().when('actions.sendMessage', {
      is: true,
      then: schema =>
        schema.shape({
          to: yup
            .array()
            .of(
              yup
                .string()
                .matches(
                  /^\+?[1-9]\d{1,14}$/,
                  t ? t('validation.invalidPhoneNumber') : 'Invalid phone number'
                )
            )
            .min(
              1,
              t ? t('validation.smsRecipientRequired') : 'At least one SMS recipient is required'
            ),
          message: yup
            .string()
            .required(t ? t('validation.smsMessageRequired') : 'SMS message is required')
            .max(
              160,
              t ? t('validation.smsMessageMaxLength') : 'SMS message must not exceed 160 characters'
            ),
        }),
      otherwise: schema => schema.notRequired(),
    }),

    // System notification validation when systemNotification is enabled
    notificationData: yup.object().when('actions.systemNotification', {
      is: true,
      then: schema =>
        schema.shape({
          message: yup
            .string()
            .required(
              t ? t('validation.notificationMessageRequired') : 'Notification message is required'
            )
            .max(
              200,
              t
                ? t('validation.notificationMessageMaxLength')
                : 'Notification message must not exceed 200 characters'
            ),
        }),
      otherwise: schema => schema.notRequired(),
    }),
  });
};

// Separate validation for conditions
export const validateConditions = (conditions, t) => {
  const errors = [];

  conditions.forEach((condition, index) => {
    const conditionErrors = {};

    if (condition.selectedDevice === 'Please choose') {
      conditionErrors.device = t ? t('validation.deviceRequired') : 'Please select a device';
    }

    if (condition.selectedField === 'Please choose') {
      conditionErrors.field = t ? t('validation.fieldRequired') : 'Please select a field';
    }

    if (!condition.conditionValue || condition.conditionValue.trim() === '') {
      conditionErrors.value = t
        ? t('validation.conditionValueRequired')
        : 'Condition value is required';
    } else if (isNaN(condition.conditionValue)) {
      conditionErrors.value = t
        ? t('validation.conditionValueNumeric')
        : 'Condition value must be a number';
    }

    if (Object.keys(conditionErrors).length > 0) {
      errors[index] = conditionErrors;
    }
  });

  return errors;
};

// Validation for actions - at least one action must be selected
export const validateActions = (actions, t) => {
  const hasAnyAction = actions.sendEmail || actions.sendMessage || actions.systemNotification;

  if (!hasAnyAction) {
    return t ? t('validation.atLeastOneActionRequired') : 'At least one action must be selected';
  }

  return null;
};
