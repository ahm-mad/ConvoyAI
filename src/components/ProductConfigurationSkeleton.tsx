import React from 'react';

function ProductConfigurationSkeleton() {
  return (
    <div className="p-8 animate-pulse">
      <div className="grid grid-cols-12 max-xl:grid-cols-8 gap-4">
        {/* Product Name Section */}
        <div className="col-span-12 md:col-span-3">
          <div className="h-4 bg-surface-3 rounded w-24 mb-2"></div>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="w-[80%] max-xl:w-[100%]">
            <div className="h-10 bg-surface-2 rounded-md"></div>
          </div>
        </div>

        {/* Webhook Link Section */}
        <div className="col-span-12 md:col-span-3">
          <div className="h-4 bg-surface-3 rounded w-28 mb-2"></div>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="w-full xl:w-[80%] max-xl:w-[100%] bg-surface-2 rounded-sm  p-2 flex justify-between items-center">
            <div className="h-4 bg-surface-3 rounded flex-grow mr-4"></div>
            <div className="h-8 w-16 bg-surface-3 rounded"></div>
          </div>
        </div>

        {/* Webhook Token Section */}
        <div className="col-span-12 md:col-span-3">
          <div className="h-4 bg-surface-3 rounded w-32 mb-2"></div>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="w-full xl:w-[80%] max-xl:w-[100%] bg-surface-2 rounded-sm  p-2 flex justify-between items-center">
            <div className="h-4 bg-surface-3 rounded flex-grow mr-4"></div>
            <div className="h-8 w-16 bg-surface-3 rounded"></div>
          </div>
        </div>

        {/* Attributes Section */}
        <div className="col-span-12 xl:col-span-3 max-xl:col-span-10">
          <div className="h-4 bg-surface-3 rounded w-36 mb-2"></div>
          <div className="space-y-2">
            <div className="h-3 bg-surface-2 rounded w-full"></div>
            <div className="h-3 bg-surface-2 rounded w-3/4"></div>
          </div>
        </div>

        <div className="col-span-12 overflow-x-hidden md:col-span-9">
          <div className="flex flex-col max-xl:w-[100%] xl:w-[80%] gap-3">
            {/* Skeleton Attribute Items */}
            {[1, 2, 3, 4, 5].map(item => (
              <div key={item} className="relative">
                <div className="flex items-center gap-2 p-2 rounded-lg shadow-sm   bg-surface-1">
                  {/* Icon skeleton */}
                  <div className="w-6 h-6 bg-surface-3 rounded-full"></div>

                  {/* Text content skeleton */}
                  <div className="flex-grow">
                    <div className="h-4 bg-surface-3 rounded w-3/4"></div>
                  </div>

                  {/* Settings button skeleton */}
                  <div className="w-8 h-8 bg-surface-2 rounded"></div>
                </div>

                {/* AI Suggested badge skeleton (random placement) */}
                {item === 2 || item === 4 ? (
                  <div className="absolute top-2 -right-28 flex items-center gap-1">
                    <div className="h-3 bg-accent-cyan/20 rounded w-20"></div>
                    <div className="w-4 h-4 bg-warning/25 rounded"></div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Raw Packet Section */}
        <div className="col-span-12 md:col-span-3">
          <div className="h-4 bg-surface-3 rounded w-24 mb-2"></div>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="max-xl:w-[100%] xl:w-[50%]">
            <div className="h-80 bg-surface-2 rounded-md "></div>
          </div>
        </div>

        {/* Remove Product Section */}
        <div className="col-span-12 md:col-span-3">
          <div className="h-4 bg-surface-3 rounded w-32 mb-2"></div>
        </div>
        <div className="col-span-12 md:col-span-9">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="h-10 w-32 bg-danger/20 rounded"></div>
            <div className="h-4 bg-surface-2 rounded w-48"></div>
          </div>
        </div>
      </div>

      {/* Save Button Skeleton */}
      <div className="mt-4">
        <div className="h-10 w-32 bg-accent-cyan/20 rounded"></div>
      </div>
    </div>
  );
}

export default ProductConfigurationSkeleton;
