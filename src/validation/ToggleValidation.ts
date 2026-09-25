import * as Yup from 'yup';

export const ToggleValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    product: Yup.string().required(t('toggleForm.validation.product')),
    device: Yup.string().required(t('toggleForm.validation.device')),
    attributes: Yup.string().required(t('toggleForm.validation.attributes')),
  });
