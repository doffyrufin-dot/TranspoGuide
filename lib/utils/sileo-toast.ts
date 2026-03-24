import { sileo, type SileoOptions } from 'sileo';

type ToastPayload =
  | string
  | {
      title: string;
      description?: SileoOptions['description'];
    };

const toOptions = (
  payload: ToastPayload,
  extra?: Partial<SileoOptions>
): SileoOptions => {
  if (typeof payload === 'string') {
    return { title: payload, ...extra };
  }
  return {
    title: payload.title,
    description: payload.description,
    ...extra,
  };
};

export const sileoToast = {
  success: (payload: ToastPayload, options?: Partial<SileoOptions>) =>
    sileo.success(toOptions(payload, options)),
  error: (payload: ToastPayload, options?: Partial<SileoOptions>) =>
    sileo.error(toOptions(payload, options)),
  warning: (payload: ToastPayload, options?: Partial<SileoOptions>) =>
    sileo.warning(toOptions(payload, options)),
  info: (payload: ToastPayload, options?: Partial<SileoOptions>) =>
    sileo.info(toOptions(payload, options)),
  loading: (payload: ToastPayload, options?: Partial<SileoOptions>) =>
    sileo.show(toOptions(payload, { type: 'loading', duration: null, ...options })),
  dismiss: (toastId?: string) =>
    toastId ? sileo.dismiss(toastId) : sileo.clear(),
};

export default sileoToast;
