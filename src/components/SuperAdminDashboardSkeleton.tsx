// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';

// Skeleton Component
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-300 rounded ${className}`}></div>
);

// Stat Card Skeleton
const StatCardSkeleton = () => (
  <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
    <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg mb-3 sm:mb-4" />
    <Skeleton className="h-8 sm:h-10 w-20 mb-2" />
    <Skeleton className="h-4 w-16" />
  </div>
);

// Chart Skeleton
const ChartSkeleton = () => (
  <div className="bg-white border h-96 border-gray-200 rounded-xl p-4">
    <div className="flex  flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
      <Skeleton className="h-6  w-48" />
      <Skeleton className="h-8 w-32 rounded-md" />
    </div>
    <div className="border animate-pulse border-gray-200"></div>
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-48">
        {[...Array(12)].map((_, j) => (
          <Skeleton key={j} className="flex-1" style={{ height: `${Math.random() * 60 + 40}%` }} />
        ))}
      </div>
    </div>
  </div>
);

// Table Row Skeleton
const TableRowSkeleton = () => (
  <tr className="border-b border-gray-100">
    <td className="px-4 py-4">
      <Skeleton className="h-4 w-4 rounded" />
    </td>
    <td className="px-4 py-4">
      <Skeleton className="h-5 w-32 mb-2" />
      <Skeleton className="h-3 w-24" />
    </td>
    <td className="px-4 py-4">
      <Skeleton className="h-5 w-8" />
    </td>
    <td className="px-4 py-4">
      <Skeleton className="h-5 w-8" />
    </td>
    <td className="px-4 py-4">
      <div className="flex -space-x-2">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="w-6 h-6 rounded-full border-2 border-white" />
        ))}
      </div>
    </td>
  </tr>
);

// Table Skeleton
const TableSkeleton = () => (
  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
    <div className="p-4 border-b border-gray-200">
      <div className="flex justify-between items-center gap-4">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-4 rounded" />
            </th>
            <th className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-20" />
            </th>
            <th className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-16" />
            </th>
            <th className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-16" />
            </th>
            <th className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-20" />
            </th>
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </tbody>
      </table>
    </div>
    <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center">
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  </div>
);

// Notification Card Skeleton
const NotificationCardSkeleton = () => (
  <div className="bg-white border  border-gray-200 rounded-lg p-4">
    <div className="flex items-start gap-3">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-2/3 mb-3" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  </div>
);

// Main Dashboard Skeleton
export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header Skeleton */}
      <div className="border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex justify-between items-start">
          <div>
            <Skeleton className="h-7 sm:h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8">
        {/* Top Section - Stat Cards aur Chart Side by Side */}
        <div className="grid xl:grid-cols-5 gap-6 sm:gap-8">
          {/* Stat Cards - Left Side */}
          <div className="xl:col-span-2 grid gap-4 sm:gap-6 grid-cols-2">
            {[...Array(4)].map((_, idx) => (
              <StatCardSkeleton key={idx} />
            ))}
          </div>

          {/* Chart - Right Side (Same Level) */}
          <div className="xl:col-span-3">
            <ChartSkeleton />
          </div>
        </div>

        {/* Bottom Section - Notifications aur Table Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Notifications - Left Side */}
          <div className="max-lg:col-span-3 border border-gray-300 animate-pulse p-4 rounded-xl space-y-4">
            <Skeleton className="h-6 w-48 mb-4" />
            {[...Array(3)].map((_, i) => (
              <NotificationCardSkeleton key={i} />
            ))}
          </div>

          {/* Table - Right Side (Same Level) */}
          <div className="max-lg:col-span-3 col-span-2">
            <TableSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
