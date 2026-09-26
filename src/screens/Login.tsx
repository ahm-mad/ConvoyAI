import { useState, useEffect, useRef } from 'react';
import GlobalInput from '@components/Input';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Check, Loader2 } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { LoginPageValidation } from '@validation/LoginPageValidation';
import { useNavigate, useLocation, Link } from '@lib/router-compat';
import { post, get } from '@utils/apiHelper';
import { useTranslation } from 'react-i18next';
import { useUser } from '@contexts/UserContext';
import AuthShell from '@components/auth/AuthShell';
// import convoyaiLogo from '../../assets/convoyai-logo.png';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { setupDemoMode } from '@utils/fakeBackend/browser';

// Origin the Google OAuth popup must post back from — derived from the same env var the rest of the
// app uses (NEXT_PUBLIC_API_URL), so it's correct in every environment without hand-editing.
const BACKEND_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const GOOGLE_REDIRECT_ENDPOINT = '/api/auth/google/redirect';

interface LoginFormValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

type TimerRef = ReturnType<typeof setTimeout> | null;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [googleSuccess, setGoogleSuccess] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');
  const { handleLogin } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const from = location.state?.from || '/home';

  const popupRef = useRef<Window | null>(null);
  const popupTimeoutRef = useRef<TimerRef>(null);
  // TEMPORARY DEBUG: remove after diagnosing the postMessage handoff timeout
  const popupDebugIntervalRef = useRef<TimerRef>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<LoginFormValues>({
    // yup schema types aren't being tightened in this pass — the resolver's
    // inferred field-optionality fights RHF's generic. Cast keeps the form
    // strongly typed as LoginFormValues for the handler/fields.
    resolver: yupResolver(LoginPageValidation) as any,
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const handleLoginClick = async (data: LoginFormValues) => {
    if (data.email === 'demoAccount@chirptech.io' && data.password === 'demoAccount-password') {
      localStorage.clear();
      await setupDemoMode(true);
    }
    setLoginError('');
    setLoginSuccess('');

    try {
      const response = await post('/api/login', data);
      localStorage.setItem('isFirstLogin', 'true');

      if (response?.success) {
        setLoginSuccess('Login successful! Redirecting...');
        handleLogin(response?.user, response?.token);
        i18n.changeLanguage(response?.user?.locale || 'en');

        setTimeout(() => {
          response?.user?.companyInfo
            ? navigate(from, { replace: true })
            : navigate('/account-setting');
        }, 600);
      } else {
        setLoginError(response?.message || 'Invalid email or password. Please try again.');
      }
    } catch (err: any) {
      setLoginError(
        err?.response?.data?.message || 'Something went wrong while signing in. Please try again.'
      );
    }
  };

  const handleGoogleLogin = async () => {
    // Clear any leftover fallback timeout from a previous attempt
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    if (popupDebugIntervalRef.current) {
      clearInterval(popupDebugIntervalRef.current);
    }

    setGoogleError('');
    setGoogleSuccess('');
    setGoogleLoading(true);

    // 2. Enterprise Fix: Open a blank popup immediately so browsers don't block it.
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      'about:blank', // Opens instantly to bypass the async popup blocker
      'Google Login',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      setGoogleError('Popup was blocked. Please allow popups for this site and try again.');
      setGoogleLoading(false);
      return;
    }

    popupRef.current = popup;

    try {
      // Now perform your network request while the user sees a loading window
      const response = await get(GOOGLE_REDIRECT_ENDPOINT);
      const authUrl = response?.redirect_url;

      if (!authUrl) {
        console.log('checking1');
        setGoogleError('Could not get the Google sign-in link. Please try again.');
        // popup.close(); // Close the blank popup we opened
        setGoogleLoading(false);
        return;
      }
      // Redirect the already-open window to the Google auth URL
      popup.location.href = authUrl;

      // We can't poll popup.closed here: once the popup navigates to
      // accounts.google.com / api.example.com, those origins send a
      // Cross-Origin-Opener-Policy header that blocks the opener from reading
      // any state on the popup window (including .closed), so this app relies
      // entirely on the callback page posting a message back via
      // window.opener.postMessage (handled below). As a safety net in case the
      // user closes the popup manually or the callback never posts a message,
      // fall back to clearing the loading state after a timeout.
      popupTimeoutRef.current = setTimeout(
        () => {
          setGoogleLoading(false);
          setGoogleError('Google sign-in timed out. Please try again.');
        },
        2 * 60 * 1000
      );

      // TEMPORARY DEBUG: observation-only, does not drive any functional logic.
      // Remove once we've confirmed why the postMessage handoff is timing out.
      if (popupDebugIntervalRef.current) {
        clearInterval(popupDebugIntervalRef.current);
      }
      popupDebugIntervalRef.current = setInterval(() => {
        console.log(
          '[GoogleAuth Debug] Popup location check:',
          (() => {
            try {
              return popup.location.href;
            } catch (e: any) {
              return `Cross-origin, cannot read (expected once popup navigates away): ${e?.message}`;
            }
          })()
        );
      }, 2000);
    } catch (err) {
      console.error('Google login error:', err);
      setGoogleError('Something went wrong. Please try again.');
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
      if (popupDebugIntervalRef.current) {
        clearInterval(popupDebugIntervalRef.current);
      }
      // if (popup && !popup.closed) popup.close();
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // TEMPORARY DEBUG: logged before the origin check so we can see messages
      // even if they're currently being silently dropped due to an origin
      // mismatch. Remove once we've confirmed the root cause.
      console.log('[GoogleAuth Debug] Message received:', {
        origin: event.origin,
        expectedOrigin: BACKEND_ORIGIN,
        originMatches: event.origin === BACKEND_ORIGIN,
        data: event.data,
      });

      // Dynamic origin check from your config constants
      if (event.origin !== BACKEND_ORIGIN) return;

      // 1. HANDLE SUCCESS
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        const { token, user } = event.data;
        setGoogleSuccess('Signed in with Google successfully! Redirecting...');
        handleLogin(user, token);
        i18n.changeLanguage(user?.locale || 'en');

        // Cleanup window and fallback timeout immediately
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        if (popupTimeoutRef.current) {
          clearTimeout(popupTimeoutRef.current);
        }
        if (popupDebugIntervalRef.current) {
          clearInterval(popupDebugIntervalRef.current);
        }
        setGoogleLoading(false);

        // Delayed Routing
        setTimeout(() => {
          user?.companyInfo ? navigate(from, { replace: true }) : navigate('/account-setting');
        }, 600);
      }

      // 2. HANDLE FAILURE
      if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
        setGoogleError(event.data?.message || 'Google sign-in failed. Please try again.');

        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        if (popupTimeoutRef.current) {
          clearTimeout(popupTimeoutRef.current);
        }
        if (popupDebugIntervalRef.current) {
          clearInterval(popupDebugIntervalRef.current);
        }
        setGoogleLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      // Ensure the fallback timeout/debug interval are cleared if the user
      // leaves the page midway
      if (popupDebugIntervalRef.current) {
        clearInterval(popupDebugIntervalRef.current);
      }
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell>
      <div className="glass-modal w-full max-w-[420px] p-8">
        <form onSubmit={handleSubmit(handleLoginClick)} className="space-y-4">
          {/* Header */}
          <div className="text-center space-y-1 pb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-0 font-display">
              Sign in
            </h1>
            <p className="text-sm text-ink-2">Welcome back. Log in with your credentials.</p>
          </div>

          {loginSuccess && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-400">{loginSuccess}</span>
            </div>
          )}

          {loginError && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
              <span className="text-xs text-danger-text">{loginError}</span>
            </div>
          )}

          {googleSuccess && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-400">{googleSuccess}</span>
            </div>
          )}

          {googleError && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
              <span className="text-xs text-danger-text">{googleError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full bg-white border border-line rounded-full h-10 shadow-card py-[6px] px-4 flex items-center justify-center gap-3 cursor-pointer transition-colors mb-6 hover:bg-surface-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-0" />
            ) : (
              <svg
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
                focusable="false"
                className="w-5 h-5"
              >
                <path
                  d="M16.2449 13.8184V18.4657H22.8349C22.5455 19.9602 21.6771 21.2257 20.3747 22.0766L24.3487 25.0985C26.6642 23.004 28 19.9276 28 16.273C28 15.4221 27.9221 14.6039 27.7773 13.8185L16.2449 13.8184Z"
                  fill="#4285F4"
                />
                <path
                  d="M5.3137 10.6221C4.47886 12.2366 4.00024 14.0584 4.00024 16.0002C4.00024 17.942 4.47886 19.7639 5.3137 21.3784C5.3137 21.3892 9.388 18.2802 9.388 18.2802C9.14311 17.5602 8.99835 16.7966 8.99835 16.0001C8.99835 15.2036 9.14311 14.44 9.388 13.72L5.3137 10.6221Z"
                  fill="#FBBC05"
                />
                <path
                  d="M16.2448 8.77821C18.0482 8.77821 19.6511 9.3891 20.9313 10.5673L24.4378 7.13097C22.3116 5.18917 19.551 4 16.2448 4C11.4582 4 7.32833 6.69456 5.31348 10.6219L9.38766 13.7201C10.3561 10.8837 13.0611 8.77821 16.2448 8.77821Z"
                  fill="#EA4335"
                />
                <path
                  d="M9.38238 18.2842L8.48609 18.9566L5.31348 21.3784C7.32833 25.2947 11.4579 28.0002 16.2445 28.0002C19.5506 28.0002 22.3224 26.9311 24.3484 25.0984L20.3744 22.0766C19.2835 22.7966 17.892 23.233 16.2445 23.233C13.0609 23.233 10.3559 21.1275 9.38739 18.2911L9.38238 18.2842Z"
                  fill="#34A853"
                />
              </svg>
            )}
            <span className="text-ink-0 text-[13px] font-medium">
              {googleLoading ? 'Connecting...' : 'Sign in with Google'}
            </span>
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-surface-1 text-[12px] text-ink-2">OR</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-1 mb-1">Email</label>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <GlobalInput
                  {...field}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  size="small"
                  height="h-9"
                  type="email"
                  placeholder="Enter your email"
                />
              )}
            />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-ink-1 mb-1">Password</label>
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
                  placeholder="Password"
                />
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-3 cursor-pointer top-[22px] flex items-center h-10"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-ink-2" />
              ) : (
                <Eye className="h-4 w-4 text-ink-2" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-start space-x-2">
              <Controller
                name="rememberMe"
                control={control}
                render={({ field }) => (
                  <RadixCheckbox.Root
                    aria-label="Remember me"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="flex h-[20px] w-[20px] appearance-none items-center justify-center rounded-md border border-line bg-white data-[state=checked]:bg-accent-cyan data-[state=checked]:border-accent-cyan focus:outline-none cursor-pointer"
                  >
                    <RadixCheckbox.Indicator className="text-white">
                      <Check className="h-3 w-3" />
                    </RadixCheckbox.Indicator>
                  </RadixCheckbox.Root>
                )}
              />
              <span className="text-sm text-ink-1">Remember me</span>
            </div>
            <Link
              to="/forget-password"
              className="text-sm text-ink-1 cursor-pointer hover:text-brand-text font-semibold"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full brand-gradient-bg on-gradient py-1 h-10 text-control px-4 cursor-pointer rounded-full font-semibold shadow-glow focus:outline-none transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="text-center text-sm">
            <span className="text-ink-1 font-medium">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="text-ink-0 hover:text-accent-cyan font-bold cursor-pointer"
              >
                Sign up
              </Link>
            </span>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
