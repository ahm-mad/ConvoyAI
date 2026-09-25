import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import LottieWrapper from '@utils/LottieDynamicImport';
import SmokeDetectorSvg from '@assets/svg/SmokeDetectorSvg';

const SmokeDetector = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  console.log('smoke-detector-widget', widgetSettings, liveValue);
  const { unit, value_color, label, attributes, device, product_name } = widgetSettings?.[0] ?? {};
  const valueUnit = unit ?? '';
  const valueColor = value_color ?? 'var(--color-ink-0)';
  const parsedValue = String(liveValue?.[0]?.attribute_value);
  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;

  return (
    <div className="p-4 h-[86%] w-full">
      {(devEui || productName) && (
        <div className="text-sm flex flex-col items-end flex-wrap text-ink-2">
          {productName && <span>{productName}</span>}
          {devEui && <span>{devEui}</span>}
        </div>
      )}
      <div className="flex w-full h-[75%] mt-4 flex-col items-center">
        {isAlert ? (
          <LottieWrapper name="smoke_detector" className="w-[50%] h-[50%]" />
        ) : (
          <div className="w-[50%] h-[60%]">
            <SmokeDetectorSvg />
          </div>
        )}
        <div className="flex items-center flex-col">
          <h1 className="text-md text-ink-2">{attributeKey && `${attributeKey} `}</h1>
          <span style={{ color: valueColor }}>
            {parsedValue === undefined || parsedValue === null
              ? '-'
              : `${parsedValue} ${valueUnit}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SmokeDetector;
