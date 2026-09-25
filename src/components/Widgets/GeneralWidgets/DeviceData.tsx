import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';

const DeviceData = ({ liveValue, widgetSettings = [] }) => {
  console.log('wValue', widgetSettings, liveValue);

  return (
    <div className="w-full h-full p-4 rounded-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-accent-cyan" />
          <div>
            <div className="font-semibold text-ink-0">
              {widgetSettings[0]?.device?.name ?? 'Tektelic Sensor'}
            </div>
            <div className="text-sm text-ink-2">
              {widgetSettings[0]?.device?.device_unique_identifier ?? ''}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] text-[#525252]">
        {widgetSettings?.length > 0 ? (
          widgetSettings.map((attribute, index) => {
            const attributeName = attribute.label ?? getKeyAfterLastDot(attribute?.attributes);

            const matchedValue = liveValue?.find(
              item =>
                item.attribute_name ===
                (attribute.label || getKeyAfterLastDot(attribute?.attributes))
            );

            const value = matchedValue?.attribute_value;

            return (
              <div
                key={index}
                className="px-2 py-1 h-10 border border-grey-200 rounded-lg bg-[#f8f8f8]"
              >
                {attributeName}
                <br />
                <span className="text-ink-0">
                  {value === null || value === undefined
                    ? '-'
                    : value === true
                      ? 'true'
                      : value === false
                        ? 'false'
                        : value}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-center text-ink-2">No data available</div>
        )}
      </div>
    </div>
  );
};

export default DeviceData;
