import * as Yup from 'yup';

export const ValueValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    sections: Yup.array()
      .of(
        Yup.object().shape({
          product: Yup.string().required(t('valueForm.validation.product')),
          device: Yup.string().required(t('valueForm.validation.device')),
          attributes: Yup.string().required(t('valueForm.validation.attributes')),
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
          // icon: Yup.string().required(t('valueForm.validation.icon')),
          // decimal: Yup.string().required(t('valueForm.validation.decimal')),
          // showTimestamp: Yup.boolean(),
          // textColor: Yup.string(),
          // valueColor: Yup.string(),
          // backgroundColor: Yup.string(),
        })
      )
      .min(1, t('valueForm.validation.atLeastOneSection')),
  });
