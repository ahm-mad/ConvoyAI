// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import WidgetInitialDiv from '../Widgets/WidgetInitialDiv';
import PowerMeterComponent from './PowerMeterComponent';

const PowerMeterRealPower = () => {
  return (
    <WidgetInitialDiv title="Tektelic AC Switch">
      <PowerMeterComponent PowerTitle="Power Meter (Real Power)" UnitSign="W" Unit="Watts" />
    </WidgetInitialDiv>
  );
};
export default PowerMeterRealPower;
