import React from 'react';

const WidgetInitialDivSkeleton = ({
  InitialDivClassName = 'h-full w-full bg-surface-1 rounded-md overflow-hidden border border-line-soft  p-2',
  PtagClassName = 'text-xs font-medium text-ink-2 cursor-all-scroll',
  childrenHeight = 'h-4',
}) => {
  return (
    <>
      <div className={InitialDivClassName}>
        {/*  
        <div className={`flex justify-center items-center gap-2 ${PtagClassName}`}>
      
          <div className="h-5 w-5 rounded bg-gray-200 animate-pulse"></div>
      
          <div className="h-4 w-24 rounded bg-gray-200 animate-pulse"></div>
        </div> */}

        {/* Children content skeleton */}
        <div className="p-24 flex flex-col gap-4">
          <div className={`mt-3 w-full ${childrenHeight} rounded bg-surface-3 animate-pulse`}></div>
          <div className="flex justify-center">
            <div
              className={`mt-3 px-6 p-4 flex w-1/2 ${childrenHeight}  w-1/2 rounded bg-surface-3 animate-pulse`}
            ></div>
          </div>

          <div
            className={`mt-3 px-4  w-full ${childrenHeight} rounded bg-surface-3 animate-pulse`}
          ></div>
        </div>
      </div>
    </>
  );
};

export default WidgetInitialDivSkeleton;
