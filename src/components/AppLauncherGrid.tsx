import React from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  Zap,
  Wrench,
  Fan,
  CreditCard,
  MessageCircle,
  Receipt,
  ShieldCheck,
  FileSpreadsheet,
  Clock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  LogIn,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { TenantProfile, AppSettings, AuthSession, KostPaymentRecord, ElectricityRecord } from '../types';
import { formatRupiah } from '../utils/whatsappHelper';
import {
  computeTenantRentStatusInfo,
  computeTenantElectricityStatusInfo,
} from '../utils/paymentStatusCalculator';

export type ActiveScreen =
  | 'home'
  | 'sewa_kost'
  | 'listrik_kwh'
  | 'jadwal_fasilitas'
  | 'servis_ac'
  | 'metode_bayar'
  | 'pengingat_wa'
  | 'riwayat_bayar'
  | 'admin_kost'
  | 'akun_penghuni'
  | 'google_sheets';

export const ADMIN_ONLY_SCREENS: ActiveScreen[] = [
  'pengingat_wa',
  'admin_kost',
  'akun_penghuni',
  'google_sheets',
];

interface AppLauncherGridProps {
  currentTenant: TenantProfile;
  settings: AppSettings;
  onOpenScreen: (screen: ActiveScreen) => void;
  isLoggedIn: boolean;
  onRequireLogin: (targetScreen: ActiveScreen) => void;
  onLogout: () => void;
  authSession?: AuthSession | null;
  pendingRentCount?: number;
  pendingElectricityCount?: number;
  acServiceDueCount?: number;
  latestVerifiedRent?: KostPaymentRecord | null;
  latestVerifiedElectricity?: ElectricityRecord | null;
  onOpenReceipt?: (record: KostPaymentRecord | ElectricityRecord, type: 'kost' | 'electricity') => void;
}

