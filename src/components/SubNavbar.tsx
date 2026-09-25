// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import FilterListIcon from '@mui/icons-material/FilterList';
import FilterPopper from './FilterPopper';
import CompanyFilterContent from '../screens/CompanyFilterContent';
import LocationFilterContent from '../screens/LocationFilterContent';
import DeviceFilterContent from '../screens/DeviceFilterContent';
import StatusFilterContent from '../screens/StatusFilterContent';
import TemplateFilterContent from '../screens/TemplateFilterContent';
import BurgerIcon from '../assets/icons/MUIicons/BurgerIcon';
import { useTranslation } from 'react-i18next';

const NavBarFilters = ({ setSidebarOpen, isExpanded, setIsExpanded }) => {
  const { t } = useTranslation('SubnavBar');
  const [openPopperId, setOpenPopperId] = useState(null);

  const Filters = [
    {
      id: 'company',
      label: t('filters.company'),
      content: <CompanyFilterContent setOpenPopperId={setOpenPopperId} />,
      sx: { height: 'fit-content' },
    },
    {
      id: 'location',
      label: t('filters.location'),
      content: <LocationFilterContent setOpenPopperId={setOpenPopperId} />,
      sx: { height: 'fit-content' },
    },
    {
      id: 'device',
      label: t('filters.device'),
      content: <DeviceFilterContent setOpenPopperId={setOpenPopperId} />,
      sx: { height: 'fit-content' },
    },
    {
      id: 'status',
      label: t('filters.status'),
      content: <StatusFilterContent setOpenPopperId={setOpenPopperId} />,
      sx: { height: 'fit-content' },
    },
    {
      id: 'template',
      label: t('filters.deviceTemplate'),
      content: <TemplateFilterContent setOpenPopperId={setOpenPopperId} />,
      sx: { height: 'fit-content' },
    },
  ];

  return (
    <div className="">
      <div className="flex items-center overflow-y-hidden  max-md:overflow-x-auto border-b-[1px] border-background h-12">
        <button
          className=" block sm:hidden text-text-light p-1 bg-primary rounded mr-2"
          onClick={() => setIsExpanded(prev => !prev)}
        >
          <BurgerIcon className="text-white" />
        </button>

        {Filters.map(filter => (
          <FilterPopper
            key={filter.id}
            id={filter.id}
            sx={filter.sx}
            className={filter.className}
            openPopperId={openPopperId}
            setOpenPopperId={setOpenPopperId}
            trigger={
              <div className="flex  items-center  gap-4 border-r border-gray-100 h-full p-2 font-medium cursor-pointer">
                <div className="text-text-dark">
                  {filter.label}
                  {/* <div className="bg-gray-100 rounded-full full text-[10px] py-[2px] px-[6px]">
                  1 selected <span className="px-2">X</span>{" "}
                </div> */}
                </div>
                <div className="hover:bg-gray-200 rounded-lg text-blue-700">
                  <FilterListIcon fontSize="small" className="m-1" />
                </div>
              </div>
            }
          >
            {/* {React.cloneElement(filter.content, { setOpenPopperId })} */}
            {filter.content}
          </FilterPopper>
        ))}
      </div>
    </div>
  );
};

export default NavBarFilters;
