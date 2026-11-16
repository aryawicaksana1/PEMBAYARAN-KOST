import { KostLocation, TenantProfile } from '../types';

/**
 * Membersihkan spasi tersembunyi (zero-width space, non-breaking space dari copy-paste WA),
 * label copy-paste WhatsApp (misal "Password: ..."), dan spasi awal/akhir agar input dari Android/HP terbaca akurat.
 */
export function sanitizeAuthInput(raw: string): string {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/^[\s\uD83D\uDD11\uD83D\uDC64]*(?:username|user|password|pass|kata\s*sandi|sandi)\s*:\s*/i, '')
    .trim();
}

/**
 * Validasi password admin dengan toleransi huruf besar/kecil dari keyboard Android/iOS.
 */
export function isValidAdminPasswordOnly(rawPassword: string): boolean {
  const p = sanitizeAuthInput(rawPassword);
  if (!p) return false;
  return p.toLowerCase() === 'bosacarya1';
}

/**
 * Validasi username & password admin (username case-insensitive agar aman dari auto-capitalize HP).
 */
export function isValidAdminCredentials(rawUsername: string, rawPassword: string): boolean {
  const u = sanitizeAuthInput(rawUsername).toLowerCase();
  return u === 'bosacarya' && isValidAdminPasswordOnly(rawPassword);
}

/**
 * Validasi password penghuni kamar.
 * Selain pencocokan persis, menangani kasus keyboard HP (Android/iOS) yang otomatis
 * mengubah huruf pertama password acak menjadi kapital (misal K7P9mVa2 -> k7P9mVa2).
 */
export function isTenantPasswordMatch(
  rawInputPassword: string,
  expectedPassword?: string
): boolean {
  if (!expectedPassword) return false;
  const inputPass = sanitizeAuthInput(rawInputPassword);
  const expected = sanitizeAuthInput(expectedPassword);
  if (!inputPass || !expected) return false;
  if (inputPass === expected) return true;

  if (/^[a-z]/.test(expected) && inputPass.length === expected.length) {
    const normalizedFirst = inputPass.charAt(0).toLowerCase() + inputPass.slice(1);
    return normalizedFirst === expected;
  }

  return false;
}

/**
 * Mencari profil penghuni kamar berdasarkan nomor kamar ("02", "2", "kamar 02", "kamar02"),
 * username, atau nama penghuni pada cabang tertentu.
 */
export function findMatchingTenantInBranch(
  tenants: TenantProfile[],
  rawIdentifier: string,
  branch: KostLocation
): TenantProfile | undefined {
  const cleaned = sanitizeAuthInput(rawIdentifier).toLowerCase();
  if (!cleaned) return undefined;

  const compact = cleaned.replace(/\s+/g, '');
  const roomMatchRegex = cleaned.match(/^(?:kamar|kmr|room|no\.?)?\s*0*(\d+)$/i);
  const paddedRoom = roomMatchRegex
    ? String(parseInt(roomMatchRegex[1], 10)).padStart(2, '0')
    : '';

  return tenants.find((t) => {
    if ((t.kostLocation || 'acarya_1') !== branch) return false;

    const tRoom = (t.roomNumber || '').toLowerCase();
    const tUser = (t.username || `kamar${t.roomNumber}`).toLowerCase();
    const tName = (t.name || '').toLowerCase().trim();

    return (
      tRoom === cleaned ||
      (paddedRoom !== '' && tRoom === paddedRoom) ||
      tUser === cleaned ||
      tUser === compact ||
      (tName !== '' && tName === cleaned)
    );
  });
}
