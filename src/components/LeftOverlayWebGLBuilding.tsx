// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import {
  TriangleAlert,
  Flame,
  Droplet,
  Zap,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { widgetsIconMapper as widgets } from '@utils/IconMapper';
import NeonPieChart from './NeonPieChart';
import { get } from '@utils/apiHelper';

const SHOW_NEW_CODE = false;

const Data = [
  { id: '002', role: 'Security', name: 'Earl', status: 'On Duty' },
  { id: '003', role: 'Security', name: 'Jay', status: 'On Duty' },
  { id: '004', role: 'Security', name: 'Bill', status: 'On Duty' },
  { id: '005', role: 'Security', name: 'Rock', status: 'On Duty' },
];

const Alerts = [
  { message: 'Water Leak Detected', icon: Droplet },
  { message: 'Fire Alarm Triggered', icon: Flame },
  { message: 'Power Surge', icon: Zap },
  { message: 'Unauthorized Access', icon: ShieldAlert },
  { message: 'System Overload', icon: TriangleAlert },
];

const CameraData = [
  { deviceId: 'CameaRec6_U1', status: 'Alert' },
  { deviceId: 'CameaRec1_U2', status: 'Alert' },
  { deviceId: 'CameaRec7_U2', status: 'Alert' },
  { deviceId: 'CameaRec4_G4', status: 'Offline' },
  { deviceId: 'CameaRec5_G4', status: 'Offline' },
  { deviceId: 'CameaRec6_G4', status: 'Offline' },
];

const defaultChartData = [
  { chartData: [{ name: 'Online', value: 0, color: '#17d68c' }], total: '0', label: 'Online' },
  { chartData: [{ name: 'Offline', value: 30, color: '#f5a623' }], total: '30', label: 'Offline' },
  { chartData: [{ name: 'Alert', value: 3, color: '#ff3b5c' }], total: '3', label: 'Alert' },
];

const alternativeChartData = [
  { chartData: [{ name: 'Online', value: 67, color: '#17d68c' }], total: '67', label: 'Online' },
  { chartData: [{ name: 'Offline', value: 15, color: '#f5a623' }], total: '15', label: 'Offline' },
  { chartData: [{ name: 'Alert', value: 8, color: '#ff3b5c' }], total: '8', label: 'Alert' },
];

