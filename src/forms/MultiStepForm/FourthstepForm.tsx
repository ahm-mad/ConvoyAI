// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect } from 'react';
import ReuseAbleBox from '../FormComponents/ReuseAbleBox';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { post } from '@utils/apiHelper';
import { useTranslation } from 'react-i18next';
import { useToast } from '@contexts/ToastContext';
import { AlertTriangle, Globe, Radio } from 'lucide-react';
import HTTPProtocol from '../../components/HTTPProtocol';
// MQTT is incomplete on both frontend and backend — commented out rather than
// deleted so it's easy to bring back once it's real. See the placeholder in
// the tab-content render below.
// import MQTTProtocol from '../../components/MQTTProtocol';

function FourthstepForm({ formData, setFormData, productResponse }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [webHookToken, setWebHookToken] = useState('');
  const [activeTab, setActiveTab] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const { data: protocols } = useSimpleQuery('protocols', `/api/protocols`);

  // Sort protocols to show HTTPS first
  const sortedProtocols = protocols?.data?.sort((a, b) => {
    if (a.name === 'HTTPS') return -1;
    if (b.name === 'HTTPS') return 1;
    return 0;
  });

  useEffect(() => {
    if (sortedProtocols?.length && !activeTab && isInitialLoad) {
      const httpsProtocol = sortedProtocols.find(p => p.name === 'HTTPS');
      if (httpsProtocol) {
        setActiveTab(httpsProtocol.id);
      }
    }
  }, [sortedProtocols, activeTab, isInitialLoad]);

  useEffect(() => {
    if (activeTab && productResponse?.product?.id && isInitialLoad) {
      getToken();
      setIsInitialLoad(false);
    }
  }, [activeTab, productResponse?.product?.id, isInitialLoad]);

  const getToken = async () => {
    let localTokenState = '';

    try {
      const response = await post(
        `/api/get-encrypt-token`,
        {
          protocol_id: activeTab,
          product_id: productResponse?.product?.id,
        },
        {},
        false
      );

      if (response?.success) {
        localTokenState = response?.token?.token;
        setWebHookToken(response?.token?.token);
      }
    } catch (error) {
      console.log('Error getting hashed token:- ', error);
    }

    const currentProtocol = sortedProtocols?.find(p => p.id === activeTab);
    const isHttps = currentProtocol?.name === 'HTTPS';

    setFormData(prev => ({
      ...prev,
      step3: {
        isFilled: isHttps,
        data: {
          ...prev.step3.data,
          selectedRow: activeTab,
          token: localTokenState,
          protocolName: currentProtocol?.name,
        },
      },
    }));
  };

  const handleTabChange = (id, name) => {
    setActiveTab(id);
    const currentProtocol = sortedProtocols?.find(p => p.id === id);
    const isHttps = currentProtocol?.name === 'HTTPS';

    // Reset isFilled based on protocol type
    setFormData(prev => ({
      ...prev,
      step3: {
        ...prev.step3,
        isFilled: isHttps, // HTTPS is auto-filled, MQTT needs form completion
        data: {
          ...prev.step3.data,
          selectedOption: name,
          selectedRow: id,
          protocolName: currentProtocol?.name,
          mqttConfig: isHttps ? null : prev.step3.data.mqttConfig,
        },
      },
    }));

    // Get new token for the selected protocol
    if (productResponse?.product?.id) {
      getTokenForProtocol(id, currentProtocol?.name);
    }
  };

  const getTokenForProtocol = async (protocolId, protocolName) => {
    try {
      const response = await post(
        `/api/get-encrypt-token`,
        {
          protocol_id: protocolId,
          product_id: productResponse?.product?.id,
        },
        {},
        false
      );

      if (response?.success) {
        setWebHookToken(response?.token?.token);
        setFormData(prev => ({
          ...prev,
          step3: {
            ...prev.step3,
            data: {
              ...prev.step3.data,
              token: response?.token?.token,
              protocolName: protocolName,
            },
          },
        }));
      }
    } catch (error) {
      console.log('Error getting hashed token:- ', error);
    }
  };

  // MQTT config handler — unused while MQTT is a coming-soon placeholder
  // below, kept alongside the commented-out <MQTTProtocol> usage for when
  // it's real.
  // const handleMqttConnect = (config, isValid) => {
  //   setFormData(prev => ({
  //     ...prev,
  //     step3: {
  //       ...prev.step3,
  //       isFilled: isValid,
  //       data: {
  //         ...prev.step3.data,
  //         mqttConfig: config,
  //       },
  //     },
  //   }));
  // };

  async function handleCopy() {
    if (!webHookToken) return;
    try {
      await navigator.clipboard.writeText(webHookToken);
      toast.success('Token copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy');
    }
  }

  const currentProtocol = sortedProtocols?.find(p => p.id === activeTab);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-semibold text-ink-0">
          {t('thirdStepForm.title').replace(/-\s*$/, '')}
        </h1>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-warning/10 text-warning">
          <AlertTriangle className="w-3 h-3" />
          {t('thirdStepForm.warning')}
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-5">
        <div className="flex border-b border-line">
          {sortedProtocols?.map(tab => {
            const Icon = tab.name === 'HTTPS' ? Globe : Radio;
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-1.5 px-6 py-3 text-sm font-medium cursor-pointer border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/5'
                    : 'border-transparent text-ink-2 hover:text-ink-1 hover:border-line'
                }`}
                onClick={() => handleTabChange(tab.id, tab.name)}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* <div className="flex mt-8 gap-6 flex-wrap justify-between">
        <div className="w-full">
          <ReuseAbleBox
            className={`w-full h-fit border-2 border-primary-light`}
            Heading={t('thirdStepForm.instructions')}
            headingStyle="-mt-2"
          />
        </div>
      </div> */}

      {/* Tab Content */}
      <div className="mt-4 flex justify-between gap-6">
        <div className="w-[100%]">
          {currentProtocol?.name === 'HTTPS' ? (
            <HTTPProtocol webHookToken={webHookToken} handleCopy={handleCopy} />
          ) : (
            // MQTTProtocol form commented out above — incomplete on both
            // frontend and backend. Placeholder until it's real; the
            // Acknowledge button stays disabled while this tab is active
            // (formData.step3.isFilled never becomes true for MQTT without
            // a real config handler wired up).
            <div className="border border-dashed border-line rounded-md p-8 text-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-3 text-ink-1 mx-auto mb-3">
                <Radio className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-ink-0">MQTT — Coming Soon</p>
              <p className="text-xs text-ink-2 mt-1.5 max-w-sm mx-auto">
                MQTT connectivity isn't available yet. Use HTTPS for now — we'll let you know when
                MQTT support ships.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FourthstepForm;
