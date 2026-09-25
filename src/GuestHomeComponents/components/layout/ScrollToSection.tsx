// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect } from 'react';
import { useLocation, useNavigate } from '@lib/router-compat';
/**
 * Scrolls to a section id passed via navigation state (e.g.
 * navigate('/', { state: { scrollTo: 'showcase' } })) instead of a URL
 * hash — keeps the address bar clean (no "#showcase"). Falls back to
 * scrolling to top on a plain route change with no scroll target.
 */
export function ScrollToSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state;
  useEffect(() => {
    const targetId = state?.scrollTo;
    if (!targetId) {
      window.scrollTo({
        top: 0,
      });
      return;
    }
    const el = document.getElementById(targetId);
    el?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    // Clear the scroll-target state so refreshing or navigating back
    // doesn't keep re-triggering the scroll.
    navigate(location.pathname, {
      replace: true,
      state: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, state?.scrollTo]);
  return null;
}
