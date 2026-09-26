import { useState, useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import FloatingNav from '@components/shell/FloatingNav';
import CommandPalette from '@components/shell/CommandPalette';
import StatusBar from '@components/shell/StatusBar';
import KeyboardShortcuts from '@components/shell/KeyboardShortcuts';
import SpotlightTracker from '@components/ui/SpotlightTracker';
import CopilotPanel from '@components/shell/CopilotPanel';
import GlobalPacketListener from '@components/GlobalPacketListener';
import { useUser } from '@contexts/UserContext';
import { useModal } from '@contexts/ModalContext';
import WelcomeIntroModal from '@components/WelcomeIntroModal';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const { openModal, closeModal } = useModal();

  const hasShownWelcome = useRef(false);

  // Any screen can open the copilot with `window.dispatchEvent(new CustomEvent('convoy:copilot', { detail: { question } }))`.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      if (q) setPendingQuestion(q);
      setCopilotOpen(true);
    };
    window.addEventListener('convoy:copilot', onOpen);
    return () => window.removeEventListener('convoy:copilot', onOpen);
  }, []);

  const handleOpenTutorial = () => {
    // Tutorials lived in the old sidebar; the new shell has no sidebar to expand.
  };

  // Welcome/Demo intro modal — shows ONLY when it's the user's first login
  // (isFirstLogin flag) AND the user is a demo user (isDemo === true).
  // Normal (non-demo) users never see this modal, regardless of isFirstLogin.
  useEffect(() => {
    if (hasShownWelcome.current) return;
    if (!user) return; // wait until user context is actually loaded

    const isFirstLogin = user.isFirstLogin === true;
    const isDemoUser = user?.isDemo === true;

    if (isFirstLogin && isDemoUser) {
      hasShownWelcome.current = true;
      localStorage.removeItem('isFirstLogin');
      openModal(<WelcomeIntroModal onFinish={closeModal} onOpenTutorial={handleOpenTutorial} />, {
        preventClose: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="max-w-screen min-h-screen overflow-x-clip flex flex-col text-ink-0">
      <GlobalPacketListener />
      <SpotlightTracker />
      <FloatingNav
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenCopilot={() => setCopilotOpen(true)}
      />
      <main key={(pathname ?? '').split('/')[1]} className="page-container motion-rise flex-1">
        {children}
      </main>
      <StatusBar />
      <KeyboardShortcuts />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAsk={q => {
          setPendingQuestion(q);
          setCopilotOpen(true);
        }}
      />
      <CopilotPanel
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        pendingQuestion={pendingQuestion}
        onConsumed={() => setPendingQuestion(null)}
      />
    </div>
  );
}
