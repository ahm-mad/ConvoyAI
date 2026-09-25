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

export const transformForWebglBuilding = data => {
  return {
    floors: (data || []).map(fl => ({
      floorId: fl.id,
      floorName: fl.name,
      numberOfUnits: fl.children?.length || 0,
      units: (fl.children || []).map(un => ({
        unitId: un.id,
        unitName: un.name,
        numberOfAreas: un.children?.length || 0,
        areas: (un.children || []).map(ar => ({
          areaId: ar.id,
          areaName: ar.name,
          sensors: (ar.children || []).map(si => ({
            id: si.id,
            Operations: Object.entries(si.latest_device_values || {}).map(([key, value]) => ({
              id: key,
              value: value,
              warning: si?.is_alert,
              // warning: (si.alert_attributes || []).includes(key),
              type: 'dummy',
              unit: 'dummy',
              widget: 'dummy',
              widgetstate: 'dummy',
            })),
          })),
        })),
      })),
    })),
  };
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
