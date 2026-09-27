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
            style: {
              boxShadow:
                'var(--shadow-glass), 0 10px 26px -12px color-mix(in srgb, var(--color-success) 60%, transparent)',
              borderLeft: '3px solid var(--color-success)',
            },
            iconTheme: {
              primary: 'var(--color-success)',
              secondary: 'var(--color-surface-2)',
            },
          },
          error: {
            style: {
              boxShadow:
                'var(--shadow-glass), 0 10px 26px -12px color-mix(in srgb, var(--color-danger) 60%, transparent)',
              borderLeft: '3px solid var(--color-danger)',
            },
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