export default function LeftOverlayWebGLBoat({ webglBuildingData, dataFromUnity }) {
  const [currentChartData, setCurrentChartData] = useState([
    { chartData: [{ name: 'Online', value: 0, color: '#17d68c' }], total: '0', label: 'Online' },
    {
      chartData: [{ name: 'Offline', value: 0, color: '#f5a623' }],
      total: '0',
      label: 'Offline',
    },
    { chartData: [{ name: 'Alert', value: 0, color: '#ff3b5c' }], total: '0', label: 'Alert' },
  ]);
  const [devicesTableData, setDevicesTableData] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);

  // Search and pagination state
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(3);
  const [totalDevices, setTotalDevices] = useState(0);
  const searchRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const handleClickOutside = event => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearch(false);
      }
    };

    if (showSearch) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSearch]);

  const totalPages = Math.ceil(totalDevices / itemsPerPage);

  // Reset to first page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const toggleRow = index => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  const goToPage = page => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Pie chart data
  useEffect(() => {
    if (dataFromUnity?.clickedNodeId) {
      (async () => {
        const res = await get(`/api/assets/${dataFromUnity?.clickedNodeId}/status-summary`);
        console.log('pie-chart-api-response', res);
        if (res.success) {
          setCurrentChartData([
            {
              chartData: [{ name: 'Online', value: res?.online_devices ?? 0, color: '#17d68c' }],
              total: String(res?.online_devices ?? 0),
              label: 'Online',
            },
            {
              chartData: [{ name: 'Offline', value: res?.offline_devices ?? 0, color: '#f5a623' }],
              total: String(res?.offline_devices ?? 0),
              label: 'Offline',
            },
            {
              chartData: [{ name: 'Alert', value: res?.alerts_last_24h ?? 0, color: '#ff3b5c' }],
              total: String(res?.alerts_last_24h ?? 0),
              label: 'Alert',
            },
          ]);
        }
      })();
    }
  }, [dataFromUnity?.clickedNodeId, dataFromUnity?.currentView]);

  useEffect(() => {
    if (dataFromUnity?.clickedNodeId) {
      (async () => {
        const apiPath =
          dataFromUnity?.currentView == 'parent'
            ? `/api/devices/${dataFromUnity?.clickedNodeId}?type=asset&page=${currentPage}&per_page=${itemsPerPage}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''}`
            : `/api/devices/${dataFromUnity?.clickedNodeId}?type=component&page=${currentPage}&per_page=${itemsPerPage}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''}`;
        const res = await get(apiPath);
        console.log('devices-table-api-response', res);
        if (res.success) {
          setDevicesTableData(res?.devices);
          setTotalDevices(res?.pagination?.total || 0);
        }
      })();
    }
  }, [
    dataFromUnity?.clickedNodeId,
    dataFromUnity?.currentView,
    searchTerm,
    currentPage,
    itemsPerPage,
  ]);

  return (
    <div className="absolute top-0 left-0 w-[35%] sm:w-[30%] md:w-[26.5%] lg:w-[24%] xl:w-[20%] 2xl:w-[18%] h-full z-10">
      {/* Hidden scrollbar but scrollable */}
      <div
        className="h-full  bg-transparent border-r border-white/20 backdrop-blur-md shadow-xl p-4 text-white flex flex-col overflow-y-scroll"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <style>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          } right
          
          .hide-scrollbar {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          
          .accordion-content {
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), 
                        opacity 0.3s ease-in-out,
                        padding 0.3s ease-in-out;
          }
          
          .accordion-content.expanded {
            max-height: 500px;
            opacity: 1;
            padding: 12px 0;
          }
          
          .accordion-row {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .accordion-row:hover {
            background-color: rgba(41, 211, 255, 0.08);
            transform: translateX(2px);
            box-shadow: inset 3px 0 0 rgba(41, 211, 255, 0.5);
          }
          
          .chevron-icon {
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .chevron-icon.rotated {
            transform: rotate(180deg);
          }
          
          .widget-card {
            transition: all 0.3s ease-in-out;
            transform: translateY(10px);
            opacity: 0;
          }
          
          .widget-card.animate-in {
            transform: translateY(0);
            opacity: 1;
          }
          
          .widget-card:hover {
            transform: scale(1.05);
            background-color: rgba(41, 211, 255, 0.1);
            border-color: rgba(41, 211, 255, 0.7);
          }
        `}</style>

        <h2 className="text-lg max-xl:text-sm max-lg:text-xs font-bold text-[#29d3ff] mb-4">
          Status Environment
        </h2>
        <h2 className="text-sm max-xl:text-2xs max-lg:text-[10px] font-bold text-[#29d3ff] mb-2">
          Active Device
        </h2>

        {/* Horizontal Charts Container */}
        <div className="flex gap-4 justify-between max-lg:flex-col mb-6">
          <div className="flex-1 max-w-[45%]">
            <NeonPieChart
              chartData={currentChartData[0].chartData}
              total={currentChartData[0].total}
              label={currentChartData[0].label}
              size={100}
              showTooltip={true}
              valueFontSize="10px"
              tooltipBg="rgba(0,0,0,0.7)"
              layoutDirection="column"
            />
          </div>
          <div className="flex-1 max-w-[45%]">
            <NeonPieChart
              chartData={currentChartData[1].chartData}
              total={currentChartData[1].total}
              label={currentChartData[1].label}
              size={100}
              showTooltip={true}
              valueFontSize="10px"
              tooltipBg="rgba(0,0,0,0.7)"
              layoutDirection="column"
            />
          </div>
        </div>
        <div className="max-w-[45%]">
          <NeonPieChart
            chartData={currentChartData[2].chartData}
            total={currentChartData[2].total}
            label={currentChartData[2].label}
            size={100}
            showTooltip={true}
            valueFontSize="12px"
            tooltipBg="rgba(0,0,0,0.7)"
            layoutDirection="column"
          />
        </div>

        <div className="flex flex-col gap-2 mt-8">
          {SHOW_NEW_CODE ? (
            <div className="min-h-screen text-white font-sans">
              <h2 className="text-lg font-bold mb-2 text-[#29d3ff]">Attributes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                {widgets.map((w, i) => (
                  <div key={i} className="rounded-2xl p-4 border border-[#29d3ff]/30 transition">
                    <div className="text-2xl mb-2 flex items-center justify-center h-8">
                      {typeof w?.icon === 'string' ? w?.icon : w?.icon}
                    </div>
                    <div className="text-sm whitespace-normal text-center leading-tight text-gray-300">
                      {w?.label}
                    </div>
                    <div className="text-sm text-center text-[#29d3ff]/85">{w.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Responsive Search Bar */}
              <div
                className="flex items-center  justify-between w-full relative rounded-lg  py-1"
                ref={searchRef}
              >
                {!showSearch && (
                  <h3 className=" text-xs md:text-sm font-semibold text-[#29d3ff]/85 whitespace-nowrap">
                    Device List
                  </h3>
                )}

                <div className="relative flex-1  overflow-hidden">
                  <input
                    type="text"
                    placeholder="Search devices..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus={showSearch}
                    className={`pl-3 md:pl-4 pr-8 md:pr-10 py-1.5 md:py-2 text-xs md:text-sm bg-transparent border border-accent-cyan/30 rounded-lg text-white placeholder-gray-400
                      focus:outline-none focus:border-[#29d3ff]
                      transition-all duration-500 ease-in-out
                      ${showSearch ? 'w-full opacity-100' : 'w-0 opacity-0'}
                    `}
                  />

                  <button
                    type="button"
                    onClick={() => setShowSearch(prev => !prev)}
                    className="absolute top-1/2 right-2 md:right- -translate-y-1/2 cursor-pointer text-gray-400 hover:text-[#29d3ff] transition-all"
                  >
                    <Search className="w-3 h-3 md:w-4 md:h-4" />
                  </button>
                </div>
              </div>

              {/* Responsive Table */}
              <div className="backdrop-blur-sm  overflow-x-auto mt-1 hide-scrollbar">
                <table className="w-full text-xs md:text-sm text-left text-white">
                  <thead>
                    <tr>
                      <th className="py-2 px-2 md:px-3 text-[#29d3ff]/85 font-medium text-xs md:text-sm">
                        Name
                      </th>
                      <th className="py-2 px-2 md:px-3 text-[#29d3ff]/85 font-medium text-xs md:text-sm">
                        Status
                      </th>
                      <th className="py-2 px-1 text-[#29d3ff]/85 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {devicesTableData?.length > 0 ? (
                      devicesTableData?.map((device, index) => {
                        const deviceStatus = (() => {
                          if (device?.attributes?.some(a => a.isAlert === true)) {
                            return 'Alert';
                          }

                          if (device?.created_at) {
                            const createdAt = new Date(device.created_at);
                            const now = new Date();
                            const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

                            return hoursDiff > 2 ? 'Offline' : 'Online';
                          }

                          return 'Online';
                        })();

                        return (
                          <React.Fragment key={index}>
                            <tr
                              className={`accordion-row ${index % 2 === 0 ? 'bg-accent-cyan/10' : 'bg-accent-cyan/5'} border-b border-accent-cyan/20`}
                              onClick={() => {
                                console.log(
                                  'GOTOAREA-argument',
                                  `${device?.child_id_1}|${device?.child_id_2}|${device?.child_id_3}`
                                );
                                if (
                                  device?.child_id_1 &&
                                  device?.child_id_2 &&
                                  device?.child_id_3 &&
                                  device?.child_id_4
                                ) {
                                  window.gameInstance.SendMessage(
                                    'SpawningObjects',
                                    'GOTOAREA',
                                    `${device?.child_id_1}|${device?.child_id_2}|${device?.child_id_3}`
                                  );
                                }
                              }}
                            >
                              <td className="py-2 md:py-3 px-2 md:px-3 cursor-pointer text-white text-xs md:text-sm truncate max-w-[80px] md:max-w-[120px]">
                                {device?.name}
                              </td>
                              <td className="py-2 md:py-3 px-2 md:px-3">
                                <span
                                  className={`font-medium text-xs md:text-sm transition-colors duration-300 ${
                                    deviceStatus == 'Alert'
                                      ? 'text-danger-text'
                                      : deviceStatus == 'Online'
                                        ? 'text-accent-green'
                                        : 'text-orange-400'
                                  }`}
                                >
                                  {deviceStatus}
                                </span>
                              </td>
                              <td
                                className="py-2 md:py-3 px-1"
                                onClick={e => {
                                  e.stopPropagation(); // stops bubbling
                                  toggleRow(index);
                                }}
                              >
                                <ChevronDown
                                  className={`w-3 h-3 md:w-4 md:h-4 text-[#29d3ff]/85 chevron-icon ${expandedRow === index ? 'rotated' : ''}`}
                                />
                              </td>
                            </tr>
                            <tr>
                              <td colSpan="3" className="p-0">
                                <div
                                  className={`accordion-content ${expandedRow === index ? 'expanded' : ''}`}
                                >
                                  <div className="grid grid-cols-2 gap-2 md:gap-3 px-2">
                                    {device?.attributes?.map((attribute, attributeIndex) => {
                                      const IconComponent =
                                        widgets?.find(w => w.name === attribute.widgetType)?.icon ||
                                        (() => (
                                          <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-white/10 rounded">
                                            ❓
                                          </div>
                                        ));

                                      return (
                                        <div
                                          key={attributeIndex}
                                          className={`widget-card rounded-lg p-2 border border-[#29d3ff]/25 ${
                                            expandedRow === index ? 'animate-in' : ''
                                          }`}
                                          style={{
                                            animationDelay:
                                              expandedRow === index
                                                ? `${attributeIndex * 0.1}s`
                                                : '0s',
                                          }}
                                        >
                                          <div className="flex items-center justify-center mb-1 transition-transform duration-300">
                                            <IconComponent className="w-6 h-6 md:w-8 md:h-8 filter invert brightness-0" />
                                          </div>
                                          <div className="text-[10px] md:text-xs text-center text-gray-300 mb-1">
                                            {attribute.label}
                                          </div>
                                          <div className="text-[10px] md:text-xs text-center text-[#29d3ff]/85 font-medium">
                                            {`${attribute.last_packet_value} ${attribute.unit}`}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan="3"
                          className="py-6 md:py-8 text-center text-white text-xs md:text-sm"
                        >
                          No devices found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Responsive Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4 px-2">
                  <div className="text-[10px] md:text-xs text-white text-center sm:text-left">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                    {Math.min(currentPage * itemsPerPage, totalDevices)} of {totalDevices} devices
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`p-0.5 md:p-1 rounded transition-colors duration-300 ${
                        currentPage === 1
                          ? 'text-gray-500 cursor-not-allowed'
                          : 'text-[#29d3ff] hover:text-[#29d3ff]/85 hover:bg-accent-cyan/15'
                      }`}
                    >
                      <ChevronLeft className="w-3 h-3 md:w-4 md:h-4" />
                    </button>

                    {[...Array(totalPages)].map((_, index) => {
                      const page = index + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => goToPage(page)}
                          className={`px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs rounded transition-colors duration-300 ${
                            currentPage === page
                              ? 'bg-[#29d3ff] text-[#001820] font-medium'
                              : 'text-[#29d3ff] hover:text-[#29d3ff]/85 hover:bg-accent-cyan/15'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`p-0.5 md:p-1 rounded transition-colors duration-300 ${
                        currentPage === totalPages
                          ? 'text-gray-500 cursor-not-allowed'
                          : 'text-[#29d3ff] hover:text-[#29d3ff]/85 hover:bg-accent-cyan/15'
                      }`}
                    >
                      <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
