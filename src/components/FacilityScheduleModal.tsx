import React, { useState } from 'react';
import {
  Wrench,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Plus,
  Send,
  MessageCircle,
  Home,
  CheckSquare,
  MapPin,
  Trash2,
  Check,
  DoorOpen,
  Sparkles,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { FacilityMaintenance, RoomInspection, TenantProfile, AppSettings, KostLocation } from '../types';
import { buildWaLink } from '../utils/whatsappHelper';
import { sendToGoogleSheets } from '../utils/googleSheetsSync';

interface FacilityScheduleModalProps {
  currentTenant: TenantProfile;
  tenants: TenantProfile[];
  settings: AppSettings;
  facilities: FacilityMaintenance[];
  roomInspections: RoomInspection[];
  onClose: () => void;
  onReportFacilityIssue: (issue: any) => void;
  onCompleteFacility: (id: string) => void;
  onDeleteFacility: (id: string) => void;
  onCompleteInspection: (id: string) => void;
  onDeleteInspection: (id: string) => void;
  onSyncWithGoogleSheets?: () => Promise<{ success: boolean; message: string }>;
  onPushToGoogleSheets?: () => Promise<{ success: boolean; message: string }>;
  isSyncingSheets?: boolean;
}

export const FacilityScheduleModal: React.FC<FacilityScheduleModalProps> = ({
  currentTenant,
  tenants,
  settings,
  facilities,
  roomInspections,
  onClose,
  onReportFacilityIssue,
  onCompleteFacility,
  onDeleteFacility,
  onCompleteInspection,
  onDeleteInspection,
  onSyncWithGoogleSheets,
  onPushToGoogleSheets,
  isSyncingSheets = false,
}) => {
  const [activeTab, setActiveTab] = useState<'mingguan' | 'enam_bulan' | 'lapor'>('mingguan');
  const [branchFilter, setBranchFilter] = useState<'all' | 'acarya_1' | 'acarya_2'>('all');
  const [selectedFormBranch, setSelectedFormBranch] = useState<KostLocation>(
    currentTenant.kostLocation || 'acarya_2'
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>(currentTenant.id);
  const [scheduleType, setScheduleType] = useState<'fasilitas' | 'cek_kamar'>('fasilitas');
  const [reportCategory, setReportCategory] = useState<string>('Air & Pompa');
  const [preferredDate, setPreferredDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reportDesc, setReportDesc] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handlePullFromSheet = async () => {
    if (!onSyncWithGoogleSheets) return;
    const res = await onSyncWithGoogleSheets();
    setSyncNotice(
      res.success
        ? 'Berhasil disinkronkan dari tab Jadwal_Fasilitas & Jadwal_Cek_Kamar! Baris yang dihapus di Google Sheet otomatis terhapus di aplikasi.'
        : res.message
    );
    setTimeout(() => setSyncNotice(null), 5000);
  };

  const handlePushToSheet = async () => {
    if (!onPushToGoogleSheets) return;
    const res = await onPushToGoogleSheets();
    setSyncNotice(res.message);
    setTimeout(() => setSyncNotice(null), 5000);
  };

  // Filter rooms available in the selected branch for the form dropdown
  const branchRooms = tenants.filter(
    (t) => (t.kostLocation || 'acarya_1') === selectedFormBranch
  );

  // Currently selected tenant/room in the form
  const selectedFormTenant =
    tenants.find((t) => t.id === selectedRoomId) ||
    branchRooms[0] ||
    currentTenant;

  const filteredFacilities =
    branchFilter === 'all'
      ? facilities
      : facilities.filter((f) => (f.kostLocation || 'acarya_1') === branchFilter);

  const filteredInspections =
    branchFilter === 'all'
      ? roomInspections
      : roomInspections.filter((r) => (r.kostLocation || 'acarya_1') === branchFilter);

  const handleFormBranchChange = (branch: KostLocation) => {
    setSelectedFormBranch(branch);
    const firstRoomInBranch = tenants.find((t) => (t.kostLocation || 'acarya_1') === branch);
    if (firstRoomInBranch) {
      setSelectedRoomId(firstRoomInBranch.id);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDesc.trim()) return;

    setIsSubmitting(true);
    const newReport = {
      id: `REP-${Date.now().toString().slice(-5)}`,
      kostLocation: selectedFormTenant.kostLocation || 'acarya_1',
      scheduleType,
      category: reportCategory,
      title: reportDesc.trim(),
      roomNumber: selectedFormTenant.roomNumber,
      tenantName: selectedFormTenant.name,
      preferredDate: preferredDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toLocaleDateString('id-ID'),
      status: 'Menunggu Penanganan',
    };

    if (settings.googleWebAppUrl) {
      try {
        await sendToGoogleSheets(settings.googleWebAppUrl, {
          action: 'lapor_fasilitas',
          ...newReport,
        });
      } catch (err) {
        console.warn('Sync report error', err);
      }
    }

    onReportFacilityIssue(newReport);
    setIsSubmitting(false);
    setSubmittedSuccess(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'selesai':
      case 'layak':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{status === 'layak' ? 'Selesai Dicek (Kondisi Baik)' : 'Selesai Dikerjakan'}</span>
          </span>
        );
      case 'dalam_proses':
      case 'perlu_perbaikan':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{status === 'perlu_perbaikan' ? 'Perlu Perbaikan' : 'Dalam Proses'}</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>Terjadwal</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          id="btn-back-facilities"
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Jadwal Pemeliharaan Fasilitas & Cek Kamar
          </h2>
          <p className="text-xs text-slate-500">
            Jadwal mingguan fasilitas dan inspeksi 6 bulanan untuk Acarya Kost 1 & 2
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab('mingguan');
            setSubmittedSuccess(false);
          }}
          className={`flex-1 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'mingguan'
              ? 'bg-white text-teal-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Fasilitas (1 Minggu 1x)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('enam_bulan');
            setSubmittedSuccess(false);
          }}
          className={`flex-1 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'enam_bulan'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Cek Kamar (6 Bulan 1x)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('lapor');
            setSubmittedSuccess(false);
          }}
          className={`flex-1 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'lapor'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Permintaan / Lapor Fasilitas
        </button>
      </div>

      {/* Branch Filter Pills */}
      {activeTab !== 'lapor' && (
        <div className="space-y-3">
          {/* Google Sheets 2-Way Sync Bar (Tab: Jadwal_Fasilitas & Jadwal_Cek_Kamar) */}
          <div className="bg-teal-50/80 border border-teal-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold text-teal-950 flex-wrap">
                <FileSpreadsheet className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  Terintegrasi dengan Sheet:{' '}
                  <code className="bg-teal-100 px-1.5 py-0.5 rounded font-mono text-teal-800">
                    {activeTab === 'mingguan' ? 'Jadwal_Fasilitas' : 'Jadwal_Cek_Kamar'}
                  </code>
                </span>
              </div>
              <p className="text-[11px] text-teal-800/80">
                Saat jadwal ditandai <strong>Selesai</strong> lalu Anda klik <strong>Hapus Jadwal</strong>, data hanya dihapus dari tampilan WebApp namun <strong>tetap tersimpan di Google Sheet</strong> sebagai arsip.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePullFromSheet}
                disabled={isSyncingSheets}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Tarik perubahan & penghapusan terbaru dari Google Sheet"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>{isSyncingSheets ? 'Sinkron...' : 'Sinkron dari Sheet'}</span>
              </button>
              <button
                type="button"
                onClick={handlePushToSheet}
                disabled={isSyncingSheets}
                className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Catat seluruh jadwal fasilitas saat ini ke Google Sheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Simpan ke Sheet</span>
              </button>
            </div>
          </div>

          {syncNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{syncNotice}</span>
            </div>
          )}

          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Filter Cabang:</span>
            </span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setBranchFilter('all')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  branchFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setBranchFilter('acarya_1')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  branchFilter === 'acarya_1'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Acarya Kost 1
              </button>
              <button
                type="button"
                onClick={() => setBranchFilter('acarya_2')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  branchFilter === 'acarya_2'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Acarya Kost 2
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Pemeliharaan Fasilitas Tiap 1 Minggu Sekali */}
      {activeTab === 'mingguan' && (
        <div className="space-y-4">
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-teal-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Siklus Pemeliharaan Rutin Mingguan</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold">
              Jadwal Pemeliharaan Fasilitas Bersama & Kamar (Tiap 1 Minggu 1x)
            </h3>
            <p className="text-xs text-slate-300">
              Meliputi kuras toren, pompa air bersama, penerangan lorong, dapur bersama, dan stabilitas WiFi Acarya Kost 1 & 2.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setScheduleType('fasilitas');
                  setActiveTab('lapor');
                  setSubmittedSuccess(false);
                }}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajukan Permintaan Servis / Perbaikan Fasilitas</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredFacilities.length === 0 && (
              <div className="bg-white rounded-xl p-8 text-center border border-slate-200 space-y-2">
                <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">
                  Tidak ada daftar jadwal pemeliharaan fasilitas yang aktif
                </p>
                <p className="text-[11px] text-slate-400">
                  Klik tombol "Ajukan Permintaan Servis / Perbaikan Fasilitas" di atas untuk menambahkan jadwal baru.
                </p>
              </div>
            )}

            {filteredFacilities.map((f) => {
              const isCompleted = f.status === 'selesai';
              return (
                <div
                  key={f.id}
                  className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 border border-teal-100">
                        <Wrench className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            f.kostLocation === 'acarya_2'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}>
                            {f.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 leading-snug">
                            {f.title}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500">
                          Waktu: <span className="font-semibold text-slate-700">{f.targetDay}</span> • PIC: {f.pic}
                        </p>
                      </div>
                    </div>
                    <div>{getStatusBadge(f.status)}</div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border border-slate-100">
                    <span>
                      Terakhir: <strong className="text-slate-800">{f.lastCheckedDate}</strong>
                    </span>
                    <span>
                      Jadwal Berikutnya (+1 mgg): <strong className="text-teal-700">{f.nextDate}</strong>
                    </span>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <div className="text-[11px] text-slate-500 italic pl-1">
                      {f.notes ? `Catatan: ${f.notes}` : 'Tidak ada catatan tambahan'}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {!isCompleted ? (
                        <button
                          type="button"
                          onClick={() => onCompleteFacility(f.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="Tandai bahwa jadwal pemeliharaan fasilitas ini sudah selesai"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Tandai Selesai</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteFacility(f.id);
                            setSyncNotice(
                              'Jadwal selesai telah dihapus dari tampilan WebApp. Data selesai tetap tersimpan aman di Google Sheet (Jadwal_Fasilitas).'
                            );
                            setTimeout(() => setSyncNotice(null), 5000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Hapus jadwal dari tampilan WebApp (data selesai tetap tersimpan di Google Sheet)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Jadwal</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Pengecekan Kamar Tiap 6 Bulan Sekali */}
      {activeTab === 'enam_bulan' && (
        <div className="space-y-4">
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              <Home className="w-3.5 h-3.5" />
              <span>Inspeksi Kamar Berkala 6 Bulanan</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold">
              Jadwal Pengecekan Fisik Kamar (Tiap 6 Bulan Sekali)
            </h3>
            <p className="text-xs text-slate-300">
              Pemeriksaan dinding, kran/plumbing air, ventilasi exhaust, dan kunci handle pintu untuk Acarya Kost 1 & 2.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setScheduleType('cek_kamar');
                  setActiveTab('lapor');
                  setSubmittedSuccess(false);
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajukan Jadwal Cek / Perbaikan Kamar</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredInspections.length === 0 && (
              <div className="bg-white rounded-xl p-8 text-center border border-slate-200 space-y-2">
                <Home className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">
                  Tidak ada daftar jadwal pengecekan kamar yang aktif
                </p>
                <p className="text-[11px] text-slate-400">
                  Klik tombol "Ajukan Jadwal Cek / Perbaikan Kamar" di atas untuk menjadwalkan kamar.
                </p>
              </div>
            )}

            {filteredInspections.map((r) => {
              const isCurrentTenantRoom =
                r.roomNumber === currentTenant.roomNumber &&
                (r.kostLocation || 'acarya_1') === (currentTenant.kostLocation || 'acarya_1');
              const isCompleted = r.status === 'layak';

              return (
                <div
                  key={r.id}
                  className={`bg-white rounded-xl p-4 border transition-all space-y-2.5 shadow-sm ${
                    isCurrentTenantRoom
                      ? 'border-indigo-500 ring-2 ring-indigo-100'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        r.kostLocation === 'acarya_2'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}>
                        {r.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
                        {r.roomNumber}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          Kamar {r.roomNumber} - {r.tenantName}
                        </h4>
                        {isCurrentTenantRoom && (
                          <span className="text-[10px] text-indigo-600 font-bold">
                            (Kamar Anda Saat Ini)
                          </span>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(r.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-500 block">Inspeksi Terakhir:</span>
                      <strong className="text-slate-800">{r.lastInspectionDate}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Jadwal Cek Berikutnya:</span>
                      <strong className="text-indigo-700">{r.nextInspectionDate}</strong>
                    </div>
                  </div>

                  {/* Checklist detail */}
                  <div className="text-xs text-slate-600 space-y-1 pl-1 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span>Dinding & Cat: {r.wallCondition}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span>Kran & Saluran Air: {r.plumbingCondition}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span>Ventilasi & Jendela: {r.ventilationCondition}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span>Pintu & Kunci: {r.doorAndLockCondition}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <div className="text-[11px] text-slate-500 italic pl-1">
                      {r.notes ? `Catatan: ${r.notes}` : 'Tidak ada catatan tambahan'}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {!isCompleted ? (
                        <button
                          type="button"
                          onClick={() => onCompleteInspection(r.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="Tandai bahwa pengecekan / perbaikan kamar ini sudah selesai"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Tandai Selesai Dicek</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteInspection(r.id);
                            setSyncNotice(
                              `Jadwal cek Kamar ${r.roomNumber} yang sudah selesai telah dihapus dari tampilan WebApp. Data selesai tetap tersimpan aman di Google Sheet (Jadwal_Cek_Kamar).`
                            );
                            setTimeout(() => setSyncNotice(null), 5000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Hapus jadwal dari tampilan WebApp (data selesai tetap tersimpan di Google Sheet)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Jadwal</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Form Permintaan / Lapor Kendala Fasilitas Kamar */}
      {activeTab === 'lapor' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <span>Formulir Permintaan & Laporan Fasilitas Kamar</span>
              </h3>
              <p className="text-xs text-slate-500">
                Pilih kamar yang ingin diperbaiki atau dijadwalkan pemeriksaan fasilitasnya
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
              selectedFormTenant.kostLocation === 'acarya_2'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
            }`}>
              {selectedFormTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'} • Kmr {selectedFormTenant.roomNumber}
            </span>
          </div>

          {submittedSuccess ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-emerald-950">
                Permintaan Fasilitas Kamar {selectedFormTenant.roomNumber} ({selectedFormTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}) Berhasil Terkirim!
              </h4>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                Jadwal perbaikan/pengecekan fasilitas telah ditambahkan ke daftar jadwal dan diteruskan ke Google Sheet pengelola.
              </p>
              <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
                <a
                  href={buildWaLink(
                    settings.adminPhone,
                    `Halo Pengelola Kost, saya mengajukan perbaikan/cek fasilitas untuk ${selectedFormTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'} - Kamar ${selectedFormTenant.roomNumber} (${selectedFormTenant.name}). Kategori: ${reportCategory}. Detail: ${reportDesc}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Kirim Pesan WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedSuccess(false);
                    setReportDesc('');
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Ajukan Kamar Lain
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitReport} className="space-y-4">
              {/* Pilihan Lokasi Cabang & Kamar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lokasi Cabang Kost:
                  </label>
                  <select
                    value={selectedFormBranch}
                    onChange={(e) => handleFormBranchChange(e.target.value as KostLocation)}
                    className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:outline-hidden focus:border-teal-600 text-slate-800"
                  >
                    <option value="acarya_1">Acarya Kost 1 (11 Kamar)</option>
                    <option value="acarya_2">Acarya Kost 2 (18 Kamar)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <DoorOpen className="w-3.5 h-3.5 text-teal-600" />
                    <span>Pilih Kamar yang Ingin Diservis / Dicek:</span>
                  </label>
                  <select
                    id="select-facility-room"
                    value={selectedFormTenant.id}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:outline-hidden focus:border-teal-600 text-slate-800"
                  >
                    {branchRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Kamar {room.roomNumber} — {room.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jenis Jadwal:
                  </label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value as 'fasilitas' | 'cek_kamar')}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs bg-slate-50 text-slate-800 font-semibold"
                  >
                    <option value="fasilitas">Perbaikan Fasilitas</option>
                    <option value="cek_kamar">Inspeksi / Cek Fisik Kamar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kategori Fasilitas:
                  </label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs bg-slate-50 text-slate-800 font-semibold"
                  >
                    <option value="Air & Pompa">Kran / Air / Pompa</option>
                    <option value="Listrik & Lampu">Lampu / Saklar / Listrik</option>
                    <option value="WiFi & Internet">Koneksi WiFi / Internet</option>
                    <option value="Pintu & Kunci">Pintu / Kunci / Jendela</option>
                    <option value="Dinding & Atap">Dinding / Cat / Plafon</option>
                    <option value="Kebersihan">Kebersihan / Dapur / Sampah</option>
                    <option value="Lainnya">Fasilitas Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>Rencana Tanggal:</span>
                  </label>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs bg-slate-50 text-slate-800 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi Kerusakan / Permintaan Pengecekan:
                </label>
                <textarea
                  rows={3}
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Contoh: Kran kamar mandi menetes atau lampu kamar perlu diganti..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-xs focus:outline-hidden focus:border-teal-600 bg-white text-slate-800"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Mengirim...'
                    : `Kirim Permintaan Fasilitas (Kamar ${selectedFormTenant.roomNumber})`}
                </span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
