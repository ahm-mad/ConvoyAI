import * as Yup from 'yup';

export const OnlineStatusValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    product: Yup.string().required(t('OnlineStatusForm.validation.product')),
    device: Yup.string().required(t('OnlineStatusForm.validation.device')),
    icon: Yup.string().required(t('OnlineStatusForm.validation.icon')),
    attributes: Yup.string().required(t('OnlineStatusForm.validation.attributes')),
  });
