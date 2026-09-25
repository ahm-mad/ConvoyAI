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
            background: 'var(--color-surface-2)',
            color: 'var(--color-ink-0)',
            border: '1px solid var(--color-line)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
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
