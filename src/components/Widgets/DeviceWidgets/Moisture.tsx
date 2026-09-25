// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';

const Moisture = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic Smart Room v2021 (Water Leak)">
        <div className="p-4">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium">Moisture</p>
            <p className="text-4xl">Dry</p>
          </div>
        </div>
      </WidgetInitialDiv>
    </>
  );
};

export default Moisture;
