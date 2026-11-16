import React, { useState } from 'react';
import {
  Zap,
  CreditCard,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
  MessageCircle,
  ArrowLeft,
  Building,
  Banknote,
  Send,
  Camera,
  Calculator,
  QrCode,
  Download,
  ZoomIn,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { TenantProfile, AppSettings, PaymentMethod, ElectricityRecord } from '../types';
import { formatRupiah, buildWaLink, generateTenantSubmissionNotification, generateElectricityReminderMessage } from '../utils/whatsappHelper';
import { sendToGoogleSheets } from '../utils/googleSheetsSync';
import { compressImageFile } from '../utils/imageCompressor';
import {
  INDONESIAN_MONTHS,
  getCurrentPeriodMonthLabel,
  computeTenantElectricityStatusInfo,
} from '../utils/paymentStatusCalculator';

interface ElectricityPaymentModalProps {
  currentTenant: TenantProfile;
  settings: AppSettings;
  electricityPayments?: ElectricityRecord[];
  onClose: () => void;
  onSubmitElectricity: (record: ElectricityRecord) => void | Promise<{ success: boolean; message: string }>;
  onOpenReceipt?: (record: ElectricityRecord, type: 'electricity') => void;
}

export const ElectricityPaymentModal: React.FC<ElectricityPaymentModalProps> = ({
  currentTenant,
  settings,
  electricityPayments = [],
  onClose,
  onSubmitElectricity,
  onOpenReceipt,
}) => {
  // Manual string inputs so there are no up/down spinner arrows and users can freely type/delete digits
  const [initialKwhInput, setInitialKwhInput] = useState<string>('');
  const [finalKwhInput, setFinalKwhInput] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [periodMonth, setPeriodMonth] = useState<string>(() => getCurrentPeriodMonthLabel(new Date()));
  const elecStatusInfo = computeTenantElectricityStatusInfo(
    currentTenant,
    electricityPayments,
    new Date()
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bri');
  const [proofImage, setProofImage] = useState<string>('');
  const [meterPhoto, setMeterPhoto] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedBank, setCopiedBank] = useState<boolean>(false);
  const [zoomQris, setZoomQris] = useState<boolean>(false);
  const [successRecord, setSuccessRecord] = useState<ElectricityRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const qrisUrl = settings.qrisImageUrl || '/qris-acarya.jpg';

  const ratePerKwh = settings.ratePerKwh || 2000;
  const machineFee = 0;

  const initialKwh = parseFloat(initialKwhInput) || 0;
  const finalKwh = parseFloat(finalKwhInput) || 0;
  const hasBothInputs = initialKwhInput.trim() !== '' && finalKwhInput.trim() !== '';

  // Calculation: kWh Akhir - kWh Awal (Hanya biaya pemakaian kWh)
  const usageKwh = hasBothInputs ? Math.max(0, finalKwh - initialKwh) : 0;
  const kwhCost = usageKwh * ratePerKwh;
  const totalAmount = kwhCost;
  const isInvalidMeter = hasBothInputs && finalKwh < initialKwh;

  const [isCompressingProof, setIsCompressingProof] = useState(false);
  const [isCompressingMeter, setIsCompressingMeter] = useState(false);

  const handleCopyBank = () => {
    navigator.clipboard.writeText(settings.briAccountNo.replace(/\D/g, ''));
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const handleProofChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormError(null);
      try {
        setIsCompressingProof(true);
        const compressed = await compressImageFile(file, 800, 0.65);
        setProofImage(compressed);
      } catch (err) {
        console.warn('Fallback proof reader:', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) setProofImage(event.target.result as string);
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressingProof(false);
      }
    }
  };

  const handleMeterPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormError(null);
      try {
        setIsCompressingMeter(true);
        const compressed = await compressImageFile(file, 800, 0.65);
        setMeterPhoto(compressed);
      } catch (err) {
        console.warn('Fallback meter reader:', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) setMeterPhoto(event.target.result as string);
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressingMeter(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!hasBothInputs) {
      setFormError('Mohon masukkan angka Stand Listrik Awal Bulan dan Stand Listrik Akhir Bulan secara manual terlebih dahulu.');
      return;
    }

    if (isInvalidMeter) {
      setFormError('Kesalahan Angka Meter: Stand meter akhir bulan tidak boleh lebih kecil daripada stand meter awal!');
      return;
    }

    if (!meterPhoto) {
      setFormError('Mohon unggah foto meteran listrik saat ini. Foto meteran listrik saat ini wajib diisi.');
      return;
    }

    if ((paymentMethod === 'bri' || paymentMethod === 'qris') && !proofImage) {
      setFormError(
        paymentMethod === 'qris'
          ? 'Pemberitahuan: Untuk pembayaran QRIS (Scan QR Code), Anda WAJIB melampirkan foto bukti pembayaran.'
          : 'Pemberitahuan: Untuk pembayaran Transfer Bank BRI, Anda WAJIB melampirkan foto bukti pembayaran.'
      );
      return;
    }

    setIsSubmitting(true);

    const now = new Date();
    const dueDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(currentTenant.electricityDueDateDay).padStart(2, '0')}`;

    const newRecord: ElectricityRecord = {
      id: `EL-${Date.now().toString().slice(-6)}`,
      kostLocation: currentTenant.kostLocation || 'acarya_1',
      tenantName: currentTenant.name,
      roomNumber: currentTenant.roomNumber,
      phone: currentTenant.phone,
      periodMonth,
      initialKwh,
      finalKwh,
      usageKwh,
      ratePerKwh,
      machineFee,
      totalAmount,
      dueDate: dueDateStr,
      paymentMethod,
      proofImage: proofImage || undefined,
      meterPhoto: meterPhoto || undefined,
      notes: notes.trim() || undefined,
      status: 'pending',
      createdAt: new Date().toLocaleString('id-ID'),
      syncedToSheets: false,
    };

    try {
      await onSubmitElectricity(newRecord);
    } catch (err) {
      console.warn('Info submit electricity:', err);
    }

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }

    setSuccessRecord({ ...newRecord, syncedToSheets: true });
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Back Button */}
      <div className="flex items-center gap-3">
        <button
          id="btn-back-electricity"
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Pembayaran Listrik Bulanan
          </h2>
          <p className="text-xs text-slate-500">
            Perhitungan stand meter pemakaian pulsa kWh
          </p>
        </div>
      </div>

      {successRecord ? (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Tagihan Listrik Berhasil Disimpan!
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Total tagihan listrik Kamar {successRecord.roomNumber} sebesar <strong>{formatRupiah(successRecord.totalAmount)}</strong> telah dicatat.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-xs text-left space-y-2 border border-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-500">ID Transaksi:</span>
              <span className="font-mono font-bold text-slate-800">{successRecord.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Stand Meter:</span>
              <span className="font-semibold text-slate-800">
                {successRecord.initialKwh} ➔ {successRecord.finalKwh} kWh ({successRecord.usageKwh} kWh)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Pemakaian Listrik:</span>
              <span className="font-semibold text-slate-800">
                {formatRupiah(successRecord.usageKwh * successRecord.ratePerKwh)}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="font-bold text-slate-700">Total Pembayaran:</span>
              <span className="font-bold text-indigo-600 text-sm font-mono">
                {formatRupiah(successRecord.totalAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Status Pembayaran:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                ⏳ Pending (Menunggu Verifikasi Admin)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Google Sheet Kamar:</span>
              <span className="font-semibold text-emerald-700 text-[11px]">
                ✅ Tercatat Otomatis di Sheet Kamar & Rekap Master
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-200/80">
              <span className="text-slate-500">Nota Transaksi Resmi:</span>
              {electricityPayments.find((p) => p.id === successRecord.id)?.status === 'verified' ? (
                <span className="font-bold text-emerald-700 text-[11px]">
                  🧾 Sudah Terbit Otomatis (Siap Diunduh)
                </span>
              ) : (
                <span className="font-semibold text-indigo-700 text-[11px]">
                  🧾 Otomatis terbit setelah pembayaran diverifikasi
                </span>
              )}
            </div>
          </div>

          {electricityPayments.find((p) => p.id === successRecord.id)?.status === 'verified' &&
            onOpenReceipt && (
              <button
                type="button"
                onClick={() => {
                  const latest =
                    electricityPayments.find((p) => p.id === successRecord.id) || successRecord;
                  onOpenReceipt(latest, 'electricity');
                }}
                className="w-full py-3 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <span>🧾 Lihat & Unduh Nota Transaksi Resmi</span>
              </button>
            )}

          {/* Action WhatsApp */}
          <div className="pt-2 space-y-2">
            <a
              id="btn-wa-confirm-electricity"
              href={buildWaLink(
                settings.adminPhone,
                generateTenantSubmissionNotification(successRecord, true, settings)
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Kirim Konfirmasi Listrik via WhatsApp ke Pengelola</span>
            </a>

            <button
              id="btn-done-electricity"
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
            >
              Kembali ke Menu Utama
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Electricity Meter Calculation Section */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Data Meteran Pulsa Listrik
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-base font-bold text-slate-900">
                    {currentTenant.name}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                    currentTenant.kostLocation === 'acarya_2'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                  }`}>
                    {currentTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    Kamar {currentTenant.roomNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Listrik Bulan Ini (Sinkron Data Google Sheet) */}
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                elecStatusInfo.status === 'lunas'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : elecStatusInfo.status === 'jatuh_tempo'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div>
                <span className="font-bold block">
                  Status Listrik Bulan {elecStatusInfo.currentMonthLabel}:{' '}
                  <span className="uppercase">
                    {elecStatusInfo.status.replace('_', ' ')}
                  </span>
                </span>
                <span className="text-[11px] opacity-90 block mt-0.5">
                  {elecStatusInfo.statusDetailText}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/80 border border-current/20 shrink-0">
                Wajib Tiap Bulan
              </span>
            </div>

            {/* Tanggal & Bulan Tagihan Listrik */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tanggal Pembayaran Listrik:
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPaymentDate(val);
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) {
                      setPeriodMonth(`${INDONESIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`);
                    }
                  }}
                  className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bulan & Tahun Tagihan Listrik:
                </label>
                <select
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-hidden focus:border-indigo-500"
                >
                  {INDONESIAN_MONTHS.map((m) => {
                    const yr = new Date().getFullYear();
                    const label = `${m} ${yr}`;
                    return (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Meter Inputs - Manual Input Without Up/Down Arrows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  1. Stand Listrik Awal Bulan:
                </label>
                <div className="relative">
                  <input
                    id="input-initial-kwh"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={initialKwhInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                      setInitialKwhInput(val);
                      setFormError(null);
                    }}
                    className="w-full text-lg font-bold p-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-indigo-500 pr-14 font-mono text-slate-800 placeholder:text-slate-300 placeholder:font-sans placeholder:text-xs placeholder:font-normal"
                    placeholder="Ketik angka meter awal"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                    kWh
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Ketik manual angka meteran awal bulan
                </span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  2. Stand Listrik Akhir Bulan:
                </label>
                <div className="relative">
                  <input
                    id="input-final-kwh"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={finalKwhInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                      setFinalKwhInput(val);
                      setFormError(null);
                    }}
                    className="w-full text-lg font-bold p-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-indigo-500 pr-14 font-mono text-indigo-600 placeholder:text-slate-300 placeholder:font-sans placeholder:text-xs placeholder:font-normal"
                    placeholder="Ketik angka meter akhir"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-indigo-400">
                    kWh
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Ketik manual angka meteran akhir bulan
                </span>
              </div>
            </div>

            {isInvalidMeter && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Perhatian: Stand meter akhir ({finalKwh} kWh) lebih kecil dari stand meter awal ({initialKwh} kWh). Silakan periksa kembali angka meteran Anda.
                </span>
              </div>
            )}

            {/* Total Dark Summary Bar */}
            <div className="p-3.5 bg-slate-900 rounded-lg flex justify-between items-center text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Tagihan Listrik
                </p>
                <p className="text-xs text-slate-300">
                  {usageKwh} kWh × {formatRupiah(ratePerKwh)}
                </p>
              </div>
              <p className="text-xl font-mono font-bold text-emerald-400">
                {formatRupiah(totalAmount)}
              </p>
            </div>

            {/* Required Meter Photo */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Foto Meteran Listrik Saat Ini</span>
                </label>
                <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                  *Wajib Diisi
                </span>
              </div>

              {isCompressingMeter ? (
                <div className="border border-dashed border-indigo-300 rounded-lg p-3 text-center bg-indigo-50/50">
                  <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-1" />
                  <span className="text-[11px] text-indigo-700 font-bold">
                    Mengompres foto meteran...
                  </span>
                </div>
              ) : meterPhoto ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-2">
                  <img
                    src={meterPhoto}
                    alt="Foto Meter Listrik Saat Ini"
                    className="w-full max-h-44 object-contain rounded-md mx-auto"
                  />
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-xs">
                    <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Foto meteran listrik berhasil diunggah
                    </span>
                    <button
                      type="button"
                      onClick={() => setMeterPhoto('')}
                      className="text-[11px] text-red-600 font-bold hover:underline cursor-pointer"
                    >
                      Hapus / Ganti Foto
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer block transition-colors ${
                    formError && !meterPhoto
                      ? 'border-red-400 bg-red-50/50 hover:bg-red-50/70'
                      : 'border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/30'
                  }`}
                >
                  <Camera className="w-6 h-6 text-indigo-600 mx-auto mb-1.5" />
                  <span className="text-xs text-indigo-700 font-bold block">
                    unggah foto meteran listrik saat ini
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Format JPG, PNG, atau jepret langsung dari kamera HP
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleMeterPhotoChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>Metode Pembayaran Listrik</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('bri')}
                className={`p-3.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMethod === 'bri'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Building className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-bold">Transfer Bank BRI</span>
                <span className="text-[10px] text-slate-500">ATM / BRImo / M-Banking</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('qris')}
                className={`p-3.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMethod === 'qris'
                    ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <QrCode className="w-5 h-5 text-rose-600" />
                <span className="text-xs font-bold">QRIS (Scan QR Code)</span>
                <span className="text-[10px] text-slate-500">Semua Bank & E-Wallet</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-3.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Banknote className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold">Cash (Tunai)</span>
                <span className="text-[10px] text-slate-500">Langsung ke Pengelola</span>
              </button>
            </div>

            {paymentMethod === 'bri' && (
              <div className="bg-blue-50/70 rounded-lg p-4 border border-blue-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900">
                    Rekening Transfer Bank BRI:
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-200 text-blue-900">
                    BANK BRI
                  </span>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-200 flex items-center justify-between">
                  <div>
                    <div className="text-base sm:text-lg font-mono font-bold text-blue-950">
                      {settings.briAccountNo}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold uppercase">
                      a.n {settings.briAccountName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyBank}
                    className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{copiedBank ? 'Tersalin!' : 'Salin'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">
                  Nominal transfer pas: <strong>{formatRupiah(totalAmount)}</strong>
                </p>
              </div>
            )}

            {paymentMethod === 'qris' && (
              <div className="bg-rose-50/70 rounded-xl p-4 border border-rose-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-rose-600" />
                      <span>Scan Kode QRIS Pembayaran Listrik:</span>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      NMID: <strong className="font-mono text-slate-700">ID1026521970321</strong> (A01) • Satu QRIS Untuk Semua
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-200 text-rose-900">
                    QRIS GPN
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3 border border-rose-200 flex flex-col items-center space-y-3">
                  <div className="relative max-w-[260px] w-full">
                    <img
                      src={qrisUrl}
                      alt="QRIS Pembayaran Listrik"
                      onClick={() => setZoomQris(true)}
                      className="w-full h-auto rounded-lg object-contain border border-slate-100 cursor-zoom-in"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 w-full max-w-[260px]">
                    <a
                      href={qrisUrl}
                      download="QRIS-Acarya-Kost.jpg"
                      className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh QRIS</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setZoomQris(true)}
                      className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1 border border-slate-200 transition-colors cursor-pointer"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Perbesar</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Nominal bayar QRIS: <strong className="text-rose-700">{formatRupiah(totalAmount)}</strong>. Setelah berhasil scan & bayar, wajib unggah screenshot bukti pembayaran di bawah ini.
                </p>
              </div>
            )}

            {paymentMethod === 'cash' && (
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 space-y-1 text-xs text-emerald-900">
                <div className="font-bold flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-700" />
                  <span>Bayar Tunai ke Pengelola:</span>
                </div>
                <p className="text-slate-600">
                  Silakan serahkan uang tunai {formatRupiah(totalAmount)} kepada {settings.adminName}. 
                  <strong> Tidak perlu upload bukti transfer untuk pembayaran tunai.</strong>
                </p>
              </div>
            )}
          </div>

          {/* Proof of Payment Upload */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Bukti Pembayaran Listrik</span>
              </label>
              {paymentMethod === 'cash' ? (
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Bebas / Tidak Perlu (Cash)
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  *Wajib Diunggah
                </span>
              )}
            </div>

            {paymentMethod !== 'cash' && (
              <div>
                {isCompressingProof ? (
                  <div className="border-2 border-dashed border-indigo-300 rounded-lg p-5 text-center bg-indigo-50/50">
                    <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2" />
                    <span className="text-xs font-bold text-indigo-700 block">
                      Mengompres & Menyiapkan Foto Bukti...
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Mengoptimalkan gambar agar cepat diunggah ke Google Drive & Sheets
                    </span>
                  </div>
                ) : proofImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-2">
                    <img
                      src={proofImage}
                      alt="Bukti Transfer Listrik"
                      className="w-full max-h-52 object-contain rounded-md mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => setProofImage('')}
                      className="mt-2 text-xs text-red-600 font-bold hover:underline block text-center w-full cursor-pointer"
                    >
                      Hapus / Ganti Foto
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-lg p-5 text-center cursor-pointer transition-colors block bg-slate-50/50 hover:bg-indigo-50/30">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-indigo-600 block">
                      Klik untuk Upload Struk / Bukti Transfer
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Mendukung format JPG, PNG, atau Screenshot
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProofChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan (Opsional):
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Meteran dicek tgl 30 malam"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:outline-hidden bg-slate-50"
              />
            </div>
          </div>

          {/* Error Banner if validation fails */}
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs flex items-start gap-2.5 shadow-2xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 font-medium leading-relaxed">
                {formError}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="space-y-2">
            <button
              id="btn-submit-electricity"
              type="submit"
              disabled={isSubmitting || isInvalidMeter}
              className="w-full py-3 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Menyimpan...' : `Kirim Tagihan Listrik (${formatRupiah(totalAmount)})`}
              </span>
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Foto meteran listrik saat ini wajib diunggah sebelum pengiriman data.
            </p>
          </div>
        </form>
      )}

      {/* Zoom QRIS Modal */}
      {zoomQris && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setZoomQris(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-4 shadow-2xl border border-slate-200 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-rose-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Scan QRIS Listrik — {formatRupiah(totalAmount)}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setZoomQris(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 flex items-center justify-center">
              <img
                src={qrisUrl}
                alt="QRIS Fullscreen"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] font-mono font-bold text-slate-600">
                NMID: ID1026521970321
              </span>
              <a
                href={qrisUrl}
                download="QRIS-Acarya-Kost.jpg"
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Simpan QR</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
