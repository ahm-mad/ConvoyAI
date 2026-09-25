import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import BoltIcon from '@mui/icons-material/Bolt';

const Battery = ({ liveValue = [], isAlert = false, widgetSettings = [] }) => {
  console.log('data-battery-widget', widgetSettings, liveValue);

  const { max_value, unit, value_color, label, attributes, device, product_name } =
    widgetSettings?.[0] ?? {};

  const max = Number(max_value) || 100;
  const valueUnit = unit ?? '';
  const valueColor = value_color ?? 'var(--color-ink-0)';

  // handle null / undefined safely
  const rawValue = liveValue?.[0]?.attribute_value;
  const value = rawValue === null || rawValue === undefined ? null : rawValue;

  console.log(value, 'valuee');

  const fillPercentage = value !== null && max > 0 ? (value / max) * 100 : 0;

  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;

  // ✅ ALERT BASED COLOR
  const getColor = () => {
    return isAlert ? 'bg-danger' : 'bg-accent-green';
  };

  return (
    <div className="p-4 h-[75%] w-full">
      {(devEui || productName) && (
        <div className="text-sm flex flex-col items-end text-ink-2">
          {productName && <span>{productName}</span>}
          {devEui && <span>{devEui}</span>}
        </div>
      )}

      <div className="flex w-full h-full flex-col items-center">
        {/* Battery */}
        <div className="flex w-[70%] mt-4 h-[60%] items-center">
          <div className="relative w-full h-16 rounded-md overflow-hidden border-2 border-line bg-surface-3">
            <div
              className={`${getColor()} h-full transition-all duration-500`}
              style={{ width: `${fillPercentage}%` }}
            />

            {/* Charging Icon */}
            <BoltIcon className="absolute inset-0 m-auto text-ink-2" sx={{ fontSize: 34 }} />
          </div>

          {/* Battery Cap */}
          <div className="bg-line w-2 h-6 rounded-r-sm"></div>
        </div>

        {/* Value */}
        <div className="text-md text-ink-2 text-center mt-2">
          {attributeKey && <span>{attributeKey}</span>}
          <br />
          <span className="flex justify-center" style={{ color: valueColor }}>
            {value === null || Number.isNaN(value) ? '-' : `${value}${valueUnit}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Battery;
