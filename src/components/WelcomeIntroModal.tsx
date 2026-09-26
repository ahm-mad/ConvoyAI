import {
  X,
  Sparkles,
  Thermometer,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Radio,
  AlertCircle,
} from 'lucide-react';

import { demoDb } from '../utils/fakeBackend/db';

const highlights = [
  'Real-time device monitoring',
  'Automated alerts & rules',
  'One workspace, every device',
];

interface WelcomeIntroModalProps {
  onFinish?: () => void;
  onOpenTutorial?: () => void;
}

const WelcomeIntroModal = ({ onFinish, onOpenTutorial }: WelcomeIntroModalProps) => {
  const handleTutorialClick = () => {
    onOpenTutorial?.();
    onFinish?.();
  };

  return (
    // Self-contained fixed overlay: the modal centers itself regardless of
    // how the parent (ModalContext) positions its children. This prevents
    // layout breaking if the parent wrapper isn't flex/centered correctly.
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40">
      <div
        className="w-full max-w-[860px] max-h-[90vh] rounded-md bg-surface-1 overflow-y-auto overflow-x-hidden relative flex border border-line-soft shadow-[0_24px_70px_-12px_rgba(0,0,0,0.45)]"
        onClick={e => e.stopPropagation()}
      >
        {/* <button
          type="button"
          onClick={() => onFinish?.()}
          className="absolute top-5 right-5 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white cursor-pointer transition-colors md:text-gray-400 md:bg-transparent md:hover:bg-gray-100 md:hover:text-gray-600"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button> */}

        {/* Left brand panel */}
        <div
          className="hidden lg:flex flex-col justify-between w-[300px] shrink-0 p-9 relative overflow-hidden"
          style={{
            background:
              'linear-gradient(160deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)',
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '18px 18px',
            }}
          />
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          />

          <div className="relative z-10">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm mb-8">
              <Sparkles className="w-5 h-5 text-white" />
            </div>

            <p className="text-white text-[22px] font-semibold leading-[1.3] tracking-tight mb-6">
              Real-time visibility, from day one.
            </p>

            <div className="flex flex-col gap-3">
              {highlights.map(item => (
                <div key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-white/70 shrink-0" />
                  <span className="text-sm text-white/85">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-xs text-white/50 tracking-wide uppercase">
            ConvoyAI Platform
          </p>
        </div>

        {/* Right content panel */}
        <div className="flex flex-col justify-center px-6 py-8 sm:px-9 lg:py-10 lg:px-11 flex-1 text-left">
          <span className="inline-block text-[11px] font-semibold tracking-wider uppercase mb-2.5 text-brand-text">
            Getting started
          </span>
          <h2 className="text-lg font-semibold text-ink-0 mb-2 tracking-tight leading-tight font-display">
            Welcome to ConvoyAI
          </h2>
          <p className="text-[13px] text-ink-2 leading-relaxed mb-5 max-w-[420px]">
            We're glad to have you here. Your workspace comes pre-configured so you can start
            exploring immediately — no setup required.
          </p>

          {/* Demo Data Warning - Compact version */}
          <div className="flex items-start gap-2.5 mb-5 p-3 rounded-md bg-warning/10 border border-warning/25">
            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-medium text-warning">Demo data notice</p>
              <p className="text-[12px] text-ink-1 leading-relaxed">
                This workspace includes pre-configured demonstration data. For a clean slate, open
                this application in a new browser session or incognito window. Your data persists
                across logins — logging out and back in will retain your current state.
              </p>
            </div>
          </div>

          <div className="w-full grid gap-3 mb-6">
            <div className="flex items-start gap-4 rounded-md border border-line-soft p-4 transition-colors hover:border-line">
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-warning/10">
                <Thermometer className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink-0 mb-1 flex items-center gap-1.5">
                  Temperature sensor ready
                  <Radio className="w-3 h-3 text-warning" />
                </p>
                <p className="text-[12.5px] text-ink-2 leading-relaxed">
                  A sample product is already configured — simulate a{' '}
                  <span className="font-medium text-ink-1">normal reading</span> or trigger an{' '}
                  <span className="font-medium text-ink-1">alert</span> to see live monitoring in
                  action.
                </p>
              </div>
            </div>

            <button
              type="button"
              // onClick={handleTutorialClick}
              className="group flex items-start gap-4 rounded-md border border-line-soft p-4 text-left transition-all hover:border-line hover:bg-surface-2"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-accent-cyan/15">
                <BookOpen className="w-5 h-5 text-accent-cyan" />
              </div>
              <div className="flex-1">
                <p className="text-[13px]  font-semibold text-ink-0 mb-1 flex items-center gap-1.5">
                  Set up your own device
                </p>
                <p className="text-[12.5px] text-ink-2 leading-relaxed">
                  Prefer to configure things yourself? We'll walk you through adding a device from
                  the sidebar.
                </p>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              await (demoDb as any).users.update('demo-user-1', { isFirstLogin: false });
              const user = JSON.parse(localStorage.getItem('user') || 'null');
              localStorage.setItem('user', JSON.stringify({ ...user, isFirstLogin: false }));
              onFinish?.();
            }}
            className="group flex p-2 items-center justify-center gap-2 w-full sm:w-auto sm:self-start px-7 h-10 rounded-md text-sm font-semibold on-gradient brand-gradient-bg cursor-pointer transition-all hover:brightness-110"
          >
            Get started
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeIntroModal;
