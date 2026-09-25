// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GridStack } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';
import ChevronLeft from '@assets/icons/MUIicons/ChevronLeft';
import ChevronRight from '@assets/icons/MUIicons/ChevronRight';
import AddIcon from '../assets/icons/MUIicons/AddBtnIcon';
import Chevron from '../assets/icons/MUIicons/Chevron';
import { createRoot } from 'react-dom/client';
import { useParams, useLocation } from '@lib/router-compat';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useModal } from '@contexts/ModalContext';
import { get, post, put, del } from '@utils/apiHelper';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@contexts/SocketContext';
import { useUser } from '@contexts/UserContext';
import SpinLoader from './SpinLoader';
import { Widgets, Forms, getWidgetConfig } from '@utils/DynamicImport';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import WidgetDashboardDemo from '../ConvoyAIDemo/WidgetDashboardDemo';
import { isFirstDemo } from '@utils/DemoHelper';

const sampleDevices = [
  {
    name: 'Tektelic AC Switch',
    sensor: 'AC Switch',
    code: 'sim-f82f-12fb8-0fa6',
    type: 'deviceData',
  },
  {
    name: 'Tektelic Smart Room v2021 (Water Leak)',
    sensor: 'Smart Room Sensor',
    code: 'sim-f82f-12fb8-0fa6',
    type: 'deviceData',
  },
];

