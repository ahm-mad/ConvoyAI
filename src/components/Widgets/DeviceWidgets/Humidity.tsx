import React from 'react';
import WidgetInitialDiv from '../GeneralWidgets/WidgetInitialDiv';

const Humidity = () => {
  return (
    <>
      {/* <WidgetInitialDiv title="Tektelic Smart Room v2021 (Water Leak)"> */}
      <div className="p-4">
        <div className="flex flex-col items-center">
          <p className="text-sm font-medium">Humidity</p>
          <span className="flex items-center space-x-2">
            <p className="text-4xl">-</p>
            <p className="text-ink-2">%</p>
          </span>
          <p className="text-md text-ink-2">Percent (%)</p>
        </div>
      </div>
      {/* </WidgetInitialDiv> */}
    </>
  );
};
export default Humidity;
