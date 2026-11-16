import React from 'react';
import { Menu, Building2, LogIn, LogOut, DoorClosed } from 'lucide-react';
import { TenantProfile, AppSettings, KostLocation, AuthSession } from '../types';

interface AppHeaderProps {
  currentTenant: TenantProfile;
  tenants: TenantProfile[];
  onSelectTenant: (tenant: TenantProfile) => void;
  isAdminMode?: boolean;
  onToggleAdminMode?: (isAdmin: boolean) => void;
  isLoggedIn: boolean;
  onOpenLogin: () => void;
  onLogout: () => void;
  settings: AppSettings;
  onOpenWhatsAppReminders?: () => void;
  onOpenGoogleSheets?: () => void;
  onOpenMobileMenu?: () => void;
  selectedLocation?: KostLocation | 'all';
  onSelectLocation?: (loc: KostLocation | 'all') => void;
  authSession?: AuthSession | null;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentTenant,
  tenants,
  onSelectTenant,
  isAdminMode,
  onToggleAdminMode,
  isLoggedIn,
  onOpenLogin,
  onLogout,
  settings,
  onOpenWhatsAppReminders,
  onOpenGoogleSheets,
  onOpenMobileMenu,
  selectedLocation,
  onSelectLocation,
  authSession,
}) => {
  // Filter tenants by selectedLocation if not 'all'
  const visibleTenants =
    selectedLocation === 'all'
      ? tenants
      : tenants.filter((t) => t.kostLocation === selectedLocation);

  return (
    <header className="bg-white/85 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-30 shadow-xs transition-all">
      {/* Subtle Top Gradient Accent */}
      <div className="h-1 w-full bg-gradient-to-r from-indigo-600 via-violet-500 to-emerald-500" />
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Top row: Brand & Mobile Menu */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {onOpenMobileMenu && (
                <button
                  type="button"
                  onClick={onOpenMobileMenu}
                  className="p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl md:hidden cursor-pointer transition-colors"
                  title="Buka Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              <div className="flex items-center gap-3">
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-tr from-indigo-600 to-emerald-500 rounded-xl blur-xs opacity-50 group-hover:opacity-80 transition duration-300" />
                  <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center text-white shadow-md ring-1 ring-white/20">
                    <Building2 className="w-5 h-5 text-indigo-300" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-2xs" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
                      Acarya<span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Kost</span>
                    </h1>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold border shadow-2xs ${
                      isLoggedIn
                        ? 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 border-amber-200/80'
                        : 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 border-indigo-200/80'
                    }`}>
                      {isLoggedIn ? '✨ Admin Kost' : `🚪 Kmr ${currentTenant.roomNumber}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium hidden sm:flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${currentTenant.kostLocation === 'acarya_2' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                    <span>{currentTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2 • Lokasi 2' : 'Acarya Kost 1 • Lokasi 1'}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop & Mobile Responsive Controls */}
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-2.5 w-full md:w-auto">
            {/* Tenant Controls vs Admin Controls */}
            {authSession?.role === 'tenant' ? (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-50/90 to-slate-50 border border-indigo-200/80 text-xs text-indigo-950 font-bold max-w-[190px] xs:max-w-[240px] truncate shadow-2xs">
                  <DoorClosed className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate">Kamar {currentTenant.roomNumber}</span>
                </div>
                <button
                  id="btn-logout-tenant"
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 transition-all cursor-pointer shrink-0 shadow-2xs"
                  title="Keluar dari dasbor kamar"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </div>
            ) : isLoggedIn ? (
              <>
                {/* Admin Room Switcher: Gunakan No Kamar saja, tanpa nama */}
                <div className="flex-1 md:flex-none min-w-0 max-w-[210px] xs:max-w-[250px] sm:max-w-xs flex items-center bg-slate-50/90 hover:bg-white transition-all rounded-xl px-3 py-1.5 border border-slate-200/90 hover:border-indigo-300 text-xs shadow-2xs">
                  <DoorClosed className="w-3.5 h-3.5 text-indigo-600 mr-2 shrink-0" />
                  <select
                    value={currentTenant.id}
                    onChange={(e) => {
                      const found = tenants.find((t) => t.id === e.target.value);
                      if (found) onSelectTenant(found);
                    }}
                    className="font-bold text-slate-800 bg-transparent outline-hidden cursor-pointer text-xs w-full truncate"
                    title="Pilih Nomor Kamar"
                  >
                    {visibleTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.kostLocation === 'acarya_2' ? 'Kost 2' : 'Kost 1'}] Kamar {t.roomNumber}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Logout Button */}
                <button
                  id="btn-logout"
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 transition-all cursor-pointer shrink-0 shadow-2xs"
                  title="Keluar dari mode admin"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </>
            ) : (
              <button
                id="btn-login-trigger"
                type="button"
                onClick={onOpenLogin}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white transition-all shadow-md shadow-indigo-500/20 cursor-pointer shrink-0"
                title="Login ke KostPay"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
