// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';

const Ammeter = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic AC Switch">
        <div className="p-4">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium">Ammeter</p>
            <span className="flex items-center space-x-2">
              <p className="text-4xl">-</p>
              <p className="text-ink-2">A</p>
            </span>
            <p className="text-md text-ink-2">Ampere</p>
          </div>
        </div>
      </WidgetInitialDiv>
    </>
  );
};
export default Ammeter;
