import * as Yup from 'yup';

export const deviceMultiFormSchema = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    product: Yup.string().required(t('DeviceMultiForm.validation.product')),
    attributes: Yup.string().required(t('DeviceMultiForm.validation.attributes')),
    device: Yup.string().required(t('DeviceMultiForm.validation.device')),
    primaryIcon: Yup.string().required(t('DeviceMultiForm.validation.primaryIcon')),
    primaryUnit: Yup.string().required(t('DeviceMultiForm.validation.primaryUnit')),
    secondaryData: Yup.string().required(t('DeviceMultiForm.validation.secondaryData')),
    secondaryIcon: Yup.string().required(t('DeviceMultiForm.validation.secondaryIcon')),
    secondaryUnit: Yup.string().required(t('DeviceMultiForm.validation.secondaryUnit')),
    lowerData: Yup.string().required(t('DeviceMultiForm.validation.lowerData')),
    lowerIcon: Yup.string().required(t('DeviceMultiForm.validation.lowerIcon')),
    lowerUnit: Yup.string().required(t('DeviceMultiForm.validation.lowerUnit')),
    lowerDecimal: Yup.string().required(t('DeviceMultiForm.validation.lowerDecimal')),
  });
