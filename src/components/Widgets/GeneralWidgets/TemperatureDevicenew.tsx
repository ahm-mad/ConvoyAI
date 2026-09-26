import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import LottieWrapper from '@utils/LottieDynamicImport';

const TemperatureDevice = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  console.log('data-temperature-device-widget', widgetSettings, liveValue);
  const { unit, value_color, label, attributes, device, product_name } = widgetSettings?.[0] ?? {};

  const valueUnit = unit ?? '';
  const valueColor = value_color ?? '#dc2626';
  const parsedValue = String(liveValue?.[0]?.attribute_value);
  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;

  const hasValue = !(
    parsedValue === undefined ||
    parsedValue === null ||
    isNaN(Number(parsedValue))
  );

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header: device identity + live status */}
      {(devEui || productName) && (
        <div className="flex items-start justify-between px-4 pt-4 pb-3 shrink-0 border-b border-line-soft">
          <span
            className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
              isAlert ? 'text-danger-text' : 'text-accent-green'
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                  isAlert ? 'bg-danger' : 'bg-accent-green'
                }`}
              />
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  isAlert ? 'bg-danger' : 'bg-accent-green'
                }`}
              />
            </span>
            {isAlert ? 'Alert' : 'Live'}
          </span>

          <div className="flex flex-col items-end text-right">
            {productName && (
              <span className="text-sm font-semibold text-ink-0 tracking-tight leading-tight">
                {productName}
              </span>
            )}
            {devEui && (
              <span className="text-[11px] text-ink-2 font-mono tracking-wide mt-0.5">
                {devEui}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Icon + value */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-4 py-4">
        <div
          className="relative flex items-center justify-center rounded-full aspect-square w-[38%] max-w-[110px] min-w-[52px]"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #eff6ff, #dbeafe)',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 2px 8px rgba(59,130,246,0.08)',
          }}
        >
          <LottieWrapper name="temperature_blue" className="w-[68%] h-[68%]" />
        </div>

        <div className="flex flex-col items-center mt-4">
          {attributeKey && (
            <span className="text-[11px] uppercase tracking-[0.15em] text-ink-2 font-semibold">
              {attributeKey}
            </span>
          )}

          <div
            className="flex items-start gap-1 mt-1.5"
            role="text"
            aria-label={hasValue ? `${parsedValue} ${valueUnit}` : 'No reading available'}
          >
            <span
              className="text-[2.5rem] font-bold leading-none tracking-tight tabular-nums"
              style={{ color: hasValue ? valueColor : '#9ca3af' }}
            >
              {hasValue ? parsedValue : '-'}
            </span>
            {hasValue && valueUnit && (
              <span
                className="text-sm font-semibold mt-1"
                style={{ color: valueColor, opacity: 0.85 }}
              >
                {valueUnit}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemperatureDevice;
