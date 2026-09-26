import { useState } from 'react';
import { Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { registerFormSchema } from '@validation/registerFormValidation';
import { post } from '@utils/apiHelper';
import { Link } from '@lib/router-compat';
import GlobalInput from '@components/Input';
// import Signimg from '../assets/images/backgroundImg.webp';
import AuthShell from '@components/auth/AuthShell';
import * as RadixCheckbox from '@radix-ui/react-checkbox';

interface RegisterFormValues {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  number: string;
  company_domain: string;
  check: boolean;
}

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    reset,
  } = useForm<RegisterFormValues>({
    // See note in Login.tsx — yup schema types aren't tightened in this pass.
    resolver: yupResolver(registerFormSchema) as any,
    mode: 'onChange',
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      confirm_password: '',
      number: '',
      company_domain: '',
      check: false,
    },
  });

  async function handleRegisterSubmit(data: RegisterFormValues) {
    console.log('register form data', data);

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log('User Timezone:', userTimezone);

    const dataWithTimezone = {
      ...data,
      timezone: userTimezone,
    };

    console.log('Data being sent to API:', dataWithTimezone);

    const response = await post('/api/register', dataWithTimezone);
    // console.log('res', response);
    // if (response?.error) {
    //   console.log('Error registering:- ', response?.message);
    //   return;
    // } else
    if (response?.success) {
      console.log('User registerd:- ', response?.message);
      // navigate("/login");
      console.log('Registration successful! Please check your email for verification link.');

      reset({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        confirm_password: '',
        number: '',
        company_domain: '',
        check: false,
      });

      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }

  return (
    <AuthShell>
      <div className="glass-modal w-full max-w-[420px] p-8">
        <form onSubmit={handleSubmit(handleRegisterSubmit)} className="space-y-3">
          {/* Header */}
          <div className="text-center space-y-1 pb-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-0 font-display">
              Sign up
            </h1>
            <p className="text-sm text-ink-2">Create your account to get started</p>
          </div>

          {/* First Name */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-ink-1 mb-1">First name</label>
            <Controller
              name="first_name"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  error={!!errors.first_name}
                  helperText={errors.first_name?.message}
                  size="small"
                  height="h-9"
                  placeholder="Enter your first name"
                />
              )}
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">Last name</label>
            <Controller
              name="last_name"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  error={!!errors.last_name}
                  helperText={errors.last_name?.message}
                  size="small"
                  height="h-9"
                  placeholder="Enter your last name"
                />
              )}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">Email</label>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  type="email"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  size="small"
                  height="h-9"
                  placeholder="Your email address"
                />
              )}
            />
          </div>

          {/* Password */}
          <div className="relative">
            <label className="block text-sm font-medium text-ink-1 mb-2">Password</label>
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  type={showPassword ? 'text' : 'password'}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  size="small"
                  height="h-9"
                  placeholder="Create a password"
                />
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-6 cursor-pointer top-[28px] flex items-center h-[36px]"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-ink-2" />
              ) : (
                <Eye className="h-4 w-4 text-ink-2" />
              )}
            </button>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">Confirm password</label>
            <div className="relative">
              <Controller
                name="confirm_password"
                control={control}
                render={({ field }) => (
                  <GlobalInput
                    {...field}
                    type={showConfirmPassword ? 'text' : 'password'}
                    error={!!errors.confirm_password}
                    helperText={errors.confirm_password?.message}
                    size="small"
                    height="h-9"
                    placeholder="Confirm your password"
                  />
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={
                  showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'
                }
                aria-pressed={showConfirmPassword}
                className="absolute right-6 cursor-pointer top-0 flex items-center h-[36px]"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 cursor-pointer text-ink-2" />
                ) : (
                  <Eye className="h-4 w-4 cursor-pointer text-ink-2" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Phone Number */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">Mobile phone number</label>
            <Controller
              name="number"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  type="tel"
                  error={!!errors.number}
                  helperText={errors.number?.message}
                  size="small"
                  height="h-9"
                  placeholder="Mobile phone number (to receive SMS notifications)"
                />
              )}
            />
          </div>

          {/* Terms and Conditions Checkbox */}
          <div className="flex items-start space-x-2 mt-4">
            <Controller
              name="check"
              control={control}
              render={({ field }) => (
                <RadixCheckbox.Root
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="flex h-[20px] w-[20px] mt-1 appearance-none items-center justify-center rounded-md border border-line bg-white data-[state=checked]:bg-accent-cyan data-[state=checked]:border-accent-cyan focus:outline-none cursor-pointer"
                >
                  <RadixCheckbox.Indicator className="text-white">
                    <Check className="h-3 w-3" />
                  </RadixCheckbox.Indicator>
                </RadixCheckbox.Root>
              )}
            />
            <div className="font-medium text-ink-2 text-sm mt-1">
              I agree to the{' '}
              <span className="text-ink-0 cursor-pointer hover:text-accent-cyan">
                Terms of Service
              </span>{' '}
              and{' '}
              <span className="text-ink-0 cursor-pointer hover:text-accent-cyan">
                Privacy Policy
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full brand-gradient-bg on-gradient py-2 text-[13px] cursor-pointer px-4 mt-4 rounded-lg font-semibold focus:outline-none transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>

          <div className="text-center text-sm text-ink-1 mt-3 pt-2">
            <span className="text-ink-1 font-medium">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-ink-0 font-bold cursor-pointer hover:text-accent-cyan"
              >
                Sign in
              </Link>
            </span>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
