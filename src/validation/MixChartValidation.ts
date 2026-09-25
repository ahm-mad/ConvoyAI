import * as Yup from 'yup';

export const MixChartValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    sections: Yup.array()
      .of(
        Yup.object().shape({
          product: Yup.string().required(t('valueForm.validation.product')),
          device: Yup.string().required(t('valueForm.validation.device')),
          attributes: Yup.string().required(t('valueForm.validation.attributes')),
          //   icon: Yup.string().required(t('valueForm.validation.icon')),
          // decimal: Yup.string().required(t('valueForm.validation.decimal')),
          // showTimestamp: Yup.boolean(),
          // textColor: Yup.string(),
          // valueColor: Yup.string(),
          // backgroundColor: Yup.string(),
        })
      )
      .min(1, t('valueForm.validation.atLeastOneSection')),
  });
