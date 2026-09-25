// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from '@lib/router-compat';
import { Menu, X } from 'lucide-react';
import { PopupModal } from 'react-calendly';
import { Container } from '../ui/Container';
import { navLinks } from '../../data/navigation';
import convoyaiLogo from '../../assets/convoyainew.png';
import { cn } from '../../lib/utils';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [calendlyOpen, setCalendlyOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen || calendlyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen, calendlyOpen]);

  const goToSection = sectionId => {
    setMobileOpen(false);
    if (location.pathname === '/') {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }
    navigate('/', {
      state: {
        scrollTo: sectionId,
      },
    });
  };

  const handleRequestDemo = () => {
    setCalendlyOpen(true);
  };

  const handleMobileRequestDemo = () => {
    setMobileOpen(false);
    setCalendlyOpen(true);
  };

  const renderLink = (link, variant = 'desktop') => {
    if (link.kind === 'route') {
      const isActive = location.pathname === link.path;
      return (
        <Link
          key={link.label}
          to={link.path}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'cursor-pointer transition-colors',
            variant === 'desktop' ? 'text-sm' : 'text-base font-medium',
            isActive ? 'font-semibold text-accent-cyan' : 'text-ink-1 hover:text-ink-0'
          )}
        >
          {link.label}
        </Link>
      );
    }
    return (
      <button
        key={link.label}
        type="button"
        onClick={() => goToSection(link.sectionId)}
        className={cn(
          'cursor-pointer text-left transition-colors text-ink-1 hover:text-ink-0',
          variant === 'desktop' ? 'text-sm' : 'text-base font-medium'
        )}
      >
        {link.label}
      </button>
    );
  };

  return (
    <>
      <header
        className={cn(
          'sticky bg-[#030712]  top-0 p-1 sm:p-2 backdrop-blur-md border-b border-line-soft transition-[z-index]',
          // Drop below the Calendly overlay while the modal is open so the
          // header gets covered by the blur/backdrop instead of floating
          // above it (react-calendly's overlay isn't always higher than z-50).
          calendlyOpen ? 'z-40' : 'z-50'
        )}
      >
        <Container className="flex h-12 sm:h-16 items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link to="/" className="flex shrink-0 cursor-pointer items-center">
              <img src={convoyaiLogo} alt="ConvoyAI" className="h-16" />
            </Link>

            <nav className="hidden items-center gap-6 sm:gap-8 md:flex">
              {navLinks.map(link => renderLink(link))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="hidden cursor-pointer text-xs sm:text-sm font-medium text-ink-1 transition-colors hover:text-ink-0 sm:block"
            >
              Sign In
            </button>

            {/* Desktop Request Demo Button */}
            <div
              onClick={handleRequestDemo}
              className="hidden rounded-lg p-[1px] bg-gradient-to-br from-[#1562AE] to-[#00B8DB] shadow-[0_2px_6px_-2px_rgba(0,184,219,0.2)] hover:shadow-[0_0_15px_2px_rgba(0,184,219,0.5)] transition-all duration-300 cursor-pointer sm:block"
            >
              <button
                type="button"
                className="rounded-lg px-3 sm:px-5 py-2 sm:py-2.5 text-[10px] sm:text-xs font-semibold text-white bg-black/80 backdrop-blur-md cursor-pointer"
              >
                Request Demo
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(open => !open)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="flex cursor-pointer items-center justify-center rounded-lg border border-line p-2 text-ink-0 transition-colors hover:border-ink-1 md:hidden"
            >
              {mobileOpen ? (
                <X className="size-5" strokeWidth={1.75} />
              ) : (
                <Menu className="size-5" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </Container>

        {/* Mobile menu panel */}
        <div
          className={cn(
            'overflow-hidden transition-[max-height] duration-300 ease-in-out md:hidden',
            mobileOpen ? 'max-h-96' : 'max-h-0'
          )}
        >
          <Container className="flex flex-col gap-4 sm:gap-5 border-t border-line-soft bg-surface-0/95 py-4 sm:py-6">
            <nav className="flex flex-col gap-4 sm:gap-5">
              {navLinks.map(link => renderLink(link, 'mobile'))}
            </nav>

            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                navigate('/login');
              }}
              className="cursor-pointer text-left text-sm sm:text-base font-medium text-ink-1 transition-colors hover:text-ink-0"
            >
              Sign In
            </button>

            {/* Mobile Request Demo Button */}
            <div
              onClick={handleMobileRequestDemo}
              className="rounded-lg p-[1px] bg-gradient-to-br from-[#1562AE] to-[#00B8DB] shadow-[0_2px_6px_-2px_rgba(0,184,219,0.2)] transition-all duration-300 cursor-pointer"
            >
              <button
                type="button"
                className="w-full rounded-lg px-4 sm:px-5 py-2 sm:py-2.5 text-xs font-semibold text-white bg-black/80 backdrop-blur-md cursor-pointer"
              >
                Request Demo
              </button>
            </div>
          </Container>
        </div>
      </header>

      <PopupModal
        url="https://calendly.com/usama-waqas-chirptech/30min"
        pageSettings={{
          backgroundColor: 'ffffff',
          hideEventTypeDetails: false,
          hideLandingPageDetails: false,
          primaryColor: '00B8DB',
          textColor: '1a1a1a',
        }}
        onModalClose={() => setCalendlyOpen(false)}
        open={calendlyOpen}
        rootElement={document.getElementById('root')}
      />
    </>
  );
}
