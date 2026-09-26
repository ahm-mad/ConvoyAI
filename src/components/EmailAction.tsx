// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { Controller } from 'react-hook-form';
import { X, Hash } from 'lucide-react';
import GlobalInput from '@components/Input';
import { useTranslation } from 'react-i18next';
import DropdownMenuRadix from '../components/DropDownMenuRadix'; // apna wrapper import karo

const EmailAction = ({ isEnabled, onToggle, control, inputStyles = undefined }) => {
  const { t } = useTranslation();

  // Available dynamic placeholders
  const availablePlaceholders = [
    { key: '{{rule_name}}', label: 'Rule Name', description: 'Name of the triggered rule' },
    { key: '{{rule_id}}', label: 'Rule ID', description: 'Unique identifier of the rule' },
    { key: '{{device_name}}', label: 'Device Name', description: 'Name of the triggering device' },
    { key: '{{device_id}}', label: 'Device ID', description: 'Unique identifier of the device' },
    // { key: '{{device_eui}}', label: 'Device EUI', description: 'Device unique identifier' },
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
  //hkjg

  const addRecipient = (currentRecipients, newRecipient, onChange, clearNewRecipient) => {
    if (newRecipient && newRecipient.trim() && !currentRecipients.includes(newRecipient.trim())) {
      const updatedRecipients = [...currentRecipients, newRecipient.trim()];
      onChange(updatedRecipients);
      if (clearNewRecipient) clearNewRecipient('');
    }
  };

  const removeRecipient = (currentRecipients, recipientToRemove, onChange) => {
    const updatedRecipients = currentRecipients.filter(r => r !== recipientToRemove);
    onChange(updatedRecipients);
  };

  const validateEmail = value => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) || t('email.error.invalidEmail');
  };

  const insertPlaceholder = (placeholder, currentValue, onChange) => {
    onChange(currentValue + ' ' + placeholder);
  };

  return (
    <div>
      {/* Email Action toggle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-ink-1">{t('email.title')}</span>
        <div
          onClick={onToggle}
          id="notify-email"
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
        <div className="space-y-4 border rounded-lg border-line bg-surface-1/40 shadow-none p-4">
          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-ink-1 mb-2">
              {t('email.toLabel')}
            </label>
            <Controller
              name="emailData.to"
              control={control}
              defaultValue={[]}
              rules={{
                validate: (value, allValues) => {
                  const pendingRecipient = allValues?.emailData?.newRecipient?.trim();
                  if ((!value || value.length === 0) && !pendingRecipient) {
                    return t('email.recipientRequired') || 'At least one recipient is required';
                  }
                  if (pendingRecipient && !validateEmail(pendingRecipient)) {
                    return t('email.error.invalidEmail') || 'Invalid email format';
                  }
                  return true;
                },
              }}
              render={({ field: { value: recipients, onChange }, fieldState }) => (
                <div>
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

                  {fieldState.error && (
                    <p className="text-danger-text text-xs mb-2">{fieldState.error.message}</p>
                  )}

                  <Controller
                    name="emailData.newRecipient"
                    control={control}
                    defaultValue=""
                    rules={{
                      validate: value => (!value ? true : validateEmail(value)),
                    }}
                    render={({ field: newRecipientField, fieldState: newRecipientState }) => (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <GlobalInput
                            {...newRecipientField}
                            error={!!newRecipientState.error}
                            helperText={newRecipientState.error?.message}
                            size="small"
                            type="email"
                            height="h-9"
                            id="email-input"
                            placeholder={t('email.placeholder.email')}
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
                          id="add-email"
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

          {/* Subject with placeholders */}
          <div>
            {/* <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-ink-1">
                {t('email.subjectLabel')}
              </label>
              <Controller
                name="emailData.subject"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <DropdownMenuRadix
                    trigger={
                      <button
                        type="button"
                        className="flex items-center  gap-1 px-2 py-1 text-xs text-brand-text hover:brightness-125 hover:bg-surface-3 rounded transition-colors"
                      >
                        <Hash className="w-3 h-3" />
                        Placeholders
                      </button>
                    }
                    options={availablePlaceholders.map(ph => ({
                      label: (
                        <div className="flex flex-col">
                          <span className="text-sm">{ph.label}</span>
                          <span className="text-xs text-brand-text font-mono">{ph.key}</span>
                          <span className="text-xs text-ink-2">{ph.description}</span>
                        </div>
                      ),
                      onClick: () => insertPlaceholder(ph.key, field.value, field.onChange),
                    }))}
                  />
                )}
              /> */}
            {/* </div> */}
            <Controller
              name="emailData.subject"
              control={control}
              defaultValue=""
              rules={{
                required: isEnabled ? t('email.error.requiredSubject') : false,
                minLength: { value: 5, message: t('email.error.minLengthSubject') },
              }}
              render={({ field, fieldState }) => (
                <GlobalInput
                  {...field}
                  error={!!fieldState.error}
                  height="h-9"
                  helperText={fieldState.error?.message}
                  size="small"
                  id="email-subject"
                  type="text"
                  placeholder="Add subject"
                />
              )}
            />
          </div>

          {/* Message with placeholders */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-ink-1">
                {t('email.messageLabel')}
              </label>
              <Controller
                name="emailData.message"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <DropdownMenuRadix
                    trigger={
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-1 text-xs text-brand-text hover:brightness-125 hover:bg-surface-3 cursor-pointer bg-surface-2 rounded transition-colors"
                      >
                        <Hash className="w-3 h-3" />
                        Add Placeholders
                      </button>
                    }
                    options={availablePlaceholders.map(ph => ({
                      label: (
                        <div className="flex flex-col">
                          <span className="text-sm">{ph.label}</span>
                          <span className="text-xs text-brand-text font-mono">{ph.key}</span>
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
              name="emailData.message"
              control={control}
              defaultValue=""
              rules={{
                required: isEnabled ? t('email.error.requiredMessage') : false,
                minLength: { value: 10, message: t('email.error.minLengthMessage') },
              }}
              render={({ field, fieldState }) => (
                <div>
                  <textarea
                    {...field}
                    className={`w-full px-3 py-2 border rounded-md text-sm bg-surface-2 text-ink-0 focus:outline-none focus:border-accent-cyan resize-vertical ${
                      fieldState.error ? 'border-danger' : 'border-line'
                    }`}
                    rows={4}
                    id="email-message"
                    placeholder={t('email.placeholder.message')}
                  />
                  {fieldState.error && (
                    <p className="text-danger-text text-xs mt-1">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailAction;
