import React from 'react';
import { TriangleAlert, Flame, Droplet, Zap, ShieldAlert } from 'lucide-react';
import tempIcon from '../assets/svg/temperature.svg';
import NeonPieChart from './NeonPieChart';
import { GiMilkCarton } from 'react-icons/gi';
import { SiApacheairflow } from 'react-icons/si';
import { FaCow, FaArrowUpFromWaterPump } from 'react-icons/fa6';
import { GoFlame } from 'react-icons/go';
import { LuMilk } from 'react-icons/lu';

const SHOW_NEW_CODE = true;

const Alerts = [
  { message: 'Water Leak Detected', icon: Droplet },
  { message: 'Fire Alarm Triggered', icon: Flame },
  { message: 'Power Surge', icon: Zap },
  { message: 'Unauthorized Access', icon: ShieldAlert },
  { message: 'System Overload', icon: TriangleAlert },
];

const CameraData = [
  { no: '1', deviceId: 'CameaRec6_U1', status: 'Alert' },
  { no: '2', deviceId: 'CameaRec1_U2', status: 'Alert' },
  { no: '3', deviceId: 'CameaRec7_U2', status: 'Alert' },
  { no: '4', deviceId: 'CameaRec4_G4', status: 'Offline' },
  { no: '5', deviceId: 'CameaRec5_G4', status: 'Offline' },
  { no: '6', deviceId: 'CameaRec6_G4', status: 'Offline' },
];

const widgets = [
  { label: 'Today’s Milk Output', value: '120 L', icon: <GiMilkCarton /> },
  {
    label: 'Body Temperature',
    value: '25.90 °C',
    icon: <img src={tempIcon} alt="temperature" className="w-12 h-12" />,
  },
  { label: 'Air Flow', value: '5–15 m³/s', icon: <SiApacheairflow /> },
  {
    label: 'Avg Rumination',
    value: '520 min/day',
    icon: <FaCow className="w-6 h-6 text-white" />,
  },
  { label: 'Cows in Heat', value: '5', icon: <GoFlame /> },
  { label: 'Avg Milk Fat', value: '3.8% fat', icon: <LuMilk /> },
];

const defaultChartData = [
  { chartData: [{ name: 'Online', value: 45, color: '#17d68c' }], total: '45', label: 'Online' },
  { chartData: [{ name: 'Offline', value: 30, color: '#f5a623' }], total: '30', label: 'Offline' },
  { chartData: [{ name: 'Alert', value: 3, color: '#ff3b5c' }], total: '3', label: 'Alert' },
];

const alternativeChartData = [
  { chartData: [{ name: 'Online', value: 5, color: '#17d68c' }], total: '5', label: 'Online Tags' },
  {
    chartData: [{ name: 'Offline', value: 3, color: '#f5a623' }],
    total: '3',
    label: 'Offline Tags',
  },
  { chartData: [{ name: 'Alert', value: 2, color: '#ff3b5c' }], total: '2', label: 'Alert' },
];

export default function LeftOverlayWebGL() {
  const currentChartData = SHOW_NEW_CODE ? alternativeChartData : defaultChartData;

  return (
    <div className="absolute top-0 left-0 w-[20%] h-full z-10">
      <div className="h-full bg-transparent border-r border-white/5 backdrop-blur-xl shadow-xl p-4 text-white flex flex-col">
        <h2 className="text-lg font-bold text-[#29d3ff] mb-4">Status Environment</h2>
        <h2 className="text-sm font-bold text-[#29d3ff] mb-2">Active Device</h2>

        {/* Charts */}
        <div className="flex gap-4 justify-between mb-6">
          {currentChartData.slice(0, 2).map((chart, idx) => (
            <div key={idx} className="flex-1 max-w-[45%]">
              <NeonPieChart
                chartData={chart.chartData}
                total={chart.total}
                label={chart.label}
                size={100}
                showTooltip
                valueFontSize="12px"
                tooltipBg="rgba(0,0,0,0.7)"
                layoutDirection="column"
              />
            </div>
          ))}
        </div>

        <div className="flex-1 max-w-[45%]">
          <NeonPieChart
            chartData={currentChartData[2].chartData}
            total={currentChartData[2].total}
            label={currentChartData[2].label}
            size={100}
            showTooltip
            valueFontSize="12px"
            tooltipBg="rgba(0,0,0,0.7)"
            layoutDirection="column"
          />
        </div>

        {/* Widgets or Alerts */}
        <div className="flex flex-col gap-2 mt-8">
          {SHOW_NEW_CODE ? (
            <div className="text-white font-sans">
              <h2 className="text-lg font-bold mb-2 text-[#29d3ff]">Device Name</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {widgets.map((w, i) => (
                  <div
                    key={i}
                    className="rounded-2xl bg-white/10 p-4 border border-[#29d3ff]/35 transition"
                  >
                    <div className="text-2xl mb-2 flex items-center justify-center h-8">
                      {w.icon}
                    </div>
                    <div className="text-sm text-gray-300">{w.label}</div>
                    <div className="text-sm text-[#29d3ff]/85">{w.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-[#29d3ff]/85 mb-2">Active Alerts</h3>
              {Alerts.map((alert, index) => {
                const Icon = alert.icon;
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-danger" />
                    <p className="text-sm text-white">{alert.message}</p>
                  </div>
                );
              })}

              {/* Camera Table */}
              <div className="backdrop-blur-sm overflow-hidden mt-6">
                <table className="w-full text-sm text-left text-white">
                  <thead>
                    <tr>
                      <th className="py-2 px-3 text-[#29d3ff]/85 font-medium">No.</th>
                      <th className="py-2 px-3 text-[#29d3ff]/85 font-medium">DeviceID</th>
                      <th className="py-2 px-3 text-[#29d3ff]/85 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CameraData.map((camera, index) => (
                      <tr
                        key={index}
                        className={`${index % 2 === 0 ? 'bg-accent-cyan/10' : 'bg-accent-cyan/5'} hover:bg-accent-cyan/15 transition-colors duration-200 border-b border-accent-cyan/20`}
                      >
                        <td className="py-2 px-3 text-white">{camera.no}</td>
                        <td className="py-2 px-3 text-white">{camera.deviceId}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`font-medium ${
                              camera.status === 'Alert' ? 'text-danger' : 'text-warning'
                            }`}
                          >
                            {camera.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
