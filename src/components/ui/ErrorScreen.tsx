import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';
import BrandMark from '@components/shell/BrandMark';

/** Full-page error state (404 / 500) on the design tokens: giant serif code, message, recovery actions. */
export default function ErrorScreen({
  code,
  title,
  children,
}: {
  code: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <BrandMark className="mb-12" />
      <div
        className="font-serif text-[clamp(6rem,22vw,12rem)] italic leading-none"
        style={{
          background: 'var(--gradient-brand)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
        aria-hidden
      >
        {code}
      </div>
      <h1 className="page-title mt-2">{title}</h1>
      <p className="page-subtitle mx-auto mt-3 max-w-[460px] !text-body">{children}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="btn-brand inline-flex items-center gap-2 rounded-full px-6 py-3 text-control font-semibold"
        >
          <Home size={15} /> Back to home
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="control inline-flex items-center gap-2 !px-6 !py-3 font-semibold"
        >
          <ArrowLeft size={15} /> Go back
        </button>
      </div>
    </div>
  );
}
