// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import SignalIcon from '../assets/icons/MUIicons/SignalIcon';
import PowerIcon from '../assets/icons/MUIicons/PowerSwitch';
import MuiBatteryIcon from '../assets/icons/MUIicons/MuiBatteryIcon';
import UpdateData from './Widgets/GeneralWidgets/UpdateData';
import ReceiveDataTime from './Widgets/GeneralWidgets/ReceiveDataTime';
import DeviceDataFooterIcon from './Widgets/GeneralWidgets/DeviceDataFooterIcon';
import { MdOutlineEdit } from 'react-icons/md';
import { MdDelete } from 'react-icons/md';

const Card = ({ DeviceName = '', DeviceData, name, Location }) => {
  const sampleSelectedAttributesValues = {
    external_input: 1,
    temperature: 37,
    humidity: 23,
    reedt_state: false,
  };
  return (
    <>
      <div className="pl-10 mt-2 cursor-pointer">
        <div className="h-full w-full bg-white hover:bg-[#EFE3F1] rounded-lg overflow-hidden border-1 border-[#9926AC] p-2 pl-10">
          <div className="flex">
            <p className="text-md font-medium text-gray-700">{DeviceName}</p>

            <p className="text-[11px] mb-2 ml-5 text-[#89848A] mt-1">{name}</p>
            <p className="text-[11px] mb-2 ml-5 text-[#89848A] mt-1">{Location}</p>
          </div>
          {/* <div className="flex flex-wrap mt-3">
            <UpdateData
              border_And_bg_color="border-[#9926AC] bg-[#9926AC]"
              textColor="text-white"
              DeviceTextColor="text-[#C9A5CF]"
              DataTextColorAndSize="text-white text-[17px]"
              setDevice="Simulated Device"
              setData="Update Data"
            />
            <ReceiveDataTime
              border_And_bg_color="border-[#FFC107] bg-[#FFF9E6]"
              setborderPadding="p-3"
              setTextsizeColor="text-xs text-[#897D5C]"
              setTextReceiveData="It may take up to 3 hours to receive sensor data."
            />
          </div> */}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="border px-3 py-1 rounded-md text-xs bg-[#F9F4FB] text-[#5B5B5B]">
              <span className="font-semibold">External Input:</span>
              {sampleSelectedAttributesValues.external_input}
            </div>

            <div className="border px-3 py-1 rounded-md text-xs bg-[#F9F4FB] text-[#5B5B5B]">
              <span className="font-semibold">Temperature:</span>
              {sampleSelectedAttributesValues.temperature}°C
            </div>

            <div className="border px-3 py-1 rounded-md text-xs bg-[#F9F4FB] text-[#5B5B5B]">
              <span className="font-semibold">Humidity:</span>
              {sampleSelectedAttributesValues.humidity}%
            </div>
          </div>

          {/* <div className="float-right ">
            <DeviceDataFooterIcon
              Icon1={SignalIcon}
              Icon2={DeviceData === 'waterLeak' ? MuiBatteryIcon : PowerIcon}
              className="cursor-pointer text-[#DADADA]"
              initialDiv="mb-0 mt-2"
            />
          </div> */}
          <div className="absolute top-2 right-2">
            <DeviceDataFooterIcon
              Icon1={MdOutlineEdit}
              Icon2={MdDelete}
              className="cursor-pointer text-[#DADADA]"
              initialDiv="mb-0"
            />
          </div>
        </div>
      </div>
    </>
  );
};
export default Card;
