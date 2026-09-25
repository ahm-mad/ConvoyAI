import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import IconMapper from '@utils/ReactIconDynamicImport';

const Value = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  console.log('data-value-widget', liveValue, widgetSettings);

  const colCount = widgetSettings?.length || 0;

  const gridCols =
    colCount === 1
      ? 'grid-cols-1'
      : colCount === 2
        ? 'grid-cols-2'
        : colCount === 3
          ? 'grid-cols-3'
          : 'grid-cols-2'; // default fallback

  return (
    <div className={`grid gap-2 mt-2 h-[86%] ${gridCols}`}>
      {widgetSettings.map((item = {}, index) => {
        const label = item.label;
        const attribute = getKeyAfterLastDot(item.attributes || '');
        const rawValue = liveValue?.[index]?.attribute_value;

        const displayValue =
          rawValue == null || Number.isNaN(Number(rawValue)) ? '-' : String(rawValue);

        console.log('sdf', item.icon);

        return (
          <div
            key={index}
            className="border rounded-md border-line-soft flex justify-center items-center"
            style={{ backgroundColor: item.background_color || '#ffffff' }}
          >
            <div>
              <IconMapper name={item.icon} className="text-[80px]" />
            </div>
            <div className="p-2  sm: sm:p-4 flex flex-col items-center gap-1 sm:gap-2">
              <div className="text-md  " style={{ color: item.text_color || '#D1D5DB' }}>
                {label ?? attribute}
              </div>
              <div className="text-center" style={{ color: item.value_color || '#000000' }}>
                {displayValue} {displayValue !== '-' ? item.unit : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Value;
