import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@lib/router-compat';
import { post } from '@utils/apiHelper';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

export default function VerifyAccount() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(true);
  const [message, setMessage] = useState('Verifying your account...');
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        console.log('tt', token);
        setMessage('Invalid verification link.');
        setVerifying(false);
        return;
      }

      const response = await post('/api/verify-token', { token }, {}, false);
      console.log('wwe', response);

      if (response?.success) {
        setSuccess(true);
        setMessage('Account verified successfully!');
      } else {
        const errorMsg = response?.message || 'Verification failed. Invalid or expired token.';
        setMessage(errorMsg);
      }

      setVerifying(false);
    }

    verifyToken();
  }, [token]);

  // Resend verification email handler
  const handleResendEmail = async () => {
    if (!token) return;

    setResending(true);
    setResendMessage('');

    const response = await post('/api/resend-verification-email', { token }, {}, false);

    if (response?.success) {
      setEmailSent(true);
      setResendMessage('Verification email sent successfully! Please check your inbox.');
    } else {
      // NOTE(ts-migration): this reads `response.error` as a message string, but
      // apiHelper sets `error: true` (boolean) on caught failures — so on a real
      // failure this currently sets `true`. Left as-is (behaviour unchanged);
      // flagged in task.md.
      setResendMessage((response as any)?.error || 'Failed to send email. Please try again.');
    }

    setResending(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="glass-strong  p-8 text-center shadow-modal">
          {/* Header */}
          <div className="mb-8">
            {!emailSent && (
              <>
                <div className="mx-auto w-16 h-16 brand-gradient-bg rounded-full flex items-center justify-center mb-4">
                  <Mail className="w-8 h-8 on-gradient" />
                </div>
                <h1 className="text-xl font-semibold text-ink-0 mb-2 font-display">
                  Account verification
                </h1>
                <p className="text-ink-2 text-sm">Please wait while we verify your account</p>
              </>
            )}
          </div>

          {/* Status Section */}
          <div className="mb-8">
            {verifying ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-accent-cyan/25 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-accent-cyan animate-spin" />
                  </div>
                </div>
                <p className="text-ink-1 font-medium text-sm">{message}</p>
              </div>
            ) : success ? (
              <div className="flex flex-col items-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 bg-accent-green/10 rounded-full flex items-center justify-center animate-bounce">
                  <CheckCircle className="w-8 h-8 text-accent-green" />
                </div>
                <p className="text-accent-green font-semibold text-base">{message}</p>
              </div>
            ) : emailSent ? (
              // Show success message after email resent
              <div className="flex flex-col items-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 bg-accent-cyan/10 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-accent-cyan" />
                </div>
                <div className="space-y-2">
                  <p className="text-accent-cyan font-semibold text-base">
                    Email sent successfully!
                  </p>
                  <p className="text-ink-2 text-sm">
                    Please check your inbox and click the verification link.
                  </p>
                </div>
              </div>
            ) : (
              // Show error state
              <div className="flex flex-col items-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-danger" />
                </div>
                <p className="text-danger font-semibold text-sm">{message}</p>
              </div>
            )}
          </div>

          {/* Resend Error Message (only show if resend failed) */}
          {resendMessage && !emailSent && (
            <div className="mb-4 p-3 rounded-md text-sm bg-danger/10 text-danger border border-danger/25">
              {resendMessage}
            </div>
          )}

          {/* Action Button */}
          {!verifying && (
            <div className="space-y-4 animate-fade-in">
              {/* Only show "Continue to Login" button if verification was successful */}
              {success && (
                <button
                  onClick={() => navigate('/login')}
                  className="w-full brand-gradient-bg on-gradient cursor-pointer font-semibold py-2.5 px-6 rounded-lg hover:brightness-110 transition-all duration-200 focus:outline-none"
                >
                  Continue to login
                </button>
              )}

              {/* Show "Back to Login" button only if verification failed AND email hasn't been sent */}
              {!success && !emailSent && (
                <button
                  onClick={() => navigate('/login')}
                  className="w-full brand-gradient-bg on-gradient cursor-pointer font-semibold py-2.5 px-6 rounded-lg hover:brightness-110 transition-all duration-200 focus:outline-none"
                >
                  Back to login
                </button>
              )}

              {/* Only show resend button if verification failed AND email hasn't been sent yet */}
              {!success && !emailSent && (
                <button
                  onClick={handleResendEmail}
                  disabled={resending}
                  className="w-full text-ink-1 cursor-pointer hover:text-ink-0 text-sm font-medium py-2 px-4 rounded-md hover:bg-surface-3 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resending ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
