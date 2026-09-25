import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import LottieWrapper from '@utils/LottieDynamicImport';

const TemperatureDevice = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  console.log('data-temperature-device-widget', widgetSettings, liveValue);
  const { unit, value_color, label, attributes, device, product_name } = widgetSettings?.[0] ?? {};

  const valueUnit = unit ?? '';
  const valueColor = value_color ?? 'var(--color-ink-0)';
  const parsedValue = String(liveValue?.[0]?.attribute_value);
  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;

  return (
    <div className="p-4 ">
      {(devEui || productName) && (
        <div className="text-sm flex flex-col items-end flex-wrap text-ink-2">
          {productName && <span>{productName}</span>}
          {devEui && <span>{devEui}</span>}
        </div>
      )}
      <div className="flex  flex-col items-center mb-5">
        <div className=" p-0 m-0">
          <div className="flex  flex-col  items-center leading-none space-y-0">
            {/* <h1 className="font-bold text-lg m-0 p-0 leading-none">Battery</h1> */}
            {/* <Lottie */}
            {/* <div
          className="relative flex items-center justify-center rounded-full aspect-square w-[38%] max-w-[110px] min-w-[52px]"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #eff6ff, #dbeafe)',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 2px 8px rgba(59,130,246,0.08)',
          }}
        > */}
            <LottieWrapper name="temperature_blue" className="w-[60%]  h-[50%]" />
            {/* </div> */}
            {/* animationData={BatteryAnimation}
              loop={true}
              className="w-full h-full m-0 p-0"
              style={{ marginTop: '-38px' }}
            /> */}
            <div className="flex  items-center   flex-col">
              <h1 className="text-md mb-2 text-ink-2">{attributeKey && `${attributeKey} `}</h1>
              <span style={{ color: valueColor }}>
                {parsedValue === undefined || parsedValue === null || isNaN(Number(parsedValue))
                  ? '-'
                  : `${parsedValue} ${valueUnit}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemperatureDevice;
