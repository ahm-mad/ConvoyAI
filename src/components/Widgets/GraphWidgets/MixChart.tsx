// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect } from 'react';
import Chart from 'react-apexcharts';
import { useTheme } from '@contexts/ThemeContext';

const MixChart = ({ widgetId, individualGraphData, isGraphLoading, fetchGraphData }) => {
  const { isLight } = useTheme();
  const [backendData, setBackendData] = useState({ xAxis: [], series: [] });
  const [selectedFilter, setSelectedFilter] = useState({ label: 'D', value: 'daily' });

  useEffect(() => {
    if (!Array.isArray(individualGraphData) || individualGraphData.length === 0) {
      return;
    }

    console.log('Processing data:', individualGraphData);

    // Extract x-axis data from the first item's data object
    const xAxisData = individualGraphData?.[0]?.data
      ? Object.keys(individualGraphData[0].data)
      : [];

    // Extract y-axis data for each series
    const yAxisData = individualGraphData?.map(ws => ({
      name: ws?.yAxisTitle || ws?.attribute || '',
      type: ws?.graph_type || 'line',
      color: ws?.text_color || '#29d3ff',
      yAxisId: ws?.widget_setting || '',
      yAxisTitle: `${ws?.yAxisTitle || ''} ${ws?.unit || ''}`.trim(),
      data: ws?.data ? Object.values(ws.data) : [],
    }));

    const formattedGraphData = {
      xAxis: xAxisData,
      series: yAxisData,
    };

    console.log('Formatted data:', formattedGraphData);
    setBackendData(formattedGraphData);
  }, [individualGraphData]);

  // Create Y-axes config dynamically
  const uniqueYAxis = [];
  const yAxisMap = new Map();

  backendData?.series?.forEach((s, idx) => {
    if (!yAxisMap.has(s.yAxisId)) {
      yAxisMap.set(s.yAxisId, uniqueYAxis.length);
      uniqueYAxis.push({
        id: s.yAxisId,
        seriesName: s.name,
        title: { text: s.yAxisTitle },
        opposite: uniqueYAxis.length % 2 === 1,
        labels: {
          style: { colors: s.color },
        },
        axisTicks: { show: true },
        axisBorder: {
          show: true,
          color: s.color,
        },
      });
    }
  });

  const options = {
    chart: {
      type: 'line',
      stacked: false,
      height: 350,
      toolbar: { show: false },
      background: 'transparent',
    },
    theme: {
      mode: isLight ? 'light' : 'dark',
    },
    grid: {
      borderColor: isLight ? '#e5e8eb' : '#22282e',
    },
    stroke: {
      width: backendData?.series?.map(s => (s.type === 'line' ? 3 : 0)),
      curve: 'smooth',
    },
    plotOptions: {
      bar: {
        columnWidth: '25%',
      },
    },
    colors: backendData?.series?.map(s => s.color),
    xaxis: {
      categories: backendData?.xAxis,
      labels: {
        rotate: -45,
        style: { colors: isLight ? '#4c545c' : '#8b95a1' },
      },
    },
    yaxis: uniqueYAxis,
    legend: {
      position: 'top',
      labels: { colors: isLight ? '#4c545c' : '#8b95a1' },
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: isLight ? 'light' : 'dark',
    },
  };

  const formattedSeries = backendData?.series?.map(s => ({
    name: s.name,
    type: s.type,
    data: s.data,
    yAxis: s.yAxisId,
  }));

  function handleIntervalChange(selectedInterval) {
    setSelectedFilter(selectedInterval);
    const payload = { [widgetId]: selectedInterval.value };
    fetchGraphData(payload);
  }

  const handleDownload = () => {
    console.log('Download clicked');
  };

  return (
    <div className="rounded-md">
      <div className="flex justify-center mb-4">
        <div className="flex items-center bg-surface-2 rounded-md p-1 space-x-1">
          {[
            { label: 'D', value: 'daily' },
            { label: 'W', value: 'weekly' },
            { label: 'M', value: 'monthly' },
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => handleIntervalChange(filter)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                selectedFilter.value === filter.value
                  ? 'bg-surface-1 text-ink-0 cursor-pointer'
                  : 'text-ink-2 hover:text-ink-0 cursor-pointer hover:bg-surface-1'
              }`}
            >
              {filter.label}
            </button>
          ))}

          <button
            onClick={handleDownload}
            className="ml-2 px-[10px] cursor-pointer py-[6px] brand-gradient-bg on-gradient rounded-md hover:brightness-110 transition-all"
          >
            <svg
              className="w-4 h-4"
              stroke="currentColor"
              fill="currentColor"
              strokeWidth="0"
              viewBox="0 0 24 24"
              focusable="false"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M18.948 11.112C18.511 7.67 15.563 5 12.004 5c-2.756 0-5.15 1.611-6.243 4.15-2.148.642-3.757 2.67-3.757 4.85 0 2.757 2.243 5 5 5h1v-2h-1c-1.654 0-3-1.346-3-3 0-1.404 1.199-2.757 2.673-3.016l.581-.102.192-.558C8.153 8.273 9.898 7 12.004 7c2.757 0 5 2.243 5 5v1h1c1.103 0 2 .897 2 2s-.897 2-2 2h-2v2h2c2.206 0 4-1.794 4-4a4.008 4.008 0 0 0-3.056-3.888z"></path>
              <path d="M13.004 14v-4h-2v4h-3l4 5 4-5z"></path>
            </svg>
          </button>
        </div>
      </div>
      {isGraphLoading?.includes(widgetId) ? (
        <div className="text-ink-2 text-sm text-center py-8">Loading graph...</div>
      ) : (
        <Chart options={options} series={formattedSeries} type="line" height={400} />
      )}
    </div>
  );
};

export default MixChart;
