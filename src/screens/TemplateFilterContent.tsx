import FilterContent from '../components/FilteredContent';
import { useTranslation } from 'react-i18next';

const TemplateFilterContent = ({ setOpenPopperId }) => {
  const { t } = useTranslation();

  const handleClose = () => {
    if (setOpenPopperId) {
      setOpenPopperId(null);
    }
  };
  return (
    <FilterContent
      title={t('filters.deviceTemplate')}
      onClick={handleClose}
      options={[
        { label: t('options.usama_waqas') },
        { label: t('options.ali') },
        { label: t('options.osman') },
        { label: t('options.ahmad') },
      ]}
    />
  );
};

export default TemplateFilterContent;
