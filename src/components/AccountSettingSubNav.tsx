import React from 'react';
import ProfileIcon from '../assets/icons/ReactIcon/ProfileIcon';
import DownloadIcon from '../assets/icons/ReactIcon/DownloadIcon';
import { useTranslation } from 'react-i18next';
const AccountSettingSubNav = () => {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-center border-b-[1px] border-background h-12 px-4">
        <div className="flex  cursor-pointer mr-8 text-gray-500 hover:text-[#2196F3]">
          <ProfileIcon className="h-7 w-7" />
          <p className="ml-2 mt-[1px]">{t('AccountSettingSubNav.AccountSetting')}</p>
        </div>
        <div className="flex cursor-pointer text-gray-500 hover:text-[#2196F3]">
          <DownloadIcon className="h-7 w-7" />
          <p className="ml-2 mt-[1px]">{t('AccountSettingSubNav.MyData')}</p>
        </div>
      </div>
    </>
  );
};
export default AccountSettingSubNav;
