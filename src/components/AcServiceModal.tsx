import React, { useState } from 'react';
import {
  Fan,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Send,
  MessageCircle,
  Sparkles,
  MapPin,
  Trash2,
  Check,
  DoorOpen,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { AcServiceRecord, TenantProfile, AppSettings, KostLocation } from '../types';
import { buildWaLink } from '../utils/whatsappHelper';
import { sendToGoogleSheets } from '../utils/googleSheetsSync';

interface AcServiceModalProps {
  currentTenant: TenantProfile;
  tenants: TenantProfile[];
  settings: AppSettings;
  acServices: AcServiceRecord[];
  onClose: () => void;
  onRequestAcService: (record: any) => void;
  onCompleteAcService: (id: string) => void;
  onDeleteAcService: (id: string) => void;
  onSyncWithGoogleSheets?: () => Promise<{ success: boolean; message: string }>;
  onPushToGoogleSheets?: () => Promise<{ success: boolean; message: string }>;
  isSyncingSheets?: boolean;
}

export const AcServiceModal: React.FC<AcServiceModalProps> = ({
  currentTenant,
  tenants,
  settings,
  acServices,
  onClose,
  onRequestAcService,
  onCompleteAcService,
  onDeleteAcService,
  onSyncWithGoogleSheets,
  onPushToGoogleSheets,
  isSyncingSheets = false,
}) => {
  const [showRequestForm, setShowRequestForm] = useState<boolean>(false);
  const [branchFilter, setBranchFilter] = useState<'all' | 'acarya_1' | 'acarya_2'>('all');
  const [selectedFormBranch, setSelectedFormBranch] = useState<KostLocation>(
    currentTenant.kostLocation || 'acarya_2'
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>(currentTenant.id);
  const [acCondition, setAcCondition] = useState<string>('perlu_dicuci');
  const [preferredDate, setPreferredDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [tenantNotes, setTenantNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handlePullFromSheet = async () => {
    if (!onSyncWithGoogleSheets) return;
    const res = await onSyncWithGoogleSheets();
    setSyncNotice(
      res.success
        ? 'Berhasil disinkronkan dari tab Jadwal_Servis_AC! Baris yang dihapus di Google Sheet otomatis terhapus di aplikasi.'
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

  // Find selected room's existing AC record
  const tenantAc = acServices.find(
    (a) =>
      a.roomNumber === selectedFormTenant.roomNumber &&
      (a.kostLocation || 'acarya_1') === (selectedFormTenant.kostLocation || 'acarya_1')
  );

  const filteredAcServices =
    branchFilter === 'all'
      ? acServices
      : acServices.filter((a) => (a.kostLocation || 'acarya_1') === branchFilter);

  const handleFormBranchChange = (branch: KostLocation) => {
    setSelectedFormBranch(branch);
    const firstRoomInBranch = tenants.find((t) => (t.kostLocation || 'acarya_1') === branch);
    if (firstRoomInBranch) {
      setSelectedRoomId(firstRoomInBranch.id);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      action: 'booking_ac',
      id: `AC-REQ-${Date.now().toString().slice(-4)}`,
      kostLocation: selectedFormTenant.kostLocation || 'acarya_1',
      roomNumber: selectedFormTenant.roomNumber,
      tenantName: selectedFormTenant.name,
      acBrand: tenantAc?.acBrand || 'Unit AC Kamar 1/2 PK',
      status: acCondition,
      nextServiceDate: preferredDate || 'Jadwal Segera',
      notes: tenantNotes,
      createdAt: new Date().toLocaleDateString('id-ID'),
    };

    if (settings.googleWebAppUrl) {
      try {
        await sendToGoogleSheets(settings.googleWebAppUrl, payload);
      } catch (err) {
        console.warn('Sync AC booking error', err);
      }
    }

    onRequestAcService(payload);
    setIsSubmitting(false);
    setSubmittedSuccess(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'normal':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Selesai Diservis (Dingin Normal)</span>
          </span>
        );
      case 'kurang_dingin':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Kurang Dingin</span>
          </span>
        );
      case 'perlu_dicuci':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <Fan className="w-3 h-3" />
            <span>Jadwal Cuci (6 Bln)</span>
          </span>
        );
      case 'rusak':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Perlu Teknisi</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <button
          id="btn-back-ac"
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Jadwal Servis AC (Tiap 6 Bulan Sekali)
          </h2>
          <p className="text-xs text-slate-500">
            Pemeliharaan berkala cuci filter & freon unit AC untuk Acarya Kost 1 & 2
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Banner Hero */}
        <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-sky-400">
            <Fan className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
            <span>Pemeliharaan Berkala Tiap 6 Bulan</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-bold">
              Status AC: Kamar {currentTenant.roomNumber} ({currentTenant.name})
            </h3>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
              currentTenant.kostLocation === 'acarya_2'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
            }`}>
              {currentTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Untuk menjaga udara kamar tetap segar, dingin optimal, dan hemat listrik pulsa, servis cuci AC dilakukan rutin setiap 6 bulan sekali.
          </p>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowRequestForm(!showRequestForm);
                setSubmittedSuccess(false);
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              {showRequestForm ? 'Tutup Formulir' : 'Ajukan Request Cuci / Cek AC'}
            </button>
          </div>
        </div>

        {/* Google Sheets 2-Way Sync Bar (Tab: Jadwal_Servis_AC) */}
        <div className="bg-violet-50/80 border border-violet-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-bold text-violet-950">
              <FileSpreadsheet className="w-4 h-4 text-violet-600 shrink-0" />
              <span>Terintegrasi dengan Sheet: <code className="bg-violet-100 px-1.5 py-0.5 rounded font-mono text-violet-800">Jadwal_Servis_AC</code></span>
            </div>
            <p className="text-[11px] text-violet-800/80">
              Saat servis AC ditandai <strong>Selesai</strong> lalu Anda klik <strong>Hapus Jadwal</strong>, data hanya dihapus dari tampilan WebApp namun <strong>tetap tersimpan di Google Sheet</strong> sebagai arsip.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePullFromSheet}
              disabled={isSyncingSheets}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-violet-100 text-violet-800 border border-violet-300 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Tarik perubahan & penghapusan terbaru dari tab Jadwal_Servis_AC di Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
              <span>{isSyncingSheets ? 'Sinkron...' : 'Sinkron dari Sheet'}</span>
            </button>
            <button
              type="button"
              onClick={handlePushToSheet}
              disabled={isSyncingSheets}
              className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Catat seluruh jadwal servis AC saat ini ke tab Jadwal_Servis_AC di Google Sheet"
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

        {/* Request Form if opened */}
        {showRequestForm && (
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Formulir Permintaan Servis AC</span>
            </h4>

            {submittedSuccess ? (
              <div className="bg-emerald-50 rounded-lg p-4 text-center space-y-3 border border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h5 className="text-xs font-bold text-emerald-950">
                  Permintaan Servis AC Kamar {selectedFormTenant.roomNumber} ({selectedFormTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}) Berhasil Terkirim!
                </h5>
                <p className="text-[11px] text-slate-600">
                  Jadwal telah ditambahkan ke daftar servis AC dan dicatat ke Google Sheets pengelola. Anda juga dapat konfirmasi langsung via WhatsApp.
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                  <a
                    href={buildWaLink(
                      settings.adminPhone,
                      `Halo Pengelola Kost, saya mengajukan servis AC untuk ${selectedFormTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'} - Kamar ${selectedFormTenant.roomNumber} (${selectedFormTenant.name}). Kondisi: ${acCondition}. Catatan: ${tenantNotes || 'Pencucian AC berkala 6 bulan'}`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Kirim Pesan WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedSuccess(false);
                      setTenantNotes('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-700 border border-slate-200 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span>Ajukan Kamar Lain</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRequestSubmit} className="space-y-3">
                {/* Pilihan Lokasi Cabang & Kamar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lokasi Cabang Kost:
                    </label>
                    <select
                      value={selectedFormBranch}
                      onChange={(e) => handleFormBranchChange(e.target.value as KostLocation)}
                      className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500 text-slate-800"
                    >
                      <option value="acarya_1">Acarya Kost 1 (11 Kamar)</option>
                      <option value="acarya_2">Acarya Kost 2 (18 Kamar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <DoorOpen className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Pilih Kamar yang Ingin Diservis:</span>
                    </label>
                    <select
                      id="select-ac-room"
                      value={selectedFormTenant.id}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500 text-slate-800"
                    >
                      {branchRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          Kamar {room.roomNumber} — {room.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kondisi AC Saat Ini:
                    </label>
                    <select
                      value={acCondition}
                      onChange={(e) => setAcCondition(e.target.value)}
                      className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500 text-slate-800"
                    >
                      <option value="perlu_dicuci">Sudah 6 Bulan / Perlu Dicuci</option>
                      <option value="kurang_dingin">Kurang Dingin / Angin Lemah</option>
                      <option value="rusak">Bocor Air / Bunyi Berisik / Rusak</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Rencana Tanggal Servis:</span>
                    </label>
                    <input
                      type="date"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Catatan / Gejala Kendala:
                  </label>
                  <textarea
                    value={tenantNotes}
                    onChange={(e) => setTenantNotes(e.target.value)}
                    rows={2}
                    placeholder="Contoh: AC mulai berdebu dan agak meneteskan air saat malam hari..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500 text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmitting
                      ? 'Mengirim...'
                      : `Kirim Permintaan Servis AC (Kamar ${selectedFormTenant.roomNumber})`}
                  </span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Branch Filter Tabs for Master List */}
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

        {/* Master List of AC by Room */}
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
            Daftar Jadwal Servis AC per Kamar ({branchFilter === 'all' ? 'Acarya Kost 1 & 2' : branchFilter === 'acarya_1' ? 'Acarya Kost 1' : 'Acarya Kost 2'})
          </h4>

          {filteredAcServices.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200 space-y-2">
              <Fan className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">
                Tidak ada daftar jadwal servis AC yang aktif
              </p>
              <p className="text-[11px] text-slate-400">
                Klik tombol "Ajukan Request Cuci / Cek AC" di atas untuk menjadwalkan kamar yang ingin diservis.
              </p>
            </div>
          )}

          {filteredAcServices.map((ac) => {
            const isMyRoom =
              ac.roomNumber === currentTenant.roomNumber &&
              (ac.kostLocation || 'acarya_1') === (currentTenant.kostLocation || 'acarya_1');
            const isCompleted = ac.status === 'normal';

            return (
              <div
                key={ac.id}
                className={`bg-white rounded-xl p-4 border transition-all space-y-2.5 shadow-sm ${
                  isMyRoom
                    ? 'border-indigo-500 ring-2 ring-indigo-100'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      ac.kostLocation === 'acarya_2'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    }`}>
                      {ac.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs border border-sky-200">
                      {ac.roomNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-slate-900">
                          Kamar {ac.roomNumber} - {ac.tenantName}
                        </h5>
                        {isMyRoom && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            Kamar Anda
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">Unit: {ac.acBrand}</p>
                    </div>
                  </div>
                  <div>{getStatusBadge(ac.status)}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-500 block">Servis Terakhir:</span>
                    <strong className="text-slate-800">{ac.lastServiceDate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Jadwal Berikutnya (+6 Bln):</span>
                    <strong className="text-indigo-700">{ac.nextServiceDate}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <div className="text-[11px] text-slate-500 italic pl-1">
                    {ac.notes ? `Catatan: ${ac.notes}` : 'Tidak ada catatan tambahan'}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {!isCompleted ? (
                      <button
                        type="button"
                        onClick={() => onCompleteAcService(ac.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        title="Tandai bahwa AC kamar ini sudah selesai diservis"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Tandai Selesai Diservis</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteAcService(ac.id);
                          setSyncNotice(
                            `Jadwal servis AC Kamar ${ac.roomNumber} yang sudah selesai telah dihapus dari tampilan WebApp. Data selesai tetap tersimpan aman di Google Sheet (Jadwal_Servis_AC).`
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
    </div>
  );
};
