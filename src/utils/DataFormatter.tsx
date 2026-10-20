export const transformForAntdTree = data => {
  return data.map(item => {
    return {
      id: item.id,
      key: `${item.id}_${item.updated_at}`,
      title: item.name,
      icon: item.icon,
      isTopMost: !Object.keys(item).includes('parent_id'),
      data: item,
      children: item.children ? transformForAntdTree(item.children) : [],
    };
  });
};

export function getBreadcrumb(data, currentState, assetName = '') {
  const { view, id } = currentState;

  // Building view
  if (view == 'building') {
    return [{ id: id, name: assetName, isAsset: true }];
  }

  // Floor view
  if (view === 'floor') {
    const floor = data.floors.find(f => f.floorId == id);
    return floor ? [{ id: floor.floorId, name: floor.floorName, isAsset: false }] : [];
  }

  // Unit view
  if (view === 'unit') {
    for (const floor of data.floors) {
      const unit = floor.units.find(u => u.unitId == id);
      if (unit) {
        return [
          { id: floor.floorId, name: floor.floorName, isAsset: false },
          { id: unit.unitId, name: unit.unitName, isAsset: false },
        ];
      }
    }
    return [];
  }

  // Area view
  if (view === 'area') {
    for (const floor of data.floors) {
      for (const unit of floor.units) {
        const area = unit.areas.find(a => a.areaId == id);
        if (area) {
          return [
            { id: floor.floorId, name: floor.floorName, isAsset: false },
            { id: unit.unitId, name: unit.unitName, isAsset: false },
            { id: area.areaId, name: area.areaName, isAsset: false },
          ];
        }
      }
    }
    return [];
  }

  return [];
}
