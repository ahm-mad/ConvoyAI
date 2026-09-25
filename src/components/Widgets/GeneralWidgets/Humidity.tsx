// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getKeyAfterLastDot } from '@utils/mapExtractedKeys';
import Chart from 'react-apexcharts';

const Humidity = ({ liveValue = [], isAlert, widgetSettings = [] }) => {
  const [, forceUpdate] = useState({});
  const prevValueRef = useRef();
  const { max_value, unit, value_color, label, attributes, device, product_name } =
    widgetSettings?.[0] ?? {};

  const max = Number(max_value) || 100;
  const valueUnit = unit ?? '%';
  const valueColor = isAlert ? '#EF4444' : '#5CE65C';

  // Get raw value and determine display
  const rawValue = liveValue?.[0]?.attribute_value;

  // Check if it's a boolean
  const isBoolean = typeof rawValue === 'boolean';

  // For numeric calculations
  const parsedValue = Number(rawValue);
  const value =
    !isBoolean &&
    rawValue !== null &&
    rawValue !== undefined &&
    rawValue !== '' &&
    !isNaN(parsedValue)
      ? parsedValue
      : null;

  // Force re-render when value actually changes
  useEffect(() => {
    if (prevValueRef.current !== value) {
      console.log('Value changed from', prevValueRef.current, 'to', value);
      prevValueRef.current = value;
      forceUpdate({});
    }
  }, [value]);

  const attributeKey = label ?? getKeyAfterLastDot(attributes);
  const devEui = device?.device_unique_identifier;
  const productName = product_name;

  // Calculate series directly - handle null/undefined/boolean
  const series = useMemo(() => {
    if (isBoolean || value === null || value === undefined) return [0];
    return [(value / max) * 100];
  }, [value, max, isBoolean]);

  // ApexCharts Gauge Configuration
  const chartOptions = useMemo(
    () => ({
      chart: {
        type: 'radialBar',
        offsetY: -10,
        sparkline: {
          enabled: true,
        },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 800,
          animateGradually: {
            enabled: true,
            delay: 150,
          },
          dynamicAnimation: {
            enabled: true,
            speed: 350,
          },
        },
      },
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          hollow: {
            margin: 0,
            size: '65%',
            background: '#fff',
            position: 'front',
            dropShadow: {
              enabled: true,
              top: 3,
              left: 0,
              blur: 4,
              opacity: 0.15,
            },
          },
          track: {
            background: '#e7e7e7',
            strokeWidth: '97%',
            margin: 5,
            dropShadow: {
              enabled: true,
              top: 2,
              left: 0,
              blur: 4,
              opacity: 0.15,
            },
          },
          dataLabels: {
            show: true,
            name: {
              offsetY: -10,
              show: true,
              color: '#6B7280',
              fontSize: '14px',
              fontWeight: 500,
            },
            value: {
              formatter: function (val) {
                // Show boolean values as true/false
                if (isBoolean) {
                  return rawValue ? 'true' : 'false';
                }
                // Show hyphen for null/undefined
                if (value === null || value === undefined) {
                  return '-';
                }
                return parseInt((val * max) / 100) + valueUnit;
              },
              color: valueColor,
              fontSize: '28px',
              fontWeight: 700,
              show: true,
              offsetY: 5,
            },
          },
        },
      },
      fill: {
        type: 'solid',
        colors: [valueColor],
      },
      stroke: {
        lineCap: 'round',
      },
      labels: [attributeKey || 'Humidity'],
    }),
    [valueColor, max, valueUnit, attributeKey, value, isBoolean, rawValue]
  );

  console.log('Rendering with value:', value, 'series:', series);

  // Create a unique key based on the actual attribute_value to force re-render
  const chartKey = `chart-${liveValue?.[0]?.attribute_value}-${isAlert}`;

  return (
    <div className="p-4 h-full w-full">
      {(devEui || productName) && (
        <div className="text-sm flex flex-col items-end flex-wrap text-ink-2">
          {productName && <span>{productName}</span>}
          {devEui && <span className="text-xs">{devEui}</span>}
        </div>
      )}

      <div className="flex w-full h-[85%] flex-col items-center justify-center">
        <div className="w-full h-full flex items-center justify-center">
          <Chart
            key={chartKey}
            options={chartOptions}
            series={series}
            type="radialBar"
            height="100%"
            width="100%"
          />
        </div>
      </div>
    </div>
  );
};

export default Humidity;
