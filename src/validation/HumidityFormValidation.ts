// HumidityFormValidation.js
import * as Yup from 'yup';

export const HumidityFormSchema = Yup.object().shape({
  widget_name: Yup.string().required('Widget name is required'),
  sections: Yup.array()
    .of(
      Yup.object().shape({
        product: Yup.string().required('Product is required'),
        device: Yup.string().required('Device is required'),
        attributes: Yup.string().required('Attribute is required'),
        unit: Yup.string().required('Unit is required'),
        min_value: Yup.number()
          .required('Minimum value is required')
          .min(0, 'Value must be between 0 and 100')
          .max(100, 'Value must be between 0 and 100'),
        max_value: Yup.number()
          .required('Maximum value is required')
          .min(0, 'Value must be between 0 and 100')
          .max(100, 'Value must be between 0 and 100')
          .test('is-greater', 'Maximum value must be greater than minimum value', function (value) {
            const { min_value } = this.parent;
            return !min_value || !value || value > min_value;
          }),
        value_color: Yup.string(),
      })
    )
    .min(1, 'At least one section is required'),
});
