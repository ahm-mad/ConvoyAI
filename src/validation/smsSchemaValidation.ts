import * as yup from 'yup';

export const smsSchema = yup.object().shape({
  smsData: yup.object().shape({
    to: yup
      .array()
      .of(
        yup
          .string()
          .matches(/^\+?\d{10,15}$/, 'Phone number must contain at least 10 digits (and max 15)')
          .required('Phone number is required')
      )
      .min(1, 'At least one phone number is required'),
    message: yup
      .string()
      .required('Message is required')
      .min(5, 'Message must be at least 5 characters')
      .max(160, 'Message cannot exceed 160 characters'),
  }),
});
