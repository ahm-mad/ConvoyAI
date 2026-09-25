import { useState, useEffect, useRef, type ReactNode } from 'react';
import LeftSidebar from '@components/LeftSidebar';
import { useLocation } from '@lib/router-compat';
import Navbar from '../components/Navbar';
import DashboardSubNav from '../components/DashboardSubNav';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import GlobalPacketListener from '@components/GlobalPacketListener';
import { useUser } from '@contexts/UserContext';
import Breadcrumb from '@components/Breadcrumb';
import { useModal } from '@contexts/ModalContext';
import WelcomeIntroModal from '@components/WelcomeIntroModal';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useUser();
  const [isExpanded, setIsExpanded] = useState(false);
  const { openModal, closeModal } = useModal();

  const hasShownWelcome = useRef(false);

  const handleOpenTutorial = () => {
    setIsExpanded(true);
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

  const {
    data: dashboardData,
    isLoading,
    refetch,
  } = useSimpleQuery('dashboardData', `/api/user/${user?.id}/dashboards`);

  const isDashboardPage = location.pathname.includes('/dashboard');

  return (
    <div className="max-w-screen min-h-screen overflow-x-hidden flex flex-col bg-surface-0 text-ink-0">
      <GlobalPacketListener />

      <div className="flex flex-1">
        <LeftSidebar
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          dashboardData={dashboardData?.data}
          refetch={refetch}
        />
        <div className="flex flex-col overflow-x-auto flex-1">
          <Navbar dashboardData={dashboardData?.data} refetch={refetch} />

          {(() => {
            if (location.pathname.includes('/dashboard')) {
              return <DashboardSubNav refetch={refetch} />;
            }
          })()}

          {!isDashboardPage && (
            <div className="">
              <Breadcrumb />
            </div>
          )}

          <div className="flex-1 bg-surface-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
