import React, { useState } from 'react';

/** Controlled popover under a trigger (replaces MUI Popper). Panel size can be overridden via `sx` (width/height). */
const FilterPopper = ({ id, openPopperId, setOpenPopperId, trigger, children, sx = {} }) => {
  const [open, setOpen] = useState(false);
  const isOpen = openPopperId === id && Boolean(children) && open;

  const handleClick = event => {
    event.stopPropagation();
    if (isOpen) {
      setOpen(false);
      setOpenPopperId(null);
    } else {
      setOpen(true);
      setOpenPopperId(id);
    }
  };

  return (
    <div className="relative">
      <div onClick={handleClick} className="focus:outline-none">
        {trigger}
      </div>

      {isOpen && (
        <div
          className="glass-strong absolute left-0 top-full z-[2000] mt-2 h-96 w-80 overflow-hidden"
          style={{ boxShadow: 'var(--shadow-glass)', ...sx }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default FilterPopper;
