import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  ShieldCheck,
  User,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  X,
  Search,
  Copy,
  Check,
  MapPin,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { TenantProfile, KostLocation, AuthSession } from '../types';
import { formatRupiah } from '../utils/whatsappHelper';

interface LoginPageProps {
  tenants: TenantProfile[];
  onLoginSuccess: (session: AuthSession, tenant?: TenantProfile) => void;
  selectedLocation: KostLocation | 'all';
}

export const LoginPage: React.FC<LoginPageProps> = ({
  tenants,
  onLoginSuccess,
  selectedLocation: initialLocation,
}) => {
  const [authTab, setAuthTab] = useState<'tenant' | 'admin'>('tenant');

  // Tenant login form state
  const [selectedBranch, setSelectedBranch] = useState<KostLocation>(
    initialLocation === 'acarya_1' ? 'acarya_1' : 'acarya_2'
  );
  const [tenantIdentifier, setTenantIdentifier] = useState('');
  const [tenantPassword, setTenantPassword] = useState('');
  const [showTenantPassword, setShowTenantPassword] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  // Admin login form state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Success state
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Help modal for owner to see accounts list (Protected by Admin Password)
  const [isAccountListOpen, setIsAccountListOpen] = useState(false);
  const [isAdminVerifyModalOpen, setIsAdminVerifyModalOpen] = useState(false);
  const [adminVerifyPassword, setAdminVerifyPassword] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [adminVerifyError, setAdminVerifyError] = useState<string | null>(null);
  const [searchAccountQuery, setSearchAccountQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter tenants for the help modal
  const helpFilteredTenants = tenants.filter((t) => {
    if (!searchAccountQuery) return true;
    const q = searchAccountQuery.toLowerCase();
    return (
      t.roomNumber.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.username && t.username.toLowerCase().includes(q)) ||
      (t.kostLocation && t.kostLocation.toLowerCase().includes(q))
    );
  });

  const handleCopyCredentials = (t: TenantProfile) => {
    const branchName = t.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
    const text = `*AKUN LOGIN KOSTPAY - ${branchName.toUpperCase()}*\n\nHalo ${t.name},\nBerikut akses login untuk dasbor tagihan sewa & listrik kamar Anda:\n\n🏢 Cabang: ${branchName}\n🚪 Kamar: ${t.roomNumber}\n👤 Username: ${t.username || `kamar${t.roomNumber}`}\n🔑 Password: ${t.password || '-'}\n\nSilakan simpan data ini dan jangan dibagikan ke orang lain ya. Terima kasih!`;
    navigator.clipboard.writeText(text);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAccountListRequest = () => {
    if (adminPassword.trim() === 'bosacarya1') {
      setIsAccountListOpen(true);
    } else {
      setAdminVerifyPassword('');
      setAdminVerifyError(null);
      setIsAdminVerifyModalOpen(true);
    }
  };

  const handleVerifyAdminForAccountList = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminVerifyPassword.trim() === 'bosacarya1') {
      setIsAdminVerifyModalOpen(false);
      setAdminVerifyPassword('');
      setAdminVerifyError(null);
      setIsAccountListOpen(true);
    } else {
      setAdminVerifyError('Password Admin salah! Hanya pengelola kost yang dapat mengakses daftar ini.');
    }
  };

  // Handler for tenant login
  const handleTenantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);

    const inputUser = tenantIdentifier.trim().toLowerCase();
    const inputPass = tenantPassword.trim();

    if (!inputUser || !inputPass) {
      setTenantError('Silakan masukkan Nomor Kamar / Username dan Password.');
      return;
    }

    // Extract digits or clean string
    // e.g. "kamar 02", "kamar02", "02", "2"
    const cleanedDigits = inputUser.replace(/\D/g, '');
    const paddedRoom = cleanedDigits ? cleanedDigits.padStart(2, '0') : '';

    // Search for matching tenant in the selected branch
    const matchedTenant = tenants.find((t) => {
      if (t.kostLocation !== selectedBranch) return false;

      const roomMatch =
        t.roomNumber.toLowerCase() === inputUser ||
        (paddedRoom && t.roomNumber === paddedRoom) ||
        (t.username && t.username.toLowerCase() === inputUser);

      return roomMatch;
    });

    if (!matchedTenant) {
      setTenantError(
        `Kamar/Username "${tenantIdentifier}" tidak ditemukan di ${
          selectedBranch === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'
        }. Periksa kembali nomor kamar Anda.`
      );
      return;
    }

    // Verify password
    const validPassword = matchedTenant.password;

    if (inputPass !== validPassword) {
      setTenantError(
        `Password salah untuk Kamar ${matchedTenant.roomNumber}. Silakan periksa kembali atau tanyakan ke pengelola kost.`
      );
      return;
    }

    // Success!
    setIsSuccess(true);
    setSuccessMessage(`Selamat datang, ${matchedTenant.name} (Kamar ${matchedTenant.roomNumber})!`);

    setTimeout(() => {
      onLoginSuccess(
        {
          role: 'tenant',
          tenantId: matchedTenant.id,
          username: matchedTenant.username || `kamar${matchedTenant.roomNumber}`,
          name: matchedTenant.name,
          roomNumber: matchedTenant.roomNumber,
          kostLocation: matchedTenant.kostLocation,
        },
        matchedTenant
      );
    }, 600);
  };

  // Handler for admin login
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);

    const u = adminUsername.trim();
    const p = adminPassword.trim();

    if (!u || !p) {
      setAdminError('Silakan masukkan username dan password admin.');
      return;
    }

    if (u === 'bosacarya' && p === 'bosacarya1') {
      setIsSuccess(true);
      setSuccessMessage('Login Pengelola Kost Berhasil!');
      setTimeout(() => {
        onLoginSuccess({
          role: 'admin',
          username: 'bosacarya',
          name: 'BOS ACARYA (Pengelola)',
        });
      }, 600);
    } else {
      setAdminError('Username atau password admin salah. Kredensial tidak valid.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background visual ambience */}
      <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-indigo-600/20 rounded-full blur-3xl pointer-events-none animate-float-slow" />
      <div className="absolute -bottom-24 -right-24 w-[28rem] h-[28rem] bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-64 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.22),rgba(255,255,255,0))]" />

      <div className="w-full max-w-md relative z-10 space-y-5">
        {/* Brand & App Title */}
        <div className="text-center space-y-2">
          <div className="relative inline-flex items-center justify-center mb-1">
            <div className="absolute -inset-1.5 bg-gradient-to-tr from-indigo-500 via-violet-500 to-emerald-400 rounded-2xl blur-md opacity-60" />
            <div className="relative inline-flex items-center justify-center w-15 h-15 rounded-2xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-2xl border border-white/20">
              <Building2 className="w-7 h-7 text-indigo-300" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Acarya<span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">Kost</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300/90 font-medium">
            Portal Pembayaran Sewa & Listrik kWh Mandiri
          </p>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/[0.06] backdrop-blur-md border border-white/15 text-[11px] text-slate-200 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold">Dasbor Privat Tiap Kamar</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-indigo-950/50 border border-white/20 text-slate-900 overflow-hidden ring-1 ring-slate-200/80">
          {/* Navigation Role Tabs */}
          <div className="grid grid-cols-2 p-1.5 bg-slate-100/90 border-b border-slate-200/80 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAuthTab('tenant');
                setTenantError(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                authTab === 'tenant'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4 text-indigo-600" />
              <span>Penghuni Kamar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('admin');
                setAdminError(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                authTab === 'admin'
                  ? 'bg-white text-amber-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Pengelola (Admin)</span>
            </button>
          </div>

          {/* Card Body */}
          <div className="p-5 sm:p-6 space-y-4">
            {/* Global Success State */}
            {isSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 animate-fadeIn">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold">{successMessage}</span>
              </div>
            )}

            {/* TAB 1: TENANT LOGIN */}
            {authTab === 'tenant' && !isSuccess && (
              <form onSubmit={handleTenantSubmit} className="space-y-4">
                {/* Information Callout */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Tarif sewa dan tagihan tiap kamar berbeda dan dijaga kerahasiaannya. Masuk dengan akun kamar Anda untuk melihat rincian tagihan Anda.
                  </p>
                </div>

                {tenantError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{tenantError}</span>
                  </div>
                )}

                {/* Branch Selection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Pilih Cabang Kost</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranch('acarya_1');
                        setTenantError(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-left flex items-center gap-2 cursor-pointer ${
                        selectedBranch === 'acarya_1'
                          ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 shadow-2xs ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <div>
                        <div className="font-bold">Acarya Kost 1</div>
                        <div className="text-[10px] text-slate-500 font-normal">11 Kamar (01-11)</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranch('acarya_2');
                        setTenantError(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-left flex items-center gap-2 cursor-pointer ${
                        selectedBranch === 'acarya_2'
                          ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 shadow-2xs ring-1 ring-emerald-600'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <div>
                        <div className="font-bold">Acarya Kost 2</div>
                        <div className="text-[10px] text-slate-500 font-normal">18 Kamar (01-18)</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Username / Room Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Nomor Kamar atau Username
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="input-tenant-user"
                      type="text"
                      value={tenantIdentifier}
                      onChange={(e) => setTenantIdentifier(e.target.value)}
                      placeholder="Masukkan username anda"
                      className="w-full text-xs font-medium pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all text-slate-900"
                      autoComplete="username"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Bisa ketik angka kamar (misal: <strong>02</strong>) atau format username (<strong>kamar02</strong>)
                  </p>
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Password Kamar
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="input-tenant-password"
                      type={showTenantPassword ? 'text' : 'password'}
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                      placeholder="Masukkan password anda"
                      className="w-full text-xs font-medium pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all text-slate-900"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTenantPassword(!showTenantPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showTenantPassword ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showTenantPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Password kamar bersifat rahasia & diberikan secara khusus oleh pengelola kost.
                  </p>
                </div>

                {/* Submit Tenant Button */}
                <button
                  id="btn-login-tenant"
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-98"
                >
                  <Lock className="w-4 h-4" />
                  <span>Masuk ke Dasbor Kamar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* TAB 2: ADMIN LOGIN */}
            {authTab === 'admin' && !isSuccess && (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Akses khusus Pengelola / Pemilik Kost untuk memeriksa semua kamar, verifikasi struk transfer, mengelola akun kamar, dan Google Sheets.
                  </p>
                </div>

                {adminError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{adminError}</span>
                  </div>
                )}

                {/* Admin Username Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Username Pengelola
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="input-admin-user"
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="Masukkan username anda"
                      className="w-full text-xs font-medium pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all text-slate-900"
                      autoComplete="username"
                    />
                  </div>
                </div>

                {/* Admin Password Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Password Pengelola
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="input-admin-password"
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Masukkan password anda"
                      className="w-full text-xs font-medium pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all text-slate-900"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showAdminPassword ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Admin Button */}
                <button
                  id="btn-login-admin"
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Masuk Panel Pengelola (Admin)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* Footer Trigger: Tenant Help vs Admin Account List */}
          {authTab === 'admin' ? (
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Akses Pengelola:</span>
              <button
                type="button"
                onClick={handleOpenAccountListRequest}
                className="text-amber-700 hover:text-amber-900 font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Daftar Akun & Password Kamar</span>
              </button>
            </div>
          ) : (
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Lupa password kamar?</span>
              <a
                href="https://wa.me/6281353746248?text=Halo%20Pengelola%20Acarya%20Kost,%20saya%20ingin%20menanyakan%20password%20login%20kamar%20saya"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Hubungi Pengelola Kost</span>
              </a>
            </div>
          )}
        </div>

        {/* Info footer */}
        <p className="text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} Acarya Kost • Sistem Pembayaran & Manajemen Kamar
        </p>
      </div>

      {/* MODAL VERIFIKASI ADMIN SEBELUM MEMBUKA DAFTAR PASSWORD KAMAR */}
      <AnimatePresence>
        {isAdminVerifyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 text-slate-900 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Verifikasi Akses Admin
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Hanya dapat diakses oleh pengelola kost
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdminVerifyModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {adminVerifyError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{adminVerifyError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyAdminForAccountList} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Masukkan Password Admin
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showVerifyPassword ? 'text' : 'password'}
                      value={adminVerifyPassword}
                      onChange={(e) => setAdminVerifyPassword(e.target.value)}
                      placeholder="Masukkan password admin"
                      className="w-full text-xs font-medium pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-all text-slate-900"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showVerifyPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAdminVerifyModalOpen(false)}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Buka Daftar Akun</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: DAFTAR AKUN & PASSWORD KAMAR (KHUSUS PEMILIK KOST / ADMIN) */}
      <AnimatePresence>
        {isAccountListOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col text-slate-900 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-900 text-white flex items-center justify-center shadow-xs">
                    <KeyRound className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Daftar Akun & Password Kamar (Khusus Admin)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Gunakan daftar ini untuk memberikan username & password acak kepada masing-masing penghuni
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAccountListOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Box */}
              <div className="p-4 border-b border-slate-100 bg-white">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari nomor kamar, nama penghuni, atau username..."
                    value={searchAccountQuery}
                    onChange={(e) => setSearchAccountQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Accounts Scrollable List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {helpFilteredTenants.map((t) => {
                  const defaultUser = t.username || `kamar${t.roomNumber}`;
                  const defaultPass = t.password || '-';
                  const isCopied = copiedId === t.id;

                  return (
                    <div
                      key={t.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-indigo-300 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              t.kostLocation === 'acarya_2'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            }`}
                          >
                            {t.kostLocation === 'acarya_2' ? 'Acarya 2' : 'Acarya 1'}
                          </span>
                          <span className="font-extrabold text-sm text-slate-900">
                            Kamar {t.roomNumber}
                          </span>
                          <span className="font-semibold text-slate-600">
                            • {t.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                          <span>
                            User: <strong className="text-slate-800">{defaultUser}</strong>
                          </span>
                          <span>
                            Pass: <strong className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded-sm">{defaultPass}</strong>
                          </span>
                          <span className="text-slate-400 font-sans">
                            Tarif: {formatRupiah(t.monthlyRentRate)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyCredentials(t)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                            isCopied
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                          title="Salin format pesan WhatsApp untuk dikirimkan ke penghuni"
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
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Total: {helpFilteredTenants.length} akun kamar
                </span>
                <button
                  type="button"
                  onClick={() => setIsAccountListOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
