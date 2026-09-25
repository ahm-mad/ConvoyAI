import React, { useState } from 'react';
import Popper from '@mui/material/Popper';
import Fade from '@mui/material/Fade';
import Box from '@mui/material/Box';

const FilterPopper = ({ id, openPopperId, setOpenPopperId, trigger, children, sx = {} }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const isOpen = openPopperId === id && Boolean(children) && Boolean(anchorEl);

  const handleClick = event => {
    event.stopPropagation();
    if (isOpen) {
      setAnchorEl(null);
      setOpenPopperId(null);
    } else {
      setAnchorEl(event.currentTarget);
      setOpenPopperId(id);
    }
  };

  return (
    <div className="relative">
      <div onClick={handleClick} className="focus:outline-none">
        {trigger}
      </div>

      {isOpen && anchorEl && (
        <Popper
          open={isOpen}
          anchorEl={anchorEl}
          transition
          placement="bottom-start"
          sx={{ zIndex: 2000 }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={500}>
              <Box
                sx={{
                  bgcolor: 'var(--color-surface-2)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                  border: '1px solid var(--color-line)',
                  borderRadius: '10px',
                  height: '24rem',
                  width: '20rem',
                  overflow: 'hidden',
                  ...sx,
                }}
              >
                {children}
              </Box>
            </Fade>
          )}
        </Popper>
      )}
    </div>
  );
};

export default FilterPopper;
