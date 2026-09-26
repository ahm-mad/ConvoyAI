// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import {
  Fingerprint as FingerprintIcon,
  DeleteOutline as DeleteOutlineIcon,
  Badge as BadgeIcon,
} from '@components/ui/icons';
import React, { useState, useEffect } from 'react';
// import { Trash2 } from "lucide-react"; // Delete icon
import GlobalInput from '@components/Input';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const TagInput = ({ formData, setFormData }) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([
    { id: Date.now(), device_unique_identifier: '', name: '', location: '', tags: '' },
  ]);

  const addDevice = () => {
    setFormData(prev => ({
      ...prev,
      step2: {
        ...prev.step2,
        data: [
          ...prev.step2.data,
          { id: Date.now(), device_unique_identifier: '', name: '', location: '' },
        ],
      },
    }));
  };

  const removeDevice = id => {
    if (formData.step2.data.length > 1) {
      setFormData(prev => ({
        ...prev,
        step2: {
          ...prev.step2,
          data: prev.step2.data.filter(item => item.id != id),
        },
      }));
    }
  };

  const handleInputChange = (id, field, value) => {
    console.log(value);
    setFormData(prev => ({
      ...prev,
      step2: {
        ...prev.step2,
        data: prev.step2.data?.map(item => (item.id == id ? { ...item, [field]: value } : item)),
      },
    }));
  };

  // A device row is "blank" (the untouched default row) if none of its
  // required fields have been typed into — that's not an in-progress row to
  // validate, just a placeholder the user may leave alone entirely when
  // relying solely on a CSV upload. Any row with at least one field filled
  // must have all three, same as before.
  useEffect(() => {
    const requiredFields = ['device_unique_identifier', 'name', 'location'];
    const isRowBlank = row => requiredFields.every(field => !Boolean(row[field]));
    const isRowComplete = row => requiredFields.every(field => Boolean(row[field]));
    const nonBlankRows = formData.step2.data.filter(row => !isRowBlank(row));
    const allNonBlankComplete = nonBlankRows.every(isRowComplete);
    const hasValidManualRows = nonBlankRows.length > 0 && allNonBlankComplete;
    const hasValidCsv =
      Boolean(formData.step2.csvFile) &&
      !formData.step2.csvParseError &&
      (formData.step2.csvRows?.length ?? 0) > 0;

    setFormData(prev => ({
      ...prev,
      step2: {
        ...prev.step2,
        isFilled: allNonBlankComplete && (hasValidManualRows || hasValidCsv),
      },
    }));
  }, [
    formData.step2.data,
    formData.step2.csvFile,
    formData.step2.csvRows,
    formData.step2.csvParseError,
  ]);

  return (
    <div>
      {/* Table */}
      <div className="mt-4 border border-line-soft overflow-hidden overflow-x-auto rounded-md">
        <table className="w-full border-collapse">
          {/* Table Header */}
          <thead className="bg-surface-2 text-left">
            <tr>
              <th className="p-2.5 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                {t('tagInput.device_unique_identifier')}
              </th>
              <th className="p-2.5 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                {t('tagInput.name')}
              </th>
              <th className="p-2.5 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                {t('tagInput.location')}
              </th>
              <th className="p-2.5 w-16 text-center font-medium text-[10.5px] uppercase tracking-wider text-ink-2"></th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {formData.step2.data.map((device, index) => {
              return (
                <tr
                  key={device.id}
                  className="border-t border-line-soft hover:bg-surface-2/60 transition-colors"
                >
                  <td className="p-2 align-top">
                    {/* Device Unique Identifier Input */}
                    <GlobalInput
                      id="device-id"
                      placeholder={t('tagInput.device_unique_identifier')}
                      height="h-10"
                      value={
                        formData?.step2?.data?.find(item => item?.id == device?.id)
                          ?.device_unique_identifier || ''
                      }
                      onChange={e =>
                        handleInputChange(device.id, 'device_unique_identifier', e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2 align-top">
                    {/* Name Input */}
                    <GlobalInput
                      id="device-name"
                      fullWidth={true}
                      shrink={true}
                      size="small"
                      variant="outlined"
                      height="h-10"
                      placeholder={t('tagInput.name')}
                      value={formData?.step2?.data?.find(item => item?.id == device?.id)?.name}
                      onChange={e => handleInputChange(device.id, 'name', e.target.value)}
                    />
                  </td>
                  <td className="p-2 align-top">
                    {/* Location Input */}
                    <GlobalInput
                      id="device-location"
                      fullWidth={true}
                      placeholder={t('tagInput.location')}
                      height="h-10"
                      value={formData?.step2?.data?.find(item => item?.id == device?.id)?.location}
                      onChange={e => handleInputChange(device.id, 'location', e.target.value)}
                    />
                  </td>
                  {/* Tags column removed 2026-09-23 — captured but never
                      displayed anywhere downstream; owner decided to drop
                      it rather than build a display surface for it. */}
                  <td className="p-2 text-center align-top">
                    {/* Delete Button */}
                    {formData.step2.data.length > 1 && (
                      <button
                        type="button"
                        id="delete-device"
                        onClick={() => removeDevice(device.id)}
                        aria-label="Remove device"
                        className="grid size-8 place-items-center rounded-full text-danger-text hover:bg-danger/10"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ➕ Add Another Device Button */}
      <div
        id="add-anpther-device"
        onClick={addDevice}
        className="mt-3 flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-md border border-dashed border-line text-ink-1 hover:text-accent-cyan hover:border-accent-cyan/50 hover:bg-accent-cyan/5 cursor-pointer transition-colors duration-150"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="font-medium text-xs">
          {(t('tagInput.addDevice') || '+ Add Another Device').replace(/^\+\s*/, '')}
        </span>
      </div>
    </div>
  );
};

export default TagInput;
