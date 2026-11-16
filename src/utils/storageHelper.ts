/**
 * Safe browser storage helpers so mobile browsers (iOS Safari Private Mode,
 * WhatsApp/Instagram in-app WebViews, or QuotaExceededError from base64 images)
 * never crash login or app state initialization.
 */

export function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore restricted storage errors
  }
}

export function safeSaveRecordsToStorage<T extends { proofImage?: string; meterPhoto?: string }>(
  key: string,
  records: T[]
): void {
  if (safeStorageSet(key, JSON.stringify(records))) {
    return;
  }

  // Fallback jika kuota localStorage di HP penuh karena foto bukti base64
  try {
    const compacted = records.map((rec) => ({
      ...rec,
      proofImage:
        typeof rec.proofImage === 'string' && rec.proofImage.startsWith('data:image/')
          ? undefined
          : rec.proofImage,
      meterPhoto:
        typeof rec.meterPhoto === 'string' && rec.meterPhoto.startsWith('data:image/')
          ? undefined
          : rec.meterPhoto,
    }));
    safeStorageSet(key, JSON.stringify(compacted));
  } catch {
    // ignore storage errors
  }
}
