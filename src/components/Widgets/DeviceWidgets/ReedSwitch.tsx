// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';

const ReedSwitch = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic Smart Room v2021 (Water Leak)">
        <div className="p-4">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium">Reed Switch</p>
            <p className="text-4xl">Magnet Present</p>
          </div>
        </div>
      </WidgetInitialDiv>
    </>
  );
};
export default ReedSwitch;
