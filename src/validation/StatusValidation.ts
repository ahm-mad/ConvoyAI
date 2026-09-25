// validation/StatusValidation.js
import * as Yup from 'yup';

export const StatusValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    product: Yup.string().required(t('statusForm.validation.product')),
    device: Yup.string().required(t('statusForm.validation.device')),
    attributes: Yup.string().required(t('statusForm.validation.attributes')),
    icon: Yup.string().required(t('statusForm.validation.icon')),
  });
