import * as Yup from 'yup';
const isDemo = JSON.parse(localStorage.getItem('user') || '{}')?.isDemo ?? false;

export const TemperatureValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('TemperatureForm.widgetName')),
    sections: Yup.array()
      .of(
        Yup.object().shape({
          product: Yup.string().required(t('TemperatureForm.validation.product')),
          device: Yup.string().required(t('TemperatureForm.validation.device')),
          attributes: Yup.string().required(t('TemperatureForm.validation.attributes')),
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
          // decimal: Yup.string().required(t('TemperatureForm.validation.decimal')),
        })
      )
      .min(1, t('tankForm.validation.atLeastOneSection')),
  });
