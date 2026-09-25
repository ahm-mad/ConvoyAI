import React from 'react';

export default function RuleBuilderSkeleton() {
  return (
    <div className="min-h-screen bg-surface-1 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb Skeleton */}
        <div className="flex items-center gap-2 text-sm mb-8">
          <div className="h-4 w-12 bg-surface-3 rounded animate-pulse"></div>
          <span className="text-ink-2">›</span>
          <div className="h-4 w-24 bg-surface-3 rounded animate-pulse"></div>
          <span className="text-ink-2">›</span>
          <div className="h-4 w-20 bg-surface-3 rounded animate-pulse"></div>
        </div>

        {/* Title */}
        <div className="h-8 w-32 bg-surface-3 rounded animate-pulse mb-8"></div>

        {/* Name Section */}
        <div className="mb-6">
          <div className="h-4 w-12 bg-surface-3 rounded animate-pulse mb-2"></div>
          <div className="h-10 w-full bg-surface-2 rounded border border-line animate-pulse"></div>
        </div>

        {/* Toggle */}
        <div className="mb-8">
          <div className="h-6 w-11 bg-surface-3 rounded-full animate-pulse"></div>
        </div>

        <div className="h-px bg-surface-3 my-6"></div>

        {/* Conditions Section */}
        <div className="mb-8">
          <div className="h-6 w-24 bg-surface-3 rounded animate-pulse mb-6"></div>

          {/* First Condition */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-8 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-9 w-32 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-9 w-6 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-9 w-32 bg-surface-2 rounded animate-pulse"></div>
            <div className="h-9 w-32 bg-surface-2 rounded animate-pulse"></div>
            <div className="h-6 w-6 bg-surface-3 rounded animate-pulse"></div>
          </div>

          {/* Second Condition */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-12 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-9 w-32 bg-surface-2 rounded animate-pulse"></div>
            <div className="h-9 w-6 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-9 w-32 bg-surface-2 rounded animate-pulse"></div>
            <div className="h-9 w-32 bg-surface-2 rounded animate-pulse"></div>
            <div className="h-6 w-6 bg-surface-3 rounded animate-pulse"></div>
          </div>

          {/* Add Button */}
          <div className="h-8 w-8 bg-surface-3 rounded animate-pulse"></div>
        </div>

        <div className="h-px bg-surface-3 my-6"></div>

        {/* Then Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-6 w-12 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-8 w-8 bg-surface-3 rounded animate-pulse"></div>
          </div>

          <div className="ml-8 space-y-4">
            {/* Send Email */}
            <div className="flex items-center justify-between">
              <div className="h-5 w-24 bg-surface-3 rounded animate-pulse"></div>
              <div className="h-6 w-11 bg-surface-3 rounded-full animate-pulse"></div>
            </div>

            {/* Send SMS */}
            <div className="flex items-center justify-between">
              <div className="h-5 w-20 bg-surface-3 rounded animate-pulse"></div>
              <div className="h-6 w-11 bg-surface-3 rounded-full animate-pulse"></div>
            </div>

            {/* System Notification */}
            <div className="flex items-center justify-between">
              <div className="h-5 w-36 bg-surface-3 rounded animate-pulse"></div>
              <div className="h-6 w-11 bg-surface-3 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>

        <div className="h-px bg-surface-3 my-6"></div>

        {/* Perform actions section */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="h-5 w-64 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-10 w-20 bg-surface-2 rounded animate-pulse"></div>
            <div className="h-5 w-16 bg-surface-3 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Allow retriggering */}
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-surface-3 rounded animate-pulse"></div>
            <div className="h-5 w-32 bg-surface-3 rounded animate-pulse"></div>
          </div>
        </div>

        <div className="h-px bg-surface-3 my-6"></div>

        {/* Buttons */}
        <div className="flex gap-3">
          <div className="h-10 w-28 bg-surface-3 rounded animate-pulse"></div>
          <div className="h-10 w-20 bg-surface-3 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
