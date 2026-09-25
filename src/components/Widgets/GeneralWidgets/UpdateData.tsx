import { Analytics as AnalyticsIcon } from '@components/ui/icons';
import React from 'react';

const UpdateData = ({
  border_And_bg_color,
  textColor,
  DeviceTextColor,
  DataTextColorAndSize,
  setDevice,
  setData,
}) => {
  return (
    <>
      <div className={`border rounded-md pr-5 hover:bg-[#771E86] ${border_And_bg_color}`}>
        <a href="#" className="flex">
          <AnalyticsIcon className={`mt-2 ml-2 ${textColor}`} />
          <div className="flex-col">
            <p className={`text-xs ml-2 font-medium ${DeviceTextColor}`}>{setDevice}</p>
            <p className={`ml-2 text-white text-[17px] font-medium ${DataTextColorAndSize}`}>
              {setData}
            </p>
          </div>
        </a>
      </div>
    </>
  );
};
export default UpdateData;
