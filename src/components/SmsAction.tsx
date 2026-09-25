// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { X, Plus, Hash } from 'lucide-react';
import GlobalInput from '@components/Input';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import DropdownMenuRadix from '../components/DropDownMenuRadix'; // Import the dropdown wrapper

const SmsAction = ({ isEnabled, onToggle, control, inputStyles = undefined }) => {
  const { t } = useTranslation();

  // Available dynamic placeholders (same as email)
  const availablePlaceholders = [
    { key: '{{rule_name}}', label: 'Rule Name', description: 'Name of the triggered rule' },
    { key: '{{rule_id}}', label: 'Rule ID', description: 'Unique identifier of the rule' },
    { key: '{{device_name}}', label: 'Device Name', description: 'Name of the triggering device' },
    { key: '{{device_id}}', label: 'Device ID', description: 'Unique identifier of the device' },
    { key: '{{device_eui}}', label: 'Device EUI', description: 'Device unique identifier' },
    { key: '{{user_name}}', label: 'User Name', description: 'Full name of the device owner' },
    { key: '{{user_email}}', label: 'User Email', description: 'Email of the device owner' },
    { key: '{{timestamp}}', label: 'Timestamp', description: 'Full date and time (Y-m-d H:i:s)' },
    { key: '{{date}}', label: 'Date', description: 'Current date (Y-m-d)' },
    { key: '{{time}}', label: 'Time', description: 'Current time (H:i:s)' },
    {
      key: '{{datetime_readable}}',
      label: 'Readable DateTime',
      description: 'Human readable date time',
    },
  ];

  const addRecipient = (currentRecipients, newRecipient, onChange, clearNewRecipient) => {
    if (newRecipient && newRecipient.trim() && !currentRecipients.includes(newRecipient.trim())) {
      const updatedRecipients = [...currentRecipients, newRecipient.trim()];
      onChange(updatedRecipients);
      // Clear the new recipient field after adding
      if (clearNewRecipient) {
        clearNewRecipient('');
      }
      return '';
    }
    return newRecipient;
  };

  const removeRecipient = (currentRecipients, recipientToRemove, onChange) => {
    const updatedRecipients = currentRecipients.filter(
      recipient => recipient !== recipientToRemove
    );
    onChange(updatedRecipients);
  };

  const validatePhoneNumber = value => {
    const phoneRegex = /^[+]?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(value) || t('sms.error.invalidPhone');
  };

  const insertPlaceholder = (placeholder, currentValue, onChange) => {
    onChange(currentValue + ' ' + placeholder);
  };

  return (
    <div className="rounded-md ">
      <div className="flex items-center mt-2 gap-2">
        <span className="text-sm font-medium text-ink-1">{t('sms.title')}</span>
        <div
          onClick={onToggle}
          id="notify-sms"
          className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${
            isEnabled ? 'bg-accent-cyan' : 'bg-surface-3'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-surface-1 transition-transform ${
              isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </div>
      </div>

      {isEnabled && (
        <div className="space-y-4 mt-2 border border-line bg-surface-1/40 shadow-none rounded-lg p-4">
          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">{t('sms.toLabel')}</label>
            <Controller
              name="smsData.to"
              control={control}
              defaultValue={[]}
              rules={{
                validate: (value, allValues) => {
                  if (isEnabled) {
                    // Check if there are recipients in the list OR a pending recipient in the input field
                    const pendingRecipient = allValues?.smsData?.newRecipient?.trim();

                    if ((!value || value.length === 0) && !pendingRecipient) {
                      return t('sms.recipientRequired') || 'At least one recipient is required';
                    }

                    // If there's a pending recipient, validate it
                    if (pendingRecipient && !validatePhoneNumber(pendingRecipient)) {
                      return t('sms.error.invalidPhone') || 'Invalid phone number format';
                    }
                  }
                  return true;
                },
              }}
              render={({ field: { value: recipients, onChange }, fieldState }) => (
                <div>
                  {/* Display current recipients */}
                  {recipients.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {recipients.map((recipient, index) => (
                        <div
                          key={index}
                          className="bg-accent-blue/10 text-accent-blue px-2 py-1 rounded-full text-xs flex items-center"
                        >
                          {recipient}
                          <button
                            type="button"
                            onClick={() => removeRecipient(recipients, recipient, onChange)}
                            className="ml-2 text-accent-blue hover:brightness-125"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Show validation error for recipients */}
                  {fieldState.error && (
                    <p className="text-danger text-xs mb-2">{fieldState.error.message}</p>
                  )}

                  {/* New recipient input */}
                  <Controller
                    name="smsData.newRecipient"
                    control={control}
                    defaultValue=""
                    rules={{
                      validate: value => {
                        if (!value) return true;
                        return validatePhoneNumber(value);
                      },
                    }}
                    render={({ field: newRecipientField, fieldState: newRecipientState }) => (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <GlobalInput
                            {...newRecipientField}
                            error={!!newRecipientState.error}
                            helperText={newRecipientState.error?.message}
                            height="h-9"
                            size="small"
                            id="number-input"
                            type="tel"
                            placeholder={t('sms.placeholder.phone')}
                            onKeyPress={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addRecipient(
                                  recipients,
                                  newRecipientField.value,
                                  onChange,
                                  newRecipientField.onChange
                                );
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          id="add-number"
                          onClick={() => {
                            addRecipient(
                              recipients,
                              newRecipientField.value,
                              onChange,
                              newRecipientField.onChange
                            );
                          }}
                          className="h-[34px] cursor-pointer px-4 brand-gradient-bg on-gradient rounded-md hover:brightness-110 transition-all font-medium text-sm"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  />
                </div>
              )}
            />
          </div>

          {/* Message with placeholders */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-ink-1">
                {t('sms.messageLabel')}
              </label>
              <Controller
                name="smsData.message"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <DropdownMenuRadix
                    trigger={
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-1 text-xs text-accent-cyan hover:brightness-125 hover:bg-surface-3 cursor-pointer bg-surface-2 rounded transition-colors"
                      >
                        <Hash className="w-3 h-3" />
                        Add Placeholders
                      </button>
                    }
                    options={availablePlaceholders.map(ph => ({
                      label: (
                        <div className="flex flex-col">
                          <span className="text-sm">{ph.label}</span>
                          <span className="text-xs text-accent-cyan font-mono">{ph.key}</span>
                          <span className="text-xs text-ink-2">{ph.description}</span>
                        </div>
                      ),
                      onClick: () => insertPlaceholder(ph.key, field.value, field.onChange),
                    }))}
                  />
                )}
              />
            </div>
            <Controller
              name="smsData.message"
              control={control}
              defaultValue=""
              rules={{
                required: isEnabled ? t('sms.error.requiredMessage') : false,
                maxLength: { value: 500, message: t('sms.error.maxLength') },
                minLength: { value: 5, message: t('sms.error.minLength') },
              }}
              render={({ field, fieldState }) => (
                <div>
                  <textarea
                    {...field}
                    className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none  resize-vertical ${
                      fieldState.error ? 'border-danger' : 'border-line'
                    }`}
                    rows={3}
                    id="phone-message"
                    placeholder={t('sms.placeholder.message')}
                    maxLength={160}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <div>
                      {fieldState.error && (
                        <p className="text-danger text-xs">{fieldState.error.message}</p>
                      )}
                    </div>
                    <p className="text-ink-2 text-xs">
                      {t('sms.characterCount', { count: field.value?.length || 0 })}
                    </p>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsAction;
