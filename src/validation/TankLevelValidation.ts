import * as Yup from 'yup';

export const TankLevelValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    sections: Yup.array()
      .of(
        Yup.object().shape({
          product: Yup.string().required(t('tankForm.validation.product')),
          device: Yup.string().required(t('tankForm.validation.device')),
          attributes: Yup.string().required(t('tankForm.validation.attributes')),
          max_value: Yup.string().required(t('tankForm.validation.maxvalue')),
          conditions: Yup.array().of(
            Yup.object().shape({
              selectedProduct: Yup.string(),
              selectedAttribute: Yup.string(),
              selectedCondition: Yup.string().required('Condition is required'),
              conditionValue: Yup.string()
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
