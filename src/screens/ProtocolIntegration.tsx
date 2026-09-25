/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useToast } from '@contexts/ToastContext';
import { useParams } from '@lib/router-compat';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import GlobalInput from '../components/Input';
import Buttton from '../components/Button';
import { post, put, del } from '../utils/apiHelper';

interface ProtocolIntegrationProps {
  productID?: string;
}

interface MqttFormValues {
  host: string;
  port: string;
  username: string;
  use_tls: boolean;
}

interface HttpFormValues {
  product_name: string;
}

// Validation Schema
const MqttConfigSchema = yup.object().shape({
  host: yup.string().required('Host is required'),
  port: yup
    .number()
    .typeError('Port must be a number')
    .required('Port is required')
    .positive('Port must be positive')
    .integer('Port must be an integer'),
  username: yup.string().required('Username is required'),
  use_tls: yup.boolean(),
});

function ProtocolIntegration({ productID: propProductID }: ProtocolIntegrationProps) {
  const { id: paramProductID } = useParams<{ id: string }>();
  const productID = propProductID || paramProductID;

  const [activeTab, setActiveTab] = useState('http');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toast = useToast();
  const webHookLink = 'https://api.example.com/api/webhook';

  // React Hook Form setup for MQTT
  const {
    control: mqttControl,
    handleSubmit: handleMqttSubmit,
    setValue: setMqttValue,
    watch: watchMqtt,
    formState: { errors: mqttErrors },
  } = useForm<MqttFormValues>({
    resolver: yupResolver(MqttConfigSchema) as any,
    defaultValues: {
      host: '',
      port: '',
      username: '',
      use_tls: false,
    },
  });

  // React Hook Form setup for HTTP
  const {
    control: httpControl,
    handleSubmit: handleHttpSubmit,
    setValue: setHttpValue,
    watch: watchHttp,
  } = useForm<HttpFormValues>({
    defaultValues: {
      product_name: '',
    },
  });

  const {
    data: productConfiguration,
    isLoading,
    error,
  } = useSimpleQuery(`productConfiguration-${productID}`, `/api/product-settings/${productID}`, {
    enabled: !!productID,
  });

  const {
    data: mqttConfiguration,
    isLoading: mqttLoading,
    error: mqttError,
    refetch: refetchMqtt,
  } = useSimpleQuery(`mqttConfiguration-${productID}`, `/api/mqtt-configurations/`, {
    enabled: !!productID && activeTab === 'mqtt',
  });

  const productName = productConfiguration?.product_name || '';
  const token = productConfiguration?.token || '';
  const mqttData: any = mqttConfiguration?.data?.[0] || {};
  const mqttConfigId = mqttData?.id || '';

  // Watch form values
  const mqttFormData = watchMqtt();
  const httpFormData = watchHttp();

  // Update HTTP form when product configuration loads
  useEffect(() => {
    if (productConfiguration?.product_name) {
      setHttpValue('product_name', productConfiguration.product_name);
    }
  }, [productConfiguration, setHttpValue]);

  // Update MQTT form when configuration loads
  useEffect(() => {
    if (mqttData && mqttData.id) {
      setMqttValue('host', mqttData.host || '');
      setMqttValue('port', mqttData.port || '');
      setMqttValue('username', mqttData.username || '');
      setMqttValue('use_tls', mqttData.use_tls || false);
    }
  }, [mqttData, setMqttValue]);

  async function handleCopy(incomingText: string) {
    if (!incomingText) return;
    try {
      await navigator.clipboard.writeText(incomingText);
      toast.success('Copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy');
    }
  }

  async function handleTestConnection() {
    if (activeTab === 'mqtt') {
      if (!mqttConfigId) {
        toast.error('MQTT configuration ID not found');
        return;
      }

      setIsTestingConnection(true);
      try {
        const result = await post(`/api/mqtt-configurations/${mqttConfigId}/test`);
        console.log('Test result:', result);

        if (result.error) {
          console.error('Test failed:', result.message);
        } else {
          console.log('Test successful:', result.message);
        }
      } catch (err) {
        console.error('Test connection error:', err);
        toast.error('Failed to test MQTT connection');
      } finally {
        setIsTestingConnection(false);
      }
    }
  }

  async function handleDeleteConfiguration() {
    try {
      const result = await del(`/api/mqtt-configurations/${mqttConfigId}`);
      setMqttValue('host', '');
      setMqttValue('port', '');
      setMqttValue('username', '');
      setMqttValue('use_tls', false);
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  const onMqttSubmit = async (data: MqttFormValues) => {
    if (!mqttConfigId) {
      // toast.error('MQTT configuration ID not found');
      return;
    }

    setIsSaving(true);
    try {
      const result = await put(`/api/mqtt-configurations/${mqttConfigId}`, {
        host: data.host,
        port: parseInt(data.port),
        username: data.username,
        use_tls: data.use_tls,
      });

      console.log('Save result:', result);

      if (result.error) {
        console.error('Save failed:', result.message);
      } else {
        console.log('Save successful:', result.message);
        refetchMqtt();
      }
    } catch (err) {
      console.error('Save configuration error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const onHttpSubmit = async (data: HttpFormValues) => {
    console.log('HTTP form submitted:', data);
    // toast.info('HTTP configuration saved');
  };

  return (
    <div className="w-full max-w-5xl">
      {/* Tab Navigation */}
      <div className="border-b border-line mb-5">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('http')}
            className={`px-6 py-3 font-medium text-base cursor-pointer transition-all relative ${
              activeTab === 'http' ? 'text-ink-0' : 'text-ink-2 hover:text-ink-1'
            }`}
          >
            HTTP
            {activeTab === 'http' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-cyan"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('mqtt')}
            className={`px-6 py-3 font-medium text-base cursor-pointer transition-all relative ${
              activeTab === 'mqtt' ? 'text-ink-0' : 'text-ink-2 hover:text-ink-1'
            }`}
          >
            MQTT
            {activeTab === 'mqtt' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-cyan"></span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'http' && (
        <form onSubmit={handleHttpSubmit(onHttpSubmit)}>
          <div className="glass-strong  p-6">
            <h3 className="text-sm font-semibold text-ink-0 mb-5 flex items-center gap-2 uppercase tracking-wider">
              HTTP configuration
            </h3>

            <div className="grid grid-cols-12 gap-4">
              {/* Product Name */}
              <div className="col-span-12 md:col-span-3">
                <label className="block mb-2 text-text-dark font-medium">Product Name:</label>
              </div>
              <div className="col-span-12 md:col-span-9">
                <div className="w-[80%] max-xl:w-[100%]">
                  <Controller
                    name="product_name"
                    control={httpControl}
                    render={({ field }) => (
                      <GlobalInput {...field} placeholder="Enter product name" fullWidth={true} />
                    )}
                  />
                </div>
              </div>

              {/* Webhook Link */}
              <div className="col-span-12 md:col-span-3">
                <label className="block mb-2 text-text-dark font-medium">Webhook Link:</label>
              </div>
              <div className="col-span-12 md:col-span-9">
                <div className="bg-surface-2 w-[80%] max-xl:w-[100%] rounded-md border border-line-soft p-2 flex flex-wrap justify-between gap-2">
                  <div className="text-text-dark my-auto overflow-hidden flex-grow">
                    {webHookLink}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Buttton
                      sx={{
                        borderRadius: '7px',
                        width: 'auto',
                        minWidth: '50px',
                        height: '32px',
                        backgroundColor: 'var(--color-primary)',
                        '&:hover': {
                          boxShadow: 'none',
                          backgroundColor: 'var(--color-primary-dark)',
                        },
                      }}
                      onClick={() => handleCopy(webHookLink)}
                    >
                      Copy
                    </Buttton>
                  </div>
                </div>
              </div>

              {/* Webhook Token */}
              <div className="col-span-12 md:col-span-3">
                <label className="block mb-2 text-text-dark font-medium">Webhook Token:</label>
              </div>
              <div className="col-span-12 md:col-span-9">
                <div className="bg-surface-2 w-[80%] max-xl:w-[100%] rounded-md border border-line-soft p-2 flex flex-wrap justify-between gap-2">
                  <div className="text-text-dark text-sm my-auto w-[80%] overflow-hidden">
                    {token}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Buttton
                      sx={{
                        borderRadius: '7px',
                        width: 'auto',
                        minWidth: '50px',
                        height: '32px',
                        backgroundColor: 'var(--color-primary)',
                        '&:hover': {
                          boxShadow: 'none',
                          backgroundColor: 'var(--color-primary-dark)',
                        },
                      }}
                      onClick={() => handleCopy(token)}
                    >
                      Copy
                    </Buttton>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button for HTTP */}
            <div className="mt-4">
              <button
                type="submit"
                className="px-3 py-2.5 brand-gradient-bg on-gradient font-semibold text-xs rounded-md hover:brightness-110 transition-all"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      )}

      {/* MQTT Tab Content */}
      {activeTab === 'mqtt' && (
        <form onSubmit={handleMqttSubmit(onMqttSubmit)}>
          <div className="glass-strong  p-6">
            <h3 className="text-sm font-semibold text-ink-0 mb-5 flex items-center gap-2 uppercase tracking-wider">
              MQTT configuration
            </h3>

            {mqttLoading ? (
              <div className="text-center py-4 text-ink-2 text-sm">
                Loading MQTT configuration...
              </div>
            ) : mqttError ? (
              <div className="text-center py-4 text-danger text-sm">
                Failed to load MQTT configuration
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-4">
                {/* Host */}
                <div className="col-span-12 md:col-span-3">
                  <label className="block mb-2 text-text-dark font-medium">Host:</label>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <div className="w-[80%] max-xl:w-[100%]">
                    <Controller
                      name="host"
                      control={mqttControl}
                      render={({ field }) => (
                        <GlobalInput
                          {...field}
                          placeholder="mqtt://broker.example.com"
                          fullWidth={true}
                          error={!!mqttErrors.host}
                          helperText={mqttErrors.host?.message}
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Port */}
                <div className="col-span-12 md:col-span-3">
                  <label className="block mb-2 text-text-dark font-medium">Port:</label>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <div className="w-[80%] max-xl:w-[100%]">
                    <Controller
                      name="port"
                      control={mqttControl}
                      render={({ field }) => (
                        <GlobalInput
                          {...field}
                          type="number"
                          placeholder="1883"
                          fullWidth={true}
                          error={!!mqttErrors.port}
                          helperText={mqttErrors.port?.message}
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Username */}
                <div className="col-span-12 md:col-span-3">
                  <label className="block mb-2 text-text-dark font-medium">Username:</label>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <div className="w-[80%] max-xl:w-[100%]">
                    <Controller
                      name="username"
                      control={mqttControl}
                      render={({ field }) => (
                        <GlobalInput
                          {...field}
                          placeholder="Enter username"
                          fullWidth={true}
                          error={!!mqttErrors.username}
                          helperText={mqttErrors.username?.message}
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                {/* <div className="col-span-12 md:col-span-3"></div> */}
                <div className="col-span-12 mt-4  md:col-span-9">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTestingConnection || !mqttConfigId}
                      className="px-3 py-2.5 bg-surface-2 border border-line cursor-pointer text-ink-1 font-medium text-xs rounded-md hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingConnection ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !mqttConfigId}
                      className="px-3 py-2.5 brand-gradient-bg on-gradient cursor-pointer font-semibold text-xs rounded-md hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : 'Save Configuration'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteConfiguration}
                      disabled={!mqttConfigId}
                      className="px-3 py-2.5 bg-danger cursor-pointer text-white font-semibold text-xs rounded-md hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete Config
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default ProtocolIntegration;
