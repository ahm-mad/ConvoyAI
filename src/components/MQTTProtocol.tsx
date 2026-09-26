// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import GlobalInput from './Input';
import SelectRadix from './Select';

// Validation schema without translations
const MQTTFormSchema = () => {
  return yup.object().shape({
    host: yup
      .string()
      .required('Hostname is required')
      .test('valid-hostname', 'Invalid hostname format', value => {
        if (!value) return false;
        const hostnameRegex =
          /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return hostnameRegex.test(value);
      }),
    port: yup
      .string()
      .required('Port is required')
      .matches(/^\d{4}$/, 'Port must be 4 digits')
      .test('valid-port', 'Port must be between 1000-9999', value => {
        if (!value) return false;
        const portNum = parseInt(value, 10);
        return portNum >= 1000 && portNum <= 9999;
      }),
    sslMode: yup.string().oneOf(['none', 'ca-signed', 'self-signed', 'self-signed-client']),
    caCertificate: yup.string().when('sslMode', {
      is: val => ['ca-signed', 'self-signed', 'self-signed-client'].includes(val),
      then: schema =>
        schema
          .required('CA certificate is required for this SSL mode')
          .test('not-empty', 'CA certificate cannot be empty', value => value?.trim().length > 0)
          .test('valid-format', 'Invalid certificate format', value =>
            value?.trim().includes('BEGIN CERTIFICATE')
          ),
      otherwise: schema => schema.notRequired(),
    }),
    clientCertificate: yup.string().when('sslMode', {
      is: 'self-signed-client',
      then: schema =>
        schema
          .required('Client certificate is required')
          .test(
            'not-empty',
            'Client certificate cannot be empty',
            value => value?.trim().length > 0
          )
          .test('valid-format', 'Invalid certificate format', value =>
            value?.trim().includes('BEGIN CERTIFICATE')
          ),
      otherwise: schema => schema.notRequired(),
    }),
    clientKey: yup.string().when('sslMode', {
      is: 'self-signed-client',
      then: schema =>
        schema
          .required('Client key is required')
          .test('not-empty', 'Client key cannot be empty', value => value?.trim().length > 0)
          .test('valid-format', 'Invalid key format', value => {
            const trimmed = value?.trim();
            return trimmed?.includes('BEGIN') && trimmed?.includes('KEY');
          }),
      otherwise: schema => schema.notRequired(),
    }),
    keyPassPhrase: yup.string().notRequired(),
    username: yup.string().when('$useAuth', {
      is: true,
      then: schema =>
        schema
          .required('Username is required when authentication is enabled')
          .min(3, 'Username must be at least 3 characters'),
      otherwise: schema => schema.notRequired(),
    }),
    password: yup.string().when('$useAuth', {
      is: true,
      then: schema =>
        schema
          .required('Password is required when authentication is enabled')
          .min(6, 'Password must be at least 6 characters'),
      otherwise: schema => schema.notRequired(),
    }),
  });
};

