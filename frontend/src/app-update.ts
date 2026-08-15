import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Service-worker update handling. Registration and waiting-SW detection run at the
// top of App, so they're active regardless of auth state. When `autoApply` is set (an
// unauthenticated visitor, e.g. on the login screen) a pending version is applied
// immediately and silently — there's no in-progress work to protect. In-app users get
// `needRefresh` instead, surfaced as the "Update" toast, so a new version never
// interrupts them mid-task.
export function useAppUpdate(autoApply: boolean) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration;
      if (registration) {
        if (registration.waiting) {
          setNeedRefresh(true);
        }
        setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef.current?.waiting) {
        setNeedRefresh(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Hand control to the waiting SW and reload once it takes over. Returns false
  // if there's nothing waiting (so callers know it was a no-op).
  const activateWaiting = useCallback(() => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) return false;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }, []);

  // The "Update" toast button: apply and drop the prompt.
  const applyUpdate = useCallback(() => {
    if (activateWaiting()) setNeedRefresh(false);
  }, [activateWaiting]);

  // Unauthenticated visitors (e.g. the login screen) have no in-progress work to
  // protect, so a pending version is applied immediately and silently — no toast.
  // This covers both a fresh load with a version already waiting and logging out
  // while one is pending.
  useEffect(() => {
    if (autoApply && needRefresh) activateWaiting();
  }, [autoApply, needRefresh, activateWaiting]);

  // Gets the user onto the newest build on demand, whether or not the service worker
  // has already noticed one. Used when syncing has stopped because this build is too
  // old to write safely, where waiting for the usual update prompt is not good enough.
  const reloadIntoLatest = useCallback(() => {
    if (!activateWaiting()) window.location.reload();
  }, [activateWaiting]);

  return { needRefresh, applyUpdate, reloadIntoLatest };
}
