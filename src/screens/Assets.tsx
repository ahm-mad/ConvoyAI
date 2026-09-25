/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Map as MapIcon,
  Layers as LayersIcon,
} from '@components/ui/icons';
import { useEffect, useState } from 'react';
import { Tree, ConfigProvider, theme as antdTheme } from 'antd';
import { useModal } from '@contexts/ModalContext';
import { useUser } from '@contexts/UserContext';
import { useTheme } from '@contexts/ThemeContext';
import CustomButton from '@components/Button';
import AddEditEntityModal from '@components/AddEditEntityModal';
import { transformForAntdTree, transformForWebglBuilding } from '@utils/DataFormatter';
import { IconMapper } from '@utils/IconMapper';
import FloorPlanEditor from '@components/FloorPlanEditor';
import BuildingMultiFloor3DViewer from '@components/BuildingMultiFloor3DViewer';
import FlowChart from '@components/FlowChart';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useTranslation } from 'react-i18next';
import { FaEye } from 'react-icons/fa';
import UnityControlBuilding from './WEBGLBUILDING';
import { get, del } from '@utils/apiHelper';
import Loader from '@components/Loader';
import { useSocket } from '@contexts/SocketContext';

export default function AssetTree() {
  const { t } = useTranslation();
  const { openModal } = useModal();
  const { user } = useUser();
  const { isLight } = useTheme();
  const { bindBuildingEvent, unbindBuildingEvent } = useSocket();
  const [selectedSubtree, setSelectedSubtree] = useState<any[]>([]);
  const [webglBuildingData, setWebglBuildingData] = useState<any>({});
  const [activeBuildingIdLoading, setActiveBuildingIdLoading] = useState<any>(null);
  const [showUnity, setShowUnity] = useState(false);
  const [unityReady, setUnityReady] = useState(false);

  const {
    data: treeData = [],
    isLoading,
    refetch,
  } = useSimpleQuery(
    'assets',
    `/api/assets`,
    {},
    {
      select: (response: any) => {
        if (response?.success) {
          return transformForAntdTree(response?.assets);
        }
        return [];
      },
    }
  );

  const { data: productData } = useSimpleQuery(`products`, `/api/products`, { user_id: user?.id });

  const openAddEditModal = (node: any, mode: string) => {
    console.log('node-mode', node, mode);
    openModal(
      <AddEditEntityModal mode={mode} node={node} onSave={refetch} productData={productData} />
    );
  };

  const handleDelete = async (node: any) => {
    try {
      const url = node?.isTopMost
        ? `/api/assets/${node.data.id}`
        : `/api/components/${node.data.id}`;
      await del(url);
      refetch();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleSelect = (selectedKeys: any, { node }: any) => {
    if (!node) return;
    const extractSubtree = (root: any): any => ({
      ...root.data,
      key: root.key,
      children: root.children ? root.children.map((child: any) => extractSubtree(child)) : [],
    });
    setSelectedSubtree([extractSubtree(node)]);
  };

  const handleFullScreen = () => {
    const wrapper = document.getElementById('unity-wrapper');
    if (wrapper?.requestFullscreen) {
      wrapper.requestFullscreen();
    }
  };

  function handleBuildingLiveValues(data: any) {
    // building:update (api_contract §4.2/§4.3) — { buildingId, deviceId, deviceIdentifier, asset }.
    // `asset` is the identical formatted tree Laravel/Pusher sent (same shape as GET /assets/{id}),
    // just no longer wrapped in buildingAssetData / status / message / userId — those are gone, not
    // renamed, so there's nothing to branch on before reading `asset` (SocketContext already filtered
    // this call to our buildingId).
    console.log('socket-building-data', data);
    const transformedData = transformForWebglBuilding(data?.asset?.children);
    setWebglBuildingData({
      assetId: data?.asset?.id,
      assetName: data?.asset?.name,
      transformedData,
    });
  }

  async function fetchWebglBuildingData(id: any) {
    setActiveBuildingIdLoading(id);
    const response = await get(`/api/assets/${id}`);
    // return
    // console.log('bacha', response);
    if (response?.success) {
      const transformedData = transformForWebglBuilding(response?.asset?.children);
      // console.log('bacha1', {
      //   assetId: response?.asset?.id,
      //   assetName: response?.asset?.name,
      //   transformedData,
      // });
      setWebglBuildingData({
        assetId: response?.asset?.id,
        assetName: response?.asset?.name,
        transformedData,
      });
      // setActiveBuildingIdLoading(null);
      bindBuildingEvent(id, handleBuildingLiveValues);
      setShowUnity(true);
      handleFullScreen();
    }
    setActiveBuildingIdLoading(null);
  }

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setShowUnity(false);
        webglBuildingData?.assetId ? unbindBuildingEvent(webglBuildingData?.assetId) : null;
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  console.log('transformed-tree-data', treeData);

  return (
    <div className="p-3 sm:p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h2 className="text-ink-0 text-base sm:text-lg font-semibold font-display">
          {t('assets.manageAssets')}
        </h2>
        {!user?.isDemo && (
          <CustomButton onClick={() => openAddEditModal(null, 'addAsset')}>
            + {t('assets.addAssets')}
          </CustomButton>
        )}
      </div>

      {/* Tree + Flowchart */}
      <div className="flex flex-col lg:flex-row w-full gap-3">
        {/* Tree Section */}
        <div className="w-full lg:w-[30vw] overflow-auto h-[50vh] lg:h-[70vh] border border-line rounded-xl p-2 bg-surface-1">
          <ConfigProvider
            theme={{
              algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
              token: {
                colorPrimary: '#29d3ff',
                colorBgContainer: 'transparent',
                colorBgElevated: isLight ? '#ffffff' : '#0e1422',
                colorBorder: isLight ? '#e1e6ee' : '#1c2536',
                colorText: isLight ? '#121826' : '#f2f5fa',
                colorTextSecondary: isLight ? '#5c6779' : '#9aa5ba',
                borderRadius: 4,
              },
            }}
          >
            <Tree
              treeData={treeData as any}
              showLine={{ showLeafIcon: false }}
              defaultExpandAll={false}
              onSelect={handleSelect}
              switcherIcon={({ expanded }: any) =>
                expanded ? (
                  <ExpandMoreIcon className="text-ink-2 !w-4 !h-6" />
                ) : (
                  <ChevronRightIcon className="text-ink-2 !w-4 !h-6" />
                )
              }
              titleRender={(node: any) => (
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                  {(IconMapper as any)[node.icon] && (
                    <span className="text-ink-1 text-sm">{(IconMapper as any)[node.icon]}</span>
                  )}
                  <span className="text-xs sm:text-sm break-words text-ink-0">{node.title}</span>

                  <div className="flex items-center gap-1">
                    {user?.isDemo ? null : (
                      <>
                        {(node?.data?.inventory_check == '0' || node?.isTopMost) && (
                          <AddIcon
                            onClick={() => openAddEditModal(node, 'addChild')}
                            className="text-accent-cyan cursor-pointer hover:scale-110 transition !w-3 !h-3"
                          />
                        )}
                        <EditIcon
                          onClick={() => openAddEditModal(node, 'edit')}
                          className="text-warning cursor-pointer hover:scale-110 transition !w-3 !h-3"
                        />
                        {!node?.isTopMost && node?.data?.parent_id === null && (
                          <MapIcon
                            onClick={() =>
                              openModal(
                                <FloorPlanEditor
                                  componentId={node.data.id}
                                  componentName={node.title}
                                />
                              )
                            }
                            titleAccess="Floor Plan"
                            className="text-accent-cyan cursor-pointer hover:scale-110 transition !w-3 !h-3"
                          />
                        )}
                        <DeleteIcon
                          onClick={() => handleDelete(node)}
                          className="text-danger cursor-pointer hover:scale-110 transition !w-3 !h-3"
                        />
                      </>
                    )}

                    {/* {node?.isTopMost && (
                      <FaEye
                        fontSize="small"
                        style={{ fontSize: '11px' }}
                        className="cursor-pointer hover:scale-110 transition text-ink-1"
                        onClick={() => {
                          setUnityReady(true);
                          fetchWebglBuildingData(node?.id);
                        }}
                      />
                    )} */}
                    {node?.isTopMost && (
                      <LayersIcon
                        titleAccess="Building 3D (all floors)"
                        onClick={() =>
                          openModal(
                            <BuildingMultiFloor3DViewer
                              assetId={node.data.id}
                              buildingName={node.title}
                            />
                          )
                        }
                        className="text-accent-cyan cursor-pointer hover:scale-110 transition !w-3 !h-3"
                      />
                    )}
                    {node?.isTopMost && activeBuildingIdLoading == node?.id && <Loader />}
                  </div>
                </div>
              )}
            />
          </ConfigProvider>
        </div>

        {/* Flowchart Section */}
        <div className="w-full lg:w-[70vw] h-[50vh] lg:h-[70vh] border border-line rounded-xl overflow-hidden bg-surface-1">
          <FlowChart data={selectedSubtree} />
        </div>
      </div>

      {/* Unity (always mounted, just hidden) */}
      {unityReady && (
        <div className={`${showUnity ? 'block' : 'hidden'}`}>
          <UnityControlBuilding webglBuildingData={webglBuildingData} />
        </div>
      )}
    </div>
  );
}
