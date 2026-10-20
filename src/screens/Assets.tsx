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
import { transformForAntdTree } from '@utils/DataFormatter';
import { IconMapper } from '@utils/IconMapper';
import FloorPlanEditor from '@components/FloorPlanEditor';
import BuildingMultiFloor3DViewer from '@components/BuildingMultiFloor3DViewer';
import FlowChart from '@components/FlowChart';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useTranslation } from 'react-i18next';
import { del } from '@utils/apiHelper';

export default function AssetTree() {
  const { t } = useTranslation();
  const { openModal } = useModal();
  const { user } = useUser();
  const { isLight } = useTheme();
  const [selectedSubtree, setSelectedSubtree] = useState<any[]>([]);

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
                          className="text-danger-text cursor-pointer hover:scale-110 transition !w-3 !h-3"
                        />
                      </>
                    )}

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
    </div>
  );
}