const Grid = () => {
  const { t } = useTranslation();
  const { id: dashboardID } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const { user } = useUser();
  const { bindDashboardEvent, unbindDashboardEvent } = useSocket();
  const gridRef = useRef(null);
  const gridInstance = useRef(null);
  const [newItems, setNewItems] = useState([]);
  const [activeTab, setActiveTab] = useState('devices');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRealTimeOpen, setIsRealTimeOpen] = useState(true);
  const [liveWidgetValues, setLiveWidgetValues] = useState([]);
  const [isVisualizationOpen, setIsVisualizationOpen] = useState(true);
  const [graphData, setGraphData] = useState({});
  const [isGraphDataLoading, setIsGraphDataLoading] = useState([]);
  const [products, setProducts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [isWidgetLoading, setIsWidgetLoading] = useState(false);
  const { openModal, closeModal } = useModal();
  const widgetConfig = getWidgetConfig();
  const [searchText, setSearchText] = useState('');

  const widgetRootsRef = useRef({});
  const [demoStart, setDemoStart] = useState(false);

  useEffect(() => {
    if (isFirstDemo('WidgetDashboardDemo')) {
      setDemoStart(false);
    }
  }, []);

  // Fetch products
  const {
    data: productData,
    // isLoading: isProductLoading,
    // refetch: productRefetch,
  } = useSimpleQuery(
    `products`,
    `/api/products`,
    { user_id: user?.id }
    // {enabled: !!user?.id},
    // { user_id: user?.id }
    // { refetchOnWindowFocus: true, staleTime: 0 }
  );

  // Fetch dashboard widgets data
  const {
    data: widgetData,
    isLoading,
    refetch,
  } = useSimpleQuery(
    `widgets-${dashboardID}`,
    `/api/dashboards/${dashboardID}`,
    {},
    {
      enabled: !!productData?.data?.data?.length > 0,
    }
    // { staleTime: 0 }
  );

  console.log('kdfhsdjhfska', productData);

  const fetchGraphData = async (passedPayload = null) => {
    const graphWidgets = widgetData?.widgets?.filter(widget => widget?.type == 'MixChart');
    const graphWidgetsPayload = {};

    graphWidgets?.forEach(widget => {
      graphWidgetsPayload[widget?.id] = widget?.widget_settings?.[0]?.graph_interval || 'daily';
    });
    const loadingGraphWidgets = passedPayload
      ? Object.keys(passedPayload)
      : Object.keys(graphWidgetsPayload);

    setIsGraphDataLoading(loadingGraphWidgets);
    const res = await post(
      '/api/widgets/graph-data',
      {
        graph_widget: passedPayload || graphWidgetsPayload,
      },
      {},
      false
    );
    if (res?.success) {
      if (passedPayload) {
        setGraphData(prev => ({
          ...prev,
          ...res.data,
        }));
      } else {
        setGraphData(res?.data);
      }
    }
    setIsGraphDataLoading([]);
  };

  useEffect(() => {
    const graphWidgets = widgetData?.widgets?.filter(widget => widget?.type == 'MixChart');

    if (graphWidgets?.length > 0) {
      fetchGraphData();
    }
  }, [widgetData]);

  useEffect(() => {
    if (!gridRef.current) return;

    if (!gridInstance.current) {
      gridInstance.current = GridStack.init(
        {
          float: true,
          cellHeight: 100,
          column: 12,
          minW: 2,
          minH: 2,
          animate: true,
          resizable: {
            handles: 'se, sw',
          },
        },
        gridRef.current
      );
    }
    gridInstance.current.removeAll();

    gridInstance.current.on('change', (_, passedUpdatedItems) => {
      setNewItems(
        passedUpdatedItems
          .map(el => {
            let id = el?.id || el.el?.getAttribute('id');
            id = id ? id : null;
            // id = id ? Number(id) : null;
            // if (isNaN(id)) {
            //   console.error('Invalid ID:', el.id);
            //   return null;
            // }

            const existingItem = widgetData?.widgets.find(item => item.id === id) || {};
            return {
              id,
              x: el.x,
              y: el.y,
              w: el.w,
              h: el.h,
              type: existingItem.type || null,
            };
          })
          .filter(Boolean)
      );
    });
  }, []);

  useEffect(() => {
    if (widgetData && gridInstance.current) {
      handleWidgetCreation();
    }
  }, [widgetData]);
  // useEffect(() => {
  //   const fetchedProducts = productData?.data?.data?.map(product => ({
  //     value: String(product.id),
  //     label: product.name,
  //   }));
  //   if (fetchedProducts) {
  //     console.log('usama-tiger', productData);
  //     setProducts(fetchedProducts);
  //   }
  //   console.log('qwerty', fetchedProducts);
  // }, [productData]);

  // Update widget positions in backend
  useEffect(() => {
    newItems.forEach(item => {
      put(
        `/api/widgets/${item.id}`,
        {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          type: item.type,
        },
        {},
        false
      );
    });
  }, [newItems]);

  useEffect(() => {
    if (dashboardID) {
      bindDashboardEvent(dashboardID, handleDashboardLiveValues);
    }

    return () => {
      if (dashboardID) {
        unbindDashboardEvent(dashboardID);
      }
    };
  }, [dashboardID]);

  function handleDashboardLiveValues(data) {
    // dashboard:update (api_contract §4.2/§4.3) — { dashboardId, widgets: [{ widgetId, values }] }.
    // Same `values` item shape (attribute_name/attribute_value/is_alert) as GET /dashboards/{id} and
    // the old Pusher payload; only the envelope changed (camelCase, id inside the payload, no more
    // dashboard_id/status/message/userId). SocketContext already filters to this dashboardId, but the
    // demo bridge shares one CustomEvent name for every dashboard, so this check is kept as a guard.
    console.log('Dashboard event socket:- ', data);
    if (String(data?.dashboardId) === String(dashboardID)) {
      setLiveWidgetValues(
        (data?.widgets ?? []).map(w => ({ widget_id: w.widgetId, values: w.values }))
      );
    }
  }

  // console.log('deewana widgetData-bahir', widgetData);

  useEffect(() => {
    if (!liveWidgetValues || !gridInstance.current || !widgetData) return;

    widgetData?.widgets?.forEach(widget => {
      const widgetId = String(widget.id);
      const root = widgetRootsRef.current[widgetId];
      const config = widgetConfig[widget.type];
      // console.log('deewana bahir0', widget);
      if (!root || !config?.component || widget?.widget_settings?.length == 0) return;

      // Socket.IO ids are strings (api_contract §4.2); GET /dashboards/{id}'s widget.id is a JSON
      // integer (api_contract §2) — compare as strings so a real live update isn't silently dropped.
      const liveValue =
        liveWidgetValues?.find(w => String(w?.widget_id) === String(widget.id))?.values ??
        widget?.values;
      const isAlert = liveValue?.some(v => v.is_alert) ?? false;
      const widgetSettings = widget?.widget_settings;
      const individualGraphData = graphData[`widget_${widget?.id}`] || graphData[widget?.id];
      console.log('deewana bahir1', widgetSettings);
      root.render(
        <Widgets.WidgetInitialDiv
          title={widget?.widget_settings?.[0]?.widget_name ?? config.title}
          openModal={() => {
            openModal(ShowFormWidget(widget));
          }}
          isAlert={isAlert}
        >
          <div className="widget-content">
            {React.createElement(config.component, {
              liveValue,
              isAlert,
              widgetSettings,
              widgetId,
              individualGraphData,
              isGraphDataLoading,
              fetchGraphData,
            })}
          </div>
        </Widgets.WidgetInitialDiv>
      );
    });
  }, [liveWidgetValues, widgetData, graphData]);

  const handlePlusButtonClick = widget => {
    const tempWid = {
      id: Date.now(),
      x: 0,
      y: 0,
      w: widget.w,
      h: widget.h,
      type: widget.type,
    };
    openModal(ShowFormWidget(tempWid, 'save'));
    setIsWidgetLoading(false);
  };

  function handleWidgetCreation() {
    if (!gridInstance.current || !widgetData) return;

    const existingIds = new Set(
      gridInstance.current.engine.nodes.map(node => String(node.el.getAttribute('id')))
    );

    widgetData?.widgets?.forEach(widget => {
      const widgetId = String(widget.id);
      if (existingIds.has(widgetId)) return;

      const config = widgetConfig[widget.type] || {
        title: 'Default Widget',
        component: null,
      };
      const widgetElement = document.createElement('div');
      const timestamp = `widget-${Date.now()}`;

      widgetElement.innerHTML = renderWidgetContent('initial', timestamp);
      widgetElement.setAttribute('id', widget.id);
      widgetElement.setAttribute('gs-x', widget.x);
      widgetElement.setAttribute('gs-y', widget.y);
      widgetElement.setAttribute('gs-w', widget.w);
      widgetElement.setAttribute('gs-h', widget.h);

      // ADDED: Widget-specific minimum constraints
      widgetElement.setAttribute('gs-min-w', config.minW || 2);
      widgetElement.setAttribute('gs-min-h', config.minH || 2);

      const placeholder = document.createElement('div');
      placeholder.className = 'widget-content';
      widgetElement.appendChild(placeholder);

      gridInstance.current.makeWidget(widgetElement);

      const root = createRoot(placeholder);
      widgetRootsRef.current[widgetId] = root;
      if (widget?.widget_settings?.[0]?.widget_name ?? config.component) {
        const widgetSettings = widget?.widget_settings;
        console.log('deewana bahir2', widgetSettings);
        root.render(
          <Widgets.WidgetInitialDiv
            title={config.title}
            openModal={() => {
              openModal(ShowFormWidget(widget));
            }}
          >
            <div className="widget-content">
              {React.createElement(config.component, { widgetSettings })}
            </div>
          </Widgets.WidgetInitialDiv>
        );
      } else {
        root.render(<div className="widget-content">Default Widget</div>);
      }
    });
  }

  const handleDragStart = (e, widget, type) => {
    e.dataTransfer.setData('widget', JSON.stringify({ ...widget, type }));
  };

  const handleDrop = e => {
    e.preventDefault();

    const widgetData = JSON.parse(e.dataTransfer.getData('widget'));
    if (!widgetData.type) {
      console.error('Dropped widget has no type!', widgetData);
      setIsWidgetLoading(false);
      return;
    }
    const tempWid = {
      id: Date.now(),
      x: 0,
      y: 0,
      w: widgetData.w,
      h: widgetData.h,
      type: widgetData.type,
    };
    openModal(ShowFormWidget(tempWid, 'save'));
    setIsWidgetLoading(false);
  };

  const renderWidgetContent = (type, timestamp = `widget-${Date.now()}`) => {
    return `<div id="${timestamp}" ${type === 'initial' ? '' : `class="widget-content"`}></div>`;
  };

  // Modal for widget creation/editing
  const ShowFormWidget = async (tempWid, formType = 'edit') => {
    setIsWidgetLoading(true);

    const isMobile = () => window.innerWidth < 640;

    const handleModalSubmit = async (tempWid, formData) => {
      const config = widgetConfig[tempWid.type];

      const widgetCreationResponse = await post(`/api/widgets`, {
        dashboard_id: dashboardID,
        x: tempWid.x,
        y: tempWid.y,
        w: tempWid.w,
        h: tempWid.h,
        type: tempWid.type,
        device_id: formData?.device,
      });

      if (!widgetCreationResponse?.success) {
        setIsWidgetLoading(false);
        return closeModal();
      }

      post(`/api/widgets/${widgetCreationResponse?.data?.id}/settings`, formData, {}, false).then(
        res => refetch()
      );
      const widgetId = widgetCreationResponse?.data?.id;
      tempWid.id = widgetId;

      const timeStampId = `widget-${Date.now()}`;
      const widgetElement = document.createElement('div');
      widgetElement.innerHTML = renderWidgetContent('submit', timeStampId);
      widgetElement.setAttribute('id', `${widgetId}`);
      widgetElement.setAttribute('gs-x', tempWid.x);
      widgetElement.setAttribute('gs-y', tempWid.y);
      widgetElement.setAttribute('gs-w', tempWid.w);
      widgetElement.setAttribute('gs-h', tempWid.h);

      // ADDED: Min/max constraints for new widgets
      widgetElement.setAttribute('gs-min-w', config.minW || 2);
      widgetElement.setAttribute('gs-min-h', config.minH || 2);
      if (config.maxW) widgetElement.setAttribute('gs-max-w', config.maxW);
      if (config.maxH) widgetElement.setAttribute('gs-max-h', config.maxH);

      gridInstance.current.makeWidget(widgetElement);

      const placeholder = widgetElement.querySelector(`#${timeStampId}`);
      if (placeholder) {
        const root = createRoot(placeholder);
        widgetRootsRef.current[widgetId] = root;

        if (config.component) {
          const widgetSettings = formData?.sections || formData?.widget_settings;
          console.log('deewana bahir3', formData);
          root.render(
            <Widgets.WidgetInitialDiv
              title={formData?.widget_name ?? config.title}
              openModal={() => {
                openModal(ShowFormWidget(tempWid));
              }}
            >
              <div className="widget-content">
                {React.createElement(config.component, { widgetSettings })}
              </div>
            </Widgets.WidgetInitialDiv>
          );
        } else {
          root.render(<div className="widget-content">Default Widget</div>);
        }
      }
      closeModal();
      setIsWidgetLoading(false);

      if (isMobile()) {
        setIsSidebarOpen(false);
      }
    };

    let incomingWidget = {};
    if (formType === 'edit') {
      const widgetFormDataResponse = await get(`/api/widgets/${tempWid?.id}`);
      if (widgetFormDataResponse?.success) {
        incomingWidget = widgetFormDataResponse?.data;
      }
      setIsWidgetLoading(false);
    }

    async function editForm(formData, incomingWidget) {
      const updatedSettings = formData.widget_settings.map((setting, index) => ({
        ...setting,
        id: incomingWidget?.widget_settings?.[index]?.id,
      }));

      const widgetEditFormDataResponse = await put(`/api/widget-settings/${incomingWidget?.id}`, {
        ...formData,
        widget_settings: updatedSettings,
      });

      if (widgetEditFormDataResponse?.success) {
        refetch();
        closeModal();
        if (isMobile()) setIsSidebarOpen(false);
      }

      setIsWidgetLoading(false);
    }

    async function handleDeleteWidget() {
      const widgetDeleteResponse = await del(`/api/widgets/${tempWid?.id}`);
      if (widgetDeleteResponse?.success) {
        closeModal();
        const widgetId = String(tempWid?.id);
        const widgetEl = gridInstance.current
          ?.getGridItems()
          .find(el => el.getAttribute('id') === widgetId);
        if (widgetEl) {
          gridInstance.current.removeWidget(widgetEl);
        }
        refetch();

        if (isMobile()) {
          setIsSidebarOpen(false);
        }
      }
    }

    const handleSubmit = async formData => {
      if (formType === 'edit') {
        // const incomingWidget = incomingWidget;
        editForm(formData, incomingWidget);
      } else {
        handleModalSubmit(tempWid, formData);
      }
    };

    const config = widgetConfig[tempWid?.type];
    if (!config || !config.form) {
      return (
        <div>
          <h1>Something Wrong!!!</h1>
        </div>
      );
    }
    const fetchedProducts = productData?.data?.data?.map(product => ({
      value: String(product.id),
      label: product.name,
    }));

    return React.createElement(config.form, {
      onClose: closeModal,
      incomingWidget: formType === 'edit' ? incomingWidget : null,
      handleModalSubmit: handleSubmit,
      handleDeleteWidget: handleDeleteWidget,
      products: fetchedProducts ?? [],
      devices: devices,
      attributes: attributes,
      setProducts: () => {},
      setDevices: setDevices,
      setAttributes: setAttributes,
    });
  };

  const filteredWidgets = useMemo(() => {
    const getWidgetsByCategory = category => {
      return Object.entries(widgetConfig)
        .filter(([_, config]) => config.category === category)
        .filter(([_, config]) => config.title.toLowerCase().includes(searchText.toLowerCase()))
        .map(([type, config]) => ({
          name: config.title,
          type: type,
          w: config.w,
          h: config.h,
        }));
    };

    return {
      realtime: getWidgetsByCategory('realtime'),
      visualization: getWidgetsByCategory('visualization'),
    };
  }, [widgetConfig, searchText]);

  const clearSearch = () => {
    setSearchText('');
  };

  console.log('products-sbse0bahire', products);

  return (
    <>
      {demoStart && (
        <WidgetDashboardDemo
          handlePlusButtonClick={handlePlusButtonClick}
          filteredWidgets={filteredWidgets}
        />
      )}
      {isWidgetLoading && <SpinLoader />}
      <div
        className={`min-w-full relative max-w-screen overflow-hidden ${searchParams.get('lock') == 'true' ? 'pointer-events-none cursor-not-allowed' : ''} flex `}
      >
        <div
          className={`p-[10px] full transition-all duration-300 ease-in-out flex-1 min-h-[700px]`}
          ref={gridRef}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        ></div>

        <div
          className={`transition-all ease-in-out duration-300 ${
            isSidebarOpen ? 'translate-x-0 w-[300px]' : 'translate-x-full w-0'
          } text-center max-sm:absolute max-sm:h-full h- max-sm:w-[100vw] max-sm:border-line z-100 max-sm-overflow-y-auto max-sm:shadow-none max-sm:p-[10px] max-sm:px-1 max-sm:border-l flex flex-col p-[10px] px-1 bg-surface-1 border-l border-line overflow-y-auto`}
        >
          <div className="flex flex-col gap-[10px]">
            <div
              className={`ml-2 mr-2 space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
                isRealTimeOpen ? 'max-h-[1000px]' : 'max-h-0'
              }`}
            >
              <div className="mb-4 relative">
                <div className="relative w-fit">
                  <input
                    id="das-title"
                    type="text"
                    placeholder={t('SideBar.device_search_placeholder')}
                    value={searchText ?? ''}
                    onChange={e => setSearchText(e.target.value)}
                    className="h-[34px] w-[268px] max-sm:w-[90vw] text-sm rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-ink-0 placeholder:text-xs placeholder:text-ink-2 placeholder:opacity-100 transition-all duration-200 ease-in-out outline-none focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/15 focus:ring-offset-0"
                  />
                  {searchText && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-ink-2 cursor-pointer hover:text-ink-0 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {filteredWidgets.realtime.length > 0 && (
                <div>
                  <div
                    className={`w-fit space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
                      isRealTimeOpen ? 'max-h-[1000px]' : 'max-h-0'
                    }`}
                  >
                    {filteredWidgets.realtime.map((widget, index) => (
                      <div
                        key={index}
                        className="widget flex justify-between items-center text-sm w-[270px] max-sm:w-[90vw] font-medium p-2.5 bg-surface-2 border border-line-soft hover:border-line rounded-md transition-colors"
                      >
                        <div
                          id="drg-widgets"
                          className="flex items-center flex-1 cursor-move"
                          draggable
                          onDragStart={e =>
                            handleDragStart(e, { w: widget.w, h: widget.h }, widget.type)
                          }
                        >
                          <p className="text-ink-1 mr-2">{widget.name}</p>
                        </div>

                        <button
                          onClick={() => handlePlusButtonClick(widget)}
                          className="bg-accent-green hover:brightness-110 max-sm:flex hidden transition-all cursor-pointer rounded-full w-8 h-8 items-center justify-center ml-2"
                        >
                          <div className="on-gradient">
                            <AddIcon size="small" />
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {activeTab === 'devices' && (
              <>
                <div
                  className={`w-fit space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
                    isVisualizationOpen ? 'max-h-[1000px]' : 'max-h-0'
                  }`}
                >
                  {filteredWidgets.visualization.length > 0 && (
                    <div>
                      <div
                        className={`ml-2 mr-2 space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
                          isVisualizationOpen ? 'max-h-[1000px]' : 'max-h-0'
                        }`}
                      >
                        {filteredWidgets.visualization.map((widget, index) => (
                          <div
                            key={index}
                            className="widget flex justify-between items-center text-sm w-[270px] max-sm:w-[90vw] font-medium p-2.5 bg-surface-2 border border-line-soft hover:border-line rounded-md transition-colors"
                          >
                            <div
                              className="flex items-center flex-1 cursor-move"
                              draggable
                              onDragStart={e =>
                                handleDragStart(e, { w: widget.w, h: widget.h }, widget.type)
                              }
                            >
                              <p className="text-ink-1 mr-2">{widget.name}</p>
                            </div>

                            <button
                              onClick={() => handlePlusButtonClick(widget)}
                              className="bg-accent-green hover:brightness-110 max-sm:flex hidden transition-all cursor-pointer rounded-full w-8 h-8 items-center justify-center ml-2"
                            >
                              <div className="on-gradient">
                                <AddIcon size="small" />
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {searchText &&
                  filteredWidgets.realtime.length === 0 &&
                  filteredWidgets.visualization.length === 0 && (
                    <div className="text-center py-8 text-ink-2">
                      <p>No widgets found </p>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        <button
          className="fixed bottom-20 right-4 z-1000 brand-gradient-bg on-gradient transition-transform duration-300 p-4 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:brightness-110"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          {isSidebarOpen ? <ChevronRight size="large" /> : <AddIcon size="large" />}
        </button>
      </div>
    </>
  );
};

export default Grid;
