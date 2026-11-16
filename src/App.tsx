/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { Lock } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { AppLauncherGrid, ActiveScreen } from './components/AppLauncherGrid';
import { LoginModal } from './components/LoginModal';
import { LoginPage } from './components/LoginPage';
import { AppFooter } from './components/AppFooter';
import { TransactionReceiptModal } from './components/TransactionReceiptModal';
import {
  formatReceiptNumber,
  autoDispatchVerifiedReceiptToTenant,
} from './utils/whatsappHelper';
import {
  sendToGoogleSheets,
  fetchRoomRatesFromGoogleSheets,
  PERMANENT_GOOGLE_WEBAPP_URL,
} from './utils/googleSheetsSync';
import {
  recalculateTenantsWithSheetData,
  isDummySeedPaymentId,
  normalizeRoomDigits,
} from './utils/paymentStatusCalculator';
import { sanitizeAuthInput } from './utils/authHelper';
import {
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
  safeSaveRecordsToStorage,
} from './utils/storageHelper';

const RentPaymentModal = lazy(() =>
  import('./components/RentPaymentModal').then((m) => ({ default: m.RentPaymentModal }))
);
const ElectricityPaymentModal = lazy(() =>
  import('./components/ElectricityPaymentModal').then((m) => ({ default: m.ElectricityPaymentModal }))
);
const FacilityScheduleModal = lazy(() =>
  import('./components/FacilityScheduleModal').then((m) => ({ default: m.FacilityScheduleModal }))
);
const AcServiceModal = lazy(() =>
  import('./components/AcServiceModal').then((m) => ({ default: m.AcServiceModal }))
);
const PaymentMethodsModal = lazy(() =>
  import('./components/PaymentMethodsModal').then((m) => ({ default: m.PaymentMethodsModal }))
);
const WhatsAppNotificationModal = lazy(() =>
  import('./components/WhatsAppNotificationModal').then((m) => ({ default: m.WhatsAppNotificationModal }))
);
const PaymentHistoryModal = lazy(() =>
  import('./components/PaymentHistoryModal').then((m) => ({ default: m.PaymentHistoryModal }))
);
const AdminDashboardModal = lazy(() =>
  import('./components/AdminDashboardModal').then((m) => ({ default: m.AdminDashboardModal }))
);
const GoogleSheetsSetupModal = lazy(() =>
  import('./components/GoogleSheetsSetupModal').then((m) => ({ default: m.GoogleSheetsSetupModal }))
);

import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_TENANTS,
  DEFAULT_FACILITY_MAINTENANCE,
  DEFAULT_ROOM_INSPECTIONS,
  DEFAULT_AC_SERVICES,
  INITIAL_KOST_PAYMENTS,
  INITIAL_ELECTRICITY_PAYMENTS,
} from './constants/defaultData';
import {
  TenantProfile,
  AppSettings,
  KostPaymentRecord,
  ElectricityRecord,
  FacilityMaintenance,
  RoomInspection,
  AcServiceRecord,
  KostLocation,
  AuthSession,
} from './types';

