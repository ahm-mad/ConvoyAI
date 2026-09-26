import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosInstance from '@root/axiosConfig';
import { toast } from 'react-hot-toast';
import type { ApiError, ApiResult } from '../types/api';
import { isShowcase, resolveShowcase, showcaseWriteResult } from './showcase';

// Showcase data on: writes never reach the backend (auth calls excepted).
const showcaseWrite = (url: string) =>
  isShowcase() &&
  !/\/(login|register|logout|forgot-password|reset-password|verify|resend|auth)/.test(url);

const handleApiError = (error: unknown): ApiError => {
  console.error('API Error:', error);
  const err = error as AxiosError<{
    message?: string;
    errors?: Record<string, string[] | string>;
    current?: Record<string, unknown>;
  }>;
  const body = err?.response?.data;
  return {
    error: true,
    message: body?.message || 'Something went wrong',
    // Kept so forms can show per-field 422 messages and the 409 "changed by someone else" details.
    ...(err?.response?.status ? { status: err.response.status } : {}),
    ...(body?.errors ? { errors: body.errors } : {}),
    ...(body?.current ? { current: body.current } : {}),
  };
};

async function get<T = any>(
  url: string,
  params: Record<string, unknown> = {}
): Promise<ApiResult<T>> {
  if (isShowcase()) {
    const fake = resolveShowcase(url, params);

    if (fake) return fake;
  }

  try {
    const response = await axiosInstance.get(url, { params });
    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
}

async function post<T = any>(
  url: string,
  data: unknown = {},
  config: AxiosRequestConfig = {},
  showToast = true
): Promise<ApiResult<T>> {
  if (showcaseWrite(url)) return showcaseWriteResult() as any;

  try {
    const req = axiosInstance.post(url, data, config);

    const response: AxiosResponse = showToast
      ? await toast.promise(req, {
          loading: 'Processing...',
          success: (response: AxiosResponse) =>
            response?.data?.success
              ? response?.data?.message || 'Successfully completed!'
              : response?.data?.message || 'Something went wrong',
          error: (error: AxiosError<{ message?: string }>) =>
            error?.response?.data?.message || 'Something went wrong',
        })
      : await req;

    return response?.data || handleApiError(new Error('Unexpected error'));
  } catch (error) {
    return handleApiError(error);
  }
}

async function put<T = any>(
  url: string,
  data: unknown = {},
  config: AxiosRequestConfig = {},
  showToast = true
): Promise<ApiResult<T>> {
  if (showcaseWrite(url)) return showcaseWriteResult() as any;

  try {
    const req = axiosInstance.put(url, data, config);

    const response: AxiosResponse = showToast
      ? await toast.promise(req, {
          loading: 'Updating...',
          success: (response: AxiosResponse) =>
            response?.data?.success
              ? response?.data?.message || 'Successfully updated!'
              : response?.data?.message || 'Update failed',
          error: (error: AxiosError<{ message?: string }>) =>
            error?.response?.data?.message || 'Update failed',
        })
      : await req;

    return response?.data || handleApiError(new Error('Unexpected error'));
  } catch (error) {
    return handleApiError(error);
  }
}

async function del<T = any>(
  url: string,
  config: AxiosRequestConfig = {},
  showToast = true
): Promise<ApiResult<T>> {
  if (showcaseWrite(url)) return showcaseWriteResult() as any;

  try {
    const req = axiosInstance.delete(url, config);

    const response: AxiosResponse = showToast
      ? await toast.promise(req, {
          loading: 'Deleting...',
          success: (response: AxiosResponse) =>
            response?.data?.success
              ? response?.data?.message || 'Successfully deleted!'
              : response?.data?.message || 'Delete failed',
          error: (error: AxiosError<{ message?: string }>) =>
            error?.response?.data?.message || 'Delete failed',
        })
      : await req;

    return response?.data || handleApiError(new Error('Unexpected error'));
  } catch (error) {
    return handleApiError(error);
  }
}

export { get, post, put, del };
