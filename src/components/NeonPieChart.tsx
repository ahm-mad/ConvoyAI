import React, { useEffect, useRef, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

// DonutChart component
const createSliceGradient = (ctx, chartArea, baseColor = '0,255,255') => {
  if (!chartArea) return `rgba(${baseColor}, 0.4)`;

  const { width, height } = chartArea;
  const gradient = ctx.createConicGradient(-0.5 * Math.PI, width / 2, height / 2);
  const steps = 6;

  for (let i = 0; i <= steps; i++) {
    const alpha = 0.1 + (i / steps) * 0.9;
    gradient.addColorStop(i / steps, `rgba(${baseColor}, ${alpha})`);
  }

  return gradient;
};

const hexToRGBString = hex => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

const DonutChart = ({
  chartData = [],
  total = '',
  label = '',
  size = 80,
  cutout = '85%',
  showLegend = false,
  showTooltip = true,
  tooltipBg = 'rgba(0, 0, 0, 0.8)',
  tooltipFontSize = 9,
  tooltipTextColor = '#fff',
  valueFontSize = '7px',
  valueFontColor = '#fff',
  animation = true,
  labelFormatter = null,
  layoutDirection = 'row',
  chartTitle = '',
  legendPosition = 'bottom',
  legendTextSize = 'text-sm',
  legendValueSize = 'text-sm',
}) => {
  // Check if the value is 0 - if so, show full circle (100%)
  const [responsiveSize, setResponsiveSize] = useState(size);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 940) {
        setResponsiveSize(60); // below md
      } else if (window.innerWidth < 1280) {
        setResponsiveSize(80); // below xl
      } else {
        setResponsiveSize(size); // default (>= 1280)
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);
  const displayData = chartData[0]?.value === 0 ? [{ ...chartData[0], value: 100 }] : chartData;

  const data = {
    labels: displayData.map(item => item.name),
    datasets: [
      {
        data: displayData.map(item => item.value),
        backgroundColor: ctx => {
          const { chart, dataIndex } = ctx;
          const area = chart.chartArea;
          const hexColor = displayData[dataIndex]?.color || '#00ffff';
          const rgb = hexToRGBString(hexColor);
          return createSliceGradient(chart.ctx, area, rgb);
        },
        borderWidth: 0,
      },
    ],
  };

  const options = {
    cutout,
    animation: animation ? { animateScale: true, animateRotate: true } : false,
    plugins: {
      tooltip: {
        enabled: showTooltip,
        backgroundColor: tooltipBg,
        titleColor: tooltipTextColor,
        bodyColor: tooltipTextColor,
        borderColor: '#333',
        borderWidth: 1,
        cornerRadius: 4,
        displayColors: false,
        padding: 4,
        bodyFont: {
          size: tooltipFontSize,
          family: 'Arial, sans-serif',
        },
        titleFont: {
          size: tooltipFontSize,
          family: 'Arial, sans-serif',
        },
        callbacks: {
          title: () => '',
          label: tooltipItem => {
            // Show original value in tooltip, not the modified display value
            const originalValue = chartData[tooltipItem.dataIndex].value;
            const labelName = chartData[tooltipItem.dataIndex].name;
            const totalVal = chartData.reduce((sum, item) => sum + item.value, 0);
            const percent = totalVal === 0 ? 0 : ((originalValue / totalVal) * 100).toFixed(1);
            return `${labelName}: ${originalValue} (${percent}%)`;
          },
        },
      },
      legend: {
        display: showLegend,
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  };

  const getLegendContainerClass = () => {
    const baseClass = 'flex gap-2 items-center';

    if (legendPosition === 'bottom' || legendPosition === 'top') {
      return layoutDirection === 'row'
        ? `${baseClass} flex-row justify-center flex-wrap`
        : `${baseClass} flex-col`;
    } else if (legendPosition === 'right' || legendPosition === 'left') {
      return `${baseClass} flex-col justify-center`;
    }
    return `${baseClass} flex-col`;
  };

  const getMainContainerClass = () => {
    switch (legendPosition) {
      case 'top':
        return 'flex flex-col items-center w-full bg-transparent';
      case 'bottom':
        return 'flex flex-col items-center w-full bg-transparent';
      case 'left':
        return 'flex flex-row items-center w-full bg-transparent';
      case 'right':
        return 'flex flex-row items-center w-full bg-transparent';
      default:
        return 'flex flex-col items-center w-full bg-transparent';
    }
  };

  const renderLegend = () => (
    <div className={getLegendContainerClass()}>
      {chartData.map((item, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-2 text-white/80 hover:text-white transition-all ${
            layoutDirection === 'row' && (legendPosition === 'bottom' || legendPosition === 'top')
              ? 'flex-row'
              : 'w-full justify-start'
          }`}
        >
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className={`text-white/90 ${legendTextSize}`}>{item.name}</span>
          <span className={`text-white/50 ${legendValueSize}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={getMainContainerClass()}>
      {legendPosition === 'top' && renderLegend()}

      {legendPosition === 'left' && <div className="mr-4">{renderLegend()}</div>}

      <div
        className="relative shrink-0"
        style={{
          height: `${responsiveSize}px`,
          width: `${responsiveSize}px`,
          margin: legendPosition === 'bottom' || legendPosition === 'top' ? '8px 0' : '0 8px',
        }}
      >
        <Doughnut data={data} options={options} />
        <div
          className="absolute top-1/2 left-1/2 text-center transform -translate-x-1/2 -translate-y-1/2 font-semibold leading-tight whitespace-pre-line"
          style={{
            fontSize: valueFontSize,
            color: valueFontColor,
          }}
        >
          {labelFormatter ? labelFormatter(total, label) : `${total}\n${label}`}
        </div>
      </div>

      {legendPosition === 'right' && <div className="ml-4">{renderLegend()}</div>}

      {legendPosition === 'bottom' && renderLegend()}
    </div>
  );
};

export default DonutChart;
