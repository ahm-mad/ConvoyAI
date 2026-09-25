// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
// import { CircleChevronUp, X, CircleChevronDown } from "lucide-react";
import Modal from '@mui/material/Modal';
import InputField from '@components/Input'; // Adjust path if needed
import ShowAndHide from './ShowAndHide';
// import Misc_Settings from "./Misc_Settings";

export default function MyModal({ isOpen, onClose, popupData, setPopupData, handleModalSubmit }) {
  return (
    <Modal open={isOpen} onClose={onClose} aria-labelledby="modal-title">
      <div className="fixed left-0 w-full h-full flex overflow-y-auto  items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-6 w-[800px]  top-18 shadow-lg relative">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-600 hover:text-black"
          >
            <div>X</div>
          </button>

          {/* Header */}
          <div className="mb-4">
            <h1 className="text-xl font-bold">Widget Settings</h1>
            <p className="text-gray-600">Device Data (Default)</p>
          </div>

          {/* General Section */}
          <h2 className="font-bold text-lg mb-2">General</h2>

          {/* Input Fields */}
          <div className="flex flex-col gap-4">
            {[
              { label: 'Widget Name (optional)', key: 'name' },

              { label: 'Company Name', key: 'companyName' },
            ].map(field => (
              <div key={field.key} className="p-4 bg-gray-100 rounded-xl">
                <div className="bg-white   rounded-lg">
                  <InputField
                    className="w-full rounded-sm text-lg p-4 focus:outline-none"
                    placeholder={field.label}
                    value={popupData[field.key]}
                    onChange={e =>
                      setPopupData({
                        ...popupData,
                        [field.key]: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Settings Section */}
          <ShowAndHide />
          {/* <Misc_Settings/> */}
          {/* Submit Button */}
          <div className="flex mt-4 justify-between">
            <div className="flex gap-4">
              <button
                onClick={onClose}
                className=" text-[#393939] font-bold px-6 py-2 rounded hover:bg-[#eee]"
              >
                cancel
              </button>
              <button className=" text-[#ea1c0d] font-bold px-6 py-2 rounded">Remove Widget</button>
            </div>
            <button
              onClick={handleModalSubmit}
              className=" bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
