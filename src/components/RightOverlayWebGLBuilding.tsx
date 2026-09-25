// src/components/RightOverlayWebGL.jsx
import React, { Suspense } from 'react';
import NeonPieChart from './NeonPieChart';
import NeonBarChart from './NeonBarChart';

const SHOW_NEW_VALUES = true;

export default function RightOverlayWebGL() {
  const defaultDataSet1 = [
    { name: '2021', value: 50, color: '#FF69B4' },
    { name: '2022', value: 45, color: '#00CED1' },
    { name: '2023', value: 30, color: '#8A2BE2' },
    { name: '2024', value: 20, color: '#FFD700' },
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
    { name: 'Occupied', value: 45, color: '#00FFFF' },
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

  const alternativeChartData = [
    { name: 'Occupied', value: 68, color: '#00FFFF' },
    { name: 'Empty', value: 22, color: '#FFA500' },
  ];

  // Choose datasets based on toggle
  const currentDataSet1 = SHOW_NEW_VALUES ? alternativeDataSet1 : defaultDataSet1;
  const currentDataSet2 = SHOW_NEW_VALUES ? alternativeDataSet2 : defaultDataSet2;
  const currentDataSet3 = SHOW_NEW_VALUES ? alternativeDataSet3 : defaultDataSet3;
  const currentChartData = SHOW_NEW_VALUES ? alternativeChartData : defaultChartData;

  return (
    <div className="absolute top-0 right-0 w-[35%] sm:w-[30%] md:w-[28%] lg:w-[24%] xl:w-[20%] 2xl:w-[18%] h-full z-10">
      <div className="h-full bg-transparent border-l border-white/5 backdrop-blur-xl shadow-xl p-3 md:p-4 text-white overflow-y-scroll overflow-x-scroll scrollbar-hide">
        <style jsx>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>

        <h2 className="text-sm md:text-base lg:text-lg font-bold text-[#29d3ff] mb-3 md:mb-3">
          Device Stats
        </h2>
        <h2 className="text-xs md:text-sm ml-2 md:ml-4 font-bold text-[#29d3ff] mb-2">Occupancy</h2>

        <div className="space-y-3  md:space-y-4 min-w-[200px]">
          {/* Occupancy Chart */}
          <div>
            <div className="ml-2 md:ml-4 scale-90 md:scale-100 origin-left">
              <NeonPieChart
                chartData={currentChartData}
                total="100"
                label="total"
                size={90}
                showTooltip={true}
                valueFontSize="11px"
                tooltipBg="rgba(0,0,0,0.7)"
                layoutDirection="row"
                legendPosition="right"
              />
            </div>
          </div>

          {/* Power Consumption */}
          <div className="w-full min-w-[180px]">
            <NeonBarChart
              chartData={currentDataSet1}
              title="Power Consumption"
              height={200}
              showLegend={false}
              width="100%"
              horizontal={false}
              distributed={true}
              barWidth="50%"
              unit="kW"
              showDataLabels={true}
            />
          </div>

          {/* Gas Consumption */}
          <div className="w-full min-w-[180px]">
            <NeonBarChart
              chartData={currentDataSet2}
              title="Gas Consumption"
              height={200}
              showLegend={false}
              width="100%"
              horizontal={false}
              distributed={true}
              barWidth="50%"
              unit="m³"
              showDataLabels={true}
            />
          </div>

          {/* Water Consumption */}
          <div className="w-full min-w-[180px]">
            <NeonBarChart
              chartData={currentDataSet3}
              title="Water Consumption"
              height={200}
              showLegend={false}
              width="100%"
              horizontal={false}
              distributed={true}
              barWidth="50%"
              unit="L"
              showDataLabels={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
