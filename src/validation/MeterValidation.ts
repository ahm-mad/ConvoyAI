import * as Yup from 'yup';

export const meterFormSchema = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    product: Yup.string().required(t('MeterForm.validation.product')),
    device: Yup.string().required(t('MeterForm.validation.device')),
    attributes: Yup.string().required(t('MeterForm.validation.attributes')),
  });
