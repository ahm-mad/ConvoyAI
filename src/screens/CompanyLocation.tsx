/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import GlobalCheckbox from '../components/GLobalCheckBox';
import { useModal } from '@contexts/ModalContext';
import AddLocation from '../components/AddLocation';
import Chevron from '../assets/icons/MUIicons/Chevron';
import ChevronRight from '../assets/icons/MUIicons/ChevronRight';
import EditIcon from '@assets/icons/MUIicons/EditIcon';
import AddIcon from '@assets/icons/MUIicons/AddBtnIcon';
import BookMarkIcon from '@assets/icons/MUIicons/BookMarkIcon';
import OnlineSignalIcon from '@assets/icons/MUIicons/OnlineSignalcon';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUser } from '@contexts/UserContext';

function CompanyLocation() {
  const { openModal } = useModal();
  const { user } = useUser();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  // const user = JSON.parse(localStorage.getItem('user'));

  const {
    data: companyData,
    isLoading,
    refetch,
  } = useSimpleQuery('companyData', `/api/companies/${user?.company_id}`);

  const toggleContent = () => {
    setIsExpanded(!isExpanded);
  };

  const handleMenuClick = (e?: MouseEvent<HTMLButtonElement>) => {
    e?.stopPropagation();
    openModal(<AddLocation companyData={companyData?.data} refetch={refetch} />);
  };

  const handleCheckboxChange = () => {
    setIsChecked(!isChecked);
  };

  useEffect(() => {
    if (!user?.company_info) {
      handleMenuClick();
    }
  }, []);

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-4">
        <div className="eyebrow">{companyData?.data?.name}</div>
        <h1 className="page-title mt-1">Company &amp; locations</h1>
      </div>
      {/* Parent Box */}
      <div
        className={`flex w-full h-full cursor-pointer items-center border ${
          isChecked ? 'gap-x-[20%] lg:gap-x-[30%] xl:gap-x-[36%]' : 'justify-between'
        } bg-surface-1 rounded-control p-2 border-line-soft `}
        onClick={toggleContent}
      >
        {/* Left Side */}
        <div className="flex items-center gap-1">
          <div className="text-ink-2">{isExpanded ? <Chevron /> : <ChevronRight />}</div>
          <div className="text-xs sm:text-sm text-ink-0 font-medium">{companyData?.data?.name}</div>
        </div>
        {/* Address */}
        <div className="flex text-[11px] sm:text-xs text-ink-2 items-center flex-wrap ml-3 sm:ml-0">
          {user?.company_info
            ? `${companyData?.data?.address}, ${companyData?.data?.city}, ${companyData?.data?.country}`
            : ''}
        </div>

        {/* Actions - Hide when checkbox is checked */}
        {!isChecked && (
          <div className="flex gap-1.5">
            <button
              onClick={handleMenuClick}
              title="Add location"
              className="flex items-center justify-center w-7 h-7 rounded-control bg-surface-2 border border-line text-ink-1 hover:bg-surface-3 hover:text-ink-0 transition-colors cursor-pointer"
            >
              <AddIcon fontSize="small" />
            </button>

            <button
              title="Bookmark"
              className="flex items-center justify-center w-7 h-7 rounded-control bg-surface-2 border border-line text-accent-cyan hover:bg-surface-3 transition-colors cursor-pointer"
            >
              <BookMarkIcon fontSize="small" />
            </button>
            <button
              onClick={handleMenuClick}
              title="Edit"
              className="flex items-center justify-center w-7 h-7 rounded-control bg-surface-2 border border-line text-ink-1 hover:bg-surface-3 hover:text-ink-0 transition-colors cursor-pointer"
            >
              <EditIcon fontSize="small" />
            </button>
          </div>
        )}
      </div>

      {/* Hidden Content (Toggled) */}
      {isExpanded && (
        <div className="mt-1.5 w-[100%]">
          <div className="flex w-full cursor-pointer h-full bg-surface-2 rounded-control p-2 border border-line-soft justify-between">
            <div className="flex items-center ml-2">
              {/* Checkbox with onChange event */}
              <GlobalCheckbox
                className="h-[34px] w-[30px]"
                size="small"
                onChange={handleCheckboxChange}
              />
              <div className="text-xs sm:text-sm text-ink-0 -ml-4 sm:-ml-0">ChirpTech</div>
            </div>
            <div className="flex text-[11px] sm:text-xs text-ink-2 items-center flex-wrap ml-3 sm:ml-0">
              {user?.company_info
                ? `${companyData?.data?.address}, ${companyData?.data?.city}, ${companyData?.data?.country}`
                : ''}
            </div>

            {/* Hide buttons when checkbox is checked */}
            {!isChecked ? (
              <div className="flex gap-1.5">
                <button
                  onClick={handleMenuClick}
                  title="Signal status"
                  className="flex items-center justify-center gap-0.5 px-2 h-7 rounded-control bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/15 transition-colors cursor-pointer"
                >
                  <OnlineSignalIcon fontSize="small" />
                  <Chevron fontSize="small" />
                </button>

                <button
                  onClick={handleMenuClick}
                  title="Add location"
                  className="flex items-center justify-center w-7 h-7 rounded-control bg-surface-1 border border-line text-ink-1 hover:bg-surface-3 hover:text-ink-0 transition-colors cursor-pointer"
                >
                  <AddIcon fontSize="small" />
                </button>
                <button
                  title="Bookmark"
                  className="flex items-center justify-center w-7 h-7 rounded-control bg-surface-1 border border-line text-accent-cyan hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  <BookMarkIcon fontSize="small" />
                </button>
                <button
                  onClick={handleMenuClick}
                  title="Edit"
                  className="flex items-center justify-center w-7 h-7 rounded-control bg-surface-1 border border-line text-ink-1 hover:bg-surface-3 hover:text-ink-0 transition-colors cursor-pointer"
                >
                  <EditIcon fontSize="small" />
                </button>
              </div>
            ) : (
              // Show Cancel button when checkbox is checked
              <button
                onClick={handleCheckboxChange}
                className="px-3 h-7 text-xs font-medium rounded-full bg-surface-1 border border-line text-ink-1 hover:bg-surface-3 hover:text-ink-0 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CompanyLocation;
