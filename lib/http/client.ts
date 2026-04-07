import axios, { AxiosError } from 'axios';

export const http = axios.create({
  baseURL: '/',
  timeout: 15000,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    const apiMessage =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message;
    if (apiMessage) {
      (error as Error).message = String(apiMessage);
    }
    return Promise.reject(error);
  }
);

