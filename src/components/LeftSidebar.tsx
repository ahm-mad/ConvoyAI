import { useEffect, useState, type ReactNode, type MouseEvent } from 'react';
import BurgerIcon from '@assets/icons/MUIicons/BurgerIcon';
import MapIcon from '@assets/icons/MUIicons/MapIcon';
import QuestionIcon from '@assets/icons/MUIicons/QuestionIcon';
import Chevron from '@assets/icons/MUIicons/Chevron';
import DashboardIcon from '@assets/icons/MUIicons/DashboardIcon';
import PinIcon from '@assets/icons/MUIicons/PinIcon';
import SubNavbar from './SubNavbar';
import { Navigate } from '@lib/router-compat';
import { NavLink } from '@lib/router-compat';
import { useParams } from '@lib/router-compat';
import { useTranslation } from 'react-i18next';
import convoyai from '../GuestHomeComponents/assets/convoyainew.png';
import Logo from '../GuestHomeComponents/assets/convoyai-logo.png';
import AccordionSection from './AccordionSection';
import BuildingIcon from '@assets/icons/MUIicons/BuildingIcon';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { Link } from '@lib/router-compat';
import 'driver.js/dist/driver.css';
import { MdOutlineAdminPanelSettings, MdOutlineDashboardCustomize } from 'react-icons/md';
import { FaUsers, FaBox, FaBuilding, FaChartLine } from 'react-icons/fa';
import { MdOutlineSlowMotionVideo } from 'react-icons/md';
import { useUser } from '@contexts/UserContext';

