// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';

const EnergyConsumptionStatus = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic AC Switch">
        <div className="p-4">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium">Energy Consumption Meter Status</p>
            <p className="text-4xl">Idle (Stopped)</p>
          </div>
        </div>
      </WidgetInitialDiv>
    </>
  );
};

export default EnergyConsumptionStatus;
