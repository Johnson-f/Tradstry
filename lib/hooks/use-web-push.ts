import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFullUrl, apiConfig } from '@/lib/config/api';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : '';
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function useWebPush() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const isSupported = useMemo(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window, []);

  useEffect(() => { if (typeof window !== 'undefined') setPermission(Notification.permission); }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!isSupported) return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  }, [isSupported]);

  const subscribe = useCallback(async (token: string) => {
    if (!isSupported) throw new Error('Web Push not supported');
    if (!VAPID_PUBLIC_KEY) throw new Error('Missing VAPID public key');

    const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
    if (!reg) throw new Error('Service worker registration failed');

    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });

    const subJson: any = sub.toJSON();
    const body = {
      endpoint: sub.endpoint,
      keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    const resp = await fetch(getFullUrl(apiConfig.endpoints.push.subscribe), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('Subscribe failed');
    return await resp.json();
  }, [isSupported, registerServiceWorker]);

  const unsubscribe = useCallback(async (token: string) => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint;
    await sub?.unsubscribe();
    if (endpoint) {
      await fetch(getFullUrl(apiConfig.endpoints.push.unsubscribe), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint }),
      });
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return 'denied' as NotificationPermission;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  }, [isSupported]);

  return { isSupported, permission, requestPermission, subscribe, unsubscribe, registerServiceWorker };
}


