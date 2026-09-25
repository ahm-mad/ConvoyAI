import React from 'react';

const ReceiveDataTime = ({
  border_And_bg_color,
  setborderPadding,
  setTextsizeColor,
  setTextReceiveData,
}) => {
  return (
    <>
      <div className={`border rounded-md ml-1 ${border_And_bg_color}`}>
        <div className={setborderPadding}>
          <p className={setTextsizeColor}>{setTextReceiveData}.</p>
        </div>
      </div>
    </>
  );
};
export default ReceiveDataTime;
