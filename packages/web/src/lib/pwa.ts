export const DEFAULT_SERVICE_WORKER_PATH = '/sw.js';
export const DEFAULT_SERVICE_WORKER_SCOPE = '/';

type ServiceWorkerContainerLike = {
  register: (scriptURL: string | URL, options?: RegistrationOptions) => Promise<unknown>;
};

type NavigatorLike = {
  serviceWorker?: ServiceWorkerContainerLike;
};

type WindowLike = {
  addEventListener: (
    type: 'load',
    listener: () => void | Promise<void>,
    options?: AddEventListenerOptions,
  ) => void;
};

type LoggerLike = Pick<Console, 'warn'>;

type RegisterPwaServiceWorkerOptions = {
  isProduction?: boolean;
  logger?: LoggerLike;
  navigator?: NavigatorLike;
  scope?: string;
  serviceWorkerPath?: string;
  window?: WindowLike;
};

export function canRegisterServiceWorker(options: {
  isProduction: boolean;
  navigator?: NavigatorLike;
}): boolean {
  return Boolean(options.isProduction && options.navigator?.serviceWorker);
}

export function registerPwaServiceWorker({
  isProduction = import.meta.env.PROD,
  logger = console,
  navigator = globalThis.navigator,
  scope = DEFAULT_SERVICE_WORKER_SCOPE,
  serviceWorkerPath = DEFAULT_SERVICE_WORKER_PATH,
  window = globalThis.window,
}: RegisterPwaServiceWorkerOptions = {}): void {
  if (!window || !canRegisterServiceWorker({ isProduction, navigator })) {
    return;
  }

  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker
        ?.register(serviceWorkerPath, { scope })
        .catch((error: unknown) => {
          logger.warn('Service worker registration failed', error);
        });
    },
    { once: true },
  );
}
