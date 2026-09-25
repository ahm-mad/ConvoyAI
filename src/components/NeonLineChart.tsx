// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// src/components/NeonLineChart.jsx
import React from 'react';
import Chart from 'react-apexcharts';
import { token } from '@lib/design/tokens';

const NeonLineChart = ({ title = 'Line Chart', categories = [], series = [], min, max, unit }) => {
  const options = {
    chart: {
      type: 'line',
      background: 'transparent',
      toolbar: { show: false },
    },
    stroke: {
      curve: 'smooth',
      width: 3,
    },
    colors: [token('--color-brand'), token('--color-danger')], // You can pass this as prop too if needed
    grid: { show: false },
    xaxis: {
      categories,
      labels: { style: { colors: '#ffffffb3' } },
      axisBorder: { show: true, color: '#ffffff33' },
      axisTicks: { show: true, color: '#ffffff33' },
    },
    yaxis: {
      min: min !== undefined ? min : undefined,
      max: max !== undefined ? max : undefined,
      labels: {
        style: { colors: '#ffffffb3' },
        formatter: value => `${value}${unit ? ` ${unit}` : ''}`,
      },
      axisBorder: { show: true, color: '#ffffff33' },
      axisTicks: { show: true, color: '#ffffff33' },
    },
    tooltip: { theme: 'dark' },
    legend: {
      labels: { colors: '#ffffffb3' },
    },
  };

  return (
    <div>
      <h3 className="text-sm text-brand ">{title}</h3>
      <Chart options={options} series={series} type="line" height={200} />
    </div>
  );
};

export default NeonLineChart;
