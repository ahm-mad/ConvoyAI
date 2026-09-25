// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';

import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';

function FontSlider() {
  return (
    <div className="mt-8 flex">
      <div>Font Size :</div>
      <div className="ml-8">
        <Box sx={{ width: 600 }}>
          <Slider
            aria-label="Temperature"
            defaultValue={30}
            getAriaValueText={FontSlider}
            color="primary"
          />
        </Box>
      </div>
    </div>
  );
}

export default FontSlider;
