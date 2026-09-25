import * as yup from 'yup';

export const GaugeFormSchema = yup.object().shape({
  widget_name: yup.string().required('Widget Name is required'),
  product: yup.string().required('Product is required'),
  device: yup.string().required('Device is required'),
  decimal: yup.string().required('Decimal is required'),
  attributes: yup.string().required('Attribute is required'),
  showTimestamp: yup.boolean().default(false),
});
