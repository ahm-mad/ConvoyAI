import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@contexts/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-[3px] ${className}`}
      role="radiogroup"
      aria-label="Theme"
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'dark'}
        aria-label="Dark theme"
        title="Dark"
        onClick={() => setTheme('dark')}
        className={`flex h-[26px] w-[28px] items-center justify-center rounded-md transition-colors cursor-pointer ${
          theme === 'dark' ? 'bg-surface-3 text-accent-cyan' : 'text-ink-2 hover:text-ink-0'
        }`}
      >
        <Moon size={14} />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'light'}
        aria-label="Light theme"
        title="Light"
        onClick={() => setTheme('light')}
        className={`flex h-[26px] w-[28px] items-center justify-center rounded-md transition-colors cursor-pointer ${
          theme === 'light' ? 'bg-surface-3 text-accent-cyan' : 'text-ink-2 hover:text-ink-0'
        }`}
      >
        <Sun size={14} />
      </button>
    </div>
  );
}
