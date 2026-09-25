import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { hardLogout } from '@contexts/UserContext';
// const isDemo = JSON.parse(localStorage.getItem('user') || '{}')?.isDemo ?? false;
// import { unsubscribePusher } from '@contexts/PusherContext';

// const user = JSON.parse(localStorage.getItem('user'));

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
    // 'ngrok-skip-browser-warning': '69420',
  },
  // withCredentials:true,
});

// function handleLogout() {
//   if (user) unsubscribePusher(user?.id);
//   localStorage.clear();
//   window.location.href = '/login';
// }

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  response => response,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response) {
      if (
        error?.response?.status === 401 &&
        error?.response?.data?.message === 'Unauthenticated.'
        //  && !isDemo
      ) {
        // hardLogout();
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
