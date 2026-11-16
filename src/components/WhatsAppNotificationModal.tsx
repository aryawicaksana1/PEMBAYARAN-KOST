import React, { useState } from 'react';
import {
  MessageCircle,
  BellRing,
  ArrowLeft,
  Send,
  Calendar,
  Zap,
  CheckCircle2,
  Clock,
  User,
  ExternalLink,
  Copy,
  Sparkles,
  MapPin,
  AlertCircle,
  Search,
} from 'lucide-react';
import { TenantProfile, AppSettings, KostLocation } from '../types';
import {
  formatRupiah,
  buildWaLink,
  generateRentReminderMessage,
  generateElectricityReminderMessage,
  generateInstallmentReminderMessage,
} from '../utils/whatsappHelper';

interface WhatsAppNotificationModalProps {
  tenants: TenantProfile[];
  settings: AppSettings;
  onClose: () => void;
}

export const WhatsAppNotificationModal: React.FC<WhatsAppNotificationModalProps> = ({
  tenants,
  settings,
  onClose,
}) => {
  const [reminderType, setReminderType] = useState<'sewa' | 'listrik'>('sewa');
  const [branchFilter, setBranchFilter] = useState<'all' | 'acarya_1' | 'acarya_2'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.id || '');
  const [copiedText, setCopiedText] = useState(false);
  const [toastWarning, setToastWarning] = useState<string | null>(null);

  const filteredTenants = tenants
    .filter((t) => branchFilter === 'all' || (t.kostLocation || 'acarya_1') === branchFilter)
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        t.roomNumber.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
      );
    });

  const selectedTenant =
    filteredTenants.find((t) => t.id === selectedTenantId) ||
    filteredTenants[0] ||
    tenants[0];

  const getMessageForTenant = (t: TenantProfile) => {
    if (reminderType === 'sewa') {
      if (t.annualInstallment?.isActive && !t.annualInstallment.isFullyPaid) {
        return generateInstallmentReminderMessage(t, settings, t.annualInstallment);
      }
      return generateRentReminderMessage(t, settings);
    }
    return generateElectricityReminderMessage(t, settings);
  };

  const generatedMessage = selectedTenant ? getMessageForTenant(selectedTenant) : '';

  const waLink = selectedTenant && selectedTenant.phone ? buildWaLink(selectedTenant.phone, generatedMessage) : '#';

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <button
          id="btn-back-wa"
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-tight truncate">
            Notifikasi WhatsApp Otomatis
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 truncate">
            Kirim pengingat sewa & tagihan listrik Acarya Kost 1 & 2
          </p>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {/* Toggle Reminder Category */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setReminderType('sewa')}
            className={`py-2 sm:py-2.5 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              reminderType === 'sewa'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
            <span className="truncate">Pengingat Sewa</span>
          </button>
          <button
            type="button"
            onClick={() => setReminderType('listrik')}
            className={`py-2 sm:py-2.5 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              reminderType === 'listrik'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
            <span className="truncate">Pengingat Listrik</span>
          </button>
        </div>

        {/* Branch Filter Tabs & Quick Search */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Filter Cabang Kost:</span>
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {filteredTenants.length} Kamar
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold text-center">
            <button
              type="button"
              onClick={() => setBranchFilter('all')}
              className={`py-1.5 px-1 rounded-md transition-all cursor-pointer truncate text-[11px] sm:text-xs ${
                branchFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({tenants.length})
            </button>
            <button
              type="button"
              onClick={() => setBranchFilter('acarya_1')}
              className={`py-1.5 px-1 rounded-md transition-all cursor-pointer truncate text-[11px] sm:text-xs ${
                branchFilter === 'acarya_1'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Acarya 1
            </button>
            <button
              type="button"
              onClick={() => setBranchFilter('acarya_2')}
              className={`py-1.5 px-1 rounded-md transition-all cursor-pointer truncate text-[11px] sm:text-xs ${
                branchFilter === 'acarya_2'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Acarya 2
            </button>
          </div>

          {/* Quick Search for Mobile */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nomor kamar (misal: 02, 101)..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Toast Warning for missing phone */}
        {toastWarning && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-xs text-amber-900 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">{toastWarning}</span>
          </div>
        )}

        {/* Tenant Selection Bar - Direct WhatsApp Link on Card Click */}
        <div className="bg-white rounded-xl p-3 sm:p-5 border border-slate-200 shadow-sm space-y-2.5 sm:space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <label className="block text-xs font-bold text-slate-800">
              Pilih Card Kamar untuk Terhubung ke WhatsApp:
            </label>
            <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Sentuh card ➔ Buka Chat WA</span>
            </span>
          </div>

          {filteredTenants.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Tidak ada kamar yang sesuai dengan filter atau pencarian.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5">
              {filteredTenants.map((t) => {
                const isSelected = t.id === selectedTenant?.id;
                const status = reminderType === 'sewa' ? t.activeRentStatus : t.activeElectricityStatus;
                const hasPhone = !!(t.phone && t.phone.trim() && t.phone !== '-');
                const targetMsg = getMessageForTenant(t);
                const cardWaLink = hasPhone ? buildWaLink(t.phone, targetMsg) : '#';

                return (
                  <a
                    key={t.id}
                    href={cardWaLink}
                    target={hasPhone ? '_blank' : undefined}
                    rel={hasPhone ? 'noopener noreferrer' : undefined}
                    onClick={(e) => {
                      setSelectedTenantId(t.id);
                      if (!hasPhone) {
                        e.preventDefault();
                        setToastWarning(`Nomor WhatsApp untuk Kamar ${t.roomNumber} (${t.name}) belum diisi di profil penghuni.`);
                        setTimeout(() => setToastWarning(null), 3500);
                      }
                    }}
                    className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all flex flex-col justify-between group cursor-pointer relative ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-emerald-500 hover:shadow-md'
                    }`}
                    title={hasPhone ? `Klik untuk membuka WhatsApp Kamar ${t.roomNumber} (${t.name})` : `No. WhatsApp belum diisi`}
                  >
                    <div>
                      {/* Top Row: Room Number, K1/K2 Badge, & Status Dot */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors">
                          Kmr {t.roomNumber}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            t.kostLocation === 'acarya_2' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {t.kostLocation === 'acarya_2' ? 'K2' : 'K1'}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              status === 'lunas'
                                ? 'bg-emerald-500'
                                : status === 'jatuh_tempo'
                                ? 'bg-red-500'
                                : 'bg-amber-500'
                            }`}
                            title={`Status: ${status}`}
                          />
                        </div>
                      </div>

                      {/* Tenant Name */}
                      <div className="text-[11px] font-semibold text-slate-700 truncate leading-tight">
                        {t.name}
                      </div>

                      {/* Rate / Amount */}
                      <div className="text-[10px] text-slate-500 mt-1 font-medium truncate">
                        {reminderType === 'sewa' ? formatRupiah(t.monthlyRentRate) : 'Listrik kWh'}
                      </div>
                    </div>

                    {/* Dedicated Button Row at Bottom (Clean and never squished on mobile) */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                      <div className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 group-hover:bg-emerald-700 text-white font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1 shadow-2xs transition-colors">
                        <MessageCircle className="w-3 h-3 shrink-0" />
                        <span>Kirim WA ↗</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Message Preview Box */}
        <div className="bg-white rounded-xl p-3.5 sm:p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  Format Pesan WhatsApp Siap Kirim
                </h4>
                <p className="text-[10px] text-slate-500 truncate">
                  Untuk {selectedTenant?.name} (Kamar {selectedTenant?.roomNumber} • {selectedTenant?.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyMessage}
              className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-slate-600" />
              <span>{copiedText ? 'Tersalin!' : 'Salin Pesan'}</span>
            </button>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap break-words leading-relaxed max-h-56 overflow-y-auto">
            {generatedMessage}
          </div>

          <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <a
              id="btn-send-wa-direct"
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 transition-all cursor-pointer text-center"
            >
              <Send className="w-4 h-4 shrink-0" />
              <span>Buka WhatsApp & Kirim</span>
            </a>

            {selectedTenant?.parentPhone && selectedTenant.parentPhone !== '-' && (
              <a
                href={buildWaLink(selectedTenant.parentPhone, generatedMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto py-3 px-4 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                title="Kirim pemberitahuan ini ke nomor WhatsApp orang tua"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>Kirim ke WA Ortu</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
