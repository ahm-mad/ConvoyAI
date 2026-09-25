// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';

const Acceleration = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic Smart Room v2021 (Water Leak)">
        <div className="p-4">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium">Acceleration</p>
            <span className="flex items-center space-x-2">
              <p className="text-4xl">-</p>
              <p className="text-ink-2">g</p>
            </span>
            <p className="text-md text-ink-2">Standard Gravity</p>
          </div>
        </div>
      </WidgetInitialDiv>
    </>
  );
};
export default Acceleration;
