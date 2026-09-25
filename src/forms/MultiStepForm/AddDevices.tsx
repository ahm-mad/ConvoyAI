// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
// Updated AddDevice.jsx with protocol-based validation
import React, { useState, useEffect } from 'react';
import SecondstepForm from './SecondstepForm';
import ThirdstepForm from './ThirdstepForm';
import FourthstepForm from './FourthstepForm';

import { Check, PackagePlus } from 'lucide-react';
import CrossIcon from '@assets/icons/MUIicons/CrossIcon';
import { useModal } from '@contexts/ModalContext';
import { useToast } from '@contexts/ToastContext';
import Button from '@components/Button';
import { post } from '@utils/apiHelper';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { StartModelDemo } from '../../ConvoyDemo/AddProductModelDemo';
import { isFirstDemo } from '@utils/DemoHelper';

export default function AddDevice({
  product = {},
  startTour = false,
  // Accepted for API compatibility with callers; not used internally.
  isNewProduct = false,
  preSelectedProduct = false,
  productId = '',
  onSuccess = () => {},
  onClose = () => {},
}) {
  const { t } = useTranslation();
  const { closeModal, setPreventClose } = useModal();
  const toast = useToast();
  const hasExistingProduct = Boolean(product?.id);
  const [productResponse, setProductResponse] = useState(null);
  // Set once a product row actually exists (either it was passed in already,
  // or a previous save attempt on THIS product created it — even if every
  // device on that attempt failed validation). Once set, every subsequent
  // save in this modal session retries with `existing_product_id` instead of
  // `product_name`, so a failed-then-corrected retry reuses the same product
  // instead of creating a new orphan one each time. See backend's guidance
  // in backend_frontend_sync/communication/findings.md (2026-09-23).
  const [createdProductId, setCreatedProductId] = useState(hasExistingProduct ? product?.id : null);
  // The last save attempt's import_summary, whenever it had ANY failures
  // (total or partial) — drives the error banner + whether a "Continue"
  // option makes sense (only if something was actually created). Cleared on
  // a clean save. Never a reason to hide the form: see the pruning note on
  // `handleNext` below for why re-showing it, rather than replacing it with
  // a read-only summary, is what makes a safe retry possible at all.
  const [importResults, setImportResults] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (isFirstDemo('AddproductModalDemo')) {
      setIsDemoMode(false);
    }
  }, []);

  const [formData, setFormData] = useState({
    connectivity: {
      isFilled: hasExistingProduct,
      data: {
        type: hasExistingProduct ? 'existing' : '',
        selectedOption: null,
      },
    },
    step1: {
      isFilled: hasExistingProduct,
      data: hasExistingProduct ? product : {},
    },
    step2: {
      isFilled: false,
      data: [{ id: Date.now(), device_unique_identifier: '', name: '', location: '' }],
      csvFile: null,
      csvRows: null,
      csvParseError: null,
    },
    step3: {
      isFilled: false,
      data: {
        selectedOption: 'HTTPS',
        selectedRow: null,
        textInput: '',
        token: null,
        mqttConfig: null,
        protocolName: null, // Add protocol name tracking
      },
    },
  });

  // Both entry points (fresh "Add Product" and an existing product's own
  // "Add Device" button) now start on step 1 — the merged Product & Devices
  // step. There's no separate product-selection step anymore; step 1
  // conditionally shows the name field only when there's no product yet.
  const [step, setStep] = useState(1);

  useEffect(() => {
    setPreventClose(step === 2);
  }, [step]);

  const STEPS = [
    { id: 1, name: t('AddDevice.steps.1') || 'Product & Devices' },
    { id: 2, name: t('AddDevice.steps.2') || 'Network Protocol' },
  ];

  // Runs after a save with no remaining failures to show the user (a clean
  // save, or the user chose "Continue" past a partial success).
  function proceedAfterSave(response) {
    setProductResponse(response);
    setImportResults(null);
    queryClient.invalidateQueries(['products']);

    if (hasExistingProduct) {
      closeModal();
      return;
    }

    setStep(step + 1);
  }

  // A partial-success "Continue" accepts whatever the last save already
  // created and abandons the still-failing rows left in the form — a
  // deliberate choice, not a resubmit (those rows were never sent again).
  function handleContinuePastFailures() {
    proceedAfterSave(productResponse);
  }

  // After ANY save with failures (total or partial), remove the devices that
  // DID get created from the form entirely and keep only the ones that
  // didn't, converting any failed CSV rows into ordinary editable manual
  // rows (the CSV file has already been fully consumed — a re-upload from
  // here would only make sense for a genuinely new file). Matched by
  // `device_unique_identifier`, not array position, since that's the actual
  // uniqueness key both sides care about.
  //
  // This is what makes retrying safe: whatever is left in the form after
  // this is, by construction, exactly the set of devices that were NOT
  // created — so resubmitting it (even unedited) can never re-send an
  // already-created device and hit the "already been used" duplicate error.
  function pruneToUncreatedDevices(response, sentManualDevices, sentCsvRows) {
    const createdIds = new Set((response?.devices || []).map(d => d.device_unique_identifier));
    const remaining = [
      ...sentManualDevices.filter(row => !createdIds.has(row.device_unique_identifier)),
      ...sentCsvRows.filter(row => !createdIds.has(row.device_unique_identifier)),
    ];

    setFormData(prev => ({
      ...prev,
      step2: {
        ...prev.step2,
        data:
          remaining.length > 0
            ? remaining.map(row => ({ ...row, id: Date.now() + Math.random() }))
            : [{ id: Date.now(), device_unique_identifier: '', name: '', location: '' }],
        csvFile: null,
        csvRows: null,
        csvParseError: null,
      },
    }));
  }

  // Form submission handler
  async function handleNext() {
    // Step 1: Save product and devices
    if (step === 1) {
      if (isSaving) return;

      if (isDemoMode) {
        console.log('Demo mode active - skipping save API');
        setStep(step + 1);
        return;
      }

      // Once a product row exists — either it was passed in already, or a
      // previous attempt on this same modal created it even with zero
      // devices — every save retries against that same product instead of
      // sending `product_name` again, which would create a new (orphan)
      // product on every failed-then-corrected retry.
      let payload;
      if (createdProductId) {
        payload = {
          existing_product_id: createdProductId,
          connectivity_type: formData?.connectivity?.data?.type,
        };
      } else {
        payload = {
          product_name: formData?.step1?.data?.name,
          connectivity_type: formData?.connectivity?.data?.type,
        };
      }

      // Manual rows: the default row starts fully blank (no field filled) so
      // a user relying entirely on the CSV can leave it untouched — drop
      // fully-blank rows rather than send them as an empty device.
      // TagInput's isFilled gate already guarantees any row reaching here is
      // either fully blank or fully complete, never half-filled.
      const requiredFields = ['device_unique_identifier', 'name', 'location'];
      const manualDevices = (formData?.step2?.data || []).filter(row =>
        requiredFields.some(field => Boolean(row[field]))
      );
      const sentCsvRows = formData?.step2?.csvRows || [];

      const body = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) body.append(key, value);
      });
      body.append('devices', JSON.stringify(manualDevices));
      if (formData?.step2?.csvFile) {
        body.append('file', formData.step2.csvFile);
      }

      setIsSaving(true);
      let response;
      try {
        // showToast=false: this call's own success/failure is nuanced
        // (created vs. failed device counts, not just an HTTP 2xx), so this
        // component shows its own accurate feedback below instead of the
        // generic "it worked" toast `post()` would otherwise show even when
        // zero devices were actually created.
        response = await post(
          '/api/products',
          body,
          { headers: { 'Content-Type': 'multipart/form-data' } },
          false
        );
      } finally {
        setIsSaving(false);
      }

      // The product row persists even when every device on this attempt
      // fails validation (backend confirmed, 2026-09-23) — remember its id
      // so the NEXT attempt (after the user fixes their input) retries
      // against it instead of creating another one.
      if (response?.product?.id) {
        setCreatedProductId(response.product.id);
      }

      if (!response?.success) {
        toast.error(
          response?.message || 'Failed to save. Please check your entries and try again.'
        );
        return;
      }

      const createdCount =
        response?.import_summary?.created_count ?? response?.devices?.length ?? 0;
      const failedCount = response?.import_summary?.failed_count ?? 0;

      if (failedCount > 0) {
        // Total or partial failure: keep the user on this screen either way
        // — there's nothing to move forward to on a total failure, and on a
        // partial one the remaining rows are still worth fixing. Prune what
        // already succeeded out of the form (see above) so a resubmit can't
        // re-send it, then surface exactly what's left to fix.
        pruneToUncreatedDevices(response, manualDevices, sentCsvRows);
        setProductResponse(response);
        setImportResults(response.import_summary);
        toast.error(
          createdCount === 0
            ? response?.message ||
                'No devices could be created — fix the errors below and try again.'
            : response?.message ||
                `${createdCount} of ${createdCount + failedCount} devices created.`
        );
        return;
      }

      setImportResults(null);
      proceedAfterSave(response);
      return;
    }

    // Step 2 (Network Protocol): handle protocol-specific logic on Acknowledge.
    // The `step3` data-bucket key name is unchanged internally — only the UI
    // step number moved from 3 to 2 when step 1+2 merged.
    if (step === 2) {
      const isHttps = formData.step3.data.protocolName === 'HTTPS';

      if (isHttps) {
        closeModal();
        return;
      }

      // For MQTT: Send configuration
      const mqttPayload = {
        product_id: productResponse?.product?.id,
        protocol_id: formData.step3.data.selectedRow,
        token: formData.step3.data.token,
        company_id: productResponse?.product?.company_id,
      };

      // Add MQTT config if available
      if (formData.step3.data.mqttConfig) {
        mqttPayload.host = formData.step3.data.mqttConfig.host;
        mqttPayload.port = formData.step3.data.mqttConfig.port;
        mqttPayload.ssl_mode = formData.step3.data.mqttConfig.sslMode;

        // Add certificates if SSL mode requires them
        if (formData.step3.data.mqttConfig.caCertificate) {
          mqttPayload.ca_certificate = formData.step3.data.mqttConfig.caCertificate;
        }
        if (formData.step3.data.mqttConfig.clientCertificate) {
          mqttPayload.client_certificate = formData.step3.data.mqttConfig.clientCertificate;
        }
        if (formData.step3.data.mqttConfig.clientKey) {
          mqttPayload.client_key = formData.step3.data.mqttConfig.clientKey;
        }
        if (formData.step3.data.mqttConfig.keyPassPhrase) {
          mqttPayload.key_pass_phrase = formData.step3.data.mqttConfig.keyPassPhrase;
        }

        // Add authentication if enabled
        if (formData.step3.data.mqttConfig.useAuth) {
          mqttPayload.username = formData.step3.data.mqttConfig.username;
          mqttPayload.password = formData.step3.data.mqttConfig.password;
        }
      }

      console.log('MQTT Configuration submitted:', mqttPayload);

      const response = await post(`/api/mqtt-configurations/`, mqttPayload);

      if (!response.success) return;

      closeModal();
      return;
    }

    // For other steps, just move forward
    if (step < 2) {
      setStep(step + 1);
    }
  }

  // Handle Enter key press
  useEffect(() => {
    const handleGlobalKeyDown = e => {
      if (e.key === 'Enter' && !isNextButtonDisabled()) {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [step, formData, isSaving]);

  const getButtonText = () => {
    if (step === 1) return isSaving ? 'Saving...' : t('AddDevice.button.save') || 'Save';
    if (step === 2) return t('AddDevice.button.acknowledge') || 'Acknowledge';
    return t('AddDevice.button.next') || 'Next';
  };

  const isNextButtonDisabled = () => {
    if (isSaving) return true;

    // Step 1 (Product & Devices)
    if (step === 1 && (!formData?.step1?.isFilled || !formData?.step2?.isFilled)) return true;

    // Step 2 (Network Protocol): protocol-specific validation
    if (step === 2) {
      const isHttps = formData.step3.data.protocolName === 'HTTPS';

      // HTTPS: No validation needed, always enabled
      if (isHttps) return false;

      // MQTT: Check if form is filled
      return !formData?.step3?.isFilled;
    }

    return false;
  };

  const renderStepForm = () => {
    switch (step) {
      case 1:
        return (
          <div id="product-devices-form" className="space-y-6 pt-1">
            {!hasExistingProduct && (
              <SecondstepForm
                formData={formData}
                setFormData={setFormData}
                locked={Boolean(createdProductId)}
              />
            )}
            <ThirdstepForm
              formData={formData}
              setFormData={setFormData}
              importResults={importResults}
            />
          </div>
        );
      case 2:
        return (
          <div id="integration-form" className="pt-1">
            <FourthstepForm
              formData={formData}
              setFormData={setFormData}
              productResponse={productResponse}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // No back button anywhere in this modal, on purpose: step 1 IS the save
  // point (creates the product + devices) — by the time step 2 (Network
  // Protocol) is reachable, that creation has already happened. A back
  // button there would let a user return to step 1 and click Save again,
  // resubmitting and creating a duplicate product. (This matches the old
  // 3-step flow's own behavior — it never had a back button past its save
  // step either, just at a different step number.)
  const renderBackButton = () => null;

  const getNextButtonId = () => {
    switch (step) {
      case 1:
        return 'step-1-save-button';
      case 2:
        return 'acknowledge-button';
      default:
        return 'next-button';
    }
  };

  return (
    <div className="flex items-center justify-center">
      {isDemoMode && <StartModelDemo setFormData={setFormData} />}
      {/* w-[860px] (not max-w alone) — same reasoning as the fixed-height
          content area below: without a real width, not just a cap, the
          dialog shrinks to fit whichever step/tab has the narrowest content
          (the MQTT placeholder especially), causing the same resize/jump on
          the horizontal axis. max-w-[95vw] is just a safety cap for very
          narrow viewports. */}
      <div className="w-[860px] max-w-[95vw] items-center p-5 relative">
        <button
          type="button"
          onClick={step === 2 ? undefined : closeModal}
          disabled={step === 2}
          title={step === 2 ? 'Finish this step to close' : 'Close'}
          className={`absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
            step === 2
              ? 'opacity-40 cursor-not-allowed text-ink-2'
              : 'text-ink-1 hover:text-ink-0 hover:bg-surface-2 cursor-pointer'
          }`}
        >
          <CrossIcon size="small" />
        </button>

        <div className="flex max-md:justify-center items-center gap-3" id="add-device-modal-header">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent-cyan/10 text-accent-cyan shrink-0">
            <PackagePlus className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="font-semibold text-lg text-ink-0 leading-tight">
              {t('AddDevice.addDevices') || 'Add Device'}
            </h1>
            {!hasExistingProduct && (
              <p className="text-xs text-ink-2 leading-tight mt-0.5">
                {t('AddDevice.step') || 'Step'} {step} of {STEPS.length}
              </p>
            )}
          </div>
        </div>

        {/* Step indicators - Hide when hasExistingProduct is true */}
        {!hasExistingProduct && (
          <div className="mt-6 flex items-center" id="step-indicators">
            {STEPS.map((stepItem, i) => {
              const isActive = step === stepItem.id;
              const isCompleted = step > stepItem.id;
              return (
                <div
                  key={stepItem.id}
                  className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}
                  data-step={stepItem.id}
                >
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div
                      className={`flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-semibold shrink-0 transition-colors ${
                        isCompleted
                          ? 'bg-accent-cyan border-accent-cyan text-surface-0'
                          : isActive
                            ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10'
                            : 'border-line text-ink-2'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepItem.id}
                    </div>
                    <div
                      className={`text-sm font-medium whitespace-nowrap max-sm:hidden ${
                        isActive || isCompleted ? 'text-ink-0' : 'text-ink-2'
                      }`}
                    >
                      {stepItem.name}
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-[2px] mx-3 rounded transition-colors ${
                        isCompleted ? 'bg-accent-cyan' : 'bg-line'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Current step form — fixed height so switching steps (or HTTPS/MQTT
            tabs within step 2) doesn't resize/reposition the whole dialog;
            content taller than this scrolls internally instead. Two heights,
            not one: `hasExistingProduct` never changes within a single open
            modal (it's fixed at mount from the `product` prop), and that flow
            never reaches step 2 at all (see `proceedAfterSave` above) — so it
            can use a shorter height sized for its own (shorter) step 1
            content instead of inheriting the taller value the full
            product+devices+network-protocol flow needs. Within either flow
            the height still never changes, which is what actually prevents
            the resize/flicker this was built to fix. */}
        <div
          className={`overflow-y-auto pr-1 mt-2 ${hasExistingProduct ? 'h-[480px]' : 'h-[600px]'}`}
        >
          {renderStepForm()}
        </div>

        <div
          className="flex pt-4 mt-2 gap-3 justify-end border-t border-line"
          id={step === 1 ? 'step-2-navigation' : undefined}
        >
          {renderBackButton()}
          {/* Only offered once something from the last attempt actually
              exists to move forward with — a total failure (created_count:
              0) has nothing to continue to, so this stays hidden and Save
              is the only option. */}
          {step === 1 && importResults && importResults.created_count > 0 && (
            <Button
              variant="secondary"
              size="large"
              onClick={handleContinuePastFailures}
              id="continue-past-failures-button"
            >
              Continue with {importResults.created_count} created
            </Button>
          )}
          <Button
            size="large"
            onClick={handleNext}
            disabled={isNextButtonDisabled()}
            id={getNextButtonId()}
          >
            {getButtonText()}
          </Button>
        </div>
      </div>
    </div>
  );
}
