import { useState, useEffect } from 'react';
import { useNavigate, useParams } from '@lib/router-compat';
import { useForm, Controller } from 'react-hook-form';
import { post } from '@utils/apiHelper';
import { CheckCircle, XCircle, Loader2, Lock } from 'lucide-react';
import GlobalInput from '../components/Input';

interface SetNewPasswordFormValues {
  newPassword: string;
  confirmPassword: string;
}

export default function SetNewPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  // React Hook Form
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<SetNewPasswordFormValues>({
    mode: 'onChange',
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Watch password values for real-time comparison
  const watchedPassword = watch('newPassword');
  const watchedConfirmPassword = watch('confirmPassword');

  // States
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);

  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      verifyToken();
      setError(true);
      setMessage('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await post('/api/verify-reset-token', { token }, {}, false);

      if (response?.success) {
        setIsTokenValid(true);
      } else {
        setIsTokenValid(true);
        setMessage('Invalid or expired reset link. Please request a new password reset.');
      }
    } catch (err) {
      setError(true);
      setMessage('Error verifying reset link. Please try again.');
      console.error('Token verification error:', err);
    }

    setVerifyingToken(false);
  };

  // Form validation rules
  const passwordValidation = {
    required: 'Password is required',
    minLength: {
      value: 8,
      message: 'Password must be at least 8 characters long',
    },
    validate: {
      hasUppercase: (value: string) =>
        /[A-Z]/.test(value) || 'Password must contain at least one uppercase letter',
      hasLowercase: (value: string) =>
        /[a-z]/.test(value) || 'Password must contain at least one lowercase letter',
      hasNumber: (value: string) => /\d/.test(value) || 'Password must contain at least one number',
    },
  };

  const confirmPasswordValidation = {
    required: 'Please confirm your password',
    validate: {
      matchesPassword: (value: string) => value === watchedPassword || 'Passwords do not match',
    },
  };

  const onSubmit = async (data: SetNewPasswordFormValues) => {
    // Reset states
    setError(false);
    setSuccess(false);
    setMessage('');
    setIsLoading(true);

    try {
      const response = await post(
        '/api/reset-password',
        {
          token,
          password: data.newPassword,
        },
        {},
        false
      );

      if (response?.success) {
        setSuccess(true);
        setMessage('Password has been set successfully!');
        // Clear form
        reset();
        // Redirect to login after 3 seconds
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setError(true);
        setMessage(response?.message || 'Failed to set password. Please try again.');
      }
    } catch (err) {
      setError(true);
      setMessage('An error occurred while setting password. Please try again.');
      console.error('Set password error:', err);
    }

    setIsLoading(false);
  };

  // Loading state while verifying token
  if (verifyingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-surface-0">
        <div className="w-full max-w-md">
          <div className="glass-strong  p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="mb-8">
              <div className="mx-auto w-16 h-16 brand-gradient-bg rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 on-gradient" />
              </div>
              <h1 className="text-xl font-semibold text-ink-0 mb-2 font-display">
                Set new password
              </h1>
              <p className="text-ink-2 text-sm">Verifying your reset link...</p>
            </div>

            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-accent-cyan/25 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-accent-cyan animate-spin" />
                </div>
              </div>
              <p className="text-ink-1 font-medium text-sm">Please wait...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-0">
      <div className="w-full max-w-md">
        <div className="glass-strong  p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 brand-gradient-bg rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 on-gradient" />
            </div>
            <h1 className="text-xl font-semibold text-ink-0 mb-2 font-display">Set new password</h1>
            <p className="text-ink-2 text-sm">Create a strong password for your account</p>
          </div>

          {/* Status Messages */}
          {(error || success) && (
            <div
              className={`mb-6 p-4 rounded-lg flex items-center ${
                success
                  ? 'bg-accent-green/10 border border-accent-green/25 text-accent-green'
                  : 'bg-danger/10 border border-danger/25 text-danger'
              }`}
            >
              {success ? (
                <CheckCircle className="w-5 h-5 mr-2 text-accent-green" />
              ) : (
                <XCircle className="w-5 h-5 mr-2 text-danger" />
              )}
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}

          {/* Set New Password Form */}
          {isTokenValid && !success && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* New Password Field */}
              <Controller
                name="newPassword"
                control={control}
                rules={passwordValidation}
                render={({ field, fieldState: { error } }) => (
                  <GlobalInput
                    label="Set New Password"
                    name="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Enter your new password"
                    disabled={isLoading}
                    error={!!error}
                    helperText={
                      error?.message ||
                      'Must be at least 8 characters with uppercase, lowercase, and number'
                    }
                    height="h-9"
                    endAdornment={
                      <button
                        type="button"
                        // onClick={() => setShowNewPassword(!showNewPassword)}
                        className="cursor-pointer hover:text-ink-0 transition-colors"
                        disabled={isLoading}
                        tabIndex={-1}
                      >
                        {/* {showNewPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )} */}
                      </button>
                    }
                    inputProps={{
                      onBlur: field.onBlur,
                      ref: field.ref,
                    }}
                  />
                )}
              />

              {/* Confirm Password Field */}
              <Controller
                name="confirmPassword"
                control={control}
                rules={confirmPasswordValidation}
                render={({ field, fieldState: { error } }) => (
                  <GlobalInput
                    label="Confirm New Password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Confirm your new password"
                    disabled={isLoading}
                    error={!!error}
                    helperText={error?.message}
                    height="h-9"
                    endAdornment={
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="cursor-pointer hover:text-ink-0 transition-colors"
                        disabled={isLoading}
                        tabIndex={-1}
                      >
                        {/* {showConfirmPassword ? (
                          <EyeOff size='10px' mt-8 className="" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )} */}
                      </button>
                    }
                    inputProps={{
                      onBlur: field.onBlur,
                      ref: field.ref,
                    }}
                  />
                )}
              />

              {/* Password Match Indicator */}
              {watchedPassword &&
                watchedConfirmPassword &&
                watchedPassword === watchedConfirmPassword &&
                !errors.confirmPassword && (
                  <div className="text-sm">
                    <p className="text-accent-green flex items-center text-xs">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Passwords match
                    </p>
                  </div>
                )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !isValid}
                className="w-full brand-gradient-bg on-gradient cursor-pointer font-semibold py-2.5 px-6 rounded-lg hover:brightness-110 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Setting password...
                  </div>
                ) : (
                  'Set new password'
                )}
              </button>
            </form>
          )}

          {/* Invalid Token - Show option to request new link */}
          {/* {!isTokenValid && !verifyingToken && (
            <div className="space-y-4 animate-fade-in">
              <button
                onClick={() => navigate('/forgot-password')}
                className="w-full bg-gradient-to-r from-blue-400 cursor-pointer to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-blue-500 hover:to-blue-600 hover:scale-102 transition-all duration-200 focus:outline-none"
              >
                Request New Reset Link
              </button>
            </div>
          )} */}

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-ink-1 hover:text-ink-0 cursor-pointer text-sm font-medium py-2 px-4 rounded-md hover:bg-surface-3 bg-surface-2 transition-colors duration-200"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
