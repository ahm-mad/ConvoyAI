// src/utils/packetToastManager.jsx
import toast from 'react-hot-toast';

const activeToasts = new Map();

export function showPersistentPacketToast({ productId, productName, navigate }) {
  const toastId = `packet-toast-${productId}`;
  // Prevent duplicate toasts
  if (activeToasts.has(toastId)) return;

  const id = toast(
    t => (
      <div className="flex flex-col space-y-2">
        <span>
          📦 Packet received for: <strong>{productName}</strong>
        </span>
        <button
          className="brand-gradient-bg on-gradient cursor-pointer text-xs font-semibold px-3 py-1.5 rounded-md hover:brightness-110 transition-all"
          onClick={() => {
            toast.dismiss(t.id);
            activeToasts.delete(toastId);
            navigate(`/products/${productId}/configuration`, {
              state: { from: 'packetToastManager', productName: productName },
            });
          }}
        >
          Click here to configure
        </button>
      </div>
    ),
    {
      id: toastId,
      duration: Infinity, // stays forever
    }
  );

  activeToasts.set(toastId, id);
}

// Optional: allow dismissing from somewhere else if needed
export function dismissPacketToast(productId) {
  const toastId = `packet-toast-${productId}`;
  if (activeToasts.has(toastId)) {
    toast.dismiss(toastId);
    activeToasts.delete(toastId);
  }
}
