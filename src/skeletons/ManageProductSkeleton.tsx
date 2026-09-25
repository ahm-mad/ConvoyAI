import React, { Fragment } from 'react';

const ManageProductSkeleton = () => {
  const statusItems = [1, 2, 3, 4];

  const products = [1, 2, 3, 4, 5, 6];

  return (
    <div className="flex flex-col">
      <div className="flex text-xs p-5 items-center flex-wrap text-text-dark gap-2"></div>

      <div className="text-text-dark flex flex-col pl-5">
        <span className="font-bold h-8 w-32  bg-surface-3 rounded animate-pulse"></span>

        {products.map((_, index) => (
          <Fragment key={index}>
            <div className="mt-4 w-[95%]  flex items-center justify-between   rounded-lg   bg-background p-3 px-3">
              <div className="font-semibold flex  items-center">
                <div className="h-5 w-5 bg-surface-3 rounded-full animate-pulse mr-2"></div>
                <div className="h-5 w-40 bg-surface-3 rounded animate-pulse mr-3 ml-1"></div>
                {/* <div className="h-5 w-40 bg-surface-3 rounded animate-pulse"></div> */}
              </div>
              <div className="h-8 w-16 bg-surface-3 rounded-lg animate-pulse"></div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export default ManageProductSkeleton;
