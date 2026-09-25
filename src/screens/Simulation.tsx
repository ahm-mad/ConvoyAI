/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../utils/apiHelper';
import GlobalInput from '../components/Input';
import SelectRadix from '../components/Select';
import { Thermometer, Droplet, Droplets, Move } from 'lucide-react';

const MIN_INTERVAL = 15; // 30 sec
const MAX_INTERVAL = 300; // 5 min
const MIN_PACKETS = 1;
const MAX_PACKETS = 50;

const DUMMY_PRODUCTS = [
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

const PRODUCT_CONFIG: Record<string, any> = {
  'demo-device-1': {
    field: 'temperature',
    inputType: 'number',
    defaultValue: '',
    validate: (value: any, t: any) => {
      if (value === '' || isNaN(value)) {
        return t('simulation.errors.temperatureRequired', 'Enter a valid temperature');
      }
      return null;
    },
    toPayload: (value: any) => Number(value),
  },
  'demo-device-2': {
    field: 'humidity',
    inputType: 'number',
    defaultValue: '',
    validate: (value: any, t: any) => {
      if (value === '' || isNaN(value) || value < 0 || value > 100) {
        return t('simulation.errors.humidityRange', 'Humidity must be between 0 and 100');
      }
      return null;
    },
    toPayload: (value: any) => Number(value),
  },
  'demo-device-3': {
    field: 'water_leakage',
    inputType: 'boolean',
    defaultValue: false,
    validate: () => null,
    toPayload: (value: any) => value,
  },
  'demo-device-4': {
    field: 'movement',
    inputType: 'boolean',
    defaultValue: false,
    validate: () => null, // booleans with a default are always valid
    toPayload: (value: any) => value,
  },
};

const SENSOR_FIELDS: any[] = Object.values(PRODUCT_CONFIG).map(cfg => cfg.field);

const FIELD_CONFIG = Object.values(PRODUCT_CONFIG).reduce<Record<string, any>>((acc, cfg) => {
  acc[cfg.field] = cfg;
  return acc;
}, {});

const SENDING_MODES = {
  SINGLE: 'single',
  MULTIPLE: 'multiple',
};

const buildDefaultFormData = (): Record<string, any> => {
  const defaults: Record<string, any> = {
    sending_mode: SENDING_MODES.SINGLE,
    product_id: '',
    interval_seconds: 60,
    packet_count: 1,
    status: false,
  };
  SENSOR_FIELDS.forEach(field => {
    defaults[field] = FIELD_CONFIG[field].defaultValue;
  });
  return defaults;
};

// Small, single-purpose icon set — kept intentionally minimal.
const Icon: Record<string, (p: any) => any> = {
  Alert: p => (
    <svg viewBox="0 0 20 20" fill="none" className={p.className}>
      <path
        d="M10 3l7.5 13H2.5L10 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 8.5v3.2M10 14.2h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  Spinner: p => (
    <svg viewBox="0 0 20 20" fill="none" className={p.className}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path
        d="M17.5 10a7.5 7.5 0 00-7.5-7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};

export default function Simulation() {
  const { t } = useTranslation();

  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [formData, setFormData] = useState<Record<string, any>>(buildDefaultFormData);
  const [errors, setErrors] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoadingProducts(true);
        setProductsError(false);

        const response = await get('/api/check-configured-devices');

        if (!response?.error) {
          const data = response;

          // Normalizes whatever shape the API returns into a Set of
          // configured product ids, e.g.:
          //   ['temperature', 'humidity']
          //   [{ id: 'temperature', configured: true }, ...]
          //   [{ product_id: 'temperature' }, ...]
          const configuredIds = new Set(
            (Array.isArray(data) ? data : [])
              .map((item: any) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                  if (item.configured === false) return null;
                  return item.product_id ?? item.id ?? null;
                }
                return null;
              })
              .filter(Boolean)
          );

          const configuredProducts = DUMMY_PRODUCTS.filter(product =>
            configuredIds.has(product.id)
          );

          setProducts(configuredProducts);
        } else {
          setProductsError(true);
        }
      } catch (error) {
        console.error('Error fetching configured devices:', error);
        setProductsError(true);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, []);

  const handleChange = (field: string, value: any, flag: boolean = false) => {
    if (flag) {
      setFormData(prev => ({ ...prev, [field]: value, value }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleInputChange = (field: string) => (e: ChangeEvent<HTMLInputElement>) => {
    if (field == 'interval_seconds') {
      const raw = e.target.value;
      let num = Number(raw);
      if (isNaN(num)) return;

      if (num > MAX_INTERVAL) num = MAX_INTERVAL;
      if (num < MIN_INTERVAL) num = MIN_INTERVAL;

      handleChange('interval_seconds', num);
    } else {
      console.log('bhai saaab', field, e.target.value);
      handleChange(field, e.target.value, true);
    }
  };

  const handlePacketCountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    if (raw === '') {
      handleChange('packet_count', '');
      return;
    }

    let num = Number(raw);
    if (isNaN(num)) return;

    if (num > MAX_PACKETS) num = MAX_PACKETS;
    if (num < 0) num = 0;

    handleChange('packet_count', num);
  };

  const handleSendingModeChange = (mode: string) => {
    setFormData(prev => ({
      ...prev,
      sending_mode: mode,
      packet_count:
        mode === SENDING_MODES.SINGLE ? 1 : prev.packet_count > 1 ? prev.packet_count : 2,
      interval_seconds: mode === SENDING_MODES.SINGLE ? null : prev.interval_seconds || 60,
    }));
    setErrors(prev => ({ ...prev, packet_count: '', interval_seconds: '' }));
  };

  const handleProductChange = (value: string) => {
    setFormData(prev => {
      const next: Record<string, any> = { ...prev, product_id: value, status: false };
      SENSOR_FIELDS.forEach(field => {
        next[field] = FIELD_CONFIG[field].defaultValue;
      });
      return next;
    });
    setErrors({});
  };

  const validate = () => {
    const newErrors: Record<string, any> = {};

    if (!formData.product_id) {
      newErrors.product_id = t('simulation.errors.productRequired', 'Select a product');
    }

    const isSingle = formData.sending_mode === SENDING_MODES.SINGLE;

    if (!isSingle) {
      const packetCount = Number(formData.packet_count);
      if (!packetCount || packetCount < MIN_PACKETS || packetCount > MAX_PACKETS) {
        newErrors.packet_count = t(
          'simulation.errors.packetCountRange',
          `Enter a number between ${MIN_PACKETS} and ${MAX_PACKETS}`
        );
      }

      if (packetCount > 1) {
        const interval = Number(formData.interval_seconds);
        if (!interval || interval < MIN_INTERVAL || interval > MAX_INTERVAL) {
          newErrors.interval_seconds = t(
            'simulation.errors.intervalRange',
            `Enter a value between ${MIN_INTERVAL} and ${MAX_INTERVAL} seconds`
          );
        }
      }
    }

    const config = PRODUCT_CONFIG[formData.product_id];
    if (config) {
      const fieldError = config.validate(formData[config.field], t);
      if (fieldError) {
        newErrors[config.field] = fieldError;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildPayload = () => {
    const isSingle = formData.sending_mode === SENDING_MODES.SINGLE;
    const packetCount = isSingle ? 1 : Number(formData.packet_count);

    const payload: Record<string, any> = {
      device_id: formData.product_id,
      interval_seconds: !isSingle && packetCount > 1 ? Number(formData.interval_seconds) : null,
      packet_count: packetCount,
      status: formData.status ? 'alert' : 'normal',
      value: formData?.value,
    };
    console.log('check-bhai saab', formData);
    payload.random_values = !isSingle;

    payload.sending_mode = isSingle ? 'single' : 'concurrent';

    const activeConfig = PRODUCT_CONFIG[formData.product_id];

    SENSOR_FIELDS.forEach(field => {
      const config = FIELD_CONFIG[field];
      payload[field] = activeConfig?.field === field ? config.toPayload(formData[field]) : null;
    });

    return payload;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const payload = buildPayload();

    try {
      setSaving(true);

      // post() already shows loading/success/error toast internally
      const response = await post('/api/simulate-packet', payload);

      if (!response?.error && response?.success) {
        setLastSavedAt(new Date());

        // Reset entire form
        setFormData(buildDefaultFormData());
        setErrors({});
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = () => {
    setFormData(buildDefaultFormData());
    setErrors({});
  };

  // ---- Derived state ----

  const isSingleMode = formData.sending_mode === SENDING_MODES.SINGLE;
  const activeConfig = PRODUCT_CONFIG[formData.product_id];
  const activeProduct = products.find(p => p.id === formData.product_id);

  const isFormComplete = useMemo(() => {
    if (!formData.product_id) return false;

    const isSingle = formData.sending_mode === SENDING_MODES.SINGLE;
    if (!isSingle) {
      const packetNum = Number(formData.packet_count);
      if (!packetNum || packetNum < MIN_PACKETS || packetNum > MAX_PACKETS) return false;
      if (packetNum > 1) {
        const intervalNum = Number(formData.interval_seconds);
        if (!intervalNum || intervalNum < MIN_INTERVAL || intervalNum > MAX_INTERVAL) return false;
      }
      return true;
    }

    return activeConfig ? !activeConfig.validate(formData[activeConfig.field], t) : false;
  }, [formData, activeConfig, t]);

  // ---- Field metadata ----

  const NUMBER_FIELD_META: Record<string, any> = {
    temperature: {
      label: t('simulation.temperature', 'Temperature (°C)'),
      placeholder: t('simulation.temperaturePlaceholder', 'e.g. 25.5'),
      inputProps: { step: '0.1', autoFocus: true },
    },
    humidity: {
      label: t('simulation.humidity', 'Humidity (%)'),
      placeholder: t('simulation.humidityPlaceholder', 'e.g. 45'),
      inputProps: { min: 0, max: 100, step: '0.1', autoFocus: true },
    },
  };

  const BOOLEAN_FIELD_META: Record<string, any> = {
    movement: { label: t('simulation.movement', 'Movement') },
    water_leakage: { label: t('simulation.waterLeakage', 'Water leakage') },
  };

  const renderSensorField = () => {
    if (!activeConfig) return null;
    const { field, inputType } = activeConfig;

    if (inputType === 'number') {
      const meta = NUMBER_FIELD_META[field];
      return (
        <GlobalInput
          label={meta.label}
          name={field}
          type="number"
          value={formData[field]}
          onChange={handleInputChange(field)}
          inputProps={meta.inputProps}
          placeholder={meta.placeholder}
          error={!!errors[field]}
          helperText={errors[field]}
        />
      );
    }

    if (inputType === 'boolean') {
      const meta = BOOLEAN_FIELD_META[field];
      return (
        <BooleanToggle
          label={meta.label}
          field={field}
          value={formData[field]}
          onChange={(f, v) => handleChange(f, v, true)}
          t={t}
        />
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen ">
      <div className="mx-auto max-w-5xl ">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900">
            {t('simulation.title', 'Simulate a device')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t(
              'simulation.subtitle',
              'Send a test packet or run a virtual device to check how your pipeline handles it.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
          {/* Main form */}
          <form
            onSubmit={handleSave}
            // className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-6"
            className="divide-y divide-ink-2 rounded-lg border border-line-soft bg-surface-2 px-6"
          >
            <FormSection
              title={t('simulation.stepMode', 'Sending mode')}
              description={
                isSingleMode
                  ? t('simulation.singleHint', 'Sends one packet immediately.')
                  : t('simulation.multipleHint', 'Sends several packets on a fixed interval.')
              }
            >
              <SegmentedControl
                value={formData.sending_mode}
                onChange={handleSendingModeChange}
                options={[
                  {
                    value: SENDING_MODES.SINGLE,
                    label: t('simulation.singlePacket', 'Single packet'),
                  },
                  {
                    value: SENDING_MODES.MULTIPLE,
                    label: t('simulation.multiplePackets', 'Multiple packets'),
                  },
                ]}
              />
            </FormSection>

            <FormSection title={t('simulation.stepDevice', 'Device')}>
              <SelectRadix
                id="product_id"
                placeholder={
                  loadingProducts
                    ? t('simulation.loadingProducts', 'Loading products…')
                    : t('simulation.selectProduct', 'Select a product')
                }
                options={products.map(product => ({ value: product.id, label: product.label }))}
                value={formData.product_id}
                onValueChange={handleProductChange}
                disabled={loadingProducts}
                error={!!errors.product_id}
                helperText={errors.product_id}
              />
              {productsError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                  <Icon.Alert className="h-3.5 w-3.5 shrink-0" />
                  {t(
                    'simulation.errors.productsLoadFailed',
                    'Could not load products. Refresh and try again.'
                  )}
                </p>
              )}
              {!productsError && !loadingProducts && products.length === 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                  <Icon.Alert className="h-3.5 w-3.5 shrink-0" />
                  {t('simulation.errors.noConfiguredDevices', 'No configured devices found.')}
                </p>
              )}
            </FormSection>

            <FormSection title={t('simulation.stepDelivery', 'Delivery')}>
              <div className="flex flex-col gap-5">
                {!isSingleMode && (
                  <>
                    <GlobalInput
                      label={t('simulation.packetCount', 'Number of packets')}
                      name="packet_count"
                      type="number"
                      value={formData.packet_count}
                      onChange={handlePacketCountChange}
                      inputProps={{ min: MIN_PACKETS, max: MAX_PACKETS }}
                      endAdornment={
                        <span className="text-xs text-gray-400">
                          {t('simulation.packets', 'packets')}
                        </span>
                      }
                      error={!!errors.packet_count}
                      helperText={
                        errors.packet_count ||
                        t('simulation.packetCountHint', `Range: ${MIN_PACKETS}–${MAX_PACKETS}`)
                      }
                    />
                    {Number(formData.packet_count) > 1 && (
                      <GlobalInput
                        label={t('simulation.interval', 'Packet interval')}
                        name="interval_seconds"
                        type="number"
                        value={formData.interval_seconds}
                        onChange={handleInputChange('interval_seconds')}
                        inputProps={{ min: MIN_INTERVAL, max: MAX_INTERVAL }}
                        endAdornment={
                          <span className="text-xs text-gray-400">
                            {t('simulation.seconds', 'sec')}
                          </span>
                        }
                        error={!!errors.interval_seconds}
                        helperText={
                          errors.interval_seconds ||
                          t('simulation.intervalHint', `Range: ${MIN_INTERVAL}–${MAX_INTERVAL} sec`)
                        }
                      />
                    )}
                    <p className="text-xs text-gray-400">
                      {t(
                        'simulation.randomValuesNote',
                        'Note: in multiple-packet mode, each packet gets its own randomly generated reading.'
                      )}
                    </p>
                  </>
                )}
                {formData.product_id && isSingleMode && (
                  <StatusToggle
                    value={formData.status}
                    onChange={v => handleChange('status', v)}
                    t={t}
                  />
                )}
              </div>
            </FormSection>

            {isSingleMode && (
              <FormSection
                title={
                  activeProduct
                    ? t('simulation.stepValueNamed', `Reading — ${activeProduct.label}`)
                    : t('simulation.stepValue', 'Reading')
                }
              >
                {formData.product_id ? (
                  renderSensorField()
                ) : (
                  // <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                  <p className="rounded-md border border-dashed border-line-soft bg-surface-3 px-4 py-6 text-center text-sm text-ink-3">
                    {t(
                      'simulation.pickProductHint',
                      'Select a device above to configure its reading.'
                    )}
                  </p>
                )}
              </FormSection>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 py-5">
              <button
                type="button"
                onClick={handleResetAll}
                // className="cursor-pointer rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                className="cursor-pointer rounded-md border border-ink-0 px-4 py-2 text-sm font-medium text-ink-1 transition-colors hover:bg-gray-50"
              >
                {t('simulation.reset', 'Reset')}
              </button>
              <button
                type="submit"
                disabled={saving || !isFormComplete}
                // className="inline-flex min-w-[160px] cursor-pointer items-center justify-center gap-2 rounded-md bg-[#1769aa] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                className="inline-flex min-w-[160px] cursor-pointer items-center justify-center gap-2 rounded-md  px-4 py-2 text-sm font-medium bg-surface-2 text-ink-1 transition-colors  disabled:cursor-not-allowed border-ink-0 border"
              >
                {saving && <Icon.Spinner className="h-4 w-4 animate-spin" />}
                {saving
                  ? t('simulation.saving', 'Saving…')
                  : t('simulation.save', 'Save configuration')}
              </button>
            </div>
          </form>

          {/* Summary sidebar */}
          {/* <aside className="rounded-lg border border-gray-200 bg-white p-5 lg:sticky lg:top-6">
            <h2 className="text-sm font-semibold text-gray-900"> */}
          <aside className="rounded-lg border border-line-soft bg-surface-2 p-5 lg:sticky lg:top-6">
            <h2 className="text-sm font-semibold text-ink-0">
              {t('simulation.summary', 'Summary')}
            </h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <SummaryRow
                label={t('simulation.summaryMode', 'Mode')}
                value={
                  isSingleMode
                    ? t('simulation.singlePacket', 'Single packet')
                    : t('simulation.multiplePackets', 'Multiple packets')
                }
              />
              <SummaryRow
                label={t('simulation.summaryDevice', 'Device')}
                value={activeProduct?.label || t('simulation.notSet', '—')}
              />
              {!isSingleMode && (
                <SummaryRow
                  label={t('simulation.summaryPackets', 'Packets')}
                  value={formData.packet_count || t('simulation.notSet', '—')}
                />
              )}
              {!isSingleMode && Number(formData.packet_count) > 1 && (
                <SummaryRow
                  label={t('simulation.summaryInterval', 'Interval')}
                  value={
                    formData.interval_seconds
                      ? `${formData.interval_seconds}s`
                      : t('simulation.notSet', '—')
                  }
                />
              )}
              {isSingleMode && (
                <SummaryRow
                  label={t('simulation.summaryStatus', 'Status')}
                  value={
                    formData.status
                      ? t('simulation.alert', 'Alert')
                      : t('simulation.normal', 'Normal')
                  }
                  highlight={formData.status ? 'alert' : 'normal'}
                />
              )}
            </dl>

            <p className="mt-5 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
              {isSingleMode
                ? t('simulation.aboutBodySingle', 'Saving sends this packet immediately.')
                : t(
                    'simulation.aboutBody',
                    'Saving starts a virtual device that sends packets on the interval above. You can stop or edit it later from the device list.'
                  )}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="py-5 first:pt-6 last:border-none">
      {/* <h2 className="text-sm font-semibold text-gray-900">{title}</h2> */}
      <h2 className="text-sm font-semibold text-ink-0">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label?: ReactNode;
  value?: ReactNode;
  highlight?: string;
}) {
  const highlightClasses =
    highlight === 'alert'
      ? 'bg-red-50 text-red-700'
      : highlight === 'normal'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-indigo-50 text-indigo-700 ';

  return (
    <div className="flex items-center justify-between gap-3">
      {/* <dt className="text-gray-500">{label}</dt> */}
      <dt className="text-ink-2">{label}</dt>
      <dd
        className={`truncate rounded-md px-2 py-0.5 font-medium ${
          // highlight ? highlightClasses : 'bg-indigo-50 text-[#1769aa]'
          highlight ? highlightClasses : 'bg-surface-2 text-ink-1'
        }
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options = [],
}: {
  value?: any;
  onChange: (v: any) => void;
  options?: any[];
}) {
  return (
    // <div role="radiogroup" className="inline-flex rounded-md border border-gray-200 p-0.5">
    <div role="radiogroup" className="inline-flex rounded-md border border-ink-1 p-0.5">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            // className={`cursor-pointer rounded-[5px] px-4 py-1.5 text-sm font-medium transition-colors ${
            className={`cursor-pointer rounded-[5px]  px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-[#1769aa] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusToggle({
  value,
  onChange,
  t,
}: {
  value?: any;
  onChange: (v: any) => void;
  t?: any;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {t('simulation.status', 'Status')}
      </label>
      <SegmentedControl
        value={value ? 'alert' : 'normal'}
        onChange={v => onChange(v === 'alert')}
        options={[
          { value: 'normal', label: t('simulation.normal', 'Normal') },
          { value: 'alert', label: t('simulation.alert', 'Alert') },
        ]}
      />
      <p className="mt-1.5 text-xs text-gray-400">
        {t('simulation.statusHint', 'Which kind of packet this device sends.')}
      </p>
    </div>
  );
}

function BooleanToggle({
  label,
  field,
  value,
  onChange,
  t,
}: {
  label?: any;
  field?: any;
  value?: any;
  onChange: (field: any, value: any) => void;
  t?: any;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          onClick={() => onChange(field, !value)}
          className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors ${
            value ? 'bg-indigo-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              value ? 'translate-x-[18px]' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-gray-600">
          {value ? t('simulation.true', 'True') : t('simulation.false', 'False')}
        </span>
      </div>
    </div>
  );
}
