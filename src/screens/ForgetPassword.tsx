import GlobalInput from '@components/Input';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useNavigate } from '@lib/router-compat';
import { post } from '@utils/apiHelper';
import AuthShell from '@components/auth/AuthShell';
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
    <AuthShell>
      <div className="glass-modal w-full max-w-[420px] p-8">
        <form onSubmit={handleSubmit(handleForgetPassword)} className="space-y-4">
          {/* Header */}
          <div className="text-center space-y-1 pb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-0 font-display">
              Reset password
            </h1>
            <p className="text-sm text-ink-2">Enter your email to receive a password reset link</p>
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
            className="w-full brand-gradient-bg on-gradient py-1 h-10 text-control px-4 cursor-pointer rounded-full font-semibold shadow-glow focus:outline-none transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
          </button>

          <div className="flex justify-center items-center">
            <button
              type="button"
              onClick={handleBackToSignIn}
              className="inline-flex text-ink-1 justify-center items-center cursor-pointer gap-2 text-sm font-semibold hover:text-brand-text"
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
    </AuthShell>
  );
}
