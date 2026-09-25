// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// LineChart.jsx
import React from 'react';
import Chart from 'react-apexcharts';
import { useTheme } from '@contexts/ThemeContext';
import { token } from '@lib/design/tokens';

const LineChart = ({ title = '', categories = [], series = [], min, max }) => {
  const { isLight } = useTheme();

  // ApexCharts needs literal color values (not CSS vars) since it renders
  // to SVG outside React's normal styling path — so we compute the right
  // values per theme here instead of hardcoding light-mode colors.
  const accentCyan = token('--color-brand');
  const gridLine = token('--color-chart-grid', '#efe4d6');
  const axisLine = token('--color-line');
  const axisLabel = token('--color-chart-axis', '#667572');
  const titleColor = token('--color-ink-0');

  const options = {
    chart: {
      type: 'line',
      background: 'transparent',
      toolbar: { show: false },
      fontFamily: 'inherit',
    },
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    colors: [accentCyan],
    grid: {
      show: true,
      borderColor: gridLine,
      strokeDashArray: 4,
      position: 'back',
      xaxis: {
        lines: { show: false },
      },
      yaxis: {
        lines: { show: true },
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: axisLabel,
          fontSize: '11px',
          fontFamily: 'Geist Mono, monospace',
        },
      },
      axisBorder: {
        show: true,
        color: axisLine,
      },
      axisTicks: {
        show: true,
        color: axisLine,
      },
    },
    yaxis: {
      min: min !== undefined ? min : undefined,
      max: max !== undefined ? max : undefined,
      tickAmount: 6,
      labels: {
        style: {
          colors: axisLabel,
          fontSize: '11px',
          fontFamily: 'Geist Mono, monospace',
        },
      },
      axisBorder: {
        show: true,
        color: axisLine,
      },
      axisTicks: {
        show: true,
        color: axisLine,
      },
    },
    tooltip: {
      theme: isLight ? 'light' : 'dark',
      y: {
        formatter: value => {
          return value.toLocaleString();
        },
      },
    },
    legend: {
      show: false,
    },
    dataLabels: {
      enabled: false,
    },
  };

  return (
    <div className="w-full h-full">
      {title && (
        <h2 className="text-sm font-semibold mb-4" style={{ color: titleColor }}>
          {title}
        </h2>
      )}
      <div className="w-full">
        <Chart options={options} series={series} type="line" height={320} />
      </div>
    </div>
  );
};

export default LineChart;
