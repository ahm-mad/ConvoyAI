import { Close as CloseIcon } from '@components/ui/icons';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import GlobalRadioGroup from '../components/GlobalRadioGroup';
import { useTranslation } from 'react-i18next';

interface StatusFilterContentProps {
  setOpenPopperId?: (id: string | null) => void;
}

function StatusFilterContent({ setOpenPopperId }: StatusFilterContentProps) {
  const { t } = useTranslation();
  const [selectedValue, setSelectedValue] = useState('first');

  const handleClose = () => {
    if (setOpenPopperId) {
      setOpenPopperId(null);
    }
  };
  const handleRadioChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedValue(event.target.value);
  };

  return (
    <div className="p-2">
      <div className="flex justify-between items-center">
        <div className="font-medium">{t('statusFilterContent.status')}</div>
        <div onClick={handleClose} className="cursor-pointer px-1 rounded-sm hover:bg-surface-3">
          <CloseIcon className="p-1 text-ink-2" />
        </div>
      </div>
      <GlobalRadioGroup
        name="custom-radio"
        value={selectedValue}
        onChange={handleRadioChange}
        options={[
          { value: 'first', label: t('statusFilterContent.options.first') },
          { value: 'second', label: t('statusFilterContent.options.second') },
          { value: 'third', label: t('statusFilterContent.options.third') },
          { value: 'fourth', label: t('statusFilterContent.options.fourth') },
        ]}
        className="flex flex-col space-y-2"
        labelClass="text-ink-1"
        radioClass="text-accent-cyan"
      />
    </div>
  );
}

export default StatusFilterContent;
