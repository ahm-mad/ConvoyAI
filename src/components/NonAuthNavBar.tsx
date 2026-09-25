// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import convoyai from '../GuestHomeComponents/assets/convoyainew.png';

function NonAuthNavBar() {
  const homePageContent = false;
  return (
    <>
      <div className={`bg-[rgb(0,38,62)] ${homePageContent ? 'h-[800px]' : 'h-fit'} mb-28`}>
        <div className=" flex p-4 fixed top-0 z-50 text-background-lightest font-bold bg-[#00263e] justify-between w-full">
          <div className="w-15  flex max-h-14">
            <img src={convoyai} alt="ConvoyAI Image" />
          </div>
          <div className="flex gap-24">
            <div className=" p-2 ">
              <a href="">WHY ConvoyAI</a>
            </div>
            <div className=" p-2 ">
              <a href="">PRODUCTS</a>
            </div>
            <div className=" p-2 ">
              <a href="">SENSORS</a>
            </div>
            <div className=" p-2 ">
              <a href="">SOLUTIONS</a>
            </div>
            <div className=" p-2 ">
              <a href=""> PLANS & PRICING</a>
            </div>
          </div>
        </div>
        {homePageContent ? (
          <div className="text-center">
            <div className="text-background-lightest text-5xl mt-36 font-bold">
              Deploy Sensors Faster
            </div>
            <div className="text-background-lightest mt-10 text-2xl">
              ConvoyAI makes it easy to quickly and securely connect any sensor to any platform
            </div>
            <div className="bg-primary p-4 text-2xl px-12 text-background-lightest rounded-2xl mt-10 inline-block">
              SENSOR DEVICE
            </div>
            <div className="text-background-lightest mt-10 text-xl">Or Schedule a Demo</div>
          </div>
        ) : (
          <div></div>
        )}
      </div>
    </>
  );
}

export default NonAuthNavBar;