const MQTTProtocol = ({ onConnect, formData, setFormData }) => {
  const [useAuth, setUseAuth] = useState(formData?.step3?.data?.mqttConfig?.useAuth || false);
  const [sslMode, setSslMode] = useState(formData?.step3?.data?.mqttConfig?.sslMode || 'none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    trigger,
    watch,
    setValue,
    reset,
  } = useForm({
    mode: 'onChange',
    reValidateMode: 'onChange',
    resolver: yupResolver(MQTTFormSchema()),
    context: { useAuth },
    defaultValues: {
      host: formData?.step3?.data?.mqttConfig?.host || '',
      port: formData?.step3?.data?.mqttConfig?.port || '',
      sslMode: formData?.step3?.data?.mqttConfig?.sslMode || 'none',
      caCertificate: formData?.step3?.data?.mqttConfig?.caCertificate || '',
      clientCertificate: formData?.step3?.data?.mqttConfig?.clientCertificate || '',
      clientKey: formData?.step3?.data?.mqttConfig?.clientKey || '',
      keyPassPhrase: formData?.step3?.data?.mqttConfig?.keyPassPhrase || '',
      username: formData?.step3?.data?.mqttConfig?.username || '',
      password: formData?.step3?.data?.mqttConfig?.password || '',
    },
  });

  const protocol = watch('protocol');
  const version = watch('version');
  const host = watch('host');
  const port = watch('port');
  const caCertificate = watch('caCertificate');
  const clientCertificate = watch('clientCertificate');
  const clientKey = watch('clientKey');
  const keyPassPhrase = watch('keyPassPhrase');
  const username = watch('username');
  const password = watch('password');

  useEffect(() => {
    if (!formData?.step3?.data?.mqttConfig) return;

    const config = formData.step3.data.mqttConfig;
    reset({
      host: config.host || '',
      port: config.port || '',
      sslMode: config.sslMode || 'none',
      caCertificate: config.caCertificate || '',
      clientCertificate: config.clientCertificate || '',
      clientKey: config.clientKey || '',
      keyPassPhrase: config.keyPassPhrase || '',
      username: config.username || '',
      password: config.password || '',
    });

    setUseAuth(config.useAuth || false);
    setSslMode(config.sslMode || 'none');
    setConnectionTested(config.connectionTested || false);
  }, [formData?.step3?.data?.mqttConfig, reset]);

  // Check if all visible required fields are filled
  const checkIfFormComplete = () => {
    // Basic required fields
    if (!host || !port) return false;

    // Check SSL mode based fields
    const showCaCertificate = ['ca-signed', 'self-signed', 'self-signed-client'].includes(sslMode);
    const showClientCertificates = sslMode === 'self-signed-client';

    if (showCaCertificate && !caCertificate?.trim()) return false;
    if (showClientCertificates && (!clientCertificate?.trim() || !clientKey?.trim())) return false;

    // Check authentication fields
    if (useAuth && (!username?.trim() || !password?.trim())) return false;

    // Check if form is valid according to yup schema
    return isValid;
  };

  // Update formData whenever form values change
  useEffect(() => {
    const values = {
      protocol,
      version,
      host,
      port,
      sslMode,
      caCertificate,
      clientCertificate,
      clientKey,
      keyPassPhrase,
      useAuth,
      username: useAuth ? username : '',
      password: useAuth ? password : '',
      connectionTested,
    };

    const isFormComplete = checkIfFormComplete();

    setFormData(prev => ({
      ...prev,
      step3: {
        ...prev.step3,
        isFilled: isFormComplete, // Enable Acknowledge if all visible fields are filled
        data: {
          ...prev.step3.data,
          mqttConfig: values,
        },
      },
    }));
  }, [
    protocol,
    version,
    host,
    port,
    sslMode,
    caCertificate,
    clientCertificate,
    clientKey,
    keyPassPhrase,
    useAuth,
    username,
    password,
    connectionTested,
    isValid,
    setFormData,
  ]);

  // Reset connection tested flag when form values change
  useEffect(() => {
    if (connectionTested) {
      setConnectionTested(false);
    }
  }, [
    host,
    port,
    sslMode,
    caCertificate,
    clientCertificate,
    clientKey,
    useAuth,
    username,
    password,
  ]);

  const onSubmit = async data => {
    console.log('MQTT Configuration submitted:', data);
    try {
      setIsSubmitting(true);
      //  Replace this with your actual API call

      await new Promise(resolve => setTimeout(resolve, 1000));

      const success = true;

      if (success) {
        // Create complete config object
        const config = {
          host: data.host,
          port: data.port,
          sslMode: data.sslMode,
          caCertificate: data.caCertificate,
          clientCertificate: data.clientCertificate,
          clientKey: data.clientKey,
          keyPassPhrase: data.keyPassPhrase,
          useAuth: useAuth,
          username: useAuth ? data.username : '',
          password: useAuth ? data.password : '',
          connectionTested: true,
        };

        // Mark connection as tested
        setConnectionTested(true);

        // Call parent's onConnect with config and validation status
        if (onConnect) {
          onConnect(config, true);
        }

        console.log('Connection test successful!');
        // You can add a success toast here
      } else {
        // Connection failed
        setConnectionTested(false);
        if (onConnect) {
          onConnect(null, false);
        }
        console.error('Connection test failed');
        // You can add an error toast here
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      setConnectionTested(false);
      if (onConnect) {
        onConnect(null, false);
      }
      // You can add an error toast here
    } finally {
      setIsSubmitting(false);
    }
  };

  const sslModeOptions = [
    { value: 'none', label: 'None' },
    { value: 'ca-signed', label: 'CA signed server certificate' },
    { value: 'self-signed', label: 'Self-signed server certificate' },
    { value: 'self-signed-client', label: 'Self-signed server & client certificate' },
  ];

  const showCaCertificate = ['ca-signed', 'self-signed', 'self-signed-client'].includes(sslMode);
  const showClientCertificates = sslMode === 'self-signed-client';

  return (
    <div className="p-6 bg-surface-1 rounded-md">
      {/* Instructions Section */}
      <div className="mb-6 bg-accent-cyan/5 border border-accent-cyan/20 rounded-md p-4">
        <h3 className="text-sm font-semibold text-ink-0 mb-2 uppercase tracking-wider">
          Instructions
        </h3>
        <div className="text-xs text-ink-1 space-y-2">
          <p>Configure your MQTT broker connection settings:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Enter the hostname and port of your MQTT broker</li>
            <li>Select appropriate SSL/TLS mode for secure connections</li>
            <li>Upload certificates if using SSL/TLS encryption</li>
            <li>Enable authentication if your broker requires credentials</li>
            <li>Test the connection before proceeding</li>
          </ul>
        </div>
      </div>

      <div onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-5 border rounded-md p-4 border-line-soft">
          {/* Hostname and Port */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Controller
                name="host"
                control={control}
                render={({ field }) => (
                  <GlobalInput
                    {...field}
                    label="Hostname"
                    size="small"
                    className="bg-surface-2"
                    placeholder="mqtt.example.com"
                    error={!!errors.host}
                    helperText={errors.host?.message}
                    disabled={isSubmitting || isDeleting}
                  />
                )}
              />
            </div>

            <div>
              <Controller
                name="port"
                control={control}
                render={({ field }) => (
                  <GlobalInput
                    {...field}
                    label="Port"
                    size="small"
                    className="bg-surface-2"
                    type="text"
                    placeholder="8883"
                    error={!!errors.port}
                    helperText={errors.port?.message}
                    disabled={isSubmitting || isDeleting}
                    maxLength={4}
                  />
                )}
              />
            </div>
          </div>

          {/* SSL/TLS Mode */}
          <div>
            <label className="block text-xs font-medium text-ink-1 mb-1">SSL / TLS mode</label>
            <SelectRadix
              value={sslMode}
              onValueChange={value => {
                setSslMode(value);
                setValue('sslMode', value);
              }}
              options={sslModeOptions}
              placeholder="Select SSL/TLS mode"
              size="small"
              disabled={isSubmitting || isDeleting}
            />
          </div>

          {/* CA Certificate */}
          {showCaCertificate && (
            <div>
              <Controller
                name="caCertificate"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-xs font-medium text-ink-1 mb-1">
                      CA certificate
                    </label>
                    <textarea
                      {...field}
                      rows={4}
                      disabled={isSubmitting || isDeleting}
                      className={`w-full px-3 py-2 border rounded-md bg-surface-2 text-ink-0 focus:outline-none focus:border-accent-cyan font-mono text-xs ${
                        errors.caCertificate ? 'border-danger ' : 'border-line '
                      }`}
                    />
                    {errors.caCertificate && (
                      <p className="text-danger-text text-xs mt-1">
                        {errors.caCertificate.message}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>
          )}

          {/* Client Certificate and Key */}
          {showClientCertificates && (
            <>
              <div>
                <Controller
                  name="clientCertificate"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label className="block text-xs font-medium text-ink-1 mb-1">
                        Client certificate
                      </label>
                      <textarea
                        {...field}
                        rows={4}
                        disabled={isSubmitting || isDeleting}
                        className={`w-full px-3 py-2 border rounded-md bg-surface-2 text-ink-0 focus:outline-none focus:border-accent-cyan font-mono text-xs ${
                          errors.clientCertificate ? 'border-danger ' : 'border-line '
                        }`}
                      />
                      {errors.clientCertificate && (
                        <p className="text-danger-text text-xs mt-1">
                          {errors.clientCertificate.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>

              <div>
                <Controller
                  name="clientKey"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label className="block text-xs font-medium text-ink-1 mb-1">
                        Client key
                      </label>
                      <textarea
                        {...field}
                        rows={4}
                        disabled={isSubmitting || isDeleting}
                        className={`w-full px-3 py-2 border rounded-md bg-surface-2 text-ink-0 focus:outline-none focus:border-accent-cyan font-mono text-xs ${
                          errors.clientKey ? 'border-danger' : 'border-line '
                        }`}
                      />
                      {errors.clientKey && (
                        <p className="text-danger-text text-xs mt-1">{errors.clientKey.message}</p>
                      )}
                    </div>
                  )}
                />
              </div>

              <div>
                <Controller
                  name="keyPassPhrase"
                  control={control}
                  render={({ field }) => (
                    <GlobalInput
                      {...field}
                      label="Key pass phrase (optional)"
                      size="small"
                      className="bg-surface-2"
                      type="password"
                      placeholder="Enter passphrase (optional)"
                      error={!!errors.keyPassPhrase}
                      helperText={errors.keyPassPhrase?.message}
                      disabled={isSubmitting || isDeleting}
                    />
                  )}
                />
              </div>
            </>
          )}

          {/* Use Authentication Toggle */}
          <div className="flex items-center space-x-3 py-2">
            <button
              type="button"
              onClick={() => setUseAuth(!useAuth)}
              disabled={isSubmitting || isDeleting}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-offset-2 ${
                useAuth ? 'bg-accent-cyan' : 'bg-surface-3'
              } ${isSubmitting || isDeleting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[#eef1f4] transition-transform ${
                  useAuth ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <label className="text-xs font-medium text-ink-1">Use authentication</label>
          </div>

          {/* Username and Password */}
          {useAuth && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Controller
                  name="username"
                  control={control}
                  render={({ field }) => (
                    <GlobalInput
                      {...field}
                      label="Username"
                      size="small"
                      className="bg-surface-2"
                      placeholder="Enter username"
                      error={!!errors.username}
                      helperText={errors.username?.message}
                      disabled={isSubmitting || isDeleting}
                    />
                  )}
                />
              </div>

              <div>
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <GlobalInput
                      {...field}
                      label="Password"
                      size="small"
                      className="bg-surface-2"
                      type="password"
                      placeholder="Enter password"
                      error={!!errors.password}
                      helperText={errors.password?.message}
                      disabled={isSubmitting || isDeleting}
                    />
                  )}
                />
              </div>
            </div>
          )}

          {/* Connection Status Message */}
          {connectionTested && (
            <div className="flex items-center space-x-2 text-accent-green bg-accent-green/10 p-3 rounded-md">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-medium">Connection tested successfully!</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-start pt-4">
            <div className="border rounded-md border-line-soft">
              <button
                type="button"
                onClick={handleSubmit(onSubmit)}
                disabled={isSubmitting || isDeleting || !isValid}
                className={`px-5 py-2 rounded-md text-xs font-semibold on-gradient brand-gradient-bg transition-all hover:brightness-110 ${
                  isSubmitting || isDeleting || !isValid
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
              >
                {isSubmitting ? 'Connecting...' : 'Test Connection'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MQTTProtocol;
