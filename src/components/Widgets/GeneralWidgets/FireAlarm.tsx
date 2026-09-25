import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import LottieWrapper from '@utils/LottieDynamicImport';
import FireAlarmSvg from '@assets/svg/FireAlarmSvg';

const FireAlarm = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  console.log('water-leak-widget', widgetSettings, liveValue);
  const { unit, value_color, label, attributes, device, product_name } = widgetSettings?.[0] ?? {};

  const valueUnit = unit ?? '';
  const valueColor = value_color ?? 'var(--color-ink-0)';
  const parsedValue = String(liveValue?.[0]?.attribute_value);
  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  // const value = !isNaN(parsedValue) ? parsedValue : 0;
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
      <div className="flex w-full  h-[75%] flex-col items-center">
        {isAlert ? (
          <LottieWrapper name="firealarm" className="w-full h-full " />
        ) : (
          <div className="w-[56%] h-full">
            <FireAlarmSvg />
          </div>
        )}
        <div className="flex  items-center   flex-col">
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

export default FireAlarm;
