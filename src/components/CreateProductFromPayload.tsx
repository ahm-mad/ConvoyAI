// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useQueryClient } from '@tanstack/react-query';
import { get, post, put } from '@utils/apiHelper';
import Button from '@components/Button';
import Input from '@components/Input';

/**
 * Real implementation of the "Create Product from Payload" flow prototyped
 * earlier. Wires four ALREADY-EXISTING backend endpoints together — no new
 * backend code was needed, confirmed by reading each one before building
 * this:
 *   1. GET  /api/dashboard/packet-history        (select a payload)
 *   2. PUT  /api/products/{id}                   (rename the product)
 *   3. POST /api/attribute/preference/mapping-preview  (preview field mapping)
 *   4. POST /api/attribute/preference/setting/store    (commit mapping + alert,
 *      called once per selected field — this single endpoint already creates
 *      BOTH the ProductAttributePreference and the Rule together via its
 *      alert_settings parameter)
 *
 * A device must already exist with a product assigned before it can send
 * any data at all (confirmed via WebhookController's device-not-found 404),
 * so this refines/renames the EXISTING product a payload's device already
 * belongs to — it does not create new devices, unlike the separate
 * "Add Product" flow (AddDevices.jsx) which is device-creation-coupled.
 */
export default function CreateProductFromPayload({ onSuccess, initialProductId = undefined }) {
  const { closeModal } = useModal();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [productName, setProductName] = useState('');
  const [deviceProtocolId, setDeviceProtocolId] = useState('');
  const [mappingPreview, setMappingPreview] = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState(null);
  const [selectedFields, setSelectedFields] = useState({});
  const [conditions, setConditions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const { data: historyData, isLoading: historyLoading } = useSimpleQuery(
    `create-product-packet-history-${initialProductId || 'all'}`,
    '/api/dashboard/packet-history',
    { per_page: 8, ...(initialProductId ? { product_id: initialProductId } : {}) },
    { enabled: step === 1 }
  );

  // NEW — lets device protocol be set/changed here too, alongside name and
  // field mapping. ProtocolController::index() returns Laravel's raw
  // paginator (no {success,message,data} envelope, unlike most other
  // endpoints in this app), so the protocol array is response.data
  // directly, not response.data.data.
  const { data: deviceProtocolsData } = useSimpleQuery(
    'device-protocols-for-product-refine',
    '/api/protocols',
    { category: 'device_protocol', per_page: 50 }
  );
  const deviceProtocols = deviceProtocolsData?.data || [];

  const packets = historyData?.data?.packets || [];

  const handleSelectPacket = packet => {
    setSelectedPacket(packet);
    setProductName(packet?.product?.name || '');
    setDeviceProtocolId(packet?.product?.device_protocol_id || '');
    setMappingPreview(null);
    setMappingError(null);
    setSelectedFields({});
    setConditions({});
  };

  const goToMapping = async () => {
    if (!selectedPacket?.product?.id) {
      setMappingError('This payload has no associated product to refine.');
      setStep(2);

      return;
    }

    setStep(2);
    setMappingLoading(true);
    setMappingError(null);

    const response = await post(
      '/api/attribute/preference/mapping-preview',
      {
        product_id: selectedPacket.product.id,
        sample_payload: selectedPacket.json_body || {},
      },
      {},
      false // no toast for a background preview call
    );

    setMappingLoading(false);

    if (response?.error || response?.success === false) {
      setMappingError(
        response?.message || 'Could not generate a mapping preview for this payload.'
      );

      return;
    }

    setMappingPreview(response.data);

    // Pre-select fields the current mapping already matches, matching the
    // prototype's behavior of showing already-mapped fields checked.
    const preselected = {};
    (response.data?.mapping || []).forEach(m => {
      preselected[m.source_field] = true;
    });
    setSelectedFields(preselected);
  };

  const toggleField = key => {
    setSelectedFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCondition = (key, patch) => {
    setConditions(prev => ({
      ...prev,
      [key]: { operator: '>', value: '', action: 'Email', ...prev[key], ...patch },
    }));
  };

  const selectedFieldKeys = Object.keys(selectedFields).filter(k => selectedFields[k]);

  const handleCreate = async () => {
    if (!selectedPacket?.product?.id) return;

    setSubmitting(true);
    setSubmitError(null);

    const productId = selectedPacket.product.id;

    try {
      // 1. Update the product if its name or device protocol changed.
      // Previously only checked name — setting just the device protocol
      // (with an unchanged name) would silently never save anything.
      const nameChanged = productName && productName !== selectedPacket.product.name;
      const protocolChanged =
        deviceProtocolId !== (selectedPacket.product.device_protocol_id || '');

      if (nameChanged || protocolChanged) {
        const renameResponse = await put(
          `/api/products/${productId}`,
          {
            ...(nameChanged ? { name: productName } : {}),
            ...(protocolChanged ? { device_protocol_id: deviceProtocolId || null } : {}),
          },
          {},
          false
        );
        if (renameResponse?.error) {
          throw new Error(renameResponse.message || 'Failed to rename product.');
        }
      }

      // 2. Commit each selected field — mapping + alert together, one call
      // per field, exactly matching what /setting/store already supports.
      for (const fieldKey of selectedFieldKeys) {
        const condition = conditions[fieldKey];
        const hasCondition = condition?.value !== undefined && condition.value !== '';

        const payload = {
          product_id: productId,
          attribute_key: fieldKey,
          label: fieldKey.split('.').pop(),
        };

        if (hasCondition) {
          payload.alert_settings = {
            enabled: true,
            conditions: [
              {
                logicalOperator: '',
                selectedCondition: condition.operator,
                conditionValue: condition.value,
                selectedAttribute: fieldKey,
                selectedProduct: productId,
              },
            ],
          };
        }

        // eslint-disable-next-line no-await-in-loop
        const fieldResponse = await post(
          '/api/attribute/preference/setting/store',
          payload,
          {},
          false
        );
        if (fieldResponse?.error) {
          throw new Error(fieldResponse.message || `Failed to save mapping for "${fieldKey}".`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSuccess?.();
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-strong  w-[720px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">
            {initialProductId ? 'Configure Product Field Mapping' : 'Create Product from Payload'}
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {initialProductId
              ? 'This product has devices sending data but no fields mapped yet — pick a recent payload from one of its devices to configure it.'
              : "Refines the product a real captured payload's device already belongs to — names it, maps its fields, and sets alerts, in one flow."}
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-b border-line-soft text-xs">
        {['Select payload', 'Name & map fields', 'Alert conditions'].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className="flex-1 h-px bg-line-soft" />}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                step === i + 1 ? 'bg-surface-2 text-ink-0' : 'text-ink-2'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono ${
                  step === i + 1 ? 'brand-gradient-bg on-gradient' : 'bg-surface-3'
                }`}
              >
                {i + 1}
              </span>
              {label}
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {step === 1 && (
          <StepSelectPayload
            packets={packets}
            loading={historyLoading}
            selectedPacket={selectedPacket}
            onSelect={handleSelectPacket}
          />
        )}

        {step === 2 && (
          <StepNameAndMap
            selectedPacket={selectedPacket}
            productName={productName}
            setProductName={setProductName}
            deviceProtocolId={deviceProtocolId}
            setDeviceProtocolId={setDeviceProtocolId}
            deviceProtocols={deviceProtocols}
            mappingLoading={mappingLoading}
            mappingError={mappingError}
            mappingPreview={mappingPreview}
            selectedFields={selectedFields}
            toggleField={toggleField}
          />
        )}

        {step === 3 && (
          <StepAlertConditions
            selectedFieldKeys={selectedFieldKeys}
            mappingPreview={mappingPreview}
            conditions={conditions}
            updateCondition={updateCondition}
          />
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-line">
        <div className="text-xs text-danger">{submitError}</div>
        <div className="flex gap-2">
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={submitting}>
              Back
            </Button>
          )}
          {step === 1 && (
            <Button onClick={goToMapping} disabled={!selectedPacket}>
              Continue
            </Button>
          )}
          {step === 2 && (
            <Button
              onClick={() => setStep(3)}
              disabled={selectedFieldKeys.length === 0 || mappingLoading}
            >
              Continue to alerts
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleCreate} loading={submitting} disabled={submitting}>
              Save product
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepSelectPayload({ packets, loading, selectedPacket, onSelect }) {
  if (loading) {
    return <div className="text-xs text-ink-2 py-8 text-center">Loading recent payloads…</div>;
  }

  if (!packets.length) {
    return (
      <div className="text-xs text-ink-2 py-8 text-center">
        No captured payloads yet — a device needs to send data at least once before you can define a
        product from it.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {packets.map(packet => (
        <button
          key={packet.id}
          onClick={() => onSelect(packet)}
          className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors ${
            selectedPacket?.id === packet.id
              ? 'border-accent-cyan bg-surface-2'
              : 'border-line-soft bg-surface-1 hover:bg-surface-2'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-0">
              {packet.product?.name || <span className="text-ink-2 italic">No product</span>}
            </span>
            <span className="text-[10px] font-mono text-ink-2">{packet.protocol?.name}</span>
          </div>
          <div className="text-[10px] font-mono text-ink-2 mt-1 truncate">
            {JSON.stringify(packet.json_body)}
          </div>
        </button>
      ))}
    </div>
  );
}

function StepNameAndMap({
  selectedPacket,
  productName,
  setProductName,
  deviceProtocolId,
  setDeviceProtocolId,
  deviceProtocols,
  mappingLoading,
  mappingError,
  mappingPreview,
  selectedFields,
  toggleField,
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Raw payload</div>
        <pre className="text-[10px] font-mono text-ink-1 bg-surface-2 rounded-md p-3 overflow-auto max-h-[300px]">
          {JSON.stringify(selectedPacket?.json_body, null, 2)}
        </pre>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-ink-2">Product name</label>
        <Input
          value={productName}
          onChange={e => setProductName(e.target.value)}
          className="mt-1.5 mb-4"
        />

        <label className="text-[10px] uppercase tracking-wider text-ink-2">
          Device protocol <span className="normal-case text-ink-2/70">(optional)</span>
        </label>
        <select
          value={deviceProtocolId}
          onChange={e => setDeviceProtocolId(e.target.value)}
          className="w-full mt-1.5 mb-4 bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
        >
          <option value="">Not set — configure later</option>
          {deviceProtocols.map(protocol => {
            // Same distinction as the Add Device wizard's dropdown: only
            // LoRaWAN is genuinely receivable today (via MQTT through a
            // gateway); Modbus/BACnet/OPC UA need polling that doesn't
            // exist yet.
            const isPollingBased = ['Modbus', 'BACnet', 'OPC UA'].includes(protocol.name);

            return (
              <option key={protocol.id} value={protocol.id}>
                {protocol.name}
                {isPollingBased ? ' (coming soon — polling not yet implemented)' : ''}
              </option>
            );
          })}
        </select>

        <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Fields to map</div>

        {mappingLoading && <div className="text-xs text-ink-2">Generating preview…</div>}
        {mappingError && <div className="text-xs text-danger">{mappingError}</div>}

        {mappingPreview && (
          <div className="space-y-1">
            {mappingPreview.mapping.map(m => (
              <label
                key={m.source_field}
                className="flex items-center gap-2 text-xs py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!selectedFields[m.source_field]}
                  onChange={() => toggleField(m.source_field)}
                  className="accent-accent-cyan"
                />
                <span className="font-mono text-ink-1">{m.source_field}</span>
                <span className="font-mono text-ink-2 ml-auto">{String(m.value)}</span>
              </label>
            ))}
            {mappingPreview.unmapped_fields.map(key => (
              <label key={key} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!selectedFields[key]}
                  onChange={() => toggleField(key)}
                  className="accent-accent-cyan"
                />
                <span className="font-mono text-ink-2">{key}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepAlertConditions({ selectedFieldKeys, conditions, updateCondition }) {
  if (selectedFieldKeys.length === 0) {
    return <div className="text-xs text-ink-2">No fields selected in the previous step.</div>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-2 mb-3">
        Optional — leave a field's value blank to map it without an alert.
      </p>
      {selectedFieldKeys.map(key => {
        const condition = conditions[key] || { operator: '>', value: '', action: 'Email' };

        return (
          <div key={key} className="flex items-center gap-2 bg-surface-2 rounded-md px-3 py-2">
            <span className="text-xs font-mono text-accent-cyan w-40 truncate">{key}</span>
            <select
              value={condition.operator}
              onChange={e => updateCondition(key, { operator: e.target.value })}
              className="bg-surface-3 border border-line rounded text-xs font-mono px-2 py-1 text-ink-0"
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value="=">=</option>
            </select>
            <input
              type="text"
              value={condition.value}
              onChange={e => updateCondition(key, { value: e.target.value })}
              placeholder="threshold"
              className="bg-surface-3 border border-line rounded text-xs font-mono px-2 py-1 w-20 text-ink-0"
            />
            <span className="text-xs text-ink-1">send</span>
            <select
              value={condition.action}
              onChange={e => updateCondition(key, { action: e.target.value })}
              className="bg-surface-3 border border-line rounded text-xs px-2 py-1 text-ink-0"
            >
              <option>Email</option>
              <option>SMS</option>
              <option>System notification</option>
            </select>
          </div>
        );
      })}
    </div>
  );
}
