// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';

function FontSlider() {
  return (
    <div className="mt-8 flex items-center">
      <label htmlFor="font-size-slider">Font Size :</label>
      <input
        id="font-size-slider"
        type="range"
        min={0}
        max={100}
        defaultValue={30}
        aria-label="Font size"
        className="ml-8 w-[600px] max-w-full accent-brand"
      />
    </div>
  );
}

export default FontSlider;
