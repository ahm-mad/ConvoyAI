import { useEffect, useState, useRef } from 'react';
import DashboardIcon from '@assets/icons/MUIicons/DashboardIcon';
import BuildingIcon from '@assets/icons/MUIicons/BuildingIcon';
import AvatarIcon from '@assets/icons/MUIicons/AvatarIcon';
import { useLocation, Link } from '@lib/router-compat';
import { get, post } from '../utils/apiHelper';
import LogoutIcon from '@mui/icons-material/Logout';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';
import CustomAvatar from './CustomAvatar';
import FilterPopper from './FilterPopper';
import ThemeToggle from './ThemeToggle';
import { disconnectSocket } from '@contexts/SocketContext';
import { Settings } from 'lucide-react';
import { Globe } from 'lucide-react';
import { useUser } from '@contexts/UserContext';
import { resolveImageUrl } from '@utils/avatar';

interface NavbarProps {
  // Passed by AuthLayout but not consumed here — declared so the call type-checks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dashboardData?: any;
  refetch?: () => void;
}

export default function Navbar(_props: NavbarProps = {}) {
  const { user, uploadedImage, setUploadedImage } = useUser();
  const { i18n } = useTranslation();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [openPopperId, setOpenPopperId] = useState<string | null>(null);
  const { t } = useTranslation();
  const location = useLocation();
  const popperRef = useRef<HTMLDivElement | null>(null);
  const prevPath = useRef<string>(location.pathname);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profileUser, setProfileUser] = useState<any>(null);

  // Header/popper profile (name + company + avatar). Runs on login and whenever the user is updated
  // elsewhere (e.g. saved in Account Settings), so the header never goes stale.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await get(`/api/profile?user_id=${user.id}`);
        if (cancelled) return;

        if (response?.data?.user) setProfileUser(response.data.user);

        // API returns absolute CDN URLs (user_image / user.profile_image); null = no picture.
        setUploadedImage(
          resolveImageUrl(response?.data?.user_image ?? response?.data?.user?.profile_image)
        );
      } catch (error) {
        // Keep whatever avatar we already have — a transient network error must not blank it.
        console.error('Navbar: Error fetching profile:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.first_name, user?.last_name, user?.profile_image, setUploadedImage]);

  const avatarName = profileUser?.first_name || user?.first_name || user?.email;

  // The popper shows the signed-in USER's name (not the company's). Fall back to the context user
  // (kept in sync by updateUser) before the profile fetch resolves, then email, then a generic label.
  const accountDisplayName =
    `${profileUser?.first_name ?? user?.first_name ?? ''} ${profileUser?.last_name ?? user?.last_name ?? ''}`.trim() ||
    user?.email ||
    t('navbar.user');

  const items: Array<{ key: string; text: string; icon: any; route?: string }> = [
    { key: 'manage', text: t('navbar.manage'), icon: DashboardIcon, route: '/manage-product' },
    {
      key: 'assets',
      text: t('navbar.assets'),
      icon: BuildingIcon,
      route: '/assets',
    },
    {
      key: 'companiesLocations',
      text: t('navbar.companiesLocations'),
      icon: BuildingIcon,
      route: '/company-location',
    },
    {
      key: 'rulesPermissions',
      text: t('navbar.rulesPermissions'),
      icon: AvatarIcon,
      route: '/rules-permission',
    },
    { key: 'language', text: t('navbar.language'), icon: LanguageIcon },
    {
      key: 'simulation',
      text: 'Simulation',
      icon: BuildingIcon,
      route: '/simulation',
    },
    {
      key: 'accountSetting',
      text: t('navbar.accountSetting'),
      icon: Settings,
      route: '/account-setting',
    },
    { key: 'logout', text: t('navbar.logout'), icon: LogoutIcon, route: '/login' },
  ];

  const logoutItem = items.find(item => item.key === 'logout');
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  const handleLanguageChange = async (locale: string) => {
    setLanguageMenuOpen(false);
    setRightSidebarOpen(false);
    i18n.changeLanguage(locale);

    try {
      await post('/api/settings/user/update', { locale });
    } catch (error) {
      console.error('Failed to update language:', error);
    }
  };

  const handleLogout = () => {
    if (user) disconnectSocket(user?.id);
    setUploadedImage(null);
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popperRef.current && !popperRef.current.contains(event.target as Node)) {
        setOpenPopperId(null);
        setLanguageMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      setOpenPopperId(null);
      setLanguageMenuOpen(false);
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

  return (
    <>
      <div className="max-w-screen overflow-hidden px-4 h-11 border-b border-line bg-surface-1 flex justify-between items-center">
        <Link to="/manage-product">
          {/* <div className="w-40 max-h-14">
            <img src={convoyai} alt="ConvoyAI Image" />
          </div> */}
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          <FilterPopper
            id="avatar-popper"
            openPopperId={openPopperId}
            setOpenPopperId={setOpenPopperId}
            trigger={
              <CustomAvatar
                alt="User Avatar"
                name={avatarName}
                src={uploadedImage ?? undefined}
                canUpload={false}
                size={35}
                className=""
              />
            }
            // height auto: the popper must grow when the language options expand (a fixed height + overflow:hidden clipped them)
            sx={{ width: '16rem', height: 'auto', zIndex: 10000 }}
          >
            <div
              style={{ fontFamily: 'Inter, sans-serif' }}
              ref={popperRef}
              className="bg-surface-2 text-ink-0 pb-2"
            >
              <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-2">
                  <CustomAvatar
                    alt="User Avatar"
                    name={avatarName}
                    src={uploadedImage ?? undefined}
                    size={35}
                    className=""
                  />
                  <div className="flex flex-col">
                    <Link
                      to="/account-setting"
                      className="text-sm text-ink-0 hover:text-accent-cyan font-semibold"
                    >
                      {accountDisplayName}
                    </Link>
                  </div>
                </div>
              </div>

              <div className="border-b border-line" />

              <div className="flex flex-col gap-1 mt-1">
                {!user?.isDemo &&
                  items
                    .filter(item => ['accountSetting'].includes(item.key))
                    .map(({ key, text, icon: Icon, route }) =>
                      route ? (
                        <Link
                          key={key}
                          to={route}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-ink-1 hover:bg-surface-3 hover:text-ink-0 ml-2 mr-2 rounded-md transition-all"
                        >
                          <Icon className="h-4 w-4 text-ink-2" />
                          <span className="font-medium text-[12px]">{text}</span>
                        </Link>
                      ) : null
                    )}

                {/* Language toggle */}
                <div className="relative">
                  <div
                    className="flex justify-between items-center gap-2 px-3 py-2 text-sm text-ink-1 hover:bg-surface-3 hover:text-ink-0 ml-2 mr-2 rounded-md transition-all cursor-pointer"
                    onClick={() => setLanguageMenuOpen(prev => !prev)}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-ink-2" />
                      <span className="font-medium text-[12px]">{t('navbar.language')}</span>
                    </div>
                    <div
                      className={`w-8 h-4 text-[10px] text-center rounded-sm font-medium ${
                        i18n.language === 'en'
                          ? 'bg-accent-blue/15 text-accent-blue'
                          : 'bg-accent-green/15 text-accent-green'
                      }`}
                    >
                      {i18n.language === 'en' ? 'EN' : 'AR'}
                    </div>
                  </div>

                  {languageMenuOpen && (
                    <div className="mt-1 ml-2 mr-2 bg-surface-2 border border-line rounded-md flex flex-col overflow-hidden">
                      <div
                        className={`px-4 py-2 text-sm hover:bg-surface-3 cursor-pointer flex items-center transition-colors ${
                          i18n.language === 'en' ? 'text-accent-cyan font-medium' : 'text-ink-1'
                        }`}
                        onClick={() => handleLanguageChange('en')}
                      >
                        {i18n.language === 'en' && (
                          <span className="w-4 h-4 mr-2 text-accent-cyan">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          </span>
                        )}
                        English
                      </div>

                      <div
                        className={`px-4 py-2 text-sm cursor-pointer hover:bg-surface-3 flex items-center transition-colors ${
                          i18n.language === 'ar' ? 'text-accent-cyan font-medium' : 'text-ink-1'
                        }`}
                        onClick={() => handleLanguageChange('ar')}
                      >
                        {i18n.language === 'ar' && (
                          <span className="w-4 h-4 mr-2 text-accent-cyan">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          </span>
                        )}
                        العربية
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulation - new page */}
                {user?.isDemo && (
                  <Link
                    to="/simulation"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-ink-1 hover:bg-surface-3 hover:text-ink-0 ml-2 mr-2 rounded-md transition-all"
                  >
                    <BuildingIcon className="h-4 w-4 text-ink-2" />
                    <span className="font-medium text-[12px]">Simulation</span>
                  </Link>
                )}

                <div className="flex justify-center mt-2 mb-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-55 py-1.5 text-xs font-semibold cursor-pointer text-ink-0 border border-line rounded-md hover:bg-surface-3 transition-all"
                  >
                    {t('navbar.logout')}
                  </button>
                </div>
              </div>
            </div>
          </FilterPopper>
        </div>
      </div>
    </>
  );
}
