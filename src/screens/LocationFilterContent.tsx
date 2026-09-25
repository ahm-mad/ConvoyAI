import { useTranslation } from 'react-i18next';
import FilterContent from '../components/FilteredContent';

const LocationFilterContent = ({ setOpenPopperId }) => {
  const { t } = useTranslation();

  const handleClose = () => {
    if (setOpenPopperId) setOpenPopperId(null);
  };

  return (
    <FilterContent
      title={t('filter.location')}
      onClick={handleClose}
      options={[
        { label: t('options.usama_waqas') },
        { label: t('options.osman') },
        { label: t('options.ahmad') },
        { label: t('options.ali') },
      ]}
    />
  );
};

export default LocationFilterContent;