export const AppLauncherGrid: React.FC<AppLauncherGridProps> = ({
  currentTenant,
  settings,
  onOpenScreen,
  isLoggedIn,
  onRequireLogin,
  onLogout,
  authSession,
  pendingRentCount = 1,
  pendingElectricityCount = 1,
  acServiceDueCount = 1,
  latestVerifiedRent,
  latestVerifiedElectricity,
  onOpenReceipt,
}) => {
  // Menu items crafted to match the user's reference image visual archetype
  const menuItems = [
    {
      id: 'sewa_kost' as ActiveScreen,
      title: 'Sewa Kost',
      subtitle: 'Bulanan / Tahunan / Cicilan',
      icon: Calendar,
      gradient: 'from-indigo-600 via-indigo-500 to-blue-500',
      shadowColor: 'shadow-indigo-500/25',
      dotColor: '#6366F1',
    },
    {
      id: 'listrik_kwh' as ActiveScreen,
      title: 'Listrik kWh',
      subtitle: 'Input Stand Meter kWh',
      icon: Zap,
      gradient: 'from-blue-600 via-sky-500 to-cyan-400',
      shadowColor: 'shadow-sky-500/25',
      dotColor: '#0EA5E9',
    },
    {
      id: 'jadwal_fasilitas' as ActiveScreen,
      title: 'Fasilitas',
      subtitle: 'Mingguan & Cek 6 Bln',
      icon: Wrench,
      gradient: 'from-cyan-500 via-teal-500 to-emerald-500',
      shadowColor: 'shadow-teal-500/25',
      dotColor: '#14B8A6',
    },
    {
      id: 'servis_ac' as ActiveScreen,
      title: 'Servis AC',
      subtitle: 'Tiap 6 Bulan Sekali',
      icon: Fan,
      gradient: 'from-sky-500 via-blue-500 to-indigo-500',
      shadowColor: 'shadow-blue-500/25',
      dotColor: '#38BDF8',
    },
    {
      id: 'metode_bayar' as ActiveScreen,
      title: 'Metode Bayar',
      subtitle: 'BRI, QRIS & Cash',
      icon: CreditCard,
      gradient: 'from-amber-500 via-orange-500 to-amber-600',
      shadowColor: 'shadow-amber-500/25',
      dotColor: '#F59E0B',
    },
    {
      id: 'pengingat_wa' as ActiveScreen,
      title: 'Notifikasi WA',
      subtitle: 'Kirim Pengingat Tagihan',
      icon: MessageCircle,
      gradient: 'from-emerald-500 via-green-500 to-teal-600',
      shadowColor: 'shadow-emerald-500/25',
      dotColor: '#10B981',
      requiresAdmin: true,
    },
    {
      id: 'riwayat_bayar' as ActiveScreen,
      title: 'Riwayat Bayar',
      subtitle: authSession?.role === 'tenant' ? 'Status Bayar Saya' : 'Bukti & Status',
      icon: Receipt,
      gradient: 'from-purple-600 via-violet-600 to-indigo-600',
      shadowColor: 'shadow-purple-500/25',
      dotColor: '#8B5CF6',
      requiresAdmin: false,
    },
    {
      id: 'admin_kost' as ActiveScreen,
      title: 'Admin Kost',
      subtitle: 'Cek & Verifikasi',
      icon: ShieldCheck,
      gradient: 'from-orange-500 via-amber-500 to-yellow-500',
      shadowColor: 'shadow-orange-500/25',
      dotColor: '#F97316',
      requiresAdmin: true,
    },
    {
      id: 'akun_penghuni' as ActiveScreen,
      title: 'Akun & Password',
      subtitle: 'Login Anak Kost (Ubah Pass)',
      icon: KeyRound,
      gradient: 'from-rose-500 via-pink-600 to-indigo-600',
      shadowColor: 'shadow-rose-500/25',
      dotColor: '#E11D48',
      requiresAdmin: true,
    },
    {
      id: 'google_sheets' as ActiveScreen,
      title: 'Google Sheet',
      subtitle: 'Kode Apps Script',
      icon: FileSpreadsheet,
      gradient: 'from-emerald-600 via-teal-600 to-green-600',
      shadowColor: 'shadow-green-500/25',
      dotColor: '#059669',
      requiresAdmin: true,
    },
  ];

  // Menu notifikasi dan fitur admin hanya bisa diakses dan dilihat oleh admin
  const visibleMenuItems = menuItems.filter((item) => {
    if (authSession?.role === 'tenant') {
      return !item.requiresAdmin;
    }
    return true;
  });

  const rentInfo = computeTenantRentStatusInfo(
    currentTenant,
    latestVerifiedRent ? [latestVerifiedRent] : [],
    new Date()
  );
  const elecInfo = computeTenantElectricityStatusInfo(
    currentTenant,
    latestVerifiedElectricity ? [latestVerifiedElectricity] : [],
    new Date()
  );

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Welcome & Tenant Status Hero Card */}
      <div
        className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 sm:p-7 shadow-xl shadow-indigo-950/15 border border-indigo-800/40 ring-1 ring-white/10 relative overflow-hidden"
      >
        {/* Architectural Grid */}
        <div className="absolute inset-0 bg-grid-white pointer-events-none opacity-60" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md shadow-2xs ${
                currentTenant.kostLocation === 'acarya_2'
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                  : 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40'
              }`}>
                {currentTenant.kostLocation === 'acarya_2' ? '🏢 Acarya Kost 2' : '🏢 Acarya Kost 1'}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-white border border-white/15 backdrop-blur-md">
                🚪 Kamar {currentTenant.roomNumber}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-950/80 text-indigo-200 border border-indigo-800/60">
                🗓️ Jatuh tempo tgl {currentTenant.rentDueDateDay}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white pt-0.5">
              Halo, <span className="bg-gradient-to-r from-white via-indigo-100 to-indigo-200 bg-clip-text text-transparent">{currentTenant.name}</span> 👋
            </h2>

            <p className="text-xs sm:text-sm text-indigo-200/90 max-w-xl leading-relaxed">
              Tarif sewa kamar: <span className="text-white font-extrabold px-2 py-0.5 rounded-md bg-white/10 border border-white/10">{formatRupiah(currentTenant.monthlyRentRate)}</span>/bulan • Listrik pemakaian pulsa kWh.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              id="btn-quick-rent"
              type="button"
              onClick={() => onOpenScreen('sewa_kost')}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 ring-1 ring-white/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>Bayar Sewa</span>
            </button>
            <button
              id="btn-quick-electricity"
              type="button"
              onClick={() => onOpenScreen('listrik_kwh')}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-bold border border-white/15 backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Input Listrik</span>
            </button>
            {authSession?.role === 'tenant' && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2.5 sm:py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari akun kamar"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            )}
          </div>
        </div>

        {/* Annual Installment Alert Banner */}
        {currentTenant.annualInstallment?.isActive && !currentTenant.annualInstallment.isFullyPaid && (
          <div className="relative z-10 mt-5 p-3.5 bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/20 border border-amber-400/40 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-100 backdrop-blur-md">
            <div className="flex items-start gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-amber-400/30 text-amber-200 font-extrabold text-[11px] shrink-0 mt-0.5 border border-amber-300/30">
                Cicilan Ke-{currentTenant.annualInstallment.installmentTerm}
              </span>
              <div>
                <span className="font-bold text-white block text-xs sm:text-sm">Sewa Tahunan Sistem Cicilan (Maksimal 3 Bulan Lunas)</span>
                <span className="text-[11px] text-amber-200/90 mt-0.5 block">
                  Terbayar: {formatRupiah(currentTenant.annualInstallment.paidAmount)} • Sisa Belum Lunas: <strong className="text-white">{formatRupiah(currentTenant.annualInstallment.remainingAmount)}</strong> • Batas Pelunasan: <strong className="text-amber-300">{currentTenant.annualInstallment.maxPayoffDate}</strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenScreen('sewa_kost')}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-xl text-xs shrink-0 transition-all shadow-md cursor-pointer"
            >
              Bayar Sisa Cicilan
            </button>
          </div>
        )}

        {/* Modern Glass Status Bento Cards (Sinkron Data Google Sheet & Periode Bulan/Tahun) */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mt-5 pt-5 border-t border-white/10 text-xs">
          <div className="bg-white/[0.06] hover:bg-white/[0.09] transition-colors backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2.5 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${currentTenant.activeRentStatus === 'lunas' ? 'bg-emerald-400 shadow-sm shadow-emerald-400/60' : 'bg-amber-400 animate-pulse shadow-sm shadow-amber-400/60'}`} />
                <span className="text-indigo-200/90 font-medium">Status Sewa:</span>
              </div>
              <span className={`font-bold capitalize px-2 py-0.5 rounded-md ${
                currentTenant.activeRentStatus === 'lunas'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
              }`}>
                {currentTenant.annualInstallment?.isActive && !currentTenant.annualInstallment.isFullyPaid
                  ? 'Cicilan Aktif'
                  : currentTenant.activeRentStatus.replace('_', ' ')}
              </span>
            </div>
            <p className="text-[10px] text-indigo-200/80 leading-snug">
              {rentInfo.statusDetailText}
            </p>
          </div>

          <div className="bg-white/[0.06] hover:bg-white/[0.09] transition-colors backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2.5 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${currentTenant.activeElectricityStatus === 'lunas' ? 'bg-emerald-400 shadow-sm shadow-emerald-400/60' : 'bg-sky-400 animate-pulse shadow-sm shadow-sky-400/60'}`} />
                <span className="text-indigo-200/90 font-medium">Listrik ({elecInfo.currentMonthLabel}):</span>
              </div>
              <span className={`font-bold capitalize px-2 py-0.5 rounded-md ${
                currentTenant.activeElectricityStatus === 'lunas'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
              }`}>
                {currentTenant.activeElectricityStatus.replace('_', ' ')}
              </span>
            </div>
            <p className="text-[10px] text-indigo-200/80 leading-snug">
              {elecInfo.statusDetailText}
            </p>
          </div>

          <div className="bg-white/[0.06] hover:bg-white/[0.09] transition-colors border border-white/10 rounded-xl px-3.5 py-2.5 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-indigo-200/90 font-medium">Database Sheet:</span>
              </div>
              <span className="font-bold text-emerald-300 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/20">
                {settings.googleWebAppUrl ? '● Sinkron Aktif' : 'Siap Hubung'}
              </span>
            </div>
            <p className="text-[10px] text-indigo-200/80 leading-snug">
              Status sewa & listrik mengikuti data Google Sheet tiap periode
            </p>
          </div>
        </div>

        {/* Automatic Verified Receipt Banner on Home Card */}
        {(latestVerifiedRent || latestVerifiedElectricity) && onOpenReceipt && (
          <div className="relative z-10 mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-emerald-200">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4 text-emerald-300" />
              </div>
              <div>
                <strong className="text-white block">
                  Nota Transaksi Resmi Tersedia (Kamar {currentTenant.roomNumber})
                </strong>
                <span className="text-[11px] text-emerald-200/80">
                  Pembayaran terverifikasi otomatis memiliki kwitansi digital resmi yang siap diunduh
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {latestVerifiedRent && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(latestVerifiedRent, 'kost')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Nota Sewa ({formatRupiah(latestVerifiedRent.totalAmount)})</span>
                </button>
              )}
              {latestVerifiedElectricity && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(latestVerifiedElectricity, 'electricity')}
                  className="px-3 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Nota Listrik ({formatRupiah(latestVerifiedElectricity.totalAmount)})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Admin Access / Tenant Private Banner */}
      {isLoggedIn ? (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm font-extrabold text-emerald-950">
                  Mode Pengelola Kost (Admin)
                </p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/80">
                  Akses Penuh
                </span>
              </div>
              <p className="text-[11px] text-emerald-800/90 mt-0.5">
                Semua menu khusus (Pengingat WA, Riwayat Bayar, Admin Kost, dan Google Sheet) dapat diakses penuh.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-open-admin-panel"
              type="button"
              onClick={() => onOpenScreen('admin_kost')}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              Buka Panel Admin
            </button>
            <button
              id="btn-open-tenant-accounts"
              type="button"
              onClick={() => onOpenScreen('akun_penghuni')}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Akun & Password Anak Kost</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
            >
              Keluar
            </button>
          </div>
        </div>
      ) : authSession?.role === 'tenant' ? (
        <div className="bg-gradient-to-r from-indigo-50/90 via-white to-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 shadow-md shadow-indigo-950/15">
              <Lock className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-extrabold text-indigo-950">
                Dasbor Privat: Kamar {currentTenant.roomNumber} ({currentTenant.name})
              </p>
              <p className="text-[11px] text-indigo-800/80 mt-0.5">
                Data tarif sewa, stand meter listrik, dan riwayat pembayaran Anda bersifat privat dan terlindungi dari kamar lain.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold transition-colors cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
          >
            Keluar Akun
          </button>
        </div>
      ) : (
        <div className="bg-white/90 backdrop-blur-sm border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 shadow-sm">
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-extrabold text-slate-900">
                Akses Terbatas: Pengingat WA, Admin Kost & Google Sheet
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Hanya dapat diakses setelah login dengan akun pengelola kost yang berwenang.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequireLogin('admin_kost')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-500/20 cursor-pointer shrink-0"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Login Pengelola</span>
          </button>
        </div>
      )}

      {/* Grid Menu Title & Info */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pt-1">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/60 text-indigo-700 text-[10px] font-extrabold uppercase tracking-wider mb-1.5">
            <span>✨ Layanan Digital Acarya</span>
          </div>
          <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
            Menu Layanan & Pembayaran
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih layanan untuk bayar sewa, catat meter listrik kWh, cek fasilitas, atau servis AC
          </p>
        </div>
      </div>

      {/* The Mobile Launcher Grid styled with Modern Bento Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
        {visibleMenuItems.map((item) => {
          const IconComponent = item.icon;
          const isLocked = item.requiresAdmin && !isLoggedIn;

          return (
            <div
              key={item.id}
              onClick={() => {
                if (isLocked) {
                  onRequireLogin(item.id);
                } else {
                  onOpenScreen(item.id);
                }
              }}
              className={`bg-white rounded-2xl shadow-xs border p-4 sm:p-5 flex flex-col items-center justify-center relative cursor-pointer group transition-transform duration-150 hover:-translate-y-1 active:scale-97 select-none overflow-hidden ${
                isLocked
                  ? 'border-slate-200/90 hover:border-amber-300 hover:shadow-md'
                  : 'border-slate-200/80 hover:border-indigo-300 hover:shadow-md'
              }`}
              id={`menu-card-${item.id}`}
            >
              {/* Icon Container with 3D Squircle Polish */}
              <div
                className={`w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white shadow-lg ${item.shadowColor} ring-4 ring-slate-50 group-hover:ring-indigo-50/80 mb-3.5 group-hover:scale-105 transition-transform duration-150 relative`}
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/10 to-white/20 pointer-events-none" />
                <IconComponent className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-xs relative z-10" />
                {isLocked && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-white text-amber-400 flex items-center justify-center shadow-xs z-20">
                    <Lock className="w-2.5 h-2.5" />
                  </div>
                )}
              </div>

              {/* Text Label Below Card */}
              <div className="text-center w-full px-1 relative z-10">
                <span className="block text-sm sm:text-[15px] font-extrabold text-slate-900 tracking-tight line-clamp-1 group-hover:text-indigo-600 transition-colors">
                  {item.title}
                </span>
                <span className="block text-[11px] font-medium text-slate-500 line-clamp-1 mt-0.5">
                  {isLocked ? 'Khusus pengelola kost' : item.subtitle}
                </span>
              </div>

              {/* Bottom Interactive Accent Bar */}
              <div
                className="w-6 group-hover:w-12 h-1 rounded-full mt-3 opacity-30 group-hover:opacity-100 transition-all duration-200"
                style={{ backgroundColor: item.dotColor }}
              />
            </div>
          );
        })}
      </div>

      {/* Quick Tips & Reminder Bar */}
      <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-2xs">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="text-xs text-amber-950 leading-relaxed">
          <p className="font-extrabold text-amber-900 mb-0.5">Informasi Pembayaran & Verifikasi Otomatis:</p>
          <p className="text-amber-800/90">
            Semua pembayaran via <strong>Transfer Bank BRI</strong> maupun <strong>QRIS (Scan QR Code)</strong> wajib menyertakan foto/screenshot bukti pembayaran. Untuk pembayaran <strong>Cash (Tunai)</strong> tidak memerlukan bukti dan langsung dikonfirmasi ke pengelola kost.
          </p>
        </div>
      </div>
    </div>
  );
};
