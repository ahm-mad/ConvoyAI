// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect } from 'react';
import ReactApexChart from 'react-apexcharts';
import { token } from '@lib/design/tokens';

const NeonBarChart = ({
  chartData = [],
  height = 260,
  width = '100%',
  showLegend = true,
  showGrid = false,
  horizontal = false,
  distributed = true,
  xAxisLabelColor = null,
  yAxisLabelColor = '#fff',
  title = '',
  barWidth = '60%',
  tooltipTheme = 'dark',
  showToolbar = false,
  unit = '',
  showDataLabels = true,
}) => {
  const [screenSize, setScreenSize] = useState('xl');

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) setScreenSize('sm');
      else if (width < 768) setScreenSize('md');
      else if (width < 1024) setScreenSize('lg');
      else if (width < 1280) setScreenSize('xl');
      else setScreenSize('2xl');
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const categories = chartData.map(item => item.name);
  const colors = chartData.map(item => item.color);
  const values = chartData.map(item => item.value);

  // Responsive settings
  const responsiveConfig = {
    sm: { fontSize: 9, dataLabelSize: 9, titleSize: 10, offsetY: -15 },
    md: { fontSize: 10, dataLabelSize: 10, titleSize: 11, offsetY: -18 },
    lg: { fontSize: 11, dataLabelSize: 11, titleSize: 11, offsetY: -18 },
    xl: { fontSize: 12, dataLabelSize: 11, titleSize: 12, offsetY: -20 },
    '2xl': { fontSize: 13, dataLabelSize: 12, titleSize: 12, offsetY: -20 },
  };

  const config = responsiveConfig[screenSize];

  const options = {
    chart: {
      type: 'bar',
      background: 'transparent',
      toolbar: { show: showToolbar },
      animations: {
        enabled: true,
        dynamicAnimation: {
          enabled: true,
          speed: 350,
        },
      },
    },
    plotOptions: {
      bar: {
        horizontal,
        columnWidth: barWidth,
        distributed,
        dataLabels: {
          position: 'top',
        },
      },
    },
    dataLabels: {
      enabled: showDataLabels,
      formatter: function (val) {
        return val + (unit ? ` ${unit}` : '');
      },
      style: {
        colors: ['#fff'],
        fontWeight: 'bold',
        fontSize: `${config.dataLabelSize}px`,
      },
      offsetY: config.offsetY,
    },
    legend: {
      show: showLegend,
      position: 'right',
      labels: {
        colors: ['#fff'],
        useSeriesColors: false,
      },
      fontSize: `${config.fontSize}px`,
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: xAxisLabelColor || colors,
          fontSize: `${config.fontSize}px`,
        },
        rotate: 0,
        trim: true,
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: [yAxisLabelColor],
          fontSize: `${config.fontSize}px`,
        },
        formatter: function (val) {
          return Math.round(val);
        },
      },
      axisBorder: {
        show: true,
        color: 'rgba(255, 255, 255, 0.4)',
        width: 1,
      },
      axisTicks: {
        show: true,
        color: 'rgba(255, 255, 255, 0.3)',
        width: 1,
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: horizontal ? 'horizontal' : 'vertical',
        shadeIntensity: 0.5,
        gradientToColors: colors,
        inverseColors: false,
        opacityFrom: 0.4,
        opacityTo: 1,
        stops: [0, 100],
      },
    },
    colors,
    tooltip: {
      theme: tooltipTheme,
      y: {
        formatter: function (val) {
          return val + (unit ? ` ${unit}` : '');
        },
      },
      style: {
        fontSize: `${config.fontSize}px`,
      },
    },
    grid: {
      show: showGrid,
      padding: {
        left: 5,
        right: 5,
      },
    },
    title: {
      text: title,
      align: 'left',
      style: {
        color: token('--color-brand'),
        fontSize: `${config.titleSize}px`,
        fontWeight: 'bold',
      },
    },
  };

  const series = [
    {
      name: title || 'Value',
      data: values,
    },
  ];

  return (
    <div className="w-full overflow-hidden">
      <ReactApexChart options={options} series={series} type="bar" height={height} width="100%" />
    </div>
  );
};

export default NeonBarChart;
