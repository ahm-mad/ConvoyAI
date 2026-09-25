import * as yup from 'yup';

export const ProductConfigurationSchema = t =>
  yup.object({
    product_name: yup.string().required(t('product-configuration.validation.product_name')),
    // externalId: yup.string(),
    // deviceUse: yup.string().required(t('productSetting.validation.deviceUse')),
    // readings: yup.array().min(1, t('productSetting.validation.readings')),
    // attributes: yup.string().required(t('productSetting.validation.attributes')),
  });
