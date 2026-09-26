import * as yup from 'yup';

export const BasicFormSchema = yup.object().shape({
  first_name: yup.string().required('First name is required'),
  last_name: yup.string().required('Last name is required'),
  // dob: yup.string().required('Date of birth is required'),
  number: yup.string().required('Phone number is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  profile_image: yup
    .mixed()
    .test('fileSize', 'File size must not exceed 1 MB', value => {
      if (!(value instanceof File)) return true;
      return value.size <= 1024 * 1024;
    })
    .test('fileType', 'Only JPG, JPEG, PNG files are allowed', value => {
      if (!(value instanceof File)) return true; // string path ya empty — skip check
      return ['image/jpeg', 'image/jpg', 'image/png'].includes(value.type);
    }),
});

export const PasswordFormSchema = yup.object().shape({
  current_password: yup.string().required('Your current password is required'),
  new_password: yup.string().required('Please enter your new password'),
  new_password_confirmation: yup
    .string()
    .required('Please confirm your new password')
    .oneOf([yup.ref('new_password')], 'Passwords do not match'),
});
