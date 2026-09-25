import React from 'react';
import { Construction } from 'lucide-react';

export default function ComingSoon({
  title,
  description = "This section is coming soon. You'll be able to manage it here once it's ready.",
}) {
  return (
    <div className="min-h-full flex items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-md py-20">
        <div className="w-14 h-14 rounded-full bg-surface-2 ring-1 ring-line-soft flex items-center justify-center mb-4">
          <Construction size={24} strokeWidth={1.5} className="text-ink-2" />
        </div>
        <h1 className="text-base font-semibold text-ink-0 font-display">{title}</h1>
        <p className="text-sm text-ink-2 mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
