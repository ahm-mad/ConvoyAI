import React from 'react';
import CubeIcon from '../assets/icons/ReactIcon/CubeIcon';
import BeaconIcon from '../assets/icons/ReactIcon/BeaconIcon';
import { useTranslation } from 'react-i18next';
const IntegrationSubNav = () => {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-center border-b-[1px] border-background h-12 px-4">
        <div className="flex  cursor-pointer mr-8 hover:text-[#2196F3]">
          <CubeIcon className="h-7 w-7 " />
          <p className="ml-2 mt-[1px]">{t('IntegrationSubNav.Destinations')}</p>
        </div>
        <div className="flex cursor-pointer hover:text-[#2196F3]">
          <BeaconIcon className="h-7 w-7" />
          <p className="ml-2 mt-[1px]">{t('IntegrationSubNav.MyIntegrations')}</p>
        </div>
      </div>
    </>
  );
};
export default IntegrationSubNav;
