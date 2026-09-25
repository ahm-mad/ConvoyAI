import { useTranslation } from 'react-i18next';
import FilterContent from '../components/FilteredContent';

const CompanyFilterContent = ({ setOpenPopperId }) => {
  const { t } = useTranslation();

  const handleClose = () => {
    if (setOpenPopperId) {
      setOpenPopperId(null);
    }
  };

  return (
    <FilterContent
      title={t('companyFilterContent.title')}
      onClick={handleClose}
      options={[
        { label: t('companyFilterContent.options.usama') },
        { label: t('companyFilterContent.options.ahmad') },
        { label: t('companyFilterContent.options.ali') },
        { label: t('companyFilterContent.options.osaman') },
      ]}
    />
  );
};

export default CompanyFilterContent;
