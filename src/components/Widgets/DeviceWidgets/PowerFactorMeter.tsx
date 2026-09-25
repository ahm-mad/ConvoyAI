// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';
import PowerMeterComponent from './PowerMeterComponent';

const PowerFactorMeter = () => {
  return (
    <>
      <WidgetInitialDiv title="Tektelic AC Switch">
        <PowerMeterComponent PowerTitle="Power Meter (Real Power)" UnitSign="" Unit="" />
      </WidgetInitialDiv>
    </>
  );
};
export default PowerFactorMeter;
