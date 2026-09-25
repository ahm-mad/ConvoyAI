// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import SelectReuseAble from '@components/Select';
// import Slider from "./Slider";
import FontSlider from './Slider';

function Misc_Settings() {
  const [TextPosition, setTextPosition] = useState('');

  const handleChange = event => {
    setTextPosition(event.target.value);
  };

  const Position = [
    { label: 'None', value: '' },
    { label: 'Right', value: 20 },
    { label: 'Left', value: 21 },
    { label: ' Center', value: 22 },
  ];

  return (
    <div className="mt-10">
      <h1 className="font-bold text-lg ">Misc Settings</h1>
      <div className="bg-gray-200 w-[752px]  border-1 border-gray-300 mt-4 rounded-xl shadow-sm h-[286px]">
        <div className="m-4">
          <div className="flex font-bold  text-[#393939] justify-between">
            <div className="ml-30">Text Position</div>
            <div className="flex  gap-4">
              <div>Text</div>
              <div>Backg.</div>
            </div>
          </div>
          <div className="flex mt-4 ">
            <div className="mt-5">Header Bar:</div>
            <div className="ml-7">
              <SelectReuseAble
                className={``}
                label="Text Position"
                minWidth={500}
                value={TextPosition}
                onChange={handleChange}
                options={Position}
              />
            </div>
          </div>
          <div className="mt-12 border-b-1 border-b-gray-300"> </div>
          <FontSlider />
        </div>
      </div>
    </div>
  );
}

export default Misc_Settings;
