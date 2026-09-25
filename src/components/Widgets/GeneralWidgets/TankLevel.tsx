import React from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import RectangularTank from '../../../assets/svg/RectangularTank';
import HorizontalCylindricalTank from '../../../assets/svg/HorizontalCylindricalTank';
import SphericalTank from '../../../assets/svg/SphericalTank';
import VerticalCylindricalFlatTank from '../../../assets/svg/VerticalCylindricalFlatTank';
import VerticalCylindricalConicalTank from '../../../assets/svg/VerticalCylindricalConicalTank';

const tankTypeMap = {
  RectangularTank,
  HorizontalCylindricalTank,
  SphericalTank,
  VerticalCylindricalFlatTank,
  VerticalCylindricalConicalTank,
};

const TankLevel = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  console.log('data-tank-widget', liveValue, widgetSettings);
  const { max_value, unit, value_color, label, tank_type, attributes, device, product_name } =
    widgetSettings?.[0] ?? {};
  console.log('deewana', widgetSettings);

  const max = Number(max_value) || 100;
  const valueUnit = unit ?? '';
  const valueColor = value_color ?? 'var(--color-ink-0)';
  const tankType = tank_type ?? 'VerticalCylindricalConicalTank';
  const TankComponent = tankTypeMap[tankType] || VerticalCylindricalConicalTank;

  const parsedValue = liveValue?.[0]?.attribute_value;
  const value = !isNaN(parsedValue) ? parsedValue : 0;
  const fillPercentage = max > 0 ? (value / max) * 100 : 0;

  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;
  console.log('dewana2', attributeKey);

  return (
    <div className="p-4 h-[75%] w-full">
      {(devEui || productName) && (
        <div className="text-sm flex flex-col  items-end flex-wrap text-ink-2">
          {productName && <span>{productName}</span>}
          {devEui && <span> {devEui}</span>}
          {/* {devEui && productId && <span className="mx-2">|</span>} */}
          {/* {productId && <span>Product: {productId}</span>} */}
        </div>
      )}
      <div className="flex w-full  h-full flex-col items-center">
        <div className="w-full  h-full">
          <TankComponent className="w-full h-full" fillPercentage={fillPercentage} />
          <div className="flex flex-col items-center gap-1">
            {/* {typeof max === 'number' && (
              <div className="text-md text-ink-2 ">
                {attributeKey && `${attributeKey}  `}
                <br />
                <span
                  className=" text-ink-0 flex  justify-center"
                  jstyle={{ color: valueColor }}
                >
                  {value}
                  {valueUnit}
                </span>
              </div>
            )} */}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          {typeof max === 'number' && (
            <div className="text-md text-ink-2 ">
              {attributeKey && `${attributeKey}  `}
              <br />
              <span className="text-ink-0 flex justify-center" style={{ color: valueColor }}>
                {value == null || value == undefined ? '-' : `${value}${valueUnit}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TankLevel;
