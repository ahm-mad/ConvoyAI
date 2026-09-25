// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import GlobalInput from '@components/Input';
import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Product-details portion of the merged "Product & Devices" step. Only
// rendered for a brand-new product — when adding devices to a product that
// already exists (opened from that product's own page), the caller skips
// this entirely and goes straight to the devices form, since there's no
// name to collect.
function SecondstepForm({ formData, setFormData, locked = false }) {
  const { t } = useTranslation();

  const updateStepOne = data => {
    setFormData(prev => ({
      ...prev,
      step1: { isFilled: Boolean(data.name), data },
    }));
  };

  return (
    <div id="add-prd-name">
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-accent-cyan" />
        <h1 className="font-semibold text-ink-0">{t('FirstStep.product_details_heading')}</h1>
      </div>
      <p className="text-ink-2 text-sm mt-1.5">{t('FirstStep.product_details_info')}</p>
      <form className="mt-4">
        <label className="block mb-2 text-sm font-medium text-ink-1">
          {t('FirstStep.product_name')}
        </label>
        <GlobalInput
          id="product-in"
          type="text"
          height="h-10"
          placeholder={t('FirstStep.enter_product_name')}
          value={formData?.step1?.data?.name || ''}
          onChange={e => updateStepOne({ ...formData?.step1?.data, name: e.target.value })}
          disabled={locked}
        />
        {/* Once a save attempt has created this product, its name is already
            saved server-side — further edits here wouldn't be sent (the
            retry reuses `existing_product_id`, not `product_name`), so the
            field is locked rather than silently ignoring input. */}
        {locked && (
          <p className="mt-1.5 text-xs text-ink-2">
            Product already created — rename it later from Manage Products if needed.
          </p>
        )}
      </form>
    </div>
  );
}

export default SecondstepForm;
