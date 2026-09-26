// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { post } from '@utils/apiHelper';
import Button from '@components/Button';
import Input from '@components/Input';

/**
 * First of the two template-creation paths (the other, SaveAsTemplateModal,
 * extracts from an already-configured product). This one is for a
 * customer who knows what fields a device sends but hasn't set up a
 * product yet — name the fields directly.
 */
export default function CreateTemplateModal({ onSuccess }) {
  const { closeModal } = useModal();
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([{ attribute_key: '', label: '', unit: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const updateField = (index, patch) => {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const addField = () => {
    setFields(prev => [...prev, { attribute_key: '', label: '', unit: '' }]);
  };

  const removeField = index => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Template name is required.');

      return;
    }

    const validFields = fields.filter(f => f.attribute_key.trim());
    if (validFields.length === 0) {
      setError('Add at least one field with a source key.');

      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await post(
      '/api/preconfigure-templates',
      {
        name: name.trim(),
        manufacturer: manufacturer.trim() || null,
        description: description.trim() || null,
        fields: validFields.map(f => ({
          attribute_key: f.attribute_key.trim(),
          label: f.label.trim() || f.attribute_key.trim(),
          unit: f.unit.trim() || null,
        })),
      },
      {},
      false
    );

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      setError(response?.message || 'Could not create this template.');

      return;
    }

    onSuccess?.(response.data);
    closeModal();
  };

  return (
    <div className="glass-strong  w-[560px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">New Template</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Name the fields a known device type sends — reusable for any product you create from it
            later.
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
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
              placeholder="e.g. Sensative"
            />
          </div>
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

        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-2">Fields</label>
          <div className="space-y-2 mt-1.5">
            {fields.map((field, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={field.attribute_key}
                  onChange={e => updateField(index, { attribute_key: e.target.value })}
                  placeholder="source key (e.g. objectJSON.temperature)"
                  className="flex-1 bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs font-mono text-ink-0"
                />
                <input
                  value={field.label}
                  onChange={e => updateField(index, { label: e.target.value })}
                  placeholder="label"
                  className="w-28 bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
                />
                <input
                  value={field.unit}
                  onChange={e => updateField(index, { unit: e.target.value })}
                  placeholder="unit"
                  className="w-16 bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
                />
                <button
                  onClick={() => removeField(index)}
                  disabled={fields.length === 1}
                  className="p-1.5 text-ink-2 hover:text-danger-text disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addField}
            className="flex items-center gap-1 text-xs text-brand-text mt-2 hover:underline"
          >
            <Plus size={12} /> Add field
          </button>
        </div>

        {error && <div className="text-xs text-danger-text">{error}</div>}
      </div>

      <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
        <Button variant="secondary" onClick={closeModal} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleCreate} loading={submitting} disabled={submitting}>
          Create Template
        </Button>
      </div>
    </div>
  );
}
