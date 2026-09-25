import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import LottieWrapper from '@utils/LottieDynamicImport';

const SignalStrength = ({ liveValue = [], isAlert = false, widgetSettings = [] }) => {
  console.log('signal-strength-widget', widgetSettings, liveValue);

  const { unit, value_color, label, attributes, device, product_name } = widgetSettings?.[0] ?? {};

  const valueColor = value_color ?? 'var(--color-ink-0)';
  const rawValue = liveValue?.[0]?.attribute_value;

  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;

  const isBoolean = rawValue === true || rawValue === false;

  let displayValue = '-';
  if (rawValue !== null && rawValue !== undefined) {
    if (isBoolean) {
      displayValue = `${rawValue ? 'true' : 'false'}${unit ? ` ${unit}` : ''}`;
    } else if (!Number.isNaN(Number(rawValue))) {
      displayValue = `${rawValue}${unit ? ` ${unit}` : ''}`;
    }
  }

  return (
    <div className="p-4">
      {(devEui || productName) && (
        <div className="text-sm flex flex-col items-end flex-wrap text-ink-2">
          {productName && <span>{productName}</span>}
          {devEui && <span>{devEui}</span>}
        </div>
      )}

      <div className="flex flex-col items-center mb-5">
        <div className="p-0 m-0">
          <div className="flex flex-col items-center leading-none space-y-0">
            <div className="w-full h-[0%]">
              <LottieWrapper name="signal" className="-mt-12" />
            </div>

            <div className="flex items-center flex-col">
              <h1 className="text-md text-ink-2">{attributeKey && `${attributeKey}`}</h1>
              <span style={{ color: valueColor }}>{displayValue}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalStrength;
