// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Hash } from 'lucide-react';
import DropdownMenuRadix from '../components/DropDownMenuRadix'; // Import the dropdown wrapper

const SystemNotificationAction = ({ isEnabled, onToggle, control }) => {
  const { t } = useTranslation();

  // Available dynamic placeholders (same as email and SMS)
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

  const insertPlaceholder = (placeholder, currentValue, onChange) => {
    onChange(currentValue + ' ' + placeholder);
  };

  return (
    <div className="rounded-lg">
      <div className="flex items-center mb-4 mt-3 gap-2">
        <span className="text-sm font-medium text-ink-1">{t('notification.title')}</span>
        <div
          onClick={onToggle}
          id="notify-notification"
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
        <div className="space-y-4 rounded-lg border border-line bg-surface-1/40 shadow-none p-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-ink-1">
                {t('notification.messageLabel')}
              </label>
              <Controller
                name="notificationData.message"
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
              name="notificationData.message"
              control={control}
              defaultValue=""
              rules={{
                required: isEnabled ? t('notification.error.required') : false,
                minLength: {
                  value: 5,
                  message: t('notification.error.minLength'),
                },
                maxLength: {
                  value: 500,
                  message: t('notification.error.maxLength'),
                },
              }}
              render={({ field, fieldState }) => (
                <div>
                  <textarea
                    {...field}
                    className={`w-full px-3 py-2 border rounded-md text-sm bg-surface-2 text-ink-0 focus:outline-none focus:border-accent-cyan resize-vertical ${
                      fieldState.error ? 'border-danger' : 'border-line'
                    }`}
                    rows={4}
                    id="notify-message"
                    placeholder={t('notification.placeholder.message')}
                    maxLength={500}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <div>
                      {fieldState.error && (
                        <p className="text-danger-text text-xs">{fieldState.error.message}</p>
                      )}
                    </div>
                    <p className="text-ink-2 text-xs">
                      {t('notification.characterCount', {
                        count: field.value?.length || 0,
                      })}
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

export default SystemNotificationAction;