import {
  ChevronFirst,
  LayoutGrid,
  House,
  ChevronDown,
  User,
  Settings,
  Map,
  MoreHorizontal,
  X,
  Menu,
  AlertTriangle,
  Activity,
  Truck,
  Layers,
  Package,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface NavItem {
  id?: string;
  icon?: ReactNode;
  text?: ReactNode;
  route?: string | null;
  active?: boolean;
  badge?: ReactNode;
  hasDropdown?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  isIndented?: boolean;
  isAddButton?: boolean;
  key?: any;
}

interface LeftSidebarProps {
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
  dashboardData?: any[];
  refetch?: () => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function LeftSidebar({
  isExpanded,
  setIsExpanded,
  dashboardData = [],
}: LeftSidebarProps) {
  const { t } = useTranslation();
  const [isDashboardOpen, setIsDashboardOpen] = useState(true);
  const [isCoreOpen, setIsCoreOpen] = useState(true);
  const [isConnectOpen, setIsConnectOpen] = useState(true);
  const [isTwinOpen, setIsTwinOpen] = useState(true);
  const [isGisOpen, setIsGisOpen] = useState(true);
  const [isStudioOpen, setIsStudioOpen] = useState(true);
  const [isOperationsOpen, setIsOperationsOpen] = useState(true);
  const [isSolutionsOpen, setIsSolutionsOpen] = useState(true);
  const [isPinned, setIsPinned] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isChevronHovered, setIsChevronHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(true);
  const { user, isSuperAdmin, isAdmin, hasPermission } = useUser();

  const DashboardItems: NavItem[] = [
    ...(isSuperAdmin || hasPermission('all-dashboard')
      ? [
          {
            text: t('home'),
            route: '/home',
            icon: <House size={16} className="" />,
            active: false,
          },
        ]
      : []),
  ];

  // Restructured to mirror the ConvoyAI OS prototype's product-area navigation
  // (Core / Connect / Twin / GIS / Studio / Operations). Only areas with a
  // real, working page behind them are included — the prototype also showed
  // AI, Edge, and a dedicated Alarms & Commands area, but nothing real exists
  // for those yet, so they're deliberately omitted rather than added as
  // empty or broken sections. Each item keeps its EXACT original permission
  // gate (isSuperAdmin vs isAdmin) even though items with different gates
  // now sit in the same visual section — the previous "Super Admin" and
  // "Admin" sections each held a mix conceptually, this just makes the
  // grouping domain-based instead.

  const coreItems: NavItem[] = [
    ...(isSuperAdmin
      ? [
          {
            icon: <FaBuilding size={16} />,
            text: 'Companies',
            route: '/companies/list',
            hasDropdown: true,
          },
        ]
      : []),
    ...(user?.isDemo
      ? [
          {
            icon: <MdOutlineSlowMotionVideo size={16} />,
            text: 'Tutorials',
            route: '/tutorials',
            hasDropdown: true,
          },
        ]
      : []),
    // ...(isAdmin || hasPermission('all-module-management')
    //   ? [
    //       {
    //         icon: <Layers size={16} />,
    //         text: 'Module Management',
    //         route: '/module-management',
    //         hasDropdown: true,
    //       },
    //     ]
    //   : []),
    // ...(isAdmin || hasPermission('all-plan-management')
    //   ? [
    //       {
    //         icon: <Package size={16} />,
    //         text: 'Plan Management',
    //         route: '/plan-management',
    //         hasDropdown: true,
    //       },
    //     ]
    //   : []),
  ];

  const connectItems: NavItem[] = [
    ...(hasPermission('all-product')
      ? [
          {
            icon: <User size={16} />,
            text: t('manageProducts'),
            route: '/manage-product',
            hasDropdown: true,
          },
        ]
      : []),
    ...(isSuperAdmin
      ? [
          {
            icon: <FaBox size={16} />,
            text: 'Products',
            route: '/all-products',
            hasDropdown: true,
          },
        ]
      : []),
    ...(hasPermission('all-connect')
      ? [
          {
            icon: <Activity size={16} />,
            text: 'Connector Health',
            route: '/connector-health',
            hasDropdown: true,
          },
        ]
      : []),
  ];

  const twinItems: NavItem[] = [
    ...(hasPermission('all-building')
      ? [
          {
            icon: <BuildingIcon style={{ fontSize: '15px' }} />,
            text: t('manageAssets'),
            route: '/assets',
            hasDropdown: true,
          },
        ]
      : []),
  ];

  const gisItems: NavItem[] = [
    ...(isAdmin && !user?.isDemo
      ? [
          {
            icon: <Map size={16} />,
            text: t('map'),
            route: '/map',
            hasDropdown: true,
          },
        ]
      : []),
  ];

  // Rule Builder lives here rather than a standalone "Workflow" section —
  // the prototype groups it under Studio alongside Dashboards/Workflow
  // Designer/Solution Designer (§12.1). A Rule is functionally a simple
  // single-step workflow; no separate Workflow Designer exists yet (see the
  // backend HANDOFF_REPORT — only Rules are real today).
  const studioItems: NavItem[] = [
    ...(!user?.isDemo && hasPermission('all-rule-builder')
      ? [
          {
            icon: <Settings size={16} />,
            text: t('roleBuilder'),
            route: '/rule-builder',
            hasDropdown: true,
          },
        ]
      : []),
  ];

  // Solutions — vertical-specific, pre-packaged experiences built on top
  // of the general platform (Fleet Management is the first). Distinct
  // from Connect/Twin/etc., which are generic platform capabilities —
  // this section is specifically "ready-made for this industry."
  const solutionsItems: NavItem[] = [
    ...(hasPermission('all-fleet')
      ? [
          {
            icon: <Truck size={16} />,
            text: 'Fleet Management',
            route: '/fleet-management',
            hasDropdown: true,
          },
        ]
      : []),
  ];

  const operationsItems: NavItem[] = [
    ...(isSuperAdmin
      ? [
          {
            icon: <FaChartLine size={16} />,
            text: 'Analytics',
            route: '/analytics',
            hasDropdown: true,
          },
        ]
      : []),
    ...(hasPermission('all-alarms')
      ? [
          {
            icon: <AlertTriangle size={16} />,
            text: 'Alarms',
            route: '/alarms',
            hasDropdown: true,
          },
        ]
      : []),
    ...(hasPermission('all-role-permission') && !user?.isDemo
      ? [
          {
            icon: <Settings size={16} />,
            text: t('rulesPermissions'),
            route: '/roles-permission',
            hasDropdown: true,
          },
        ]
      : []),
  ];

  useEffect(() => {
    const shouldExpand = isPinned || isHovered || isChevronHovered;

    if (shouldExpand !== isExpanded) {
      setAnimationComplete(false);
      setIsExpanded(shouldExpand);

      const timer = setTimeout(() => {
        setAnimationComplete(true);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isPinned, isHovered, isChevronHovered, setIsExpanded, isExpanded]);

  const handleChevronClick = () => {
    setIsPinned(!isPinned);
  };

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const MenuItem = ({
    id,
    icon,
    text,
    route,
    active,
    badge,
    hasDropdown,
    onClick,
    isIndented = false,
    isAddButton = false,
  }: NavItem) => {
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (onClick) {
        onClick(e);
      }
      if (window.innerWidth < 640) {
        // Mobile screen: close sidebar
        setIsMobileMenuOpen(false);
      }
    };

    return (
      <NavLink
        id={id}
        to={route || '#'}
        onClick={handleClick}
        className={({ isActive }: { isActive: boolean }) =>
          `relative ${isExpanded ? (isIndented ? 'pl-[22px] pr-3' : 'px-2.5') : 'px-2.5 justify-center'} py-[5px] w-full flex items-center ${
            isExpanded ? 'justify-between' : 'justify-center'
          } rounded hover:bg-surface-2 group transition-all duration-150 ease-in-out ${
            !isAddButton && (active || isActive)
              ? 'bg-surface-3 text-ink-0'
              : isAddButton
                ? 'text-accent-cyan'
                : 'text-ink-1'
          }`
        }
      >
        {({ isActive }: { isActive: boolean }) =>
          !isAddButton && (active || isActive) ? (
            <span className="absolute left-0 top-[3px] bottom-[3px] w-[2px] rounded-none brand-gradient-bg" />
          ) : null
        }
        <div className={`flex items-center ${!isExpanded ? 'justify-center' : ''}`}>
          {icon && (
            <span
              className={`transition-all duration-200 group-hover:text-accent-cyan ${
                !isAddButton && (active || (route && window.location.pathname === route))
                  ? 'text-accent-cyan'
                  : 'text-ink-2'
              }`}
            >
              {icon}
            </span>
          )}
          <span
            className={`transition-all duration-300 ease-in-out ${
              !isExpanded ? 'opacity-0 w-0 ml-0 max-w-0' : 'opacity-100 w-auto ml-3 max-w-none'
            } text-xs font-medium font-sans tracking-wide group-hover:text-ink-0 whitespace-nowrap overflow-hidden`}
          >
            {text}
          </span>
        </div>

        <div
          className={`flex items-center transition-all duration-300 ${!isExpanded ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}
        >
          {isExpanded && badge && (
            <span className="px-2 py-0.5 text-[10.5px] bg-surface-2 text-ink-2 rounded-full transition-all duration-300">
              {badge}
            </span>
          )}
          {isExpanded && hasDropdown && (
            <ChevronDown
              size={12}
              className="text-ink-2 ml-2 transition-colors duration-300 group-hover:text-accent-cyan"
            />
          )}
        </div>
      </NavLink>
    );
  };

  const SectionLabel = ({ title }: { title: ReactNode }) => (
    <div className="px-3 py-2 mb-1">
      <span
        className={`text-[10px] font-semibold text-ink-2 uppercase tracking-wider transition-all duration-300 ease-in-out ${
          !isExpanded ? 'opacity-0 w-0 max-w-0' : 'opacity-100 w-auto max-w-none'
        } whitespace-nowrap overflow-hidden`}
      >
        {title}
      </span>
    </div>
  );

  return (
    <>
      <div className="sm:hidden">
        {!isMobileMenuOpen && (
          <button
            onClick={handleMobileMenuToggle}
            className="absolute top-4 left-4 z-50 p-2 glass-strong  hover:bg-surface-2 transition-colors duration-200"
          >
            <Menu size={20} className="text-ink-1" />
          </button>
        )}
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 sm:hidden"
          onClick={handleMobileMenuToggle}
        />
      )}

      <div className="relative flex">
        {/* Sidebar */}
        <div
          className={`fixed top-0 left-0 z-1000 h-full sm:static transition-all duration-300 ease-in-out ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          } sm:translate-x-0 ${isExpanded ? 'w-64 max-sm:w-[100vw]' : 'w-16 sm:w-16'} 
          bg-surface-1 text-ink-1 text-sm flex flex-col overflow-hidden border-r border-line`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Logo/Brand */}
          <div className="h-11 flex items-center px-4 border-b border-line relative">
            <div className="flex items-center justify-center transition-transform duration-200 hover:scale-105">
              <div className="transition-all duration-300 ease-in-out">
                {isExpanded ? (
                  <div className="transition-all duration-300 ease-in-out">
                    <Link to={'/home'}>
                      <img
                        src={convoyai}
                        alt="ConvoyAI Image"
                        className="h-6 w-auto cursor-pointer object-contain transition-opacity duration-300"
                      />
                    </Link>
                  </div>
                ) : (
                  <img
                    src={Logo}
                    alt="logo"
                    className="w-8 h-6 transition-all duration-300 ease-in-out"
                  />
                )}
              </div>
            </div>

            {/* Mobile Close Button - Inside sidebar header */}
            {isMobileMenuOpen && (
              <button
                onClick={handleMobileMenuToggle}
                className="absolute right-4 p-1 hover:bg-surface-2 rounded transition-colors duration-200 sm:hidden"
              >
                <X size={20} className="text-ink-1" />
              </button>
            )}
          </div>

          <div className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
            {/* Dashboard Accordion */}
            <AccordionSection
              title={t('dashboardSection')}
              isOpen={isDashboardOpen}
              icon={<LayoutGrid size={16} />}
              isExpanded={isExpanded}
              onToggle={() => setIsDashboardOpen(!isDashboardOpen)}
            >
              <div className="space-y-0.5 font-semibold max-h-64 overflow-y-auto overflow-x-hidden">
                {DashboardItems.map((item, index) => (
                  <>
                    <MenuItem
                      key={index}
                      icon={item.icon}
                      text={item.text}
                      route={item.route}
                      active={item.active}
                      isIndented={true}
                    />
                  </>
                ))}

                {dashboardData?.map(item => (
                  <MenuItem
                    key={item.id}
                    icon={<MdOutlineDashboardCustomize size={18} />}
                    text={!item.name || item.name === 'Untitled' ? t('dashboard') : item.name}
                    route={`/dashboard/${item.id}`}
                    active={false}
                    isIndented={true}
                  />
                ))}
              </div>
            </AccordionSection>

            {/* Core, Connect, Twin, GIS, Studio, Operations — mirrors the
                ConvoyAI OS prototype's product-area navigation. Each section
                only renders if it has at least one item the current user
                can actually see, so a user with narrower permissions never
                sees an empty section header. */}
            <div className="mt-4 space-y-0.5">
              {coreItems.length > 0 && (
                <AccordionSection
                  title="Core"
                  isOpen={isCoreOpen}
                  icon={<MdOutlineAdminPanelSettings size={16} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsCoreOpen(!isCoreOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {coreItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}

              {connectItems.length > 0 && (
                <AccordionSection
                  title="Connect"
                  isOpen={isConnectOpen}
                  icon={<ViewInArIcon style={{ fontSize: '16px' }} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsConnectOpen(!isConnectOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {connectItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}

              {twinItems.length > 0 && (
                <AccordionSection
                  title="Twin"
                  isOpen={isTwinOpen}
                  icon={<BuildingIcon style={{ fontSize: '15px' }} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsTwinOpen(!isTwinOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {twinItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}

              {gisItems.length > 0 && (
                <AccordionSection
                  title="GIS"
                  isOpen={isGisOpen}
                  icon={<PinIcon style={{ fontSize: '15px' }} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsGisOpen(!isGisOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {gisItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}

              {studioItems.length > 0 && (
                <AccordionSection
                  title="Studio"
                  isOpen={isStudioOpen}
                  icon={<MdOutlineSlowMotionVideo size={16} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsStudioOpen(!isStudioOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {studioItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}

              {solutionsItems.length > 0 && (
                <AccordionSection
                  title="Solutions"
                  isOpen={isSolutionsOpen}
                  icon={<Truck size={16} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsSolutionsOpen(!isSolutionsOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {solutionsItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}

              {operationsItems.length > 0 && (
                <AccordionSection
                  title="Operations"
                  isOpen={isOperationsOpen}
                  icon={<MdOutlineAdminPanelSettings size={16} />}
                  isExpanded={isExpanded}
                  onToggle={() => setIsOperationsOpen(!isOperationsOpen)}
                >
                  <div className="space-y-0.5 font-semibold">
                    {operationsItems.map((item, index) => (
                      <MenuItem
                        key={index}
                        icon={item.icon}
                        text={item.text}
                        route={item.route}
                        active={item.active}
                        isIndented={true}
                      />
                    ))}
                  </div>
                </AccordionSection>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Pin/Chevron Button - Hidden on mobile */}
        <div
          className={`absolute top-2 bg-surface-1 shadow-md border border-line rounded-lg p-[6px] z-1000 
          transition-all duration-300 ease-in-out cursor-pointer hover:scale-110 group max-sm:hidden ${
            isExpanded ? 'left-64 transform -translate-x-1/2' : 'left-8 transform translate-x-1/2'
          }`}
          onClick={handleChevronClick}
          onMouseEnter={() => setIsChevronHovered(true)}
          onMouseLeave={() => setIsChevronHovered(false)}
        >
          <ChevronFirst
            size={16}
            className={`transition-all duration-300 ease-in-out ${
              isPinned ? 'text-accent-cyan' : 'text-ink-2 group-hover:text-ink-0'
            } ${isExpanded ? 'rotate-0' : 'rotate-180'}`}
          />
        </div>
      </div>
    </>
  );
}
