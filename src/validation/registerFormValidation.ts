import * as yup from 'yup';

export const registerFormSchema = yup.object().shape({
  first_name: yup.string().required('First name is required'),
  last_name: yup.string().required('Last name is required'),
  email: yup.string().email('Invalid email address').required('Email is required'),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .matches(/[a-z]/, 'Password must contain at least one lowercase letter')
    .matches(/[0-9]/, 'Password must contain at least one number')
    .matches(/[\W_]/, 'Password must contain at least one special character')
    .required('Password is required'),
  confirm_password: yup
    .string()
    .oneOf([yup.ref('password'), null], 'Passwords must match')
    .required('Confirm password is required'),

  number: yup
    .string()
    .matches(/^\+?\d{10,15}$/, 'Phone number must contain at least 10 digits (and max 15)')
    .required('Phone number is required'),

  // company_domain: yup
  //   .string()
  //   .matches(/^[a-z0-9]+$/, 'Only lowercase letters and numbers allowed (no special characters)')
  //   .required('Company domain is required'),
  check: yup.bool().oneOf([true], 'Required'),
});
