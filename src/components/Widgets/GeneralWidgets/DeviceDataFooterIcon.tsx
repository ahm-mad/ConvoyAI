import React from 'react';

const DeviceDataFooterIcon = ({ Icon1, Icon2, initialDiv = 'mb-4 mt-10 ' }) => {
  return (
    <>
      <div className={`flex items-center space-x-[4px] ${initialDiv}`}>
        <Icon1 className="text-[#9926AC] cursor-pointer" />
        <Icon2 className="text-[#9926AC] cursor-pointer" />
      </div>
    </>
  );
};
export default DeviceDataFooterIcon;