export default function App() {
  // Load state from localStorage or defaults with automatic migration
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = safeStorageGet('kostpay_settings');
    if (saved) {
      try {
        const parsed: AppSettings = JSON.parse(saved);
        let updated = { ...parsed };
        if (parsed.kostName === 'Kost Griya Mandiri Sejahtera' || !parsed.kostName.includes('Acarya')) {
          updated = {
            ...updated,
            kostName: DEFAULT_APP_SETTINGS.kostName,
            adminName: DEFAULT_APP_SETTINGS.adminName,
            kostAddress: DEFAULT_APP_SETTINGS.kostAddress,
            briAccountName: DEFAULT_APP_SETTINGS.briAccountName,
            briAccountNo: DEFAULT_APP_SETTINGS.briAccountNo,
          };
        }
        if (!parsed.briAccountNo || parsed.briAccountNo.startsWith('0123-01')) {
          updated = {
            ...updated,
            briAccountNo: DEFAULT_APP_SETTINGS.briAccountNo,
          };
        }
        if (
          !parsed.briAccountName ||
          parsed.briAccountName === 'BOS ACARYA (PENGELOLA KOST)' ||
          parsed.briAccountName !== DEFAULT_APP_SETTINGS.briAccountName
        ) {
          updated = {
            ...updated,
            briAccountName: DEFAULT_APP_SETTINGS.briAccountName,
          };
        }
        if (!parsed.googleWebAppUrl || parsed.googleWebAppUrl !== DEFAULT_APP_SETTINGS.googleWebAppUrl) {
          updated = {
            ...updated,
            googleWebAppUrl: DEFAULT_APP_SETTINGS.googleWebAppUrl,
          };
        }
        if (!parsed.kostAddress || parsed.kostAddress !== DEFAULT_APP_SETTINGS.kostAddress) {
          updated = {
            ...updated,
            kostAddress: DEFAULT_APP_SETTINGS.kostAddress,
          };
        }
        return updated;
      } catch {
        return DEFAULT_APP_SETTINGS;
      }
    }
    return DEFAULT_APP_SETTINGS;
  });

  useEffect(() => {
    if (
      settings.briAccountName !== DEFAULT_APP_SETTINGS.briAccountName ||
      !settings.qrisImageUrl ||
      settings.googleWebAppUrl !== DEFAULT_APP_SETTINGS.googleWebAppUrl
    ) {
      setSettings((prev) => ({
        ...prev,
        briAccountName: DEFAULT_APP_SETTINGS.briAccountName,
        qrisImageUrl: prev.qrisImageUrl || DEFAULT_APP_SETTINGS.qrisImageUrl,
        googleWebAppUrl: DEFAULT_APP_SETTINGS.googleWebAppUrl,
      }));
    }
  }, [settings.briAccountName, settings.qrisImageUrl, settings.googleWebAppUrl]);

  // User Authentication Session (either room tenant or admin)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    const saved = safeStorageGet('kostpay_auth_session_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Backward compatibility for admin
    if (safeStorageGet('kostpay_auth_user') === 'bosacarya') {
      return {
        role: 'admin',
        username: 'bosacarya',
        name: 'BOS ACARYA (Pengelola)',
      };
    }
    return null;
  });

  const isStaleTenantList = (list: TenantProfile[]): boolean => {
    if (!Array.isArray(list) || list.length !== 29) return true;
    const oldDummyNames = [
      'i putu sudiasa',
      'kadek surya kencana',
      'ni made anggraini',
      'gede wahyu pratama',
      'nyoman triana dewi',
      'ketut agus mahendra',
      'luh putu dian lestari',
      'wayan adi gunawan',
      'ni komang ayu safitri',
      'made bayu saputra',
      'komang krisna murti',
      'ni ketut ratna sari',
    ];
    if (list.some((t) => oldDummyNames.includes((t.name || '').trim().toLowerCase()))) {
      return true;
    }
    return false;
  };

  const [tenants, setTenants] = useState<TenantProfile[]>(() => {
    const saved = safeStorageGet('kostpay_tenants_v6');
    if (saved) {
      try {
        const parsed: TenantProfile[] = JSON.parse(saved);
        if (isStaleTenantList(parsed)) {
          safeStorageSet('kostpay_tenants_v6', JSON.stringify(DEFAULT_TENANTS));
          return DEFAULT_TENANTS;
        }
        return parsed.map((t) => {
          const defaultTenant = DEFAULT_TENANTS.find((dt) => dt.id === t.id);
          return {
            ...t,
            username: t.username || `kamar${t.roomNumber}`,
            password: t.password || defaultTenant?.password || `kamar${t.roomNumber}`,
          };
        });
      } catch {
        return DEFAULT_TENANTS;
      }
    }
    safeStorageSet('kostpay_tenants_v6', JSON.stringify(DEFAULT_TENANTS));
    return DEFAULT_TENANTS;
  });

  // Pastikan jika HMR masih menyimpan state lama di memori, langsung di-reset ke DEFAULT_TENANTS yang sesuai data HTML pengguna
  useEffect(() => {
    if (isStaleTenantList(tenants)) {
      setTenants(DEFAULT_TENANTS);
      safeStorageSet('kostpay_tenants_v6', JSON.stringify(DEFAULT_TENANTS));
    }
  }, [tenants]);

  const [currentTenant, setCurrentTenant] = useState<TenantProfile>(() => {
    if (authSession?.role === 'tenant' && authSession.tenantId) {
      const match = tenants.find((t) => t.id === authSession.tenantId);
      if (match) return match;
    }
    const defaultArya = tenants.find((t) => t.name.includes('ARYA WICAKSANA'));
    return defaultArya || tenants[0] || DEFAULT_TENANTS[0];
  });

  const [kostPayments, setKostPayments] = useState<KostPaymentRecord[]>(() => {
    const saved = safeStorageGet('kostpay_kost_payments_v2');
    if (saved) {
      try {
        const parsed: KostPaymentRecord[] = JSON.parse(saved);
        if (parsed.some((p) => p.tenantName === 'Rian Pratama')) {
          return INITIAL_KOST_PAYMENTS;
        }
        const cleaned = parsed.filter((p) => p && !isDummySeedPaymentId(p.id));
        if (cleaned.length !== parsed.length) {
          safeSaveRecordsToStorage('kostpay_kost_payments_v2', cleaned);
        }
        return cleaned;
      } catch {
        return INITIAL_KOST_PAYMENTS;
      }
    }
    return INITIAL_KOST_PAYMENTS;
  });

  const [electricityPayments, setElectricityPayments] = useState<ElectricityRecord[]>(() => {
    const saved = safeStorageGet('kostpay_elec_payments_v2');
    if (saved) {
      try {
        const parsed: ElectricityRecord[] = JSON.parse(saved);
        if (parsed.some((p) => p.tenantName === 'Siti Nurhaliza')) {
          return INITIAL_ELECTRICITY_PAYMENTS;
        }
        const cleaned = parsed.filter((p) => p && !isDummySeedPaymentId(p.id));
        if (cleaned.length !== parsed.length) {
          safeSaveRecordsToStorage('kostpay_elec_payments_v2', cleaned);
        }
        return cleaned;
      } catch {
        return INITIAL_ELECTRICITY_PAYMENTS;
      }
    }
    return INITIAL_ELECTRICITY_PAYMENTS;
  });

  // Otomatis hitung ulang status pembayaran sewa & listrik setiap kamar berdasarkan data Google Sheet & tanggal/bulan berjalan
  useEffect(() => {
    const applyDynamicStatuses = () => {
      const now = new Date();
      setTenants((prevTenants) => {
        const recalculated = recalculateTenantsWithSheetData(
          prevTenants,
          kostPayments,
          electricityPayments,
          now
        );
        const hasStatusChange = recalculated.some((rt, idx) => {
          const pt = prevTenants[idx];
          return (
            !pt ||
            rt.activeRentStatus !== pt.activeRentStatus ||
            rt.activeElectricityStatus !== pt.activeElectricityStatus ||
            rt.lastInitialKwh !== pt.lastInitialKwh ||
            JSON.stringify(rt.annualInstallment) !== JSON.stringify(pt.annualInstallment)
          );
        });

        if (hasStatusChange) {
          safeStorageSet('kostpay_tenants_v6', JSON.stringify(recalculated));
          setCurrentTenant((prevCur) => {
            const matched = recalculated.find((t) => t.id === prevCur.id);
            return matched || prevCur;
          });
          return recalculated;
        }
        return prevTenants;
      });
    };

    applyDynamicStatuses();
    const timer = setInterval(applyDynamicStatuses, 60000);
    return () => clearInterval(timer);
  }, [kostPayments, electricityPayments]);

  const [facilities, setFacilities] = useState<FacilityMaintenance[]>(() => {
    const saved = safeStorageGet('kostpay_facilities_v2');
    if (saved) {
      try {
        const parsed: FacilityMaintenance[] = JSON.parse(saved);
        if (parsed.some((f) => !f.kostLocation)) {
          return DEFAULT_FACILITY_MAINTENANCE;
        }
        return parsed;
      } catch {
        return DEFAULT_FACILITY_MAINTENANCE;
      }
    }
    return DEFAULT_FACILITY_MAINTENANCE;
  });

  const [roomInspections, setRoomInspections] = useState<RoomInspection[]>(() => {
    const saved = safeStorageGet('kostpay_inspections_v3');
    if (saved) {
      try {
        const parsed: RoomInspection[] = JSON.parse(saved);
        if (parsed.some((r) => r.roomNumber === '101')) {
          return DEFAULT_ROOM_INSPECTIONS;
        }
        return parsed;
      } catch {
        return DEFAULT_ROOM_INSPECTIONS;
      }
    }
    return DEFAULT_ROOM_INSPECTIONS;
  });

  const [acServices, setAcServices] = useState<AcServiceRecord[]>(() => {
    const saved = safeStorageGet('kostpay_ac_services_v3');
    if (saved) {
      try {
        const parsed: AcServiceRecord[] = JSON.parse(saved);
        if (parsed.some((a) => a.roomNumber === '101')) {
          return DEFAULT_AC_SERVICES;
        }
        return parsed;
      } catch {
        return DEFAULT_AC_SERVICES;
      }
    }
    return DEFAULT_AC_SERVICES;
  });

  // Daftar ID jadwal yang sudah ditandai selesai lalu dihapus dari tampilan WebApp (namun tetap tersimpan di Google Sheet)
  const getHiddenScheduleIds = (): Set<string> => {
    try {
      const raw = safeStorageGet('kostpay_hidden_schedule_ids_v1');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch {
      // ignore
    }
    return new Set<string>();
  };

  const addHiddenScheduleId = (id: string) => {
    if (!id) return;
    const set = getHiddenScheduleIds();
    set.add(id);
    safeStorageSet('kostpay_hidden_schedule_ids_v1', JSON.stringify(Array.from(set)));
  };

  const removeHiddenScheduleId = (id: string) => {
    if (!id) return;
    const set = getHiddenScheduleIds();
    if (set.has(id)) {
      set.delete(id);
      safeStorageSet('kostpay_hidden_schedule_ids_v1', JSON.stringify(Array.from(set)));
    }
  };

  const [selectedLocation, setSelectedLocation] = useState<KostLocation | 'all'>('acarya_2');
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    return authSession?.role === 'admin';
  });
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('home');

  // Authentication State for Admin
  const isLoggedIn = authSession?.role === 'admin';
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [pendingTargetScreen, setPendingTargetScreen] = useState<ActiveScreen | null>(null);

  // Sync login status to localStorage
  useEffect(() => {
    if (authSession) {
      safeStorageSet('kostpay_auth_session_v2', JSON.stringify(authSession));
      if (authSession.role === 'admin') {
        safeStorageSet('kostpay_auth_user', 'bosacarya');
      } else {
        safeStorageRemove('kostpay_auth_user');
      }
    } else {
      safeStorageRemove('kostpay_auth_session_v2');
      safeStorageRemove('kostpay_auth_user');
    }
  }, [authSession]);

  // Protected screens requiring admin login: pengingat wa, admin kost, google sheets
  // Note: riwayat bayar is available to tenants to check their own room transactions!
  const ADMIN_PROTECTED_SCREENS: ActiveScreen[] = [
    'pengingat_wa',
    'admin_kost',
    'akun_penghuni',
    'google_sheets',
  ];

  const getScreenTitle = (screen: ActiveScreen | null): string => {
    switch (screen) {
      case 'pengingat_wa':
        return 'Notifikasi WA (Khusus Admin)';
      case 'riwayat_bayar':
        return 'Riwayat Bayar';
      case 'admin_kost':
        return 'Admin Kost';
      case 'akun_penghuni':
        return 'Akun & Password Login Anak Kost';
      case 'google_sheets':
        return 'Google Sheet';
      default:
        return 'Pengelola Kost';
    }
  };

  const handleOpenScreen = (screen: ActiveScreen) => {
    if (ADMIN_PROTECTED_SCREENS.includes(screen) && !isLoggedIn) {
      if (authSession?.role === 'tenant') {
        // Menu notifikasi WhatsApp dan admin hanya bisa diakses oleh admin
        return;
      }
      setPendingTargetScreen(screen);
      setIsLoginModalOpen(true);
      return;
    }
    setActiveScreen(screen);
  };

  const handleSuccessLogin = () => {
    const adminSession: AuthSession = {
      role: 'admin',
      username: 'bosacarya',
      name: 'BOS ACARYA (Pengelola)',
    };
    setAuthSession(adminSession);
    setIsAdminMode(true);
    setIsLoginModalOpen(false);
    if (pendingTargetScreen) {
      setActiveScreen(pendingTargetScreen);
      setPendingTargetScreen(null);
    } else {
      setActiveScreen('admin_kost');
    }
  };

  const handleLogout = () => {
    setAuthSession(null);
    setIsAdminMode(false);
    safeStorageRemove('kostpay_auth_session_v2');
    safeStorageRemove('kostpay_auth_user');
    setActiveScreen('home');
  };

  const lastAccountEditAtRef = useRef<Record<string, number>>({});
  const [isGoogleSheetAccountSyncReady, setIsGoogleSheetAccountSyncReady] = useState<boolean | null>(
    null
  );
  const [hasSyncedSheetsOnce, setHasSyncedSheetsOnce] = useState<boolean>(false);
  const hasAutoSeededAccountsRef = useRef<boolean>(false);
  const tenantsRef = useRef<TenantProfile[]>(tenants);
  const kostPaymentsRef = useRef<KostPaymentRecord[]>(kostPayments);
  const electricityPaymentsRef = useRef<ElectricityRecord[]>(electricityPayments);

  useEffect(() => {
    tenantsRef.current = tenants;
  }, [tenants]);

  useEffect(() => {
    kostPaymentsRef.current = kostPayments;
  }, [kostPayments]);

  useEffect(() => {
    electricityPaymentsRef.current = electricityPayments;
  }, [electricityPayments]);

  const handleUpdateTenant = async (
    updated: TenantProfile
  ): Promise<{
    localSaved: boolean;
    syncedToSheets: boolean;
    hasAccountsSync: boolean;
    message: string;
  }> => {
    lastAccountEditAtRef.current[updated.id] = Date.now();
    const updatedListSnapshot = tenantsRef.current.map((t) => (t.id === updated.id ? updated : t));
    tenantsRef.current = updatedListSnapshot;
    let nextTenantsSnapshot: TenantProfile[] = updatedListSnapshot;
    setTenants(updatedListSnapshot);
    safeStorageSet('kostpay_tenants_v6', JSON.stringify(updatedListSnapshot));
    if (currentTenant.id === updated.id) {
      setCurrentTenant(updated);
    }

    // Perbarui juga nama penghuni pada jadwal Servis AC & Cek Kamar jika kamar tersebut ada di daftar jadwal
    const displayRoomName = updated.isOccupied && updated.name && updated.name !== '-'
      ? updated.name
      : `Kamar ${updated.roomNumber}`;

    setAcServices((prev) => {
      let acChanged = false;
      const nextAc = prev.map((ac) => {
        if (
          ac.roomNumber === updated.roomNumber &&
          (ac.kostLocation || 'acarya_1') === (updated.kostLocation || 'acarya_1') &&
          ac.tenantName !== displayRoomName
        ) {
          acChanged = true;
          const updatedAc = { ...ac, tenantName: displayRoomName };
          if (settings.googleWebAppUrl) {
            sendToGoogleSheets(settings.googleWebAppUrl, {
              action: 'upsert_ac',
              ...updatedAc,
            });
          }
          return updatedAc;
        }
        return ac;
      });
      if (acChanged) {
        safeStorageSet('kostpay_ac_services_v3', JSON.stringify(nextAc));
      }
      return acChanged ? nextAc : prev;
    });

    setRoomInspections((prev) => {
      let inspChanged = false;
      const nextInsp = prev.map((r) => {
        if (
          r.roomNumber === updated.roomNumber &&
          (r.kostLocation || 'acarya_1') === (updated.kostLocation || 'acarya_1') &&
          r.tenantName !== displayRoomName
        ) {
          inspChanged = true;
          const updatedInsp = { ...r, tenantName: displayRoomName };
          if (settings.googleWebAppUrl) {
            sendToGoogleSheets(settings.googleWebAppUrl, {
              action: 'upsert_inspection',
              ...updatedInsp,
            });
          }
          return updatedInsp;
        }
        return r;
      });
      if (inspChanged) {
        safeStorageSet('kostpay_inspections_v3', JSON.stringify(nextInsp));
      }
      return inspChanged ? nextInsp : prev;
    });

    // Langsung kirim perubahan nama, tarif, serta username/password kamar dari WebApp ke Google Sheet
    try {
      const sheetFormattedName =
        updated.isOccupied && updated.name && updated.name !== '-' && !updated.name.toLowerCase().includes('tersedia')
          ? updated.name
          : `Kamar ${updated.roomNumber} (Tersedia)`;

      const targetUrl = settings.googleWebAppUrl || PERMANENT_GOOGLE_WEBAPP_URL;
      if (targetUrl) {
        const res = await sendToGoogleSheets(targetUrl, {
          action: 'update_room_rates',
          rates: [
            {
              kostLocation: updated.kostLocation || 'acarya_1',
              roomNumber: updated.roomNumber,
              tenantName: sheetFormattedName,
              monthlyRentRate: updated.monthlyRentRate,
              rentDueDateDay: updated.rentDueDateDay,
              username: updated.username || `kamar${updated.roomNumber}`,
              password: updated.password,
              phone: updated.phone,
              isOccupied: updated.isOccupied,
            },
          ],
          tenant: updated,
        });
        const hasAcc = Boolean(res.data?.hasAccountsSync);
        if (res.data && typeof res.data.hasAccountsSync === 'boolean') {
          setIsGoogleSheetAccountSyncReady(hasAcc);
        }
        if (nextTenantsSnapshot.length > 0) {
          safeStorageSet('kostpay_tenants_v6', JSON.stringify(nextTenantsSnapshot));
        }
        return {
          localSaved: true,
          syncedToSheets: res.success,
          hasAccountsSync: hasAcc,
          message: res.message,
        };
      }
    } catch (err: any) {
      return {
        localSaved: true,
        syncedToSheets: false,
        hasAccountsSync: false,
        message: err?.message || 'Tersimpan secara lokal, namun gagal terhubung ke Google Sheet.',
      };
    }

    return {
      localSaved: true,
      syncedToSheets: false,
      hasAccountsSync: false,
      message: 'Tersimpan di perangkat ini.',
    };
  };

  const handleSyncAllAccountsToSheets = async (): Promise<{
    success: boolean;
    hasAccountsSync: boolean;
    message: string;
  }> => {
    const targetUrl = settings.googleWebAppUrl || PERMANENT_GOOGLE_WEBAPP_URL;
    if (!targetUrl) {
      return {
        success: false,
        hasAccountsSync: false,
        message: 'URL Google Web App belum diatur.',
      };
    }
    const res = await sendToGoogleSheets(targetUrl, {
      action: 'sync_all_room_accounts',
      rates: tenants.map((t) => ({
        kostLocation: t.kostLocation || 'acarya_1',
        roomNumber: t.roomNumber,
        tenantName:
          t.isOccupied && t.name && t.name !== '-' && !t.name.toLowerCase().includes('tersedia')
            ? t.name
            : `Kamar ${t.roomNumber} (Tersedia)`,
        monthlyRentRate: t.monthlyRentRate,
        rentDueDateDay: t.rentDueDateDay,
        username: t.username || `kamar${t.roomNumber}`,
        password: t.password,
        phone: t.phone,
        isOccupied: t.isOccupied,
      })),
    });
    const hasAcc = Boolean(res.data?.hasAccountsSync);
    if (res.data && typeof res.data.hasAccountsSync === 'boolean') {
      setIsGoogleSheetAccountSyncReady(hasAcc);
    }
    return {
      success: res.success,
      hasAccountsSync: hasAcc,
      message: res.message,
    };
  };

  const handleUpdateAllTenants = (updatedTenants: TenantProfile[]) => {
    setTenants(updatedTenants);
    safeStorageSet('kostpay_tenants_v6', JSON.stringify(updatedTenants));
    // Also update currentTenant if it was among updated
    const updatedCurrent = updatedTenants.find((t) => t.id === currentTenant.id);
    if (updatedCurrent) {
      setCurrentTenant(updatedCurrent);
    }

    if (settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'update_room_rates',
        rates: updatedTenants.map((t) => ({
          kostLocation: t.kostLocation || 'acarya_1',
          roomNumber: t.roomNumber,
          tenantName:
            t.isOccupied && t.name && t.name !== '-' && !t.name.toLowerCase().includes('tersedia')
              ? t.name
              : `Kamar ${t.roomNumber} (Tersedia)`,
          monthlyRentRate: t.monthlyRentRate,
          rentDueDateDay: t.rentDueDateDay,
          username: t.username || `kamar${t.roomNumber}`,
          password: t.password,
          phone: t.phone,
          isOccupied: t.isOccupied,
        })),
      });
    }
  };

  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);

  // Fungsi Sinkronisasi (Status Pembayaran Sewa & Listrik, Tarif Kamar, Akun Login Kamar, Jadwal_Servis_AC, Jadwal_Fasilitas, Jadwal_Cek_Kamar)
  // Status pembayaran sewa & listrik diambil dari data Google Sheet. Jika data di Google Sheet kosong, status pembayaran otomatis menyesuaikan.
  const handleSyncAllFromGoogleSheets = async (): Promise<{
    success: boolean;
    hasSchedulesSync?: boolean;
    hasPaymentsSync?: boolean;
    hasAccountsSync?: boolean;
    tenants?: TenantProfile[];
    message: string;
  }> => {
    if (!settings.googleWebAppUrl) {
      return { success: false, message: 'URL Google Web App belum diatur.' };
    }
    setIsSyncingSheets(true);
    try {
      const res = await fetchRoomRatesFromGoogleSheets(settings.googleWebAppUrl);
      let syncedTenantsSnapshot: TenantProfile[] | undefined;

      if (res.success) {
        setIsGoogleSheetAccountSyncReady(Boolean(res.hasAccountsSync));
        let nextKostPayments = kostPaymentsRef.current;
        let nextElectricityPayments = electricityPaymentsRef.current;

        // Sinkronisasi data Pembayaran Sewa dari Google Sheet (jika tersedia dari endpoint doGet)
        if (Array.isArray(res.kostPayments)) {
          const sheetKostList = res.kostPayments.filter((p) => p && !isDummySeedPaymentId(p.id));
          const sheetIds = new Set(sheetKostList.map((p) => p.id));
          // Pertahankan transaksi pending lokal yang baru dikirim dan belum masuk di pembacaan sheet
          const localPending = kostPaymentsRef.current.filter(
            (p) => p.status === 'pending' && !sheetIds.has(p.id) && !isDummySeedPaymentId(p.id)
          );
          const mergedKost = [...localPending, ...sheetKostList];
          nextKostPayments = mergedKost;
          kostPaymentsRef.current = mergedKost;
          setKostPayments(mergedKost);
          safeSaveRecordsToStorage('kostpay_kost_payments_v2', mergedKost);
        }

        // Sinkronisasi data Pembayaran Listrik dari Google Sheet (jika tersedia dari endpoint doGet)
        if (Array.isArray(res.electricityPayments)) {
          const sheetElecList = res.electricityPayments.filter(
            (p) => p && !isDummySeedPaymentId(p.id)
          );
          const sheetIds = new Set(sheetElecList.map((p) => p.id));
          const localPending = electricityPaymentsRef.current.filter(
            (p) => p.status === 'pending' && !sheetIds.has(p.id) && !isDummySeedPaymentId(p.id)
          );
          const mergedElec = [...localPending, ...sheetElecList];
          nextElectricityPayments = mergedElec;
          electricityPaymentsRef.current = mergedElec;
          setElectricityPayments(mergedElec);
          safeSaveRecordsToStorage('kostpay_elec_payments_v2', mergedElec);
        }

        // Perbarui tarif kamar, akun login (dari Google Sheet), & hitung ulang status sewa dan listrik secara sinkron
        const rateMerged = tenantsRef.current.map((t) => {
          const match = res.rates?.find(
            (r) =>
              normalizeRoomDigits(r.roomNumber) === normalizeRoomDigits(t.roomNumber) &&
              (!r.kostLocation || r.kostLocation === t.kostLocation)
          );
          if (match) {
            const recentEditAt = lastAccountEditAtRef.current[t.id] || 0;
            const isRecentlyEdited = Date.now() - recentEditAt < 45000;
            const sheetUser = match.username ? sanitizeAuthInput(match.username) : '';
            const sheetPass = match.password ? sanitizeAuthInput(match.password) : '';
            return {
              ...t,
              monthlyRentRate:
                match.monthlyRentRate && match.monthlyRentRate > 0
                  ? match.monthlyRentRate
                  : t.monthlyRentRate,
              rentDueDateDay: match.rentDueDateDay || t.rentDueDateDay,
              username: isRecentlyEdited ? t.username : sheetUser || t.username,
              password: isRecentlyEdited ? t.password : sheetPass || t.password,
              phone: match.phone !== undefined ? match.phone : t.phone,
              isOccupied: match.isOccupied !== undefined ? match.isOccupied : t.isOccupied,
            };
          }
          return t;
        });

        const recalculated = recalculateTenantsWithSheetData(
          rateMerged,
          nextKostPayments,
          nextElectricityPayments,
          new Date()
        );

        syncedTenantsSnapshot = recalculated;
        tenantsRef.current = recalculated;
        setTenants(recalculated);
        safeStorageSet('kostpay_tenants_v6', JSON.stringify(recalculated));
        setCurrentTenant((prevCurrent) => {
          const updatedCurrent = recalculated.find((t) => t.id === prevCurrent.id);
          return updatedCurrent || prevCurrent;
        });
        setHasSyncedSheetsOnce(true);

        // Jika login sebagai Admin dan masih ada kamar yang belum tercatat di tab AKUN_LOGIN_KAMAR,
        // lengkapi baris yang kosong tanpa pernah menimpa password yang sudah ada di Google Sheet.
        if (
          authSession?.role === 'admin' &&
          res.hasAccountsSync &&
          !hasAutoSeededAccountsRef.current &&
          Array.isArray(res.rates)
        ) {
          hasAutoSeededAccountsRef.current = true;
          const missingAccounts = recalculated.filter((t) => {
            const match = res.rates?.find(
              (r) =>
                normalizeRoomDigits(r.roomNumber) === normalizeRoomDigits(t.roomNumber) &&
                (!r.kostLocation || r.kostLocation === t.kostLocation)
            );
            return !match?.password || !sanitizeAuthInput(match.password);
          });
          if (missingAccounts.length > 0) {
            const targetUrl = settings.googleWebAppUrl || PERMANENT_GOOGLE_WEBAPP_URL;
            sendToGoogleSheets(targetUrl, {
              action: 'sync_all_room_accounts',
              rates: missingAccounts.map((t) => ({
                kostLocation: t.kostLocation || 'acarya_1',
                roomNumber: t.roomNumber,
                tenantName:
                  t.isOccupied && t.name && t.name !== '-' && !t.name.toLowerCase().includes('tersedia')
                    ? t.name
                    : `Kamar ${t.roomNumber} (Tersedia)`,
                monthlyRentRate: t.monthlyRentRate,
                rentDueDateDay: t.rentDueDateDay,
                username: t.username || `kamar${t.roomNumber}`,
                password: t.password,
                phone: t.phone,
                isOccupied: t.isOccupied,
              })),
            }).catch(() => {
              hasAutoSeededAccountsRef.current = false;
            });
          }
        }

        // Sinkronisasi data jadwal dari Google Sheet, dengan tetap menyembunyikan jadwal selesai yang sudah dihapus dari tampilan WebApp
        const hiddenIds = getHiddenScheduleIds();

        if (Array.isArray(res.acServices)) {
          const visibleAc = res.acServices.filter(
            (item) => !(hiddenIds.has(item.id) && item.status === 'normal')
          );
          setAcServices(visibleAc);
          safeStorageSet('kostpay_ac_services_v3', JSON.stringify(visibleAc));
        }

        if (Array.isArray(res.facilities)) {
          const visibleFac = res.facilities.filter(
            (item) => !(hiddenIds.has(item.id) && item.status === 'selesai')
          );
          setFacilities(visibleFac);
          safeStorageSet('kostpay_facilities_v2', JSON.stringify(visibleFac));
        }

        if (Array.isArray(res.roomInspections)) {
          const visibleInsp = res.roomInspections.filter(
            (item) => !(hiddenIds.has(item.id) && item.status === 'layak')
          );
          setRoomInspections(visibleInsp);
          safeStorageSet('kostpay_inspections_v3', JSON.stringify(visibleInsp));
        }
      }
      return {
        success: res.success,
        hasSchedulesSync: res.hasSchedulesSync,
        hasPaymentsSync: res.hasPaymentsSync,
        hasAccountsSync: res.hasAccountsSync,
        tenants: syncedTenantsSnapshot,
        message: res.message,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Gagal menyinkronkan dengan Google Sheet.',
      };
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Kirim seluruh data jadwal Servis AC & Fasilitas ke tab terpisah di Google Sheet
  const handlePushAllSchedulesToSheets = async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    if (!settings.googleWebAppUrl) {
      return { success: false, message: 'URL Google Web App belum diatur.' };
    }
    setIsSyncingSheets(true);
    try {
      const res = await sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'sync_all_schedules',
        acServices,
        facilities,
        roomInspections,
        timestamp: new Date().toISOString(),
      });
      return {
        success: res.success,
        message: res.success
          ? 'Berhasil mencatat seluruh data ke tab Jadwal_Servis_AC, Jadwal_Fasilitas, dan Jadwal_Cek_Kamar di Google Sheet!'
          : res.message,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Gagal mengirim jadwal ke Google Sheet.',
      };
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const hasInitialSyncedRef = useRef(false);

  // Saat Admin masuk, sinkronkan dan pastikan seluruh 29 akun kamar terhubung dengan Google Sheet
  useEffect(() => {
    if (authSession?.role === 'admin' && !hasAutoSeededAccountsRef.current && settings.googleWebAppUrl) {
      handleSyncAllFromGoogleSheets();
    }
  }, [authSession?.role]);

  // Auto-sync dari Google Sheet saat aplikasi pertama kali dibuka (tanpa mendorong data dummy ke Google Sheet)
  useEffect(() => {
    const targetUrl = PERMANENT_GOOGLE_WEBAPP_URL;
    if (!targetUrl || hasInitialSyncedRef.current) return;
    hasInitialSyncedRef.current = true;
    handleSyncAllFromGoogleSheets();
  }, [settings.googleWebAppUrl]);

  // Sinkronisasi berkala dengan Google Sheet agar perubahan/pengosongan data di Google Sheet otomatis menyesuaikan status pembayaran
  useEffect(() => {
    if (!settings.googleWebAppUrl) return;
    const intervalId = setInterval(() => {
      handleSyncAllFromGoogleSheets();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [settings.googleWebAppUrl, activeScreen]);

  // Switch Location handler
  const handleSelectLocation = (loc: KostLocation | 'all') => {
    setSelectedLocation(loc);
    if (loc !== 'all') {
      const match = tenants.find((t) => t.kostLocation === loc);
      if (match && currentTenant.kostLocation !== loc) {
        setCurrentTenant(match);
      }
    }
  };

  const handleSelectTenant = (tenant: TenantProfile) => {
    setCurrentTenant(tenant);
    if (tenant.kostLocation && selectedLocation !== 'all' && selectedLocation !== tenant.kostLocation) {
      setSelectedLocation(tenant.kostLocation);
    }
  };

  // Persistence to localStorage
  useEffect(() => {
    safeStorageSet('kostpay_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    safeStorageSet('kostpay_tenants_v6', JSON.stringify(tenants));
  }, [tenants]);

  useEffect(() => {
    safeSaveRecordsToStorage('kostpay_kost_payments_v2', kostPayments);
  }, [kostPayments]);

  useEffect(() => {
    safeSaveRecordsToStorage('kostpay_elec_payments_v2', electricityPayments);
  }, [electricityPayments]);

  useEffect(() => {
    safeStorageSet('kostpay_facilities_v2', JSON.stringify(facilities));
  }, [facilities]);

  useEffect(() => {
    safeStorageSet('kostpay_inspections_v3', JSON.stringify(roomInspections));
  }, [roomInspections]);

  useEffect(() => {
    safeStorageSet('kostpay_ac_services_v3', JSON.stringify(acServices));
  }, [acServices]);

  // Handler: Rent Payment Submitted — Langsung kirim ke Google Sheets sekaligus simpan di aplikasi
  const handleSubmitRentPayment = async (
    newRecord: KostPaymentRecord
  ): Promise<{ success: boolean; message: string }> => {
    setKostPayments((prev) => {
      const updated = [newRecord, ...prev];
      safeSaveRecordsToStorage('kostpay_kost_payments_v2', updated);
      return updated;
    });

    // Jika pembayaran adalah cicilan sewa (awal maupun sisa cicilan), langsung perbarui progres cicilan di profil kamar
    if (newRecord.paymentType === 'tahunan_cicil' && newRecord.installmentInfo) {
      const info = newRecord.installmentInfo;
      setTenants((prev) =>
        prev.map((t) => {
          if (
            t.roomNumber === newRecord.roomNumber &&
            (t.kostLocation || 'acarya_1') === (newRecord.kostLocation || 'acarya_1')
          ) {
            return {
              ...t,
              annualInstallment: {
                isActive: true,
                totalAnnualAmount: info.totalAnnualAmount,
                paidAmount: info.totalPaidSoFar,
                remainingAmount: info.remainingAmount,
                startDate: t.annualInstallment?.startDate || new Date().toLocaleDateString('id-ID'),
                maxPayoffDate: info.maxPayoffDate,
                installmentTerm: info.installmentTerm,
                isFullyPaid: info.isFullyPaid,
                lastPaymentDate: new Date().toLocaleDateString('id-ID'),
              },
            };
          }
          return t;
        })
      );

      if (
        currentTenant.roomNumber === newRecord.roomNumber &&
        (currentTenant.kostLocation || 'acarya_1') === (newRecord.kostLocation || 'acarya_1')
      ) {
        setCurrentTenant((prev) => ({
          ...prev,
          annualInstallment: {
            isActive: true,
            totalAnnualAmount: info.totalAnnualAmount,
            paidAmount: info.totalPaidSoFar,
            remainingAmount: info.remainingAmount,
            startDate: prev.annualInstallment?.startDate || new Date().toLocaleDateString('id-ID'),
            maxPayoffDate: info.maxPayoffDate,
            installmentTerm: info.installmentTerm,
            isFullyPaid: info.isFullyPaid,
            lastPaymentDate: new Date().toLocaleDateString('id-ID'),
          },
        }));
      }
    }

    // Langsung kirim ke Google Sheets saat penghuni mengirim pembayaran & bukti foto
    try {
      const res = await sendToGoogleSheets(PERMANENT_GOOGLE_WEBAPP_URL, {
        action: 'pembayaran_kost',
        ...newRecord,
        status: 'Sukses',
        hasProof: Boolean(newRecord.proofImage),
      });

      if (res.success) {
        setKostPayments((prev) => {
          const synced = prev.map((p) =>
            p.id === newRecord.id ? { ...p, syncedToSheets: true } : p
          );
          safeSaveRecordsToStorage('kostpay_kost_payments_v2', synced);
          return synced;
        });
      }
      return res;
    } catch (err: any) {
      console.warn('Info sinkronisasi awal pembayaran sewa ke Google Sheet:', err);
      return {
        success: false,
        message: err?.message || 'Gagal menghubungi Google Sheet.',
      };
    }
  };

  // Handler: Electricity Payment Submitted — Langsung kirim ke Google Sheets sekaligus simpan di aplikasi
  const handleSubmitElectricityPayment = async (
    newRecord: ElectricityRecord
  ): Promise<{ success: boolean; message: string }> => {
    setElectricityPayments((prev) => {
      const updated = [newRecord, ...prev];
      safeSaveRecordsToStorage('kostpay_elec_payments_v2', updated);
      return updated;
    });

    try {
      const res = await sendToGoogleSheets(PERMANENT_GOOGLE_WEBAPP_URL, {
        action: 'pembayaran_listrik',
        ...newRecord,
        status: 'Sukses',
        hasProof: Boolean(newRecord.proofImage),
      });

      if (res.success) {
        setElectricityPayments((prev) => {
          const synced = prev.map((p) =>
            p.id === newRecord.id ? { ...p, syncedToSheets: true } : p
          );
          safeSaveRecordsToStorage('kostpay_elec_payments_v2', synced);
          return synced;
        });
      }
      return res;
    } catch (err: any) {
      console.warn('Info sinkronisasi awal pembayaran listrik ke Google Sheet:', err);
      return {
        success: false,
        message: err?.message || 'Gagal menghubungi Google Sheet.',
      };
    }
  };

  // Handler: Verification by admin
  // 1. Ubah status 'pending' menjadi 'verified' (Sukses)
  // 2. Tandai status sewa / listrik penghuni menjadi 'lunas'
  // 3. LANGSUNG kirim dan catat data ke sheet kamar yang telah dipisahkan di Google Sheets!
  const handleVerifyPayment = async (
    type: 'kost' | 'electricity',
    id: string
  ): Promise<{ success: boolean; message: string; sentToSheets: boolean }> => {
    if (type === 'kost') {
      const target = kostPayments.find((p) => p.id === id);
      if (!target) {
        return { success: false, message: 'Data pembayaran sewa tidak ditemukan.', sentToSheets: false };
      }

      const hasUrl = !!(settings.googleWebAppUrl && settings.googleWebAppUrl.trim());
      const nowVerifiedStr = new Date().toLocaleString('id-ID');
      const generatedReceiptNo = formatReceiptNumber(target);
      const matchedTenant = tenants.find(
        (t) =>
          t.roomNumber === target.roomNumber &&
          (t.kostLocation || 'acarya_1') === (target.kostLocation || 'acarya_1')
      );
      const resolvedPhone =
        (target.phone && target.phone !== '-' ? target.phone : matchedTenant?.phone) || '';

      const updatedRecord: KostPaymentRecord = {
        ...target,
        phone: resolvedPhone || target.phone,
        status: 'verified',
        verifiedAt: nowVerifiedStr,
        receiptNumber: generatedReceiptNo,
        syncedToSheets: hasUrl,
      };

      setKostPayments((prev) =>
        prev.map((p) => (p.id === id ? updatedRecord : p))
      );

      // Otomatis tampilkan Nota Transaksi Resmi & kirim otomatis ke WhatsApp penyewa
      setActiveReceiptModal({
        record: updatedRecord,
        type: 'kost',
        autoGenerated: true,
      });

      if (resolvedPhone) {
        autoDispatchVerifiedReceiptToTenant(updatedRecord, false, resolvedPhone, settings).catch(
          (err) => console.warn('Info auto-send WA nota sewa:', err)
        );
      }

      // Determine updated tenant rent status and annual installment state
      const isInstallment = target.paymentType === 'tahunan_cicil' && !!target.installmentInfo;
      const isFullyPaid = isInstallment ? !!target.installmentInfo?.isFullyPaid : true;
      const newRentStatus = isFullyPaid ? 'lunas' : 'belum_bayar';

      setTenants((prev) =>
        prev.map((t) => {
          if (
            t.roomNumber === target.roomNumber &&
            (t.kostLocation || 'acarya_1') === (target.kostLocation || 'acarya_1')
          ) {
            const updatedAnnualInstallment = isInstallment && target.installmentInfo
              ? {
                  isActive: true,
                  totalAnnualAmount: target.installmentInfo.totalAnnualAmount,
                  paidAmount: target.installmentInfo.totalPaidSoFar,
                  remainingAmount: target.installmentInfo.remainingAmount,
                  startDate: t.annualInstallment?.startDate || new Date().toLocaleDateString('id-ID'),
                  maxPayoffDate: target.installmentInfo.maxPayoffDate,
                  installmentTerm: target.installmentInfo.installmentTerm,
                  isFullyPaid: target.installmentInfo.isFullyPaid,
                  lastPaymentDate: new Date().toLocaleDateString('id-ID'),
                }
              : t.annualInstallment;

            return {
              ...t,
              activeRentStatus: newRentStatus,
              annualInstallment: updatedAnnualInstallment,
            };
          }
          return t;
        })
      );

      if (
        currentTenant.roomNumber === target.roomNumber &&
        (currentTenant.kostLocation || 'acarya_1') === (target.kostLocation || 'acarya_1')
      ) {
        const updatedAnnualInstallment = isInstallment && target.installmentInfo
          ? {
              isActive: true,
              totalAnnualAmount: target.installmentInfo.totalAnnualAmount,
              paidAmount: target.installmentInfo.totalPaidSoFar,
              remainingAmount: target.installmentInfo.remainingAmount,
              startDate: currentTenant.annualInstallment?.startDate || new Date().toLocaleDateString('id-ID'),
              maxPayoffDate: target.installmentInfo.maxPayoffDate,
              installmentTerm: target.installmentInfo.installmentTerm,
              isFullyPaid: target.installmentInfo.isFullyPaid,
              lastPaymentDate: new Date().toLocaleDateString('id-ID'),
            }
          : currentTenant.annualInstallment;

        setCurrentTenant((prev) => ({
          ...prev,
          activeRentStatus: newRentStatus,
          annualInstallment: updatedAnnualInstallment,
        }));
      }

      // Kirim langsung ke Google Sheets (masuk ke sheet kamar penghuni)
      if (hasUrl) {
        try {
          const res = await sendToGoogleSheets(settings.googleWebAppUrl.trim(), {
            action: 'pembayaran_kost',
            ...updatedRecord,
            status: 'Sukses',
            hasProof: !!target.proofImage,
          });

          if (res.success) {
            return {
              success: true,
              message: `Pembayaran Sewa Kamar ${target.roomNumber} (${target.tenantName}) BERHASIL diverifikasi! Status menjadi SUKSES dan data otomatis telah tercatat di sheet kamar Google Sheets.`,
              sentToSheets: true,
            };
          } else {
            return {
              success: true,
              message: `Pembayaran Sewa Kamar ${target.roomNumber} diverifikasi SUKSES di aplikasi. Namun respons Google Sheets: "${res.message}". Pastikan Web App di-Deploy Versi Baru dengan akses Anyone.`,
              sentToSheets: false,
            };
          }
        } catch (err: any) {
          console.error('Gagal mencatat pembayaran sewa kost ke sheet kamar Google Sheets:', err);
          return {
            success: true,
            message: `Pembayaran diverifikasi SUKSES secara lokal. Pengiriman ke Google Sheets gagal: ${err?.message || 'Koneksi terputus'}. Silakan periksa URL Web App Anda.`,
            sentToSheets: false,
          };
        }
      } else {
        return {
          success: true,
          message: `Pembayaran Sewa Kamar ${target.roomNumber} (${target.tenantName}) diverifikasi SUKSES di aplikasi. Namun data BELUM masuk ke Google Sheets karena URL Web App belum diisi di menu Pengaturan Google Sheets.`,
          sentToSheets: false,
        };
      }
    } else {
      const target = electricityPayments.find((p) => p.id === id);
      if (!target) {
        return { success: false, message: 'Data pembayaran listrik tidak ditemukan.', sentToSheets: false };
      }

      const hasUrl = !!(settings.googleWebAppUrl && settings.googleWebAppUrl.trim());
      const nowVerifiedStr = new Date().toLocaleString('id-ID');
      const generatedReceiptNo = formatReceiptNumber(target);
      const matchedTenant = tenants.find(
        (t) =>
          t.roomNumber === target.roomNumber &&
          (t.kostLocation || 'acarya_1') === (target.kostLocation || 'acarya_1')
      );
      const resolvedPhone =
        (target.phone && target.phone !== '-' ? target.phone : matchedTenant?.phone) || '';

      const updatedRecord: ElectricityRecord = {
        ...target,
        phone: resolvedPhone || target.phone,
        status: 'verified',
        verifiedAt: nowVerifiedStr,
        receiptNumber: generatedReceiptNo,
        syncedToSheets: hasUrl,
      };

      setElectricityPayments((prev) =>
        prev.map((p) => (p.id === id ? updatedRecord : p))
      );

      // Otomatis tampilkan Nota Transaksi Resmi & kirim otomatis ke WhatsApp penyewa
      setActiveReceiptModal({
        record: updatedRecord,
        type: 'electricity',
        autoGenerated: true,
      });

      if (resolvedPhone) {
        autoDispatchVerifiedReceiptToTenant(updatedRecord, true, resolvedPhone, settings).catch(
          (err) => console.warn('Info auto-send WA nota listrik:', err)
        );
      }

      setTenants((prev) =>
        prev.map((t) =>
          t.roomNumber === target.roomNumber && (t.kostLocation || 'acarya_1') === (target.kostLocation || 'acarya_1')
            ? {
                ...t,
                activeElectricityStatus: 'lunas',
                lastInitialKwh: target.finalKwh,
              }
            : t
        )
      );

      if (
        currentTenant.roomNumber === target.roomNumber &&
        (currentTenant.kostLocation || 'acarya_1') === (target.kostLocation || 'acarya_1')
      ) {
        setCurrentTenant((prev) => ({
          ...prev,
          activeElectricityStatus: 'lunas',
          lastInitialKwh: target.finalKwh,
        }));
      }

      // Kirim langsung ke Google Sheets (masuk ke sheet kamar penghuni)
      if (hasUrl) {
        try {
          const res = await sendToGoogleSheets(settings.googleWebAppUrl.trim(), {
            action: 'pembayaran_listrik',
            ...updatedRecord,
            status: 'Sukses',
            hasProof: !!target.proofImage,
          });

          if (res.success) {
            return {
              success: true,
              message: `Pembayaran Listrik Kamar ${target.roomNumber} (${target.tenantName}) BERHASIL diverifikasi! Status menjadi SUKSES dan data otomatis telah tercatat di sheet kamar Google Sheets.`,
              sentToSheets: true,
            };
          } else {
            return {
              success: true,
              message: `Pembayaran Listrik Kamar ${target.roomNumber} diverifikasi SUKSES di aplikasi. Namun respons Google Sheets: "${res.message}". Pastikan Web App di-Deploy Versi Baru dengan akses Anyone.`,
              sentToSheets: false,
            };
          }
        } catch (err: any) {
          console.error('Gagal mencatat pembayaran listrik ke sheet kamar Google Sheets:', err);
          return {
            success: true,
            message: `Pembayaran diverifikasi SUKSES secara lokal. Pengiriman ke Google Sheets gagal: ${err?.message || 'Koneksi terputus'}. Silakan periksa URL Web App Anda.`,
            sentToSheets: false,
          };
        }
      } else {
        return {
          success: true,
          message: `Pembayaran Listrik Kamar ${target.roomNumber} (${target.tenantName}) diverifikasi SUKSES di aplikasi. Namun data BELUM masuk ke Google Sheets karena URL Web App belum diisi di menu Pengaturan Google Sheets.`,
          sentToSheets: false,
        };
      }
    }
  };

  // Handler: Report Facility Issue / Schedule Inspection
  const handleReportFacilityIssue = (newReport: any) => {
    const loc = newReport.kostLocation || currentTenant.kostLocation || 'acarya_1';

    if (newReport.scheduleType === 'cek_kamar') {
      setRoomInspections((prev) => {
        const existing = prev.find(
          (r) =>
            r.roomNumber === newReport.roomNumber &&
            (r.kostLocation || 'acarya_1') === loc
        );
        if (existing) {
          removeHiddenScheduleId(existing.id);
          return prev.map((r) =>
            r.roomNumber === newReport.roomNumber &&
            (r.kostLocation || 'acarya_1') === loc
              ? {
                  ...r,
                  tenantName: newReport.tenantName || r.tenantName,
                  nextInspectionDate: newReport.preferredDate || r.nextInspectionDate,
                  status: 'perlu_perbaikan',
                  notes: `${newReport.category}: ${newReport.title}`,
                }
              : r
          );
        }

        const newId = `room-${loc}-${newReport.roomNumber}-${Date.now()}`;
        removeHiddenScheduleId(newId);
        const newInspection: RoomInspection = {
          id: newId,
          kostLocation: loc,
          roomNumber: newReport.roomNumber,
          tenantName: newReport.tenantName,
          frequency: '6_bulanan',
          lastInspectionDate: '-',
          nextInspectionDate: newReport.preferredDate || new Date().toISOString().split('T')[0],
          status: 'perlu_perbaikan',
          wallCondition: 'Perlu Pengecekan',
          plumbingCondition: 'Perlu Pengecekan',
          ventilationCondition: 'Perlu Pengecekan',
          doorAndLockCondition: 'Perlu Pengecekan',
          notes: `${newReport.category}: ${newReport.title}`,
        };
        return [newInspection, ...prev];
      });
    } else {
      removeHiddenScheduleId(newReport.id);
      const newFacilityItem: FacilityMaintenance = {
        id: newReport.id,
        kostLocation: loc,
        title: `${newReport.category}: ${newReport.title} (Kmr ${newReport.roomNumber})`,
        category: 'kebersihan',
        frequency: 'mingguan',
        targetDay: 'Terjadwal',
        nextDate: newReport.preferredDate || new Date().toLocaleDateString('id-ID'),
        lastCheckedDate: 'Hari Ini',
        status: 'dalam_proses',
        notes: `Kamar ${newReport.roomNumber} (${newReport.tenantName}) — Menunggu tindak lanjut pengelola.`,
        pic: 'Pengelola Kost',
      };
      setFacilities((prev) => [newFacilityItem, ...prev]);
    }
  };

  // Handler: Mark Facility Maintenance as Completed
  const handleCompleteFacility = (id: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const target = facilities.find((f) => f.id === id);
    const updatedNotes = 'Pemeliharaan / perbaikan fasilitas telah selesai dikerjakan.';

    setFacilities((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              status: 'selesai',
              lastCheckedDate: todayStr,
              notes: updatedNotes,
            }
          : f
      )
    );

    if (target && settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'upsert_facility',
        ...target,
        status: 'selesai',
        lastCheckedDate: todayStr,
        notes: updatedNotes,
      });
    }
  };

  // Handler: Delete Completed Facility Maintenance Schedule (Hanya hapus di WebApp, data selesai tetap tersimpan di Google Sheet)
  const handleDeleteFacility = (id: string) => {
    const target = facilities.find((f) => f.id === id);
    addHiddenScheduleId(id);
    setFacilities((prev) => prev.filter((f) => f.id !== id));

    // Pastikan status selesai tetap tercatat di Google Sheet (TIDAK dihapus dari Google Sheet)
    if (target && settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'upsert_facility',
        ...target,
        status: 'selesai',
      });
    }
  };

  // Handler: Mark Room Inspection as Completed
  const handleCompleteInspection = (id: string) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const nextSixMonths = new Date(today);
    nextSixMonths.setMonth(nextSixMonths.getMonth() + 6);
    const nextStr = nextSixMonths.toISOString().split('T')[0];
    const target = roomInspections.find((r) => r.id === id);
    const updatedNotes = 'Pengecekan & perbaikan fasilitas kamar telah selesai.';

    setRoomInspections((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'layak',
              lastInspectionDate: todayStr,
              nextInspectionDate: nextStr,
              wallCondition: 'Bagus & Rapi',
              plumbingCondition: 'Lancar & Normal',
              ventilationCondition: 'Bagus',
              doorAndLockCondition: 'Aman & Normal',
              notes: updatedNotes,
            }
          : r
      )
    );

    if (target && settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'upsert_inspection',
        ...target,
        status: 'layak',
        lastInspectionDate: todayStr,
        nextInspectionDate: nextStr,
        notes: updatedNotes,
      });
    }
  };

  // Handler: Delete Completed Room Inspection Schedule (Hanya hapus di WebApp, data selesai tetap tersimpan di Google Sheet)
  const handleDeleteInspection = (id: string) => {
    const target = roomInspections.find((r) => r.id === id);
    addHiddenScheduleId(id);
    setRoomInspections((prev) => prev.filter((r) => r.id !== id));

    // Pastikan status selesai ('layak') tetap tercatat di Google Sheet (TIDAK dihapus dari Google Sheet)
    if (target && settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'upsert_inspection',
        ...target,
        status: 'layak',
      });
    }
  };

  // Handler: Request AC Service
  const handleRequestAcService = (req: any) => {
    setAcServices((prev) => {
      const existingItem = prev.find(
        (ac) =>
          ac.roomNumber === req.roomNumber &&
          (ac.kostLocation || 'acarya_1') === (req.kostLocation || 'acarya_1')
      );
      if (existingItem) {
        removeHiddenScheduleId(existingItem.id);
        return prev.map((ac) =>
          ac.roomNumber === req.roomNumber &&
          (ac.kostLocation || 'acarya_1') === (req.kostLocation || 'acarya_1')
            ? {
                ...ac,
                tenantName: req.tenantName || ac.tenantName,
                status: req.status,
                nextServiceDate: req.nextServiceDate || ac.nextServiceDate,
                notes: req.notes || ac.notes,
              }
            : ac
        );
      }

      const newId = req.id || `ac-${req.kostLocation || 'ac1'}-${req.roomNumber}-${Date.now()}`;
      removeHiddenScheduleId(newId);
      const newRecord: AcServiceRecord = {
        id: newId,
        kostLocation: req.kostLocation || 'acarya_1',
        roomNumber: req.roomNumber,
        tenantName: req.tenantName,
        acBrand: req.acBrand || 'Unit AC Kamar 1/2 PK',
        frequency: '6_bulanan',
        lastServiceDate: '-',
        nextServiceDate: req.nextServiceDate || new Date().toISOString().split('T')[0],
        status: req.status || 'perlu_dicuci',
        lastTechnician: 'Sentra Dingin AC (Mas Dani)',
        notes: req.notes || 'Permintaan jadwal servis AC baru.',
      };
      return [newRecord, ...prev];
    });
  };

  // Handler: Mark AC Service as Completed
  const handleCompleteAcService = (id: string) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const nextSixMonths = new Date(today);
    nextSixMonths.setMonth(nextSixMonths.getMonth() + 6);
    const nextStr = nextSixMonths.toISOString().split('T')[0];
    const target = acServices.find((ac) => ac.id === id);
    const updatedNotes = 'Servis AC telah selesai dikerjakan (kondisi dingin normal).';

    setAcServices((prev) =>
      prev.map((ac) =>
        ac.id === id
          ? {
              ...ac,
              status: 'normal',
              lastServiceDate: todayStr,
              nextServiceDate: nextStr,
              notes: updatedNotes,
            }
          : ac
      )
    );

    if (target && settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'upsert_ac',
        ...target,
        status: 'normal',
        lastServiceDate: todayStr,
        nextServiceDate: nextStr,
        notes: updatedNotes,
      });
    }
  };

  // Handler: Delete Completed AC Service Schedule (Hanya hapus di WebApp, data selesai tetap tersimpan di Google Sheet)
  const handleDeleteAcService = (id: string) => {
    const target = acServices.find((ac) => ac.id === id);
    addHiddenScheduleId(id);
    setAcServices((prev) => prev.filter((ac) => ac.id !== id));

    // Pastikan status selesai ('normal') tetap tercatat di Google Sheet (TIDAK dihapus dari Google Sheet)
    if (target && settings.googleWebAppUrl) {
      sendToGoogleSheets(settings.googleWebAppUrl, {
        action: 'upsert_ac',
        ...target,
        status: 'normal',
      });
    }
  };

  // Handler: Update app settings
  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const [activeReceiptModal, setActiveReceiptModal] = useState<{
    record: KostPaymentRecord | ElectricityRecord;
    type: 'kost' | 'electricity';
    autoGenerated?: boolean;
  } | null>(null);

  const handleOpenReceipt = (
    record: KostPaymentRecord | ElectricityRecord,
    type: 'kost' | 'electricity',
    autoGenerated = false
  ) => {
    setActiveReceiptModal({ record, type, autoGenerated });
  };

  // Cari transaksi terverifikasi terbaru untuk kamar yang sedang aktif
  const latestVerifiedRent = useMemo(
    () =>
      kostPayments.find(
        (p) =>
          p.status === 'verified' &&
          p.roomNumber === currentTenant.roomNumber &&
          (p.kostLocation || 'acarya_1') === (currentTenant.kostLocation || 'acarya_1')
      ) || null,
    [kostPayments, currentTenant.roomNumber, currentTenant.kostLocation]
  );

  const latestVerifiedElectricity = useMemo(
    () =>
      electricityPayments.find(
        (p) =>
          p.status === 'verified' &&
          p.roomNumber === currentTenant.roomNumber &&
          (p.kostLocation || 'acarya_1') === (currentTenant.kostLocation || 'acarya_1')
      ) || null,
    [electricityPayments, currentTenant.roomNumber, currentTenant.kostLocation]
  );

  // Otomatis munculkan Nota Transaksi bagi penghuni ketika transaksi baru mereka sudah terverifikasi
  useEffect(() => {
    if (!authSession || authSession.role !== 'tenant') return;
    try {
      const rawSeen = safeStorageGet('kostpay_seen_receipts_v1');
      const seenIds: string[] = rawSeen
        ? JSON.parse(rawSeen)
        : [
            'kp-ac2-02-init',
            'kp-ac2-03-init',
            'kp-ac2-06-init',
            'el-ac2-02-init',
            'el-ac2-03-init',
          ];

      if (latestVerifiedRent && !seenIds.includes(latestVerifiedRent.id)) {
        const updatedSeen = [...seenIds, latestVerifiedRent.id];
        safeStorageSet('kostpay_seen_receipts_v1', JSON.stringify(updatedSeen));
        setActiveReceiptModal({
          record: latestVerifiedRent,
          type: 'kost',
          autoGenerated: true,
        });
        return;
      }

      if (latestVerifiedElectricity && !seenIds.includes(latestVerifiedElectricity.id)) {
        const updatedSeen = [...seenIds, latestVerifiedElectricity.id];
        safeStorageSet('kostpay_seen_receipts_v1', JSON.stringify(updatedSeen));
        setActiveReceiptModal({
          record: latestVerifiedElectricity,
          type: 'electricity',
          autoGenerated: true,
        });
      }
    } catch {
      // ignore storage errors
    }
  }, [authSession, latestVerifiedRent, latestVerifiedElectricity]);

  const pendingRentCount = useMemo(
    () => kostPayments.filter((p) => p.status === 'pending').length,
    [kostPayments]
  );
  const pendingElecCount = useMemo(
    () => electricityPayments.filter((p) => p.status === 'pending').length,
    [electricityPayments]
  );
  const acServiceDue = useMemo(
    () =>
      acServices.filter(
        (a) => a.status === 'perlu_dicuci' || a.status === 'kurang_dingin' || a.status === 'rusak'
      ).length,
    [acServices]
  );

  // When no session is active, require login so no one can view any room's dashboard
  if (!authSession) {
    return (
      <LoginPage
        tenants={tenants}
        onLoginSuccess={(session, tenant) => {
          safeStorageSet('kostpay_auth_session_v2', JSON.stringify(session));
          if (session.role === 'admin') {
            safeStorageSet('kostpay_auth_user', 'bosacarya');
            setIsAdminMode(true);
            setActiveScreen('home');
          } else if (tenant) {
            safeStorageRemove('kostpay_auth_user');
            setCurrentTenant(tenant);
            if (tenant.kostLocation) {
              setSelectedLocation(tenant.kostLocation);
            }
            setIsAdminMode(false);
            setActiveScreen('home');
          }
          setAuthSession(session);
        }}
        selectedLocation={selectedLocation}
        onSyncFromSheets={async () => {
          const r = await handleSyncAllFromGoogleSheets();
          return {
            tenants: r.tenants || null,
            success: r.success,
            message: r.message,
          };
        }}
        isSyncingSheets={isSyncingSheets}
        hasSyncedSheetsOnce={hasSyncedSheetsOnce}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] bg-grid-pattern flex flex-col text-slate-900 selection:bg-indigo-500 selection:text-white pb-20 sm:pb-16 relative overflow-x-hidden">
      {/* Top Header */}
      <AppHeader
        currentTenant={currentTenant}
        tenants={tenants}
        onSelectTenant={handleSelectTenant}
        isAdminMode={isAdminMode}
        onToggleAdminMode={(val) => {
          if (!isLoggedIn) {
            setPendingTargetScreen('admin_kost');
            setIsLoginModalOpen(true);
            return;
          }
          setIsAdminMode(val);
          if (val) {
            setActiveScreen('admin_kost');
          } else if (activeScreen === 'admin_kost') {
            setActiveScreen('home');
          }
        }}
        isLoggedIn={isLoggedIn}
        onOpenLogin={() => {
          setPendingTargetScreen('admin_kost');
          setIsLoginModalOpen(true);
        }}
        onLogout={handleLogout}
        settings={settings}
        onOpenWhatsAppReminders={() => handleOpenScreen('pengingat_wa')}
        onOpenGoogleSheets={() => handleOpenScreen('google_sheets')}
        selectedLocation={selectedLocation}
        onSelectLocation={handleSelectLocation}
        authSession={authSession}
      />

      {/* Main Screen Router */}
      <main className="relative z-10 flex-1 w-full max-w-5xl lg:max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-7">
        <Suspense
          fallback={
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center my-6 shadow-xs">
              <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2.5" />
              <p className="text-xs font-bold text-slate-600">Memuat halaman...</p>
            </div>
          }
        >
        {activeScreen === 'home' && (
          <AppLauncherGrid
            currentTenant={currentTenant}
            settings={settings}
            onOpenScreen={handleOpenScreen}
            isLoggedIn={isLoggedIn}
            onRequireLogin={(screen) => {
              setPendingTargetScreen(screen);
              setIsLoginModalOpen(true);
            }}
            onLogout={handleLogout}
            authSession={authSession}
            pendingRentCount={pendingRentCount}
            pendingElectricityCount={pendingElecCount}
            acServiceDueCount={acServiceDue}
            latestVerifiedRent={latestVerifiedRent}
            latestVerifiedElectricity={latestVerifiedElectricity}
            onOpenReceipt={(rec, t) => handleOpenReceipt(rec, t, false)}
          />
        )}

        {/* Protected Screen Access Gate if accessed without admin credentials */}
        {ADMIN_PROTECTED_SCREENS.includes(activeScreen) && !isLoggedIn && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-md mx-auto text-center space-y-4 shadow-sm my-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Menu Khusus Pengelola
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Menu <strong>{getScreenTitle(activeScreen)}</strong> hanya dapat diakses oleh Pengelola / Admin Acarya Kost.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveScreen('home')}
                className="flex-1 py-2 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Kembali ke Beranda
              </button>
              {authSession?.role !== 'tenant' && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingTargetScreen(activeScreen);
                    setIsLoginModalOpen(true);
                  }}
                  className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition-colors cursor-pointer shadow-sm"
                >
                  Login Admin
                </button>
              )}
            </div>
          </div>
        )}

        {activeScreen === 'sewa_kost' && (
          <RentPaymentModal
            currentTenant={currentTenant}
            settings={settings}
            kostPayments={kostPayments}
            onClose={() => setActiveScreen('home')}
            onSubmitPayment={handleSubmitRentPayment}
            onOpenReceipt={(rec, t) => handleOpenReceipt(rec, t, false)}
          />
        )}

        {activeScreen === 'listrik_kwh' && (
          <ElectricityPaymentModal
            currentTenant={currentTenant}
            settings={settings}
            electricityPayments={electricityPayments}
            onClose={() => setActiveScreen('home')}
            onSubmitElectricity={handleSubmitElectricityPayment}
            onOpenReceipt={(rec, t) => handleOpenReceipt(rec, t, false)}
          />
        )}

        {activeScreen === 'jadwal_fasilitas' && (
          <FacilityScheduleModal
            currentTenant={currentTenant}
            tenants={tenants}
            settings={settings}
            facilities={facilities}
            roomInspections={roomInspections}
            onClose={() => setActiveScreen('home')}
            onReportFacilityIssue={handleReportFacilityIssue}
            onCompleteFacility={handleCompleteFacility}
            onDeleteFacility={handleDeleteFacility}
            onCompleteInspection={handleCompleteInspection}
            onDeleteInspection={handleDeleteInspection}
            onSyncWithGoogleSheets={handleSyncAllFromGoogleSheets}
            onPushToGoogleSheets={handlePushAllSchedulesToSheets}
            isSyncingSheets={isSyncingSheets}
          />
        )}

        {activeScreen === 'servis_ac' && (
          <AcServiceModal
            currentTenant={currentTenant}
            tenants={tenants}
            settings={settings}
            acServices={acServices}
            onClose={() => setActiveScreen('home')}
            onRequestAcService={handleRequestAcService}
            onCompleteAcService={handleCompleteAcService}
            onDeleteAcService={handleDeleteAcService}
            onSyncWithGoogleSheets={handleSyncAllFromGoogleSheets}
            onPushToGoogleSheets={handlePushAllSchedulesToSheets}
            isSyncingSheets={isSyncingSheets}
          />
        )}

        {activeScreen === 'metode_bayar' && (
          <PaymentMethodsModal
            settings={settings}
            onClose={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'pengingat_wa' && isLoggedIn && (
          <WhatsAppNotificationModal
            tenants={tenants}
            settings={settings}
            onClose={() => setActiveScreen('home')}
          />
        )}

        {activeScreen === 'riwayat_bayar' && (
          <PaymentHistoryModal
            currentTenant={currentTenant}
            kostPayments={kostPayments}
            electricityPayments={electricityPayments}
            isAdmin={isLoggedIn}
            onClose={() => setActiveScreen('home')}
            onVerifyPayment={handleVerifyPayment}
            onOpenReceipt={(rec, t) => handleOpenReceipt(rec, t, false)}
          />
        )}

        {(activeScreen === 'admin_kost' || activeScreen === 'akun_penghuni') && isLoggedIn && (
          <AdminDashboardModal
            tenants={tenants}
            settings={settings}
            kostPayments={kostPayments}
            electricityPayments={electricityPayments}
            initialTab={activeScreen === 'akun_penghuni' ? 'akun' : 'verifikasi'}
            onClose={() => setActiveScreen('home')}
            onVerifyPayment={handleVerifyPayment}
            onOpenGoogleSheetsModal={() => setActiveScreen('google_sheets')}
            onOpenWhatsAppModal={() => setActiveScreen('pengingat_wa')}
            onUpdateTenant={handleUpdateTenant}
            isGoogleSheetAccountSyncReady={isGoogleSheetAccountSyncReady}
            onSyncAllAccountsToSheets={handleSyncAllAccountsToSheets}
            onSyncFromSheets={handleSyncAllFromGoogleSheets}
            isSyncingSheets={isSyncingSheets}
            onOpenReceipt={(rec, t) => handleOpenReceipt(rec, t, false)}
          />
        )}

        {activeScreen === 'google_sheets' && isLoggedIn && (
          <GoogleSheetsSetupModal
            settings={settings}
            tenants={tenants}
            kostPayments={kostPayments}
            electricityPayments={electricityPayments}
            onUpdateSettings={handleUpdateSettings}
            onUpdateTenants={handleUpdateAllTenants}
            onClose={() => setActiveScreen('home')}
          />
        )}
        </Suspense>
      </main>

      {/* Footer */}
      <AppFooter
        settings={settings}
        currentTenant={currentTenant}
        authSession={authSession}
        onNavigateScreen={(screen) => handleOpenScreen(screen)}
        onLogout={handleLogout}
      />

      {/* Floating Bottom Quick Bar on mobile / modal view */}
      {activeScreen !== 'home' && (
        <div className="fixed bottom-3.5 sm:bottom-5 inset-x-0 max-w-xs mx-auto px-4 z-40">
          <button
            type="button"
            onClick={() => setActiveScreen('home')}
            className="w-full py-2.5 sm:py-3 px-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 hover:from-indigo-950 hover:to-slate-900 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-xl shadow-indigo-950/30 backdrop-blur-xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/15 active:scale-95"
          >
            <span>⌂ Kembali ke Menu Utama</span>
          </button>
        </div>
      )}

      {/* Official Digital Receipt (Nota Transaksi) Modal */}
      {activeReceiptModal && (
        <TransactionReceiptModal
          record={activeReceiptModal.record}
          type={activeReceiptModal.type}
          settings={settings}
          tenantPhone={
            (activeReceiptModal.record.phone && activeReceiptModal.record.phone !== '-'
              ? activeReceiptModal.record.phone
              : tenants.find(
                  (t) =>
                    t.roomNumber === activeReceiptModal.record.roomNumber &&
                    (t.kostLocation || 'acarya_1') ===
                      (activeReceiptModal.record.kostLocation || 'acarya_1')
                )?.phone) || ''
          }
          isAdmin={isLoggedIn}
          autoGeneratedNotice={activeReceiptModal.autoGenerated}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setActiveReceiptModal(null)}
        />
      )}

      {/* Admin Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setPendingTargetScreen(null);
        }}
        onSuccessLogin={handleSuccessLogin}
        targetScreenTitle={getScreenTitle(pendingTargetScreen)}
      />
    </div>
  );
}
