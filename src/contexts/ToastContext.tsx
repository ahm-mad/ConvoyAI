'use client';

import { createContext, useContext, type ReactNode } from 'react';
import toast, { Toaster } from 'react-hot-toast';

const ToastContext = createContext<typeof toast>(toast);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster
        position="top-center"
        reverseOrder={true}
        toastOptions={{
          style: {
            wordBreak: 'break-word', // breaks long words
            whiteSpace: 'normal', // allows wrapping
            maxWidth: '400px', // prevent toast being too wide
            background: 'var(--glass-bg-strong)',
            backdropFilter: 'var(--glass-blur)',
            borderRadius: 'var(--radius-card)',
            color: 'var(--color-ink-0)',
            border: '1px solid var(--color-line)',
            boxShadow: 'var(--shadow-glass)',
          },
          success: {
            iconTheme: {
              primary: 'var(--color-accent-green)',
              secondary: 'var(--color-surface-2)',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--color-danger)',
              secondary: 'var(--color-surface-2)',
            },
          },
        }}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
