import * as Yup from 'yup';

export const LoginPageValidation = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email format') // Ensures it's an email
    .required('Email is required'),
  password: Yup.string()
    // .min(8, "Password must be at least 8 characters long") // Ensures minimum 8 characters
    .required('Password is required'),
});
