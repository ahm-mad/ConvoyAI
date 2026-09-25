// validation/SignalStrengthValidation.js
import * as Yup from 'yup';
const isDemo = JSON.parse(localStorage.getItem('user') || '{}')?.isDemo ?? false;

export const SignalStrengthValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    sections: Yup.array()
      .of(
        Yup.object().shape({
          product: Yup.string().required(t('signalform.validation.product')),
          device: Yup.string().required(t('signalform.validation.device')),
          attributes: Yup.string().required(t('signalform.validation.attributes')),
          conditions: Yup.array().of(
            Yup.object().shape({
              selectedProduct: Yup.string(),
              selectedAttribute: Yup.string(),
              selectedCondition: Yup.string().required('Condition is required'),
              conditionValue: isDemo
                ? Yup.string().nullable().notRequired()
                : Yup.string()
                    .required('Value cannot be empty')
                    .test('not-empty', 'Value cannot be empty', value => {
                      return value && value.trim() !== '';
                    }),
              logicalOperator: Yup.string(),
            })
          ),
        })
      )
      .min(1, t('tankForm.validation.atLeastOneSection')),
  });
