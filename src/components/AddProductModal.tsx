// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect } from 'react';
import { X, Thermometer, Droplet, Droplets, Move, Package, Check, Loader2 } from 'lucide-react';
import { get, post } from '../utils/apiHelper';

const ACCENT = 'var(--color-accent-cyan)';
const ACCENT_DARK = 'var(--color-accent-cyan)';
const ACCENT_SOFT = 'color-mix(in srgb, var(--color-accent-cyan) 10%, var(--color-surface-1))';
const ACCENT_ICON_BG = 'color-mix(in srgb, var(--color-accent-cyan) 16%, var(--color-surface-1))';

const PRODUCTS = [
  {
    id: 'demo-device-1',
    label: 'Temperature',
    icon: Thermometer,
    description: 'Monitor ambient or surface temperature in real time',
  },
  {
    id: 'demo-device-2',
    label: 'Humidity',
    icon: Droplet,
    description: 'Track relative humidity levels for climate-sensitive environments',
  },
  {
    id: 'demo-device-3',
    label: 'Water Leak',
    icon: Droplets,
    description: 'Detect leaks early and get alerted before damage occurs',
  },
  {
    id: 'demo-device-4',
    label: 'Move',
    icon: Move,
    description: 'Detect movement and trigger alerts or automations instantly',
  },
];

export default function AddProductModal({ onClose, onComplete }) {
  const [selectedProducts, setSelectedProducts] = useState([]);

  const [configuredDevices, setConfiguredDevices] = useState([]);
  const [isCheckingConfigured, setIsCheckingConfigured] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canProceed = selectedProducts.length > 0;

  useEffect(() => {
    let isMounted = true;

    const fetchConfiguredDevices = async () => {
      setIsCheckingConfigured(true);
      const response = await get('/api/check-configured-devices');
      if (isMounted) {
        // response is expected to be an array like ['demo-device-4', 'demo-device-2']
        setConfiguredDevices(Array.isArray(response) ? response : []);
        setIsCheckingConfigured(false);
      }
    };

    fetchConfiguredDevices();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleProduct = productId => {
    if (configuredDevices.includes(productId)) return;
    setSelectedProducts(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const handleSubmit = async () => {
    if (!canProceed) return;

    setIsSubmitting(true);
    const response = await post('/api/add-demo-product', selectedProducts);
    setIsSubmitting(false);

    if (response?.success) {
      onComplete?.({ products: selectedProducts });
    }
  };

  return (
    <div className="-m-5 w-[92vw] max-w-[800px] flex flex-col  bg-surface-1 overflow-hidden ">
      {/* Header */}
      <div className="px-7 pt-5 pb-5 border-b border-line-soft">
        <div className="flex items-start justify-between">
          <div className="flex items-center  gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
              style={{ backgroundColor: ACCENT_ICON_BG }}
            >
              <Package className="w-4.5 h-4.5" style={{ color: ACCENT_DARK }} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-ink-0 tracking-tight leading-tight font-display">
                Add Product
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink-0 cursor-pointer transition-colors -mt-1 -mr-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-7 py-5 h-[380px] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] text-ink-2 leading-relaxed">
            Choose one or more products you'd like to add.
          </p>
          {isCheckingConfigured && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2 shrink-0 ml-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking devices…
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PRODUCTS.map(p => {
            const selected = selectedProducts.includes(p.id);
            const isConfigured = configuredDevices.includes(p.id);
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProduct(p.id)}
                disabled={isConfigured}
                aria-disabled={isConfigured}
                className="group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all"
                style={{
                  borderColor: selected ? ACCENT : 'var(--color-line)',
                  backgroundColor: isConfigured
                    ? 'var(--color-surface-2)'
                    : selected
                      ? ACCENT_SOFT
                      : 'var(--color-surface-1)',
                  boxShadow: selected ? `0 0 0 1px ${ACCENT}` : 'none',
                  cursor: isConfigured ? 'not-allowed' : 'pointer',
                }}
              >
                {/* Configured badge, top-right */}
                {isConfigured && (
                  <span className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-surface-3 text-ink-1 border border-line">
                    <Check className="w-2.5 h-2.5" />
                    Configured
                  </span>
                )}

                <div className="flex items-center justify-between w-full">
                  <span
                    className="flex items-center justify-center w-10 h-10 rounded-xl"
                    style={{
                      backgroundColor: isConfigured ? 'var(--color-surface-3)' : ACCENT_ICON_BG,
                    }}
                  >
                    <Icon
                      className="w-5 h-5"
                      style={{ color: isConfigured ? 'var(--color-ink-2)' : ACCENT_DARK }}
                    />
                  </span>
                  {selected && !isConfigured && (
                    <span
                      className="flex items-center justify-center w-5 h-5 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Check className="w-3 h-3 on-gradient" />
                    </span>
                  )}
                </div>

                <span>
                  <span
                    className="block text-[13.5px] font-semibold"
                    style={{
                      color: isConfigured
                        ? 'var(--color-ink-2)'
                        : selected
                          ? ACCENT_DARK
                          : 'var(--color-ink-0)',
                    }}
                  >
                    {p.label}
                  </span>
                  <span className="block text-[12px] text-ink-2 mt-0.5 leading-snug">
                    {isConfigured ? 'You already have this device set up' : p.description}
                  </span>
                </span>

                {/* Tooltip on hover for configured cards */}
                {isConfigured && (
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#eee3d4] px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    Already configured
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-7 py-4 border-t border-line-soft flex items-center justify-end bg-surface-2/60">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canProceed || isSubmitting}
          className="flex items-center gap-1.5 px-5 h-9 rounded-md text-[13px] font-semibold on-gradient transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          style={{ backgroundColor: ACCENT }}
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            `Add Product${selectedProducts.length > 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  );
}
