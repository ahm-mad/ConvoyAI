// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// src/components/RightOverlayWebGL.jsx
import React, { Suspense } from 'react';
// import NeonLineChart from './NeonLineChart';
import NeonPieChart from './NeonPieChart';
import NeonBarChart from './NeonBarChart';
import NeonLineChart from './NeonLineChart';
// import { NeonBarChart, NeonPieChart } from '@components/lazyComponents';

const SHOW_NEW_VALUES = true;

export default function RightOverlayWebGL() {
  const defaultDataSet1 = [
    { name: '2021', value: 50, color: '#FF69B4' },
    { name: '2022', value: 45, color: '#00CED1' },
    { name: '2023', value: 30, color: '#8A2BE2' },
    { name: '2024', value: 20, color: '#FFD700' },
  ];

  const categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  const series1 = [
    {
      name: 'Temperature',
      data: [23, 21, 46, 27, 24],
    },
    // {
    //   name: 'Humidity',
    //   data: [11, 45, 20, 95, 42],
    // },
  ];
  const series2 = [
    // {
    //   name: 'Temperature',
    //   data: [23, 21, 46, 27, 24],
    // },
    {
      name: 'Humidity',
      data: [11, 45, 20, 95, 42],
    },
  ];

  const defaultDataSet2 = [
    { name: '2021', value: 40, color: '#32CD32' },
    { name: '2022', value: 35, color: '#FF4500' },
    { name: '2023', value: 50, color: '#7B68EE' },
    { name: '2024', value: 25, color: '#20B2AA' },
  ];

  const defaultDataSet3 = [
    { name: '2021', value: 20, color: '#00FFFF' },
    { name: '2022', value: 25, color: '#DC143C' },
    { name: '2023', value: 40, color: '#FF8C00' },
    { name: '2024', value: 18, color: '#4B0082' },
  ];

  const defaultChartData = [
    { name: 'Occupied', value: 45, color: '#e50f17' },
    { name: 'Empty', value: 30, color: '#FFA500' },
  ];

  // Alternative datasets
  const alternativeDataSet1 = [
    { name: '2021', value: 75, color: '#FF69B4' },
    { name: '2022', value: 62, color: '#00CED1' },
    { name: '2023', value: 55, color: '#8A2BE2' },
    { name: '2024', value: 48, color: '#FFD700' },
  ];

  const alternativeDataSet2 = [
    { name: '2021', value: 65, color: '#32CD32' },
    { name: '2022', value: 58, color: '#FF4500' },
    { name: '2023', value: 72, color: '#7B68EE' },
    { name: '2024', value: 43, color: '#20B2AA' },
  ];

  const alternativeDataSet3 = [
    { name: '2021', value: 35, color: '#00FFFF' },
    { name: '2022', value: 42, color: '#DC143C' },
    { name: '2023', value: 58, color: '#FF8C00' },
    { name: '2024', value: 33, color: '#4B0082' },
  ];

  const weeklyMilkData = [
    { name: 'Week 1', value: 15.5, color: '#00f7ff' },
    { name: 'Week 2', value: 18.0, color: '#00e0ff' },
    { name: 'Week 3', value: 22.3, color: '#00caff' },
    { name: 'Week 4', value: 20.1, color: '#00b5ff' },
    // { name: 'Week 5', value: 24.7, color: '#009fff' },
  ];

  const alternativeChartData = [
    { name: 'normal', value: 4, color: '#00FFFF' },
    { name: 'Fever', value: 6, color: '#e50f17' },
  ];

  // Choose datasets based on toggle
  const currentDataSet1 = SHOW_NEW_VALUES ? alternativeDataSet1 : defaultDataSet1;
  const currentDataSet2 = SHOW_NEW_VALUES ? alternativeDataSet2 : defaultDataSet2;
  const currentDataSet3 = SHOW_NEW_VALUES ? alternativeDataSet3 : defaultDataSet3;
  const currentChartData = SHOW_NEW_VALUES ? alternativeChartData : defaultChartData;

  return (
    <div className="absolute top-0 right-0 w-[20%] h-full z-10">
      <div className="h-full bg-transparent border-l border-white/5 backdrop-blur-xl shadow-xl p-4 text-white">
        <h2 className="text-lg font-bold text-[#29d3ff]">Device Stats</h2>
        <div className="space-y-4 overflow-hidden">
          <div className="mt-4">
            {/* <h2 className="text-sm font-bold text-[#29d3ff] mb-3">occupancy</h2> */}
            <h2 className="text-sm font-bold text-[#29d3ff] mb-3">Health Status</h2>

            <NeonPieChart
              chartData={currentChartData}
              total="10"
              label="total"
              size={100}
              showTooltip={true}
              valueFontSize="12px"
              tooltipBg="rgba(0,0,0,0.7)"
              layoutDirection="row"
              legendPosition="right"
            />
          </div>

          <div className="overflow-hidden">
            {/* <NeonBarChart
              chartData={currentDataSet1}
              title="Power Consumption"
              height={200}
              showLegend={false}
              width={300}
              horizontal={false}
              distributed={true}
              barWidth="40%"
              unit="kW"
              showDataLabels={true}
            /> */}
            <NeonLineChart
              title="Avg Temperature "
              categories={['10:00', '11:00', '12:00', '13:00', '14:00', '15:00']}
              series={[
                {
                  name: 'Temperature',
                  data: [27.5, 28.1, 29.0, 30.2, 30.0, 28.9],
                },
              ]}
              min={20}
              max={35}
              unit="°C"
            />
          </div>

          <div className="overflow-hidden mb-4 ">
            {/* <NeonLineChart
              title="Milk Production (Daily)"
              categories={['12.04', '13.04', '14.04', '15.04', '16.04', '17.04', '18.04']}
              series={[
                {
                  name: 'Liters',
                  data: [180, 200, 190, 210, 220, 205, 195],
                },
              ]}
              min={150}
              max={250}
              unit="L"
            /> */}
            <NeonLineChart title=" Humidity" categories={categories} series={series2} />
            <NeonBarChart
              chartData={weeklyMilkData}
              title="Milk per Cow (Weekly Avg)"
              height={200}
              width={300}
              showLegend={false}
              horizontal={false}
              distributed={true}
              barWidth="40%"
              unit="L"
              showDataLabels={true}
            />
          </div>

          {/* <div className="overflow-hidden">
            <NeonBarChart
              chartData={currentDataSet3}
              title="Water Consumption"
              height={200}
              showLegend={false}
              width={300}
              horizontal={false}
              distributed={true}
              barWidth="40%"
              unit="L" // Water unit (Liters)
              showDataLabels={true}
            />
          </div> */}
        </div>
      </div>
    </div>
  );
}
