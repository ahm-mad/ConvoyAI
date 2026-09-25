'use client';

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

import queryClient from '../reactQueryConfig';
import i18n from '../src/i18n';

import { ThemeProvider } from '@contexts/ThemeContext';
import { UserProvider } from '@contexts/UserContext';
import { SocketProvider } from '@contexts/SocketContext';
import { ToastProvider } from '@contexts/ToastContext';
import { ModalProvider } from '@contexts/ModalContext';
import Modal from '@components/Modal';

import Bootstrap from './bootstrap';
import RouteProgress from './route-progress';

/**
 * Provider stack — ported 1:1 from src/main.jsx, minus <BrowserRouter> (App Router
 * replaces react-router). Order is load-bearing (SocketProvider needs UserProvider
 * above it, etc.). <Modal/> was mounted in src/App.jsx; it lives here now, as do
 * <RouteProgress/> (was <RouteLoader/>) and <Bootstrap/> (was main.jsx's async
 * bootstrapApplication + App.jsx's Pusher-init effect).
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <UserProvider>
            <SocketProvider>
              <ToastProvider>
                <ModalProvider>
                  <RouteProgress />
                  <Bootstrap>{children}</Bootstrap>
                  <Modal />
                </ModalProvider>
              </ToastProvider>
            </SocketProvider>
          </UserProvider>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
