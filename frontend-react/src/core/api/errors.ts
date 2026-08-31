import axios from 'axios';

type ApiErrorBody = {
  message?: string;
  mensaje?: string;
  error?: string;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  return error.response?.data?.message
    || error.response?.data?.mensaje
    || error.response?.data?.error
    || fallback;
}
