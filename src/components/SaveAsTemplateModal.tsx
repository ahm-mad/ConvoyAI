// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { post } from '@utils/apiHelper';
import Button from '@components/Button';
import Input from '@components/Input';

/**
 * Second of the two template-creation paths (the other is a form-based
 * creator elsewhere). This one needs zero manual re-entry: it extracts
 * whatever ProductAttributePreference + Settings records already exist on
 * a real, configured product and turns them into a reusable template via
 * POST /api/preconfigure-templates/from-product/{id} — the backend does
 * the actual extraction; this just collects the template's own name/
 * manufacturer/description first.
 */
export default function SaveAsTemplateModal({ product, onSuccess }) {
  const { closeModal } = useModal();
  const [name, setName] = useState(product?.name ? `${product.name} Template` : '');
  const [manufacturer, setManufacturer] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required.');

      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await post(
      `/api/preconfigure-templates/from-product/${product.id}`,
      {
        name: name.trim(),
        manufacturer: manufacturer.trim() || null,
        description: description.trim() || null,
      },
      {},
      false
    );

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      setError(response?.message || 'Could not save this product as a template.');

      return;
    }

    onSuccess?.(response.data);
    closeModal();
  };

  return (
    <div className="glass-strong  w-[440px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">Save as Template</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Saves {product?.name}'s current field mappings as a reusable template for your company.
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-2">Template name</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1.5" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-2">
            Manufacturer <span className="normal-case text-ink-2/70">(optional)</span>
          </label>
          <Input
            value={manufacturer}
            onChange={e => setManufacturer(e.target.value)}
            className="mt-1.5"
            placeholder="e.g. Tektelic"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-2">
            Description <span className="normal-case text-ink-2/70">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full mt-1.5 bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
          />
        </div>
        {error && <div className="text-xs text-danger-text">{error}</div>}
      </div>

      <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
        <Button variant="secondary" onClick={closeModal} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={submitting} disabled={submitting}>
          Save Template
        </Button>
      </div>
    </div>
  );
}
