import FilterContent from '../components/FilteredContent';

import { useTranslation } from 'react-i18next';

const DeviceFilterContent = ({ setOpenPopperId }) => {
  const { t } = useTranslation();

  const handleClose = () => {
    if (setOpenPopperId) setOpenPopperId(null);
  };

  return (
    <FilterContent
      title={t('deviceFilterContent.device')}
      onClick={handleClose}
      options={[
        { label: t('deviceFilterContent.options.usama_waqas') },
        { label: t('deviceFilterContent.options.ali') },
        { label: t('deviceFilterContent.options.ahmad') },
        { label: t('deviceFilterContent.options.osman') },
      ]}
    />
  );
};

export default DeviceFilterContent;
