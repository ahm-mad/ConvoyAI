import React from 'react';

const TableSkeleton = (_props: { count?: number }) => {
  const skeletonRows = Array(7).fill(null);

  return (
    <div className="">
      <div className="w-full bg-surface-1 rounded-xl border border-line">
        {/* Header */}
        <div className="p-6 border-b border-line flex justify-between items-center">
          <div className="w-48 h-10 bg-surface-2 rounded-md animate-pulse"></div>
          <div className="w-32 h-10 bg-surface-2 rounded-md animate-pulse"></div>
        </div>

        {/* Table */}
        <div>
          <table className="w-full">
            {/* Table Header */}
            <thead className="bg-surface-2 border-b border-line">
              <tr>
                <th className="w-12 px-6 py-4 text-left">
                  <div className="w-4 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-16 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-16 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-20 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-24 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-24 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-8 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
                <th className="px-6 py-4 text-left">
                  <div className="w-8 h-4 bg-surface-3 rounded animate-pulse"></div>
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-line">
              {skeletonRows.map((_, index) => (
                <tr key={index} className="hover:bg-surface-2">
                  {/* Checkbox */}
                  <td className="px-6 py-4">
                    <div className="w-4 h-4 bg-surface-2 rounded animate-pulse"></div>
                  </td>

                  {/* Rule Name */}
                  <td className="px-6 py-4">
                    <div
                      className={`h-4 bg-surface-2 rounded animate-pulse ${
                        index === 0
                          ? 'w-12'
                          : index === 1
                            ? 'w-20'
                            : index === 2
                              ? 'w-20'
                              : index === 3
                                ? 'w-8'
                                : index === 4
                                  ? 'w-32'
                                  : index === 5
                                    ? 'w-20'
                                    : 'w-16'
                      }`}
                    ></div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <div className="w-16 h-6 bg-surface-2 rounded-full animate-pulse"></div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    {index === 6 ? (
                      <div className="w-32 h-6 bg-surface-2 rounded animate-pulse"></div>
                    ) : (
                      <div className="w-12 h-4 bg-surface-2 rounded animate-pulse"></div>
                    )}
                  </td>

                  {/* Created At */}
                  <td className="px-6 py-4">
                    <div className="w-36 h-4 bg-surface-2 rounded animate-pulse"></div>
                  </td>

                  {/* Last Trigger */}
                  <td className="px-6 py-4">
                    <div className="w-12 h-4 bg-surface-2 rounded animate-pulse"></div>
                  </td>

                  {/* Edit Icon */}
                  <td className="px-6 py-4">
                    <div className="w-5 h-5 bg-surface-2 rounded animate-pulse"></div>
                  </td>

                  {/* Delete Icon */}
                  <td className="px-6 py-4">
                    <div className="w-5 h-5 bg-surface-2 rounded animate-pulse"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-24 h-4 bg-surface-2 rounded animate-pulse"></div>
            <div className="w-12 h-8 bg-surface-2 rounded animate-pulse"></div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="w-20 h-4 bg-surface-2 rounded animate-pulse"></div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-surface-2 rounded animate-pulse"></div>
              <div className="w-6 h-4 bg-surface-2 rounded animate-pulse"></div>
              <div className="w-8 h-8 bg-surface-2 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableSkeleton;
