// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// import { X } from "lucide-react";
import Modal from '@mui/material/Modal';
import ShowAndHide from './ShowAndHide';

const ReusableModal = ({
  isOpen,
  onClose,
  title = 'Modal Title',
  description = '',
  fields = [],
  formData,
  setFormData,
  onSubmit,
  onRemove,
}) => {
  return (
    <Modal open={isOpen} onClose={onClose} aria-labelledby="modal-title">
      <div className="fixed left-0 w-full h-full flex overflow-y-auto items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-6 w-[800px] top-18 shadow-lg relative">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-600 hover:text-black"
          >
            <div>X</div>
          </button>

          {/* Header */}
          <div className="mb-4">
            <h1 className="text-xl font-bold">{title}</h1>
            {description && <p className="text-gray-600">{description}</p>}
          </div>

          {/* Input Fields */}
          <div className="flex flex-col gap-4">
            {fields.map(field => (
              <div key={field.key} className="p-4 bg-gray-100 rounded-xl">
                <div className="bg-white rounded-lg">
                  <InputField
                    className="w-full rounded-sm text-lg p-4 focus:outline-none"
                    placeholder={field.label}
                    value={formData[field.key] || ''}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        [field.key]: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Custom Content Slot */}
          <div className="mt-4">
            <ShowAndHide />
          </div>

          {/* Buttons */}
          <div className="flex mt-4 justify-between">
            <div className="flex gap-4">
              <button
                onClick={onClose}
                className="text-[#393939] font-bold px-6 py-2 rounded hover:bg-[#eee]"
              >
                Cancel
              </button>
              {onRemove && (
                <button onClick={onRemove} className="text-[#ea1c0d] font-bold px-6 py-2 rounded">
                  Remove Widget
                </button>
              )}
            </div>
            <button
              onClick={onSubmit}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ReusableModal;
