import { Analytics as AnalyticsIcon, NotificationsActive as ErrorIcon } from '@components/ui/icons';
import React from 'react';
import { IoSettingsOutline } from 'react-icons/io5';
// import WarningIcon from '@mui/icons-material/Warning';
// import ErrorIcon from '@mui/icons-material/Error';

const WidgetInitialDiv = ({
  InitialDivClassName = 'h-full w-full border border-line-soft bg-surface-1 rounded-md overflow-hidden  p-2',
  PtagClassName = 'text-xs font-medium text-ink-2',
  children,
  title,
  openModal,
  isAlert = false,
}) => {
  return (
    <div className={InitialDivClassName}>
      <div className="flex justify-between cursor-all-scroll">
        <div className={PtagClassName}>
          {/* <AnalyticsIcon className="text-[#b733ce]" /> */}
          {isAlert && (
            <ErrorIcon className={` text-danger mr-1 animate-pulse`} fontSize="small" />
            // <div className='px-2 py-[1px] bg-red-600 rounded-md text-white text-xs animate-pulse'>Alert</div>
          )}
          {title}
        </div>

        <div className="flex items-center gap-2">
          {/* Warning Icon with conditional animation */}

          <IoSettingsOutline
            className="h-5 w-5 cursor-pointer text-ink-2 hover:text-ink-0 transition-colors"
            onClick={openModal}
          />
        </div>
      </div>

      {children}
    </div>
  );
};

export default WidgetInitialDiv;
