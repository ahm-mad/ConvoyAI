// // DeviceDefaultValidation.js
// import * as Yup from 'yup';

// export const DeviceDefaultValidation = t =>
//   Yup.object().shape({
//     widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
//     product: Yup.string().required(t('deviceDefaultForm.validation.product')),
//     attributes: Yup.string().required(t('deviceDefaultForm.validation.attributes')),
//     device: Yup.string().required(t('deviceDefaultForm.validation.device')),
//   });

// DeviceDefaultValidation.js
import * as Yup from 'yup';

// export const DeviceDefaultValidation = t =>
//   Yup.object().shape({
//     widget_name: Yup.string(),
//     product: Yup.string(),
//     attributes: Yup.string(),
//     device: Yup.string(),
//   });

export const DeviceDefaultValidation = t =>
  Yup.object().shape({
    widget_name: Yup.string().required(t('tankForm.validation.widgetName')),
    sections: Yup.array()
      .of(
        Yup.object().shape({
          product: Yup.string().required(t('deviceDefaultForm.validation.product')),
          device: Yup.string().required(t('deviceDefaultForm.validation.device')),
          // attributes: Yup.string().required(t('deviceDefaultForm.validation.attributes')),
        })
      )
      .min(1, t('tankForm.validation.atLeastOneSection')),
  });
