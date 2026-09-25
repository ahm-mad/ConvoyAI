import * as yup from 'yup';

export const addEditEntityModalSchema = yup.object().shape({
  name: yup.string().required('Name is required'),
  type: yup.string().required('Type is required'),
  icon: yup.string().required('Icon is required'),
  isDeviceAssigned: yup.string().required(),

  selectedProduct: yup.string().when('isDeviceAssigned', {
    is: true,
    then: schema => schema.required('Product selection is required'),
    otherwise: schema => schema.optional(),
  }),

  selectedDevice: yup.string().when('isDeviceAssigned', {
    is: true,
    then: schema => schema.required('Device selection is required'),
    otherwise: schema => schema.optional(),
  }),
});
