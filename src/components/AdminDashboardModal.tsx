import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  MessageCircle,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Receipt,
  Search,
  Check,
  Eye,
  MapPin,
  Building2,
  Phone,
  User,
  ExternalLink,
  KeyRound,
  Copy,
  Lock,
  Edit3,
  Share2,
  BellRing,
  Layers,
} from 'lucide-react';
import {
  TenantProfile,
  AppSettings,
  KostPaymentRecord,
  ElectricityRecord,
  KostLocation,
} from '../types';
import {
  formatRupiah,
  buildWaLink,
  generateRentReminderMessage,
  generateElectricityReminderMessage,
  generateInstallmentReminderMessage,
} from '../utils/whatsappHelper';

interface AdminDashboardModalProps {
  tenants: TenantProfile[];
  settings: AppSettings;
  kostPayments: KostPaymentRecord[];
  electricityPayments: ElectricityRecord[];
  initialTab?: 'verifikasi' | 'penghuni' | 'akun' | 'rekap';
  onClose: () => void;
  onVerifyPayment: (
    type: 'kost' | 'electricity',
    id: string
  ) => Promise<{ success: boolean; message: string; sentToSheets: boolean }> | void;
  onOpenGoogleSheetsModal: () => void;
  onOpenWhatsAppModal?: () => void;
  onUpdateTenant?: (updated: TenantProfile) => void;
  onOpenReceipt?: (record: KostPaymentRecord | ElectricityRecord, type: 'kost' | 'electricity') => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  tenants,
  settings,
  kostPayments,
  electricityPayments,
  initialTab = 'verifikasi',
  onClose,
  onVerifyPayment,
  onOpenGoogleSheetsModal,
  onOpenWhatsAppModal,
  onUpdateTenant,
  onOpenReceipt,
}) => {
  const [activeTab, setActiveTab] = useState<'verifikasi' | 'penghuni' | 'akun' | 'rekap'>(initialTab);
  const [accountViewMode, setAccountViewMode] = useState<'table' | 'cards'>('table');
  const [branchFilter, setBranchFilter] = useState<'all' | 'acarya_1' | 'acarya_2'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'dihuni' | 'tersedia'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewProof, setPreviewProof] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantProfile | null>(null);
  const [editUsernameInput, setEditUsernameInput] = useState('');
  const [editPasswordInput, setEditPasswordInput] = useState('');

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [editingProfileTenant, setEditingProfileTenant] = useState<TenantProfile | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [editOccupiedInput, setEditOccupiedInput] = useState<boolean>(true);
  const [editPhoneInput, setEditPhoneInput] = useState('');
  const [editParentPhoneInput, setEditParentPhoneInput] = useState('');
  const [editOriginInput, setEditOriginInput] = useState('');
  const [editCheckInInput, setEditCheckInInput] = useState('');
  const [editCheckOutInput, setEditCheckOutInput] = useState('');
  const [editRateInput, setEditRateInput] = useState('');
  const [isVerifyingId, setIsVerifyingId] = useState<string | null>(null);
  const [toastData, setToastData] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const handleVerifyWithFeedback = async (
    type: 'kost' | 'electricity',
    id: string,
    roomNumber: string,
    tenantName: string
  ) => {
    setIsVerifyingId(id);
    try {
      const res = await onVerifyPayment(type, id);
      if (res && typeof res === 'object') {
        if (res.sentToSheets) {
          setToastData({
            type: 'success',
            title: 'Verifikasi Berhasil & Masuk ke Sheet Kamar!',
            message: res.message,
          });
        } else {
          setToastData({
            type: 'warning',
            title: 'Status Sukses di Aplikasi (Periksa Google Sheets)',
            message: res.message,
          });
        }
      } else {
        setToastData({
          type: 'success',
          title: 'Verifikasi Berhasil',
          message: `Pembayaran Kamar ${roomNumber} (${tenantName}) telah diverifikasi menjadi SUKSES.`,
        });
      }
    } catch (err: any) {
      setToastData({
        type: 'error',
        title: 'Gagal Memproses Verifikasi',
        message: err?.message || 'Terjadi gangguan saat memverifikasi pembayaran.',
      });
    } finally {
      setIsVerifyingId(null);
    }
  };

  // Filtered by branch (memoized for smooth rendering)
  const filteredKostPayments = useMemo(
    () =>
      branchFilter === 'all'
        ? kostPayments
        : kostPayments.filter((p) => (p.kostLocation || 'acarya_1') === branchFilter),
    [kostPayments, branchFilter]
  );

  const filteredElectricityPayments = useMemo(
    () =>
      branchFilter === 'all'
        ? electricityPayments
        : electricityPayments.filter((p) => (p.kostLocation || 'acarya_1') === branchFilter),
    [electricityPayments, branchFilter]
  );

  const branchTenants = useMemo(
    () =>
      branchFilter === 'all'
        ? tenants
        : tenants.filter((t) => (t.kostLocation || 'acarya_1') === branchFilter),
    [tenants, branchFilter]
  );

  const totalRoomsCount = branchTenants.length;
  const occupiedCount = useMemo(
    () => branchTenants.filter((t) => t.isOccupied === true || t.status === 'DIHUNI').length,
    [branchTenants]
  );
  const availableCount = totalRoomsCount - occupiedCount;

  const filteredTenants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return branchTenants
      .filter((t) => {
        if (statusFilter === 'dihuni') return t.isOccupied === true || t.status === 'DIHUNI';
        if (statusFilter === 'tersedia') return !t.isOccupied || t.status === 'TERSEDIA';
        return true;
      })
      .filter((t) => {
        if (!q) return true;
        return (
          t.name.toLowerCase().includes(q) ||
          t.roomNumber.toLowerCase().includes(q) ||
          (t.origin && t.origin.toLowerCase().includes(q)) ||
          (t.phone && t.phone.includes(q)) ||
          (t.parentPhone && t.parentPhone.includes(q))
        );
      });
  }, [branchTenants, statusFilter, searchQuery]);

  const pendingKost = useMemo(
    () => filteredKostPayments.filter((p) => p.status === 'pending'),
    [filteredKostPayments]
  );
  const pendingElectricity = useMemo(
    () => filteredElectricityPayments.filter((p) => p.status === 'pending'),
    [filteredElectricityPayments]
  );
  const totalPending = pendingKost.length + pendingElectricity.length;

  const totalRevenueKost = useMemo(
    () =>
      filteredKostPayments
        .filter((p) => p.status === 'verified')
        .reduce((acc, curr) => acc + curr.totalAmount, 0),
    [filteredKostPayments]
  );

  const totalRevenueElectricity = useMemo(
    () =>
      filteredElectricityPayments
        .filter((p) => p.status === 'verified')
        .reduce((acc, curr) => acc + curr.totalAmount, 0),
    [filteredElectricityPayments]
  );

  // Per branch stats for summary
  const kost1Revenue = useMemo(
    () =>
      kostPayments
        .filter((p) => p.status === 'verified' && (p.kostLocation || 'acarya_1') === 'acarya_1')
        .reduce((acc, curr) => acc + curr.totalAmount, 0) +
      electricityPayments
        .filter((p) => p.status === 'verified' && (p.kostLocation || 'acarya_1') === 'acarya_1')
        .reduce((acc, curr) => acc + curr.totalAmount, 0),
    [kostPayments, electricityPayments]
  );

  const kost2Revenue = useMemo(
    () =>
      kostPayments
        .filter((p) => p.status === 'verified' && p.kostLocation === 'acarya_2')
        .reduce((acc, curr) => acc + curr.totalAmount, 0) +
      electricityPayments
        .filter((p) => p.status === 'verified' && p.kostLocation === 'acarya_2')
        .reduce((acc, curr) => acc + curr.totalAmount, 0),
    [kostPayments, electricityPayments]
  );

  // Export CSV with Lokasi Kost column
  const handleExportCSV = () => {
    const headers = 'ID,Lokasi Kost,Jenis,Nama,Kamar,WhatsApp,Nominal,Metode,Status,Tanggal\n';
    const kostRows = filteredKostPayments.map(
      (k) =>
        `"${k.id}","${k.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}","Sewa Kost","${k.tenantName}","${k.roomNumber}","${k.phone}",${k.totalAmount},"${k.paymentMethod}","${k.status}","${k.createdAt}"`
    );
    const elecRows = filteredElectricityPayments.map(
      (e) =>
        `"${e.id}","${e.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}","Listrik kWh","${e.tenantName}","${e.roomNumber}","${e.phone}",${e.totalAmount},"${e.paymentMethod}","${e.status}","${e.createdAt}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + headers + [...kostRows, ...elecRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rekap_Acarya_Kost_${branchFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCredentials = (t: TenantProfile) => {
    const branchName = t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
    const defaultUser = t.username || `kamar${t.roomNumber}`;
    const defaultPass = t.password || '-';
    const text = `*AKUN LOGIN KOSTPAY - ${branchName.toUpperCase()}*\n\nHalo Kak ${t.name},\nBerikut akses login untuk dasbor tagihan sewa & listrik kamar Anda:\n\n🏢 Cabang: ${branchName}\n🚪 Kamar: ${t.roomNumber}\n👤 Username: ${defaultUser}\n🔑 Password: ${defaultPass}\n\nSilakan simpan data ini dan jangan dibagikan ke orang lain ya. Terima kasih!`;
    navigator.clipboard.writeText(text);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAllCredentials = () => {
    const lines = filteredTenants.map((t) => {
      const branch = t.kostLocation === 'acarya_2' ? 'Kost 2' : 'Kost 1';
      const u = t.username || `kamar${t.roomNumber}`;
      const p = t.password || '-';
      return `[${branch}] Kamar ${t.roomNumber} - ${t.name} | User: ${u} | Pass: ${p} | Tarif: Rp ${t.monthlyRentRate.toLocaleString('id-ID')}`;
    });
    const header = `DAFTAR AKUN & PASSWORD KAMAR ACARYA KOST (${branchFilter === 'all' ? 'Semua Cabang' : branchFilter === 'acarya_1' ? 'Kost 1' : 'Kost 2'})\n${'='.repeat(70)}\n`;
    navigator.clipboard.writeText(header + lines.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const openEditPasswordModal = (t: TenantProfile) => {
    setEditingTenant(t);
    setEditUsernameInput(t.username || `kamar${t.roomNumber}`);
    setEditPasswordInput(t.password || '');
  };

  const generateRandomPass = (roomNumber: string) => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `k${roomNumber}${randomPart}`;
  };

  const handleSavePassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingTenant || !editPasswordInput.trim()) return;
    const newPass = editPasswordInput.trim();
    const newUser = editUsernameInput.trim() || `kamar${editingTenant.roomNumber}`;
    const updated: TenantProfile = {
      ...editingTenant,
      username: newUser,
      password: newPass,
    };
    if (onUpdateTenant) {
      onUpdateTenant(updated);
    }
    const branchLabel =
      editingTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
    setToastData({
      type: 'success',
      title: 'Akun & Password Login Berhasil Diperbarui!',
      message: `${branchLabel} - Kamar ${editingTenant.roomNumber} (${editingTenant.name}) kini menggunakan Username: "${newUser}" dan Password Baru: "${newPass}".`,
    });
    setEditingTenant(null);
    setEditPasswordInput('');
    setEditUsernameInput('');
  };

  const openEditProfileModal = (t: TenantProfile) => {
    const isCurrentlyOccupied = t.isOccupied === true || t.status === 'DIHUNI';
    const isPlaceholderName = !t.name || t.name === '-' || t.name.toLowerCase().includes('tersedia');
    setEditingProfileTenant(t);
    setEditNameInput(isPlaceholderName ? '' : t.name);
    setEditOccupiedInput(isCurrentlyOccupied);
    setEditPhoneInput(t.phone && t.phone !== '-' ? t.phone : '');
    setEditParentPhoneInput(t.parentPhone && t.parentPhone !== '-' ? t.parentPhone : '');
    setEditOriginInput(t.origin && t.origin !== '-' ? t.origin : '');
    setEditCheckInInput(t.checkInDate && t.checkInDate !== '-' ? t.checkInDate : '');
    setEditCheckOutInput(t.checkOutDate && t.checkOutDate !== '-' ? t.checkOutDate : '');
    setEditRateInput(String(t.monthlyRentRate || 1500000));
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileTenant) return;

    const cleanName = editNameInput.trim();
    const isNowOccupied = editOccupiedInput && cleanName.length > 0 && cleanName !== '-';
    const resolvedName = isNowOccupied
      ? cleanName
      : `Kamar ${editingProfileTenant.roomNumber} (Tersedia)`;
    const parsedRate =
      parseInt(editRateInput.replace(/\D/g, ''), 10) || editingProfileTenant.monthlyRentRate;

    const updated: TenantProfile = {
      ...editingProfileTenant,
      name: resolvedName,
      isOccupied: isNowOccupied,
      status: isNowOccupied ? 'DIHUNI' : 'TERSEDIA',
      phone: isNowOccupied ? editPhoneInput.trim() : '',
      parentPhone: isNowOccupied && editParentPhoneInput.trim() ? editParentPhoneInput.trim() : '-',
      origin: isNowOccupied && editOriginInput.trim() ? editOriginInput.trim() : '-',
      checkInDate: isNowOccupied && editCheckInInput.trim() ? editCheckInInput.trim() : '-',
      checkOutDate: isNowOccupied && editCheckOutInput.trim() ? editCheckOutInput.trim() : '-',
      monthlyRentRate: parsedRate,
    };

    if (onUpdateTenant) {
      onUpdateTenant(updated);
    }

    const branchLabel =
      editingProfileTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
    setToastData({
      type: 'success',
      title: 'Nama & Data Penghuni Tersimpan & Tersinkron ke Google Sheet!',
      message: `${branchLabel} - Kamar ${editingProfileTenant.roomNumber} berhasil diperbarui menjadi "${resolvedName}" dan otomatis dikirim ke Google Spreadsheet (DAFTAR_TARIF_KAMAR & Tab Kamar).`,
    });

    setEditingProfileTenant(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-admin"
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Panel Pengelola Kost
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Admin
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Kelola pembayaran, verifikasi struk transfer, & status 2 cabang: Acarya Kost 1 & 2
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenWhatsAppModal && (
            <button
              type="button"
              onClick={onOpenWhatsAppModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
              title="Buka Sistem Notifikasi WhatsApp"
            >
              <BellRing className="w-3.5 h-3.5 text-emerald-600" />
              <span>Notifikasi WA</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenGoogleSheetsModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Google Sheet</span>
          </button>
        </div>
      </div>

      {/* Missing URL Warning Alert */}
      {(!settings.googleWebAppUrl || !settings.googleWebAppUrl.trim()) && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3.5 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <strong className="block font-bold text-amber-900 mb-0.5">
              URL Google Apps Script Belum Terhubung!
            </strong>
            <p className="text-amber-800 leading-relaxed">
              Saat ini pembayaran yang Anda verifikasi hanya tersimpan di aplikasi dan <strong>belum dapat masuk ke sheet kamar</strong> karena URL Google Apps Script masih kosong. Silakan buka menu Google Sheet untuk menempelkan URL Web App Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenGoogleSheetsModal}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            Hubungkan URL
          </button>
        </div>
      )}

      {/* Verification Toast Notification (Success, Warning, Error) */}
      {toastData && (
        <div
          className={`rounded-xl p-3.5 flex items-start gap-3 shadow-xs border animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastData.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : toastData.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {toastData.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : toastData.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs font-medium">
            <strong
              className={`block font-bold mb-0.5 ${
                toastData.type === 'success'
                  ? 'text-emerald-800'
                  : toastData.type === 'warning'
                  ? 'text-amber-800'
                  : 'text-rose-800'
              }`}
            >
              {toastData.title}
            </strong>
            <span className="leading-relaxed">{toastData.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastData(null)}
            className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Branch Filter Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-xs gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700">Filter Lokasi Cabang:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setBranchFilter('all')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              branchFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Cabang
          </button>
          <button
            type="button"
            onClick={() => setBranchFilter('acarya_1')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              branchFilter === 'acarya_1'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-300"></span>
            <span>Acarya Kost 1</span>
          </button>
          <button
            type="button"
            onClick={() => setBranchFilter('acarya_2')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              branchFilter === 'acarya_2'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
            <span>Acarya Kost 2</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold block">
            Sewa Terverifikasi
          </span>
          <span className="text-lg font-bold text-indigo-700 font-mono">
            {formatRupiah(totalRevenueKost)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {branchFilter === 'all' ? '2 Cabang' : branchFilter === 'acarya_1' ? 'Kost 1' : 'Kost 2'}
          </span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold block">
            Listrik Terkumpul
          </span>
          <span className="text-lg font-bold text-sky-700 font-mono">
            {formatRupiah(totalRevenueElectricity)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Pemakaian kWh Listrik</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold block">
            Total Penghuni
          </span>
          <span className="text-2xl font-bold text-slate-800 font-mono">
            {filteredTenants.length}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Kamar aktif</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold block">
            Per Cabang (Total)
          </span>
          <div className="text-[11px] font-mono mt-1 space-y-0.5">
            <div className="text-indigo-700 font-bold">K1: {formatRupiah(kost1Revenue)}</div>
            <div className="text-emerald-700 font-bold">K2: {formatRupiah(kost2Revenue)}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('verifikasi')}
          className={`py-2 px-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'verifikasi'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Verifikasi ({totalPending})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('penghuni')}
          className={`py-2 px-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'penghuni'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-600" />
          <span>Kamar ({occupiedCount}/{totalRoomsCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('akun')}
          className={`py-2 px-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'akun'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <KeyRound className="w-4 h-4 text-emerald-600" />
          <span>Akun & Password</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rekap')}
          className={`py-2 px-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4 text-slate-600" />
          <span>Rekap Transaksi</span>
        </button>
      </div>

      {/* TAB 1: Antrean Verifikasi */}
      {activeTab === 'verifikasi' && (
        <div className="space-y-4">
          {totalPending === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-slate-400 border border-slate-200 shadow-sm">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-80" />
              <h4 className="text-base font-bold text-slate-800">
                Semua Pembayaran Sudah Terverifikasi!
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Tidak ada bukti transfer yang menunggu pengecekan untuk filter {branchFilter === 'all' ? 'semua cabang' : branchFilter === 'acarya_1' ? 'Acarya Kost 1' : 'Acarya Kost 2'}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Pending Kost */}
              {pendingKost.map((k) => (
                <div
                  key={k.id}
                  className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                          k.kostLocation === 'acarya_2'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}>
                          {k.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          Kamar {k.roomNumber}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{k.tenantName}</h4>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                          {k.paymentMethod === 'bri'
                            ? 'Transfer BRI'
                            : k.paymentMethod === 'qris'
                            ? 'QRIS'
                            : 'Cash'}
                        </span>
                        {k.paymentType === 'tahunan_cicil' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                            <Layers className="w-3 h-3 text-amber-700" />
                            <span>Cicilan Ke-{k.installmentInfo?.installmentTerm || 1} (Tahunan)</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {k.paymentType === 'tahunan_cicil'
                          ? `Sewa Tahunan Sistem Cicilan • ID: ${k.id}`
                          : `Sewa Kost: ${k.periodStart} s/d ${k.periodEnd} (${k.durationMonths} Bulan) • ID: ${k.id}`}
                      </p>

                      {k.installmentInfo && (
                        <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs space-y-1">
                          <div className="flex items-center justify-between text-amber-950">
                            <span>Total Sewa 1 Tahun:</span>
                            <span className="font-semibold">{formatRupiah(k.installmentInfo.totalAnnualAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-amber-950">
                            <span>Akumulasi Terbayar:</span>
                            <span className="font-bold text-emerald-700">{formatRupiah(k.installmentInfo.totalPaidSoFar)}</span>
                          </div>
                          <div className="flex items-center justify-between text-amber-950">
                            <span>Sisa Kekurangan:</span>
                            <span className="font-bold text-rose-700">{formatRupiah(k.installmentInfo.remainingAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-amber-900 pt-1 border-t border-amber-200">
                            <span>Batas Pelunasan (Maks 3 Bulan):</span>
                            <strong className="text-amber-900">{k.installmentInfo.maxPayoffDate}</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-indigo-700 block">
                        {formatRupiah(k.totalAmount)}
                      </span>
                      <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block mt-1">
                        ⏳ Pending (Belum Masuk Sheet)
                      </span>
                    </div>
                  </div>

                  {k.notes && (
                    <div className="bg-slate-50 p-2.5 rounded-lg text-xs text-slate-600 border border-slate-100">
                      Catatan Anak Kost: "{k.notes}"
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      {k.proofImage ? (
                        <button
                          type="button"
                          onClick={() => setPreviewProof(k.proofImage!)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Periksa Bukti Struk</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          {k.paymentMethod === 'cash' ? 'Bayar Tunai Langsung (Cash)' : 'Tanpa Bukti'}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isVerifyingId === k.id}
                      onClick={() => handleVerifyWithFeedback('kost', k.id, k.roomNumber, k.tenantName)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      title="Ubah status jadi Sukses dan langsung catat ke sheet kamar"
                    >
                      {isVerifyingId === k.id ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Menyimpan & Mengirim...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Verifikasi & Terbitkan Nota Otomatis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}

              {/* Pending Electricity */}
              {pendingElectricity.map((el) => (
                <div
                  key={el.id}
                  className="bg-white rounded-xl p-4 border border-sky-200 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                          el.kostLocation === 'acarya_2'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}>
                          {el.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          Kamar {el.roomNumber}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{el.tenantName}</h4>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200">
                          Listrik{' '}
                          {el.paymentMethod === 'bri'
                            ? 'BRI'
                            : el.paymentMethod === 'qris'
                            ? 'QRIS'
                            : 'Cash'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Listrik Periode {el.periodMonth} • Pemakaian {el.usageKwh} kWh ({el.initialKwh} ➔ {el.finalKwh})
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-sky-700 block">
                        {formatRupiah(el.totalAmount)}
                      </span>
                      <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block mt-1">
                        ⏳ Pending (Belum Masuk Sheet)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      {el.proofImage ? (
                        <button
                          type="button"
                          onClick={() => setPreviewProof(el.proofImage!)}
                          className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-sky-200"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Periksa Bukti Listrik</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          {el.paymentMethod === 'cash' ? 'Bayar Tunai (Cash)' : 'Tanpa Bukti'}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isVerifyingId === el.id}
                      onClick={() => handleVerifyWithFeedback('electricity', el.id, el.roomNumber, el.tenantName)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      title="Ubah status jadi Sukses dan langsung catat ke sheet kamar"
                    >
                      {isVerifyingId === el.id ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Menyimpan & Mengirim...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Verifikasi & Terbitkan Nota Otomatis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Status Kamar & Data Diri Penghuni (Acarya 1 & 2) */}
      {activeTab === 'penghuni' && (
        <div className="space-y-5">
          {/* Executive Hero Occupancy & Interactive Visual Room Map */}
          <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-indigo-800/40 relative overflow-hidden space-y-5">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-[10px] font-extrabold uppercase tracking-wider mb-1.5">
                  <Building2 className="w-3 h-3 text-indigo-300" />
                  <span>Monitor Real-Time Kost</span>
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                  Pemantauan Status Kamar & Data Diri Penghuni
                </h3>
                <p className="text-xs text-indigo-200/80 mt-0.5">
                  Data terintegrasi otomatis dengan Dasbor & Google Sheet ({branchFilter === 'all' ? 'Acarya Kost 1 & Kost 2' : branchFilter === 'acarya_1' ? 'Acarya Kost 1' : 'Acarya Kost 2'})
                </p>
              </div>

              {/* 3 Stat Bento Pills */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
                <div className="bg-white/10 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-white/15 text-center">
                  <span className="text-[10px] font-bold text-indigo-200 block uppercase tracking-wider">Total Kamar</span>
                  <span className="text-xl sm:text-2xl font-black text-white">{totalRoomsCount}</span>
                  <span className="text-[10px] text-indigo-200/75 block">
                    {branchFilter === 'all' ? '2 Cabang' : branchFilter === 'acarya_1' ? 'Kost 1' : 'Kost 2'}
                  </span>
                </div>
                <div className="bg-rose-500/20 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-rose-400/30 text-center">
                  <span className="text-[10px] font-bold text-rose-200 block uppercase tracking-wider">Dihuni</span>
                  <span className="text-xl sm:text-2xl font-black text-rose-300">{occupiedCount}</span>
                  <span className="text-[10px] text-rose-200/90 font-semibold block">
                    {totalRoomsCount > 0 ? `${Math.round((occupiedCount / totalRoomsCount) * 100)}% Terisi` : '0%'}
                  </span>
                </div>
                <div className="bg-emerald-500/20 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-emerald-400/30 text-center">
                  <span className="text-[10px] font-bold text-emerald-200 block uppercase tracking-wider">Tersedia</span>
                  <span className="text-xl sm:text-2xl font-black text-emerald-300">{availableCount}</span>
                  <span className="text-[10px] text-emerald-200/90 font-semibold block">Siap Huni</span>
                </div>
              </div>
            </div>

            {/* Interactive Visual Room Number Map (Denah Cepat Kamar) */}
            <div className="relative z-10 pt-3 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-indigo-200">
                <span className="font-bold">Denah Cepat Status Kamar (Klik kamar untuk edit cepat):</span>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Dihuni
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Tersedia
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {branchTenants.map((rm) => {
                  const occ = rm.isOccupied === true || rm.status === 'DIHUNI';
                  return (
                    <button
                      key={rm.id}
                      type="button"
                      onClick={() => openEditProfileModal(rm)}
                      title={`${rm.kostLocation === 'acarya_2' ? 'Kost 2' : 'Kost 1'} - Kamar ${rm.roomNumber}: ${occ ? rm.name : 'Tersedia (Klik untuk isi/edit)'}`}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-extrabold border transition-all cursor-pointer flex items-center gap-1 ${
                        occ
                          ? 'bg-rose-500/25 hover:bg-rose-500/40 text-white border-rose-400/40 shadow-2xs'
                          : 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border-emerald-400/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${occ ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                      <span>{branchFilter === 'all' ? `${rm.kostLocation === 'acarya_2' ? 'K2-' : 'K1-'}${rm.roomNumber}` : rm.roomNumber}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Control Bar & Room Cards Container */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 shadow-sm space-y-5">
            {/* Google Sheet Sync Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50 border border-emerald-200/90 rounded-xl text-xs text-emerald-950">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-extrabold text-emerald-950 block text-xs sm:text-sm">
                    Nominal Tarif & Nama Penghuni Terhubung dengan Google Sheet
                  </span>
                  <span className="text-[11px] text-emerald-800">
                    Perubahan nama penghuni & tarif bulanan tiap kamar otomatis tersinkron ke tab master <strong>DAFTAR_TARIF_KAMAR</strong> di Google Spreadsheet.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenGoogleSheetsModal}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Atur / Tarik Tarif Sheet</span>
              </button>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Status Filter Buttons */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs self-start">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Kamar ({totalRoomsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('dihuni')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'dihuni'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-rose-700 hover:text-rose-900'
                  }`}
                >
                  ● Dihuni ({occupiedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('tersedia')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'tersedia'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:text-emerald-900'
                  }`}
                >
                  ● Tersedia ({availableCount})
                </button>
              </div>

              {/* Search Input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nomor kamar, nama penghuni, asal daerah, no WA..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Redesigned Executive Room Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredTenants.map((t) => {
                const isDihuni = t.isOccupied === true || t.status === 'DIHUNI';
                const rentMsg = generateRentReminderMessage(t, settings);
                const rentLink = t.phone ? buildWaLink(t.phone, rentMsg) : '#';

                const elecMsg = generateElectricityReminderMessage(t, settings);
                const elecLink = t.phone ? buildWaLink(t.phone, elecMsg) : '#';

                const ortuMsg = `Halo Bapak/Ibu orang tua dari ${t.name} (Penghuni Kamar ${t.roomNumber} ${t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}). Kami dari pihak Pengelola Acarya Kost ingin menyampaikan update terkait informasi sewa dan fasilitas kamar. Terima kasih.`;
                const ortuLink = t.parentPhone && t.parentPhone !== '-' ? buildWaLink(t.parentPhone, ortuMsg) : null;

                const initials = isDihuni
                  ? t.name
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join('')
                  : t.roomNumber;

                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl border overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                      isDihuni
                        ? 'border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-indigo-300'
                        : 'border-dashed border-emerald-300/90 bg-gradient-to-br from-emerald-50/30 via-white to-emerald-50/20 hover:border-emerald-400'
                    }`}
                  >
                    {/* Top Color Accent Strip */}
                    <div
                      className={`h-1.5 w-full ${
                        isDihuni
                          ? t.kostLocation === 'acarya_2'
                            ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500'
                            : 'bg-gradient-to-r from-indigo-600 to-blue-500'
                          : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                      }`}
                    />

                    <div className="p-4 sm:p-5 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-3.5">
                        {/* Top Header: Room Badge, Branch & Quick Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            {/* Stylized Room Number Box */}
                            <div
                              className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-mono shrink-0 border shadow-2xs ${
                                isDihuni
                                  ? 'bg-slate-900 text-white border-slate-800'
                                  : 'bg-emerald-100/80 text-emerald-900 border-emerald-300'
                              }`}
                            >
                              <span className="text-[9px] uppercase tracking-wider opacity-70 font-sans font-bold leading-none">
                                KMR
                              </span>
                              <span className="text-base font-black leading-tight">
                                {t.roomNumber}
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                    t.kostLocation === 'acarya_2'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  }`}
                                >
                                  {t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide border inline-flex items-center gap-1 ${
                                    isDihuni
                                      ? 'text-rose-700 border-rose-200 bg-rose-50'
                                      : 'text-emerald-700 border-emerald-200 bg-emerald-50'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      isDihuni ? 'bg-rose-500' : 'bg-emerald-500'
                                    }`}
                                  />
                                  {isDihuni ? 'DIHUNI' : 'TERSEDIA'}
                                </span>
                              </div>

                              {/* Tenant Name or Available Title */}
                              <div className="mt-1 flex items-center gap-1.5">
                                <h4
                                  className={`text-sm sm:text-base font-extrabold tracking-tight leading-snug ${
                                    isDihuni ? 'text-slate-900' : 'text-slate-500'
                                  }`}
                                >
                                  {isDihuni ? t.name : `Kamar ${t.roomNumber} (Siap Huni)`}
                                </h4>
                                <button
                                  type="button"
                                  onClick={() => openEditProfileModal(t)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer shrink-0"
                                  title="Edit Nama & Profil Penghuni"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Quick Ubah Nama Button */}
                          <button
                            type="button"
                            onClick={() => openEditProfileModal(t)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                            title="Ubah Nama & Data Penghuni Kamar (Otomatis Sinkron ke Google Sheet)"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Ubah Nama</span>
                          </button>
                        </div>

                        {/* Tarif Sewa Banner */}
                        <div className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-50/80 via-slate-50 to-indigo-50/50 border border-indigo-100/90 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                            <span>Tarif Sewa Kamar:</span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              Sheet
                            </span>
                          </div>
                          <span className="font-mono font-extrabold text-indigo-700 text-sm">
                            {formatRupiah(t.monthlyRentRate)}
                            <span className="text-[10px] font-sans font-normal text-slate-500">/bln</span>
                          </span>
                        </div>

                        {isDihuni ? (
                          <div className="space-y-3 text-xs">
                            {/* Bento Grid Info Kontak & Asal */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  WhatsApp Penghuni
                                </span>
                                {t.phone ? (
                                  <a
                                    href={`https://wa.me/${t.phone.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 break-all"
                                  >
                                    <span>{t.phone.startsWith('62') ? `+${t.phone}` : t.phone}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-slate-400 font-medium">-</span>
                                )}
                              </div>

                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  WhatsApp Ortu / Wali
                                </span>
                                {t.parentPhone && t.parentPhone !== '-' ? (
                                  <a
                                    href={`https://wa.me/${t.parentPhone.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 break-all"
                                  >
                                    <span>{t.parentPhone.startsWith('62') ? `+${t.parentPhone}` : t.parentPhone}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-slate-400 font-medium">-</span>
                                )}
                              </div>
                            </div>

                            {/* Asal Daerah & Tanggal Masuk/Keluar */}
                            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1.5">
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                    Asal Daerah / Alamat
                                  </span>
                                  <span className="text-slate-800 font-semibold leading-snug block">
                                    {t.origin || '-'}
                                  </span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-200/60 text-[11px]">
                                <div>
                                  <span className="text-slate-400">Tgl Masuk: </span>
                                  <strong className="text-slate-700">{t.checkInDate || '-'}</strong>
                                </div>
                                <div>
                                  <span className="text-slate-400">Tgl Keluar: </span>
                                  <strong className="text-slate-700">{t.checkOutDate || '-'}</strong>
                                </div>
                              </div>
                            </div>

                            {/* Program Sewa Tahunan Cicilan Details if active */}
                            {t.annualInstallment?.isActive && (
                              <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 space-y-1 text-xs">
                                <div className="flex items-center justify-between text-amber-950">
                                  <span className="font-bold flex items-center gap-1">
                                    <Layers className="w-3.5 h-3.5 text-amber-700" />
                                    <span>Cicilan Tahunan (Ke-{t.annualInstallment.installmentTerm})</span>
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      t.annualInstallment.isFullyPaid
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-200 text-amber-900'
                                    }`}
                                  >
                                    {t.annualInstallment.isFullyPaid ? 'Lunas 1 Tahun' : 'Maks 3 Bln Lunas'}
                                  </span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-600">
                                  <span>
                                    Terbayar: <strong>{formatRupiah(t.annualInstallment.paidAmount)}</strong> /{' '}
                                    {formatRupiah(t.annualInstallment.totalAnnualAmount)}
                                  </span>
                                  <span>
                                    Sisa:{' '}
                                    <strong
                                      className={
                                        t.annualInstallment.remainingAmount > 0
                                          ? 'text-rose-600'
                                          : 'text-emerald-600'
                                      }
                                    >
                                      {formatRupiah(t.annualInstallment.remainingAmount)}
                                    </strong>
                                  </span>
                                </div>
                                <div className="text-[10px] text-amber-800 pt-0.5 border-t border-amber-200 flex justify-between">
                                  <span>Batas Pelunasan:</span>
                                  <span className="font-bold">{t.annualInstallment.maxPayoffDate} (Maks 3 Bulan)</span>
                                </div>
                              </div>
                            )}

                            {/* Akun Login Kamar Strip */}
                            <div className="px-3 py-2 bg-slate-900 text-white rounded-xl flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="text-slate-300">
                                  User: <strong className="font-mono text-white">{t.username || `kamar${t.roomNumber}`}</strong>
                                </span>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-300">
                                  Pass: <strong className="font-mono text-amber-300">{t.password || '-'}</strong>
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openEditPasswordModal(t)}
                                className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white border border-white/15 font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                                title="Ubah Password Login Kamar"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                                <span>Ubah Pass</span>
                              </button>
                            </div>

                            {/* Status Sewa & Listrik Badges */}
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div
                                className={`px-3 py-1.5 rounded-lg border flex items-center justify-between ${
                                  t.activeRentStatus === 'lunas'
                                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                                }`}
                              >
                                <span className="text-slate-500 font-medium">Sewa:</span>
                                <strong
                                  className={`uppercase font-extrabold ${
                                    t.activeRentStatus === 'lunas' ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  {t.activeRentStatus.replace('_', ' ')}
                                </strong>
                              </div>

                              <div
                                className={`px-3 py-1.5 rounded-lg border flex items-center justify-between ${
                                  t.activeElectricityStatus === 'lunas'
                                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                    : 'bg-sky-50/70 border-sky-200 text-sky-900'
                                }`}
                              >
                                <span className="text-slate-500 font-medium">Listrik:</span>
                                <strong
                                  className={`uppercase font-extrabold ${
                                    t.activeElectricityStatus === 'lunas' ? 'text-emerald-700' : 'text-sky-700'
                                  }`}
                                >
                                  {t.activeElectricityStatus.replace('_', ' ')}
                                </strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Empty / Available Room Body */
                          <div className="py-3 px-4 rounded-xl bg-white/80 border border-emerald-200/80 text-center space-y-2.5">
                            <p className="text-xs font-bold text-emerald-900">
                              Kamar ini kosong & siap dihuni penghuni baru.
                            </p>
                            <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">
                                User: <strong className="font-mono text-slate-800">{t.username || `kamar${t.roomNumber}`}</strong> • Pass:{' '}
                                <strong className="font-mono text-indigo-700">{t.password || '-'}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => openEditPasswordModal(t)}
                                className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                              >
                                Ubah Pass
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Complete Footer Action Buttons (All Preserved!) */}
                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                        {isDihuni ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditProfileModal(t)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Ubah Nama & Data Penghuni (Sinkron Otomatis ke Google Sheet)"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Penghuni</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditPasswordModal(t)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Ubah Password Login Anak Kost"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Ubah Password</span>
                            </button>
                            {t.phone && (
                              <>
                                <a
                                  href={rentLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                  title="Kirim Pengingat Sewa Kost"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>WA Sewa</span>
                                </a>
                                {t.annualInstallment?.isActive && !t.annualInstallment.isFullyPaid && (
                                  <a
                                    href={buildWaLink(
                                      t.phone,
                                      generateInstallmentReminderMessage(t, settings, t.annualInstallment)
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                    title="Kirim Pengingat Sisa Cicilan Tahunan (Maks 3 Bulan)"
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                    <span>WA Sisa Cicilan</span>
                                  </a>
                                )}
                                <a
                                  href={elecLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                  title="Kirim Pengingat Listrik kWh"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>WA Listrik</span>
                                </a>
                              </>
                            )}
                            {ortuLink && (
                              <a
                                href={ortuLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="Hubungi Orang Tua Penghuni via WhatsApp"
                              >
                                <Phone className="w-3 h-3" />
                                <span>WA Ortu</span>
                              </a>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEditProfileModal(t)}
                            className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Isi / Ubah Nama Penghuni</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredTenants.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs font-semibold text-slate-600">
                  Tidak ada kamar yang cocok dengan kriteria pencarian.
                </p>
                <p className="text-[11px] text-slate-400">
                  Coba ubah kata kunci atau filter cabang/status.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Kumpulan Username & Password Login Anak Kost */}
      {activeTab === 'akun' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  <span>Kumpulan Username & Password Login Anak Kost</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kelola dan ubah password login masing-masing kamar ({branchFilter === 'all' ? 'Semua Cabang: 29 Kamar' : branchFilter === 'acarya_1' ? 'Acarya Kost 1: 11 Kamar' : 'Acarya Kost 2: 18 Kamar'})
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyAllCredentials}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  title="Salin seluruh username & password kamar ke clipboard"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Semua Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Semua Akun</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-950 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Kelola Akses & Ubah Password Anak Kost:</span>
                <p className="mt-0.5 text-indigo-900/90 leading-relaxed">
                  Tekan tombol <strong>"Ubah Password"</strong> pada kamar mana pun untuk mengganti password login penghuni. Perubahan langsung aktif saat anak kost login ke dasbor kamar mereka.
                </p>
              </div>
            </div>

            {/* Filter Status & View Mode Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs self-start">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({totalRoomsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('dihuni')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'dihuni'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'text-red-700 hover:text-red-900'
                  }`}
                >
                  Dihuni ({occupiedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('tersedia')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'tersedia'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:text-emerald-900'
                  }`}
                >
                  Tersedia ({availableCount})
                </button>
              </div>

              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setAccountViewMode('table')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    accountViewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📋 Tabel Ringkas
                </button>
                <button
                  type="button"
                  onClick={() => setAccountViewMode('cards')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    accountViewMode === 'cards'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🪪 Kartu Detail
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nomor kamar, nama anak kost, username, atau password..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* MODE 1: TABEL KUMPULAN USERNAME & PASSWORD */}
            {accountViewMode === 'table' && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3 px-3 font-bold">Cabang & Kamar</th>
                      <th className="py-3 px-3 font-bold">Nama Anak Kost</th>
                      <th className="py-3 px-3 font-bold">Username Login</th>
                      <th className="py-3 px-3 font-bold">Password Login</th>
                      <th className="py-3 px-3 font-bold text-right">Aksi (Ubah / Kirim)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredTenants.map((t) => {
                      const defaultUser = t.username || `kamar${t.roomNumber}`;
                      const defaultPass = t.password || '-';
                      const isCopied = copiedId === t.id;
                      const isDihuni = t.isOccupied === true || t.status === 'DIHUNI';
                      const branchName = t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
                      const waInviteMsg = `*AKUN LOGIN KOSTPAY - ${branchName.toUpperCase()}*\n\nHalo Kak ${t.name},\nBerikut akses login untuk dasbor tagihan sewa & listrik kamar Anda:\n\n🏢 Cabang: ${branchName}\n🚪 Kamar: ${t.roomNumber}\n👤 Username: ${defaultUser}\n🔑 Password: ${defaultPass}\n\nSilakan gunakan data di atas untuk masuk ke dasbor Anda secara privat. Terima kasih!`;
                      const directWaLink = t.phone ? buildWaLink(t.phone, waInviteMsg) : null;

                      return (
                        <tr
                          key={t.id}
                          className={`hover:bg-indigo-50/40 transition-colors ${
                            !isDihuni ? 'bg-slate-50/60 text-slate-500' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  t.kostLocation === 'acarya_2'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                }`}
                              >
                                {t.kostLocation === 'acarya_2' ? 'Kost 2' : 'Kost 1'}
                              </span>
                              <span className="font-extrabold text-slate-900">
                                Kamar {t.roomNumber}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{t.name}</div>
                            <span
                              className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                isDihuni
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {isDihuni ? 'DIHUNI' : 'TERSEDIA'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                              {defaultUser}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200">
                              {defaultPass}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                id={`btn-edit-pass-${t.id}`}
                                type="button"
                                onClick={() => openEditPasswordModal(t)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                title="Ubah Password Login Kamar"
                              >
                                <KeyRound className="w-3 h-3" />
                                <span>Ubah Password</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyCredentials(t)}
                                className={`px-2 py-1.5 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer border ${
                                  isCopied
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                                title="Salin Username & Password"
                              >
                                {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
                              </button>
                              {directWaLink && (
                                <a
                                  href={directWaLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                  title="Kirim Akun Login ke WhatsApp Penghuni"
                                >
                                  <Share2 className="w-3 h-3" />
                                  <span>WA</span>
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* MODE 2: KARTU DETAIL PER KAMAR */}
            {accountViewMode === 'cards' && (
              <div className="space-y-3">
                {filteredTenants.map((t) => {
                  const defaultUser = t.username || `kamar${t.roomNumber}`;
                  const defaultPass = t.password || '-';
                  const isCopied = copiedId === t.id;

                  const branchName = t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
                  const waInviteMsg = `*AKUN LOGIN KOSTPAY - ${branchName.toUpperCase()}*\n\nHalo Kak ${t.name},\nBerikut akses login untuk dasbor tagihan sewa & listrik kamar Anda:\n\n🏢 Cabang: ${branchName}\n🚪 Kamar: ${t.roomNumber}\n👤 Username: ${defaultUser}\n🔑 Password: ${defaultPass}\n\nSilakan gunakan data di atas untuk masuk ke dasbor Anda secara privat. Terima kasih!`;
                  const directWaLink = t.phone ? buildWaLink(t.phone, waInviteMsg) : null;

                  return (
                    <div
                      key={t.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 shadow-2xs transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              t.kostLocation === 'acarya_2'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            }`}
                          >
                            {t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                          </span>
                          <span className="font-extrabold text-sm text-slate-900">
                            Kamar {t.roomNumber}
                          </span>
                          <span className="font-semibold text-slate-700 text-xs">
                            • {t.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditProfileModal(t)}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Ubah Nama Penghuni (Sinkron ke Google Sheet)"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Ubah Nama</span>
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider border ${
                              t.isOccupied
                                ? 'text-red-600 border-red-200 bg-red-50'
                                : 'text-emerald-700 border-emerald-200 bg-emerald-50'
                            }`}
                          >
                            {t.isOccupied ? 'DIHUNI' : 'TERSEDIA'}
                          </span>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="text-[11px] text-slate-400 block">Tarif Sewa Kamar:</span>
                          <span className="text-xs font-bold text-indigo-700 font-mono">
                            {formatRupiah(t.monthlyRentRate)}/bulan
                          </span>
                        </div>
                      </div>

                      {/* Credentials Display */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                        <div className="flex items-center justify-between bg-white p-2.5 rounded-md border border-slate-200">
                          <span className="text-slate-500 font-medium">Username Login:</span>
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-sm">
                            {defaultUser}
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white p-2.5 rounded-md border border-slate-200">
                          <span className="text-slate-500 font-medium">Password Login:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-sm border border-indigo-200">
                              {defaultPass}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditPasswordModal(t)}
                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Ubah Password Kamar"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Ubah Password</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                        <div className="text-[11px] text-slate-400">
                          {t.phone ? (
                            <span>WA: +{t.phone.replace(/[^0-9]/g, '')}</span>
                          ) : (
                            <span className="italic">Belum ada No. WA</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {directWaLink && (
                            <a
                              href={directWaLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Kirim kredensial langsung ke WhatsApp penghuni"
                            >
                              <Share2 className="w-3 h-3" />
                              <span>Kirim ke WA</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyCredentials(t)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer border ${
                              isCopied
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Salin teks pesan login siap kirim ke WhatsApp"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Tersalin!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Salin Format WA</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT TENANT NAME & PROFILE MODAL (INTEGRATED WITH GOOGLE SHEETS) */}
      {editingProfileTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 text-slate-900 my-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Ubah Nama & Data Penghuni Kamar {editingProfileTenant.roomNumber}
                  </h4>
                  <span className="text-[11px] font-semibold text-emerald-700">
                    {editingProfileTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'} • Otomatis Sinkron ke Google Sheet
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfileTenant(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs">
              {/* Status Kamar Toggle */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Status Kamar:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOccupiedInput(true)}
                    className={`py-2 px-3 rounded-lg font-bold border text-center transition-all cursor-pointer ${
                      editOccupiedInput
                        ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    DIHUNI (Ada Penghuni)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOccupiedInput(false);
                      setEditNameInput('');
                    }}
                    className={`py-2 px-3 rounded-lg font-bold border text-center transition-all cursor-pointer ${
                      !editOccupiedInput
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    TERSEDIA (Kosong)
                  </button>
                </div>
              </div>

              {/* Nama Penghuni */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Lengkap Penghuni Kost:
                </label>
                <input
                  id="input-edit-tenant-name"
                  type="text"
                  value={editNameInput}
                  onChange={(e) => {
                    setEditNameInput(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setEditOccupiedInput(true);
                    }
                  }}
                  placeholder="Masukkan nama penghuni baru..."
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  autoFocus
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Saat disimpan, nama di tab <strong>DAFTAR_TARIF_KAMAR</strong> & nama tab kamar di Google Sheet otomatis ikut berubah.
                </span>
              </div>

              {/* Nomor WA & WA Ortu */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. WhatsApp Penghuni:
                  </label>
                  <input
                    type="text"
                    value={editPhoneInput}
                    onChange={(e) => setEditPhoneInput(e.target.value)}
                    placeholder="Contoh: +628123456789"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    No. WhatsApp Ortu:
                  </label>
                  <input
                    type="text"
                    value={editParentPhoneInput}
                    onChange={(e) => setEditParentPhoneInput(e.target.value)}
                    placeholder="Contoh: +628129876543"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                  />
                </div>
              </div>

              {/* Asal Daerah */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Asal Daerah / Alamat:
                </label>
                <input
                  type="text"
                  value={editOriginInput}
                  onChange={(e) => setEditOriginInput(e.target.value)}
                  placeholder="Contoh: Tabanan / Denpasar"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                />
              </div>

              {/* Tanggal Masuk, Keluar & Tarif */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tgl Masuk:
                  </label>
                  <input
                    type="text"
                    value={editCheckInInput}
                    onChange={(e) => setEditCheckInInput(e.target.value)}
                    placeholder="Mis: 01 Jul 2026"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tgl Keluar:
                  </label>
                  <input
                    type="text"
                    value={editCheckOutInput}
                    onChange={(e) => setEditCheckOutInput(e.target.value)}
                    placeholder="-"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tarif / Bln (Rp):
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editRateInput}
                    onChange={(e) => setEditRateInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1500000"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold text-indigo-700 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProfileTenant(null)}
                  className="flex-1 py-2.5 px-3 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="btn-save-tenant-profile"
                  type="submit"
                  className="flex-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan & Sinkron ke Sheet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USERNAME & PASSWORD MODAL */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form
            onSubmit={handleSavePassword}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 text-slate-900"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Ubah Akun & Password Kamar {editingTenant.roomNumber}
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {editingTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'} • {editingTenant.name}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTenant(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Username Login Kamar:
                </label>
                <input
                  id="input-edit-tenant-username"
                  type="text"
                  value={editUsernameInput}
                  onChange={(e) => setEditUsernameInput(e.target.value)}
                  placeholder={`kamar${editingTenant.roomNumber}`}
                  className="w-full text-xs font-mono font-bold px-3 py-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password Login Baru:
                </label>
                <input
                  id="input-edit-tenant-password"
                  type="text"
                  value={editPasswordInput}
                  onChange={(e) => setEditPasswordInput(e.target.value)}
                  placeholder="Masukkan password baru..."
                  className="w-full text-sm font-mono font-extrabold text-indigo-900 px-3 py-2.5 rounded-lg border-2 border-indigo-300 bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                  autoFocus
                />
                <div className="flex items-center gap-1.5 flex-wrap pt-2">
                  <span className="text-[10px] font-semibold text-slate-500">Pilihan Cepat:</span>
                  <button
                    type="button"
                    onClick={() => setEditPasswordInput(`kamar${editingTenant.roomNumber}`)}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-mono font-bold cursor-pointer"
                  >
                    kamar{editingTenant.roomNumber}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPasswordInput(`acarya${editingTenant.roomNumber}`)}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-mono font-bold cursor-pointer"
                  >
                    acarya{editingTenant.roomNumber}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPasswordInput('123456')}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-mono font-bold cursor-pointer"
                  >
                    123456
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPasswordInput(generateRandomPass(editingTenant.roomNumber))}
                    className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold cursor-pointer"
                  >
                    🎲 Password Acak
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Password ini langsung aktif dan digunakan penghuni untuk login ke dasbor Kamar {editingTenant.roomNumber}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingTenant(null)}
                className="flex-1 py-2.5 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                id="btn-save-tenant-password"
                type="submit"
                className="flex-1 py-2.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Simpan Password</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: Rekap & Ekspor */}
      {activeTab === 'rekap' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Rekap Semua Transaksi ({branchFilter === 'all' ? 'Acarya Kost 1 & 2' : branchFilter === 'acarya_1' ? 'Acarya Kost 1' : 'Acarya Kost 2'})
                </h3>
                <p className="text-xs text-slate-500">
                  Data pembayaran yang tercatat di KostPay dan disinkronkan ke Google Sheet
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors self-start sm:self-auto cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh CSV / Excel</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between font-semibold text-slate-500">
                <span>TOTAL TRANSAKSI SEWA (TERVERIFIKASI):</span>
                <span className="font-bold text-slate-800 font-mono">
                  {formatRupiah(totalRevenueKost)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between font-semibold text-slate-500">
                <span>TOTAL TRANSAKSI LISTRIK (TERVERIFIKASI):</span>
                <span className="font-bold text-slate-800 font-mono">
                  {formatRupiah(totalRevenueElectricity)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between font-bold text-slate-900 text-sm">
                <span>TOTAL KESELURUHAN PENDAPATAN:</span>
                <span className="font-bold text-indigo-700 font-mono">
                  {formatRupiah(totalRevenueKost + totalRevenueElectricity)}
                </span>
              </div>
            </div>
          </div>

          {/* Daftar Nota Transaksi Resmi (Terverifikasi) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>Arsip Nota Transaksi Resmi (Sudah Terverifikasi)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Klik "Lihat & Kirim Nota" untuk mengunduh kwitansi PNG, mencetak PDF, atau mengirim nota ke WhatsApp penghuni
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filteredKostPayments
                .filter((p) => p.status === 'verified')
                .map((kp) => (
                  <div
                    key={kp.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3 flex-wrap text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                          SEWA KOST
                        </span>
                        <strong className="text-slate-900">
                          Kamar {kp.roomNumber} — {kp.tenantName}
                        </strong>
                        <span className="text-[10px] font-mono text-slate-500">({kp.id})</span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Periode: {kp.periodStart} s/d {kp.periodEnd} •{' '}
                        <strong className="text-emerald-700">{formatRupiah(kp.totalAmount)}</strong>
                      </span>
                    </div>
                    {onOpenReceipt && (
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(kp, 'kost')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Lihat & Kirim Nota</span>
                      </button>
                    )}
                  </div>
                ))}

              {filteredElectricityPayments
                .filter((p) => p.status === 'verified')
                .map((el) => (
                  <div
                    key={el.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3 flex-wrap text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold text-[10px]">
                          LISTRIK kWh
                        </span>
                        <strong className="text-slate-900">
                          Kamar {el.roomNumber} — {el.tenantName}
                        </strong>
                        <span className="text-[10px] font-mono text-slate-500">({el.id})</span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Periode: {el.periodMonth} ({el.usageKwh} kWh) •{' '}
                        <strong className="text-sky-700">{formatRupiah(el.totalAmount)}</strong>
                      </span>
                    </div>
                    {onOpenReceipt && (
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(el, 'electricity')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Lihat & Kirim Nota</span>
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Proof Preview Modal */}
      {previewProof && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-2xl p-4 space-y-3 border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Foto Bukti Transfer</h4>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
            <div className="max-h-96 overflow-auto bg-slate-100 rounded-lg p-2 flex items-center justify-center">
              <img
                src={previewProof}
                alt="Bukti Transfer"
                className="max-h-80 object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
