import GlobalInput from '@components/Input';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useNavigate } from '@lib/router-compat';
import { post } from '@utils/apiHelper';
import minilog from '../GuestHomeComponents/assets/convoyainew.png';
import { Loader2 } from 'lucide-react';

const ForgetPasswordValidation = yup.object({
  email: yup.string().email('Please enter a valid email address').required('Email is required'),
});

type ForgetPasswordFormValues = yup.InferType<typeof ForgetPasswordValidation>;

export default function ForgetPassword() {
  const navigate = useNavigate();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ForgetPasswordFormValues>({
    resolver: yupResolver(ForgetPasswordValidation),
    mode: 'onChange',
    defaultValues: {
      email: '',
    },
  });

  const handleForgetPassword = async (data: ForgetPasswordFormValues) => {
    console.log('data', data);
    try {
      const response = await post('/api/forgot-password', data);

      if (response?.success) {
        navigate('/login', {
          state: { email: data.email },
        });
        console.log('passwo');
      }
    } catch (error) {
      console.error('Error in forget password request:', error);
    }
  };

  const handleBackToSignIn = () => {
    navigate('/login');
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-0">
      {/* Logo + heading - desktop only, top-left */}
      <div className="hidden md:flex absolute top-20 left-20 z-10 flex-col items-start gap-4 text-3xl font-bold">
        <img src={minilog} className="h-[68px] max-w-none" alt="Logo" />
        <h3 className="text-xl -mt-6 text-ink-0 font-semibold font-display">Password recovery</h3>
        <p className="text-base text-ink-1 font-medium">
          Secure password reset process to regain
          <br /> access to your <span className="font-semibold text-ink-0">
            dashboard account
          </span>{' '}
          with
          <br /> enhanced security measures.
        </p>
      </div>

      {/* Mobile header - shown above the form on small screens */}
      <div className="md:hidden absolute top-8 left-0 right-0 z-10 flex flex-col items-center px-4">
        <img src={minilog} className="h-[64px] " alt="Logo" />
        <h3 className="text-xl text-ink-0 font-semibold text-center mb-2 font-display">
          Password recovery
        </h3>
        <p className="text-sm text-ink-1 font-medium text-center max-w-sm">
          Secure password reset process to regain
          <span className="font-semibold text-ink-0"> access to your dashboard account </span>
          with enhanced security measures.
        </p>
      </div>

      {/* Form Card */}
      <div className="relative z-10 h-full w-full flex items-center justify-center md:justify-end md:pr-24 p-4">
        <div className="max-w-[400px] w-full rounded-xl border border-line p-6 bg-surface-1 max-h-[95vh] overflow-hidden overflow-y-hidden shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <form onSubmit={handleSubmit(handleForgetPassword)} className="space-y-4">
            {/* Header */}
            <div className="text-center space-y-1 pb-4">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-0 font-display">
                Reset password
              </h1>
              <p className="text-sm text-ink-2">
                Enter your email to receive a password reset link
              </p>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-ink-1 mb-1">Email</label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <GlobalInput
                    {...field}
                    type="email"
                    height="h-9"
                    error={!!errors.email}
                    helperText={errors.email?.message}
                    size="small"
                    placeholder="Your email address"
                  />
                )}
              />
            </div>

            {/* Send Reset Link Button */}
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="w-full brand-gradient-bg on-gradient py-1 h-[34px] text-[13px] px-4 cursor-pointer rounded-lg font-semibold focus:outline-none transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
            </button>

            <div className="flex justify-center items-center">
              <button
                type="button"
                onClick={handleBackToSignIn}
                className="inline-flex text-ink-1 justify-center items-center cursor-pointer gap-2 text-sm font-semibold hover:text-accent-cyan"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-move-left size-3.5 opacity-70"
                  aria-hidden="true"
                >
                  <path d="M6 8L2 12L6 16" />
                  <path d="M2 12H22" />
                </svg>
                Back to sign in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
