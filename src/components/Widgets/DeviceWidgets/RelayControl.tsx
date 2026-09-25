// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';
import ToggleBtn from '@forms/FormComponents/ToggleBtn';

const RelayControl = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic AC Switch">
        <div className="p-4">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium">Relay Control</p>
            <ToggleBtn className="mt-4" />
          </div>
        </div>
      </WidgetInitialDiv>
    </>
  );
};
export default RelayControl;
