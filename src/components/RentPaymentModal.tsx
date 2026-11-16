import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
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
  FileSpreadsheet,
  Clock,
  Layers,
  Wallet,
  History,
  Edit3,
  QrCode,
  Download,
  ZoomIn,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  TenantProfile,
  AppSettings,
  PaymentMethod,
  KostPaymentType,
  KostPaymentRecord,
  AnnualInstallmentInfo,
} from '../types';
import {
  formatRupiah,
  buildWaLink,
  generateTenantSubmissionNotification,
} from '../utils/whatsappHelper';
import { compressImageFile } from '../utils/imageCompressor';
import { computeTenantRentStatusInfo } from '../utils/paymentStatusCalculator';

interface RentPaymentModalProps {
  currentTenant: TenantProfile;
  settings: AppSettings;
  kostPayments?: KostPaymentRecord[];
  initialMode?: 'reguler' | 'sisa_cicilan';
  onClose: () => void;
  onSubmitPayment: (record: KostPaymentRecord) => void | Promise<{ success: boolean; message: string }>;
  onOpenReceipt?: (record: KostPaymentRecord, type: 'kost') => void;
}

export const RentPaymentModal: React.FC<RentPaymentModalProps> = ({
  currentTenant,
  settings,
  kostPayments = [],
  initialMode,
  onClose,
  onSubmitPayment,
  onOpenReceipt,
}) => {
  // Cari riwayat pembayaran cicilan sebelumnya untuk kamar ini (baik dari profil maupun dari daftar transaksi)
  const roomInstallmentHistory = useMemo(() => {
    return kostPayments.filter(
      (p) =>
        p.roomNumber === currentTenant.roomNumber &&
        (p.kostLocation || 'acarya_1') === (currentTenant.kostLocation || 'acarya_1') &&
        p.paymentType === 'tahunan_cicil' &&
        p.status !== 'rejected'
    );
  }, [kostPayments, currentTenant.roomNumber, currentTenant.kostLocation]);

  const latestHistoryInstallment = roomInstallmentHistory.length > 0 ? roomInstallmentHistory[0].installmentInfo : undefined;

  // Check if tenant currently has an active ongoing annual installment plan
  const existingInstallment = useMemo(() => {
    if (currentTenant.annualInstallment?.isActive && !currentTenant.annualInstallment.isFullyPaid) {
      return currentTenant.annualInstallment;
    }
    if (latestHistoryInstallment && !latestHistoryInstallment.isFullyPaid) {
      return {
        isActive: true,
        totalAnnualAmount: latestHistoryInstallment.totalAnnualAmount,
        paidAmount: latestHistoryInstallment.totalPaidSoFar,
        remainingAmount: latestHistoryInstallment.remainingAmount,
        startDate: roomInstallmentHistory[roomInstallmentHistory.length - 1]?.createdAt || new Date().toLocaleDateString('id-ID'),
        maxPayoffDate: latestHistoryInstallment.maxPayoffDate,
        installmentTerm: latestHistoryInstallment.installmentTerm,
        isFullyPaid: latestHistoryInstallment.isFullyPaid,
      };
    }
    return null;
  }, [currentTenant.annualInstallment, latestHistoryInstallment, roomInstallmentHistory]);

  // Sub-menu mode: 'reguler' (Sewa Baru / Cicilan Awal) vs 'sisa_cicilan' (Bayar Sisa Cicilan)
  const [menuMode, setMenuMode] = useState<'reguler' | 'sisa_cicilan'>(() => {
    if (initialMode) return initialMode;
    return existingInstallment ? 'sisa_cicilan' : 'reguler';
  });

  const [paymentType, setPaymentType] = useState<KostPaymentType>(() => {
    return existingInstallment || initialMode === 'sisa_cicilan' ? 'tahunan_cicil' : 'bulanan';
  });
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [monthlyRate, setMonthlyRate] = useState<number>(currentTenant.monthlyRentRate);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bri');
  const [proofImage, setProofImage] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedBank, setCopiedBank] = useState<boolean>(false);
  const [zoomQris, setZoomQris] = useState<boolean>(false);
  const [successRecord, setSuccessRecord] = useState<KostPaymentRecord | null>(null);

  const qrisUrl = settings.qrisImageUrl || '/qris-acarya.jpg';
  const rentStatusInfo = useMemo(
    () => computeTenantRentStatusInfo(currentTenant, kostPayments, new Date()),
    [currentTenant, kostPayments]
  );

  // Installment specific state
  const totalAnnualRent = monthlyRate * 12;

  // State untuk nominal yang sudah dibayar sebelumnya (bisa otomatis dari data sebelumnya atau diisi manual jika cicilan awal belum tercatat)
  const defaultPriorPaid = existingInstallment
    ? existingInstallment.paidAmount
    : Math.round(totalAnnualRent / 3);

  const [manualPriorPaid, setManualPriorPaid] = useState<number>(defaultPriorPaid);
  const [isEditingPriorPaid, setIsEditingPriorPaid] = useState<boolean>(!existingInstallment);

  // Tahap cicilan saat membayar sisa cicilan (Ke-2, Ke-3 / Pelunasan)
  const [selectedRemainingTerm, setSelectedRemainingTerm] = useState<number>(() => {
    return existingInstallment ? existingInstallment.installmentTerm + 1 : 2;
  });

  useEffect(() => {
    if (existingInstallment) {
      setManualPriorPaid(existingInstallment.paidAmount);
      setSelectedRemainingTerm(existingInstallment.installmentTerm + 1);
      setIsEditingPriorPaid(false);
    } else {
      setManualPriorPaid(Math.round((monthlyRate * 12) / 3));
      setIsEditingPriorPaid(true);
    }
  }, [existingInstallment, monthlyRate]);

  // Jika di menu 'sisa_cicilan', gunakan priorPaid dari riwayat atau input manual; jika di 'reguler' (Cicilan Awal Ke-1), priorPaid = 0
  const priorPaid =
    menuMode === 'sisa_cicilan'
      ? existingInstallment && !isEditingPriorPaid
        ? existingInstallment.paidAmount
        : manualPriorPaid
      : 0;

  const priorRemaining = Math.max(0, totalAnnualRent - priorPaid);
  const currentInstallmentTerm =
    menuMode === 'sisa_cicilan' ? selectedRemainingTerm : 1;

  // 3-month payoff deadline computation
  const getDeadlineDate = (): string => {
    if (existingInstallment?.maxPayoffDate) {
      return existingInstallment.maxPayoffDate;
    }
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const deadlineDateStr = getDeadlineDate();

  // Default installment amount
  const [installmentAmount, setInstallmentAmount] = useState<number>(() => {
    if (existingInstallment) {
      return existingInstallment.remainingAmount;
    }
    return Math.round(totalAnnualRent / 3);
  });

  // Update default installmentAmount when switching between 'reguler' and 'sisa_cicilan'
  const handleSwitchMenuMode = (mode: 'reguler' | 'sisa_cicilan') => {
    setMenuMode(mode);
    setValidationError(null);
    if (mode === 'sisa_cicilan') {
      setPaymentType('tahunan_cicil');
      setDurationMonths(12);
      const currentPrior = existingInstallment ? existingInstallment.paidAmount : manualPriorPaid;
      const rem = Math.max(0, totalAnnualRent - currentPrior);
      setInstallmentAmount(rem > 0 ? rem : Math.round((totalAnnualRent * 2) / 3));
    } else {
      setPaymentType('bulanan');
      setDurationMonths(1);
    }
  };

  // Days remaining until 3-month deadline
  const calculateDaysLeft = (deadlineStr: string) => {
    try {
      const parts = deadlineStr.split('/');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const diff = d.getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
      }
    } catch {
      // ignore
    }
    return 90;
  };
  const daysLeft = calculateDaysLeft(deadlineDateStr);

  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync monthly rate whenever currentTenant or its synced rate changes
  useEffect(() => {
    if (currentTenant.monthlyRentRate) {
      setMonthlyRate(currentTenant.monthlyRentRate);
    }
  }, [currentTenant.monthlyRentRate]);

  // Month calculation
  const monthsToPay =
    paymentType === 'bulanan'
      ? 1
      : paymentType === 'tahunan' || paymentType === 'tahunan_cicil'
      ? 12
      : Math.max(1, durationMonths);

  const totalAmount =
    paymentType === 'tahunan_cicil'
      ? installmentAmount
      : monthlyRate * monthsToPay;

  // Period string calculation
  const now = new Date();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const startMonthIdx = now.getMonth();
  const startYear = now.getFullYear();
  const endMonthTotal = startMonthIdx + monthsToPay - 1;
  const endMonthIdx = endMonthTotal % 12;
  const endYear = startYear + Math.floor(endMonthTotal / 12);

  const periodStart = `${monthNames[startMonthIdx]} ${startYear}`;
  const periodEnd = `${monthNames[endMonthIdx]} ${endYear}`;

  // Due Date (e.g. 5th of current month)
  const dueDateStr = `${startYear}-${String(startMonthIdx + 1).padStart(2, '0')}-${String(currentTenant.rentDueDateDay).padStart(2, '0')}`;

  const [isCompressing, setIsCompressing] = useState(false);

  const handleCopyBank = () => {
    navigator.clipboard.writeText(settings.briAccountNo.replace(/\D/g, ''));
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setValidationError(null);
      try {
        setIsCompressing(true);
        const compressed = await compressImageFile(file, 800, 0.65);
        setProofImage(compressed);
      } catch (err) {
        console.warn('Fallback to standard reader:', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setProofImage(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation
    if ((paymentMethod === 'bri' || paymentMethod === 'qris') && !proofImage) {
      setValidationError(
        paymentMethod === 'qris'
          ? 'Untuk metode pembayaran QRIS (Scan QR Code), Anda wajib melampirkan foto / screenshot bukti transaksi QRIS.'
          : 'Untuk metode pembayaran Transfer Bank BRI, Anda wajib melampirkan foto / screenshot bukti transfer.'
      );
      return;
    }

    if (paymentType === 'tahunan_cicil') {
      if (menuMode === 'sisa_cicilan' && priorPaid <= 0) {
        setValidationError('Silakan masukkan nominal cicilan awal yang sudah pernah dibayarkan sebelumnya.');
        return;
      }
      if (menuMode === 'sisa_cicilan' && priorPaid >= totalAnnualRent) {
        setValidationError('Nominal yang sudah dibayar sebelumnya tidak boleh melebihi atau sama dengan total sewa 1 tahun.');
        return;
      }
      if (!installmentAmount || installmentAmount <= 0) {
        setValidationError('Nominal pembayaran cicilan harus lebih dari Rp 0.');
        return;
      }
      if (installmentAmount > priorRemaining) {
        setValidationError(`Nominal pembayaran (${formatRupiah(installmentAmount)}) tidak boleh melebihi sisa kekurangan (${formatRupiah(priorRemaining)}).`);
        return;
      }
    }

    setIsSubmitting(true);

    const calculatedInstallmentInfo: AnnualInstallmentInfo | undefined =
      paymentType === 'tahunan_cicil'
        ? {
            isInstallment: true,
            totalAnnualAmount: totalAnnualRent,
            paidThisTerm: installmentAmount,
            totalPaidSoFar: priorPaid + installmentAmount,
            remainingAmount: Math.max(0, totalAnnualRent - (priorPaid + installmentAmount)),
            installmentTerm: currentInstallmentTerm,
            maxPayoffDate: deadlineDateStr,
            isFullyPaid: priorPaid + installmentAmount >= totalAnnualRent,
          }
        : undefined;

    const autoNotes =
      menuMode === 'sisa_cicilan' && paymentType === 'tahunan_cicil'
        ? `${notes.trim() ? notes.trim() + ' — ' : ''}Pembayaran Sisa Cicilan Sewa (Cicilan Ke-${currentInstallmentTerm}${
            priorPaid + installmentAmount >= totalAnnualRent ? ' / Pelunasan Akhir' : ''
          })`
        : notes.trim() || undefined;

    const newRecord: KostPaymentRecord = {
      id: `KP-${Date.now().toString().slice(-6)}`,
      kostLocation: currentTenant.kostLocation || 'acarya_1',
      tenantName: currentTenant.name,
      roomNumber: currentTenant.roomNumber,
      phone: currentTenant.phone,
      paymentType,
      durationMonths: monthsToPay,
      monthlyRate,
      totalAmount,
      periodStart,
      periodEnd,
      dueDate: dueDateStr,
      paymentMethod,
      proofImage: proofImage || undefined,
      notes: autoNotes,
      status: 'pending',
      createdAt: new Date().toLocaleString('id-ID'),
      syncedToSheets: false,
      installmentInfo: calculatedInstallmentInfo,
    };

    try {
      await onSubmitPayment(newRecord);
    } catch (err) {
      console.warn('Info submit payment:', err);
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
      {/* Top Header Navigation */}
      <div className="flex items-center gap-3">
        <button
          id="btn-back-rent"
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Pembayaran Sewa Kost
          </h2>
          <p className="text-xs text-slate-500">
            Formulir pembayaran sewa bulanan, tahunan lunas, cicilan baru, atau pelunasan sisa cicilan
          </p>
        </div>
      </div>

      {/* Top Menu Mode Switcher: Sewa Baru vs Bayar Sisa Cicilan */}
      {!successRecord && (
        <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 gap-1.5">
          <button
            id="tab-sewa-reguler"
            type="button"
            onClick={() => handleSwitchMenuMode('reguler')}
            className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              menuMode === 'reguler'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>Bayar Sewa Baru / Awal</span>
          </button>

          <button
            id="tab-bayar-sisa-cicilan"
            type="button"
            onClick={() => handleSwitchMenuMode('sisa_cicilan')}
            className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
              menuMode === 'sisa_cicilan'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-700 hover:bg-amber-50'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Bayar Sisa Cicilan</span>
            {existingInstallment && (
              <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-600 text-white">
                Aktif
              </span>
            )}
          </button>
        </div>
      )}

      {successRecord ? (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Pembayaran Berhasil Dikirim!
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Terima kasih, pembayaran sebesar <strong>{formatRupiah(successRecord.totalAmount)}</strong> untuk Kamar {successRecord.roomNumber} telah dicatat.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-xs text-left space-y-2 border border-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-500">ID Transaksi:</span>
              <span className="font-mono font-bold text-slate-800">{successRecord.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipe Sewa:</span>
              <span className="font-semibold text-indigo-700">
                {successRecord.paymentType === 'tahunan_cicil'
                  ? `Sewa Tahunan (Cicilan Ke-${successRecord.installmentInfo?.installmentTerm}${
                      successRecord.installmentInfo?.isFullyPaid ? ' - Pelunasan Akhir' : ''
                    })`
                  : successRecord.paymentType === 'tahunan'
                  ? 'Sewa 1 Tahun (Lunas Sekaligus)'
                  : `${successRecord.durationMonths} Bulan`}
              </span>
            </div>

            {successRecord.installmentInfo && (
              <div className="p-3 bg-amber-50/70 rounded-lg border border-amber-200 space-y-1.5 my-1">
                <div className="flex justify-between font-medium text-amber-950">
                  <span>Total Sewa 1 Tahun:</span>
                  <span>{formatRupiah(successRecord.installmentInfo.totalAnnualAmount)}</span>
                </div>
                <div className="flex justify-between font-medium text-amber-950">
                  <span>Dibayar pada Transaksi Ini:</span>
                  <span className="font-bold text-indigo-700">
                    {formatRupiah(successRecord.installmentInfo.paidThisTerm)}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-amber-950">
                  <span>Total Akumulasi Terbayar:</span>
                  <span className="font-bold text-emerald-700">
                    {formatRupiah(successRecord.installmentInfo.totalPaidSoFar)}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-amber-950">
                  <span>Sisa Kekurangan:</span>
                  <span className="font-bold text-rose-700">
                    {successRecord.installmentInfo.isFullyPaid
                      ? '🎉 Rp 0 (LUNAS)'
                      : formatRupiah(successRecord.installmentInfo.remainingAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-amber-800 pt-1 border-t border-amber-200">
                  <span>Batas Pelunasan (Maks 3 Bulan):</span>
                  <span className="font-bold">{successRecord.installmentInfo.maxPayoffDate}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-slate-500">Periode:</span>
              <span className="font-semibold text-slate-800">{successRecord.periodStart} s/d {successRecord.periodEnd}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Metode Bayar:</span>
              <span className="font-semibold text-slate-800 uppercase">{successRecord.paymentMethod}</span>
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
              {kostPayments.find((p) => p.id === successRecord.id)?.status === 'verified' ? (
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

          {kostPayments.find((p) => p.id === successRecord.id)?.status === 'verified' &&
            onOpenReceipt && (
              <button
                type="button"
                onClick={() => {
                  const latest =
                    kostPayments.find((p) => p.id === successRecord.id) || successRecord;
                  onOpenReceipt(latest, 'kost');
                }}
                className="w-full py-3 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <span>🧾 Lihat & Unduh Nota Transaksi Resmi</span>
              </button>
            )}

          {/* Direct WhatsApp notification actions */}
          <div className="pt-2 space-y-2">
            <a
              id="btn-wa-confirm-rent"
              href={buildWaLink(
                settings.adminPhone,
                generateTenantSubmissionNotification(successRecord, false, settings)
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Kirim Konfirmasi WhatsApp ke Pengelola</span>
            </a>

            <button
              id="btn-done-rent"
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
          {/* Tenant Identity Summary */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Penghuni Kost
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {currentTenant.name}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                  currentTenant.kostLocation === 'acarya_2'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                }`}>
                  {currentTenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1'}
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                  Kamar {currentTenant.roomNumber}
                </span>
              </div>
            </div>

            {/* Status Sewa Kamar Saat Ini (Sinkron Data Google Sheet) */}
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                rentStatusInfo.status === 'lunas'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : rentStatusInfo.status === 'jatuh_tempo'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div>
                <span className="font-bold block">
                  Status Sewa Kamar Saat Ini:{' '}
                  <span className="uppercase">
                    {rentStatusInfo.status.replace('_', ' ')}
                  </span>
                </span>
                <span className="text-[11px] opacity-90 block mt-0.5">
                  {rentStatusInfo.statusDetailText}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/80 border border-current/20 shrink-0">
                Jatuh Tempo Tgl {currentTenant.rentDueDateDay}
              </span>
            </div>

            {/* Active installment alert if tenant already has an ongoing installment */}
            {existingInstallment && (
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Tagihan Cicilan Sewa Tahunan Aktif</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    daysLeft > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-red-100 text-red-800 border border-red-300 animate-pulse'
                  }`}>
                    {daysLeft > 0 ? `${daysLeft} Hari Lagi` : 'Lewat Batas 3 Bulan!'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Total 1 Tahun:</span>
                    <strong className="text-slate-900">{formatRupiah(existingInstallment.totalAnnualAmount)}</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Sudah Dibayar:</span>
                    <strong className="text-emerald-700">{formatRupiah(existingInstallment.paidAmount)}</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-amber-200 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-500 block">Sisa Harus Dilunasi:</span>
                    <strong className="text-rose-700">{formatRupiah(existingInstallment.remainingAmount)}</strong>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-amber-800 leading-tight">
                    📌 Wajib lunas sebelum <strong>{existingInstallment.maxPayoffDate}</strong> (maks 3 bulan).
                  </p>
                  {menuMode !== 'sisa_cicilan' && (
                    <button
                      type="button"
                      onClick={() => handleSwitchMenuMode('sisa_cicilan')}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer shrink-0"
                    >
                      Bayar Sisa Sekarang →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* MODE 1: PEMBAYARAN SEWA BARU / REGULER */}
            {menuMode === 'reguler' && (
              <>
                {/* Rent Type Picker - 5 Options including Bayar Sisa Cicilan shortcut */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Pilih Durasi / Jenis Pembayaran Sewa:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { id: 'bulanan', label: '1 Bulan', desc: 'Bulanan' },
                      { id: 'beberapa_bulan', label: 'Beberapa Bln', desc: 'Custom 2-11 Bln' },
                      { id: 'tahunan', label: '1 Tahun (Lunas)', desc: '12 Bulan Penuh' },
                      { id: 'tahunan_cicil', label: 'Tahunan Cicil', desc: 'Cicilan Awal (Ke-1)' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setPaymentType(t.id as KostPaymentType);
                          if (t.id === 'bulanan') setDurationMonths(1);
                          if (t.id === 'tahunan' || t.id === 'tahunan_cicil') {
                            setDurationMonths(12);
                            if (t.id === 'tahunan_cicil') {
                              setInstallmentAmount(Math.round(totalAnnualRent / 3));
                            }
                          }
                        }}
                        className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                          paymentType === t.id
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold shadow-2xs'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold">{t.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{t.desc}</div>
                      </button>
                    ))}

                    {/* Direct Option Card to Open Sisa Cicilan Menu */}
                    <button
                      id="btn-option-sisa-cicilan"
                      type="button"
                      onClick={() => handleSwitchMenuMode('sisa_cicilan')}
                      className="p-3 rounded-lg border border-amber-300 bg-amber-50/70 hover:bg-amber-100/80 text-amber-950 text-center transition-all cursor-pointer col-span-2 sm:col-span-1"
                    >
                      <div className="text-xs font-extrabold flex items-center justify-center gap-1 text-amber-900">
                        <Wallet className="w-3.5 h-3.5 text-amber-700" />
                        <span>Sisa Cicilan</span>
                      </div>
                      <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                        Pelunasan / Ke-2 & 3
                      </div>
                    </button>
                  </div>
                </div>

                {/* If custom months */}
                {paymentType === 'beberapa_bulan' && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Jumlah Bulan yang Dibayar:
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="2"
                        max="11"
                        value={durationMonths}
                        onChange={(e) => setDurationMonths(parseInt(e.target.value) || 2)}
                        className="flex-1 accent-indigo-600 cursor-pointer"
                      />
                      <span className="w-16 py-1 text-center bg-white rounded-lg border border-slate-300 font-bold text-indigo-700 text-sm">
                        {durationMonths} Bulan
                      </span>
                    </div>
                  </div>
                )}

                {/* If Tahunan Cicil (Awal / Cicilan Ke-1) */}
                {paymentType === 'tahunan_cicil' && (
                  <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-700" />
                        <span>Mulai Cicilan Sewa 1 Tahun (Cicilan Awal Ke-1)</span>
                      </span>
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        Batas Lunas: {deadlineDateStr} (Maks 3 Bln)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                        <span className="text-[10px] text-slate-500 block">Total Sewa 1 Tahun (12 Bln):</span>
                        <strong className="text-sm font-bold text-slate-900">{formatRupiah(totalAnnualRent)}</strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                        <span className="text-[10px] text-slate-500 block">Sisa Setelah Cicilan Ke-1:</span>
                        <strong className="text-sm font-bold text-rose-700">
                          {formatRupiah(Math.max(0, totalAnnualRent - (installmentAmount || 0)))}
                        </strong>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-100/70 rounded-lg text-xs text-amber-900 border border-amber-300 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold block">Ingin Membayar Sisa Cicilan (Cicilan Ke-2 / Pelunasan)?</strong>
                          <span className="text-[11px] leading-relaxed">
                            Jika Anda sudah pernah membayar DP / Cicilan Ke-1 sebelumnya, gunakan menu khusus <strong>Bayar Sisa Cicilan</strong>.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSwitchMenuMode('sisa_cicilan')}
                        className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 cursor-pointer"
                      >
                        Ke Menu Sisa Cicilan
                      </button>
                    </div>

                    {/* Input for First Installment Amount */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-800">
                        Masukkan Nominal Pembayaran Cicilan Ke-1 (DP Awal):
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={installmentAmount || ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            setInstallmentAmount(Math.max(0, parseInt(raw, 10) || 0));
                          }}
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                          placeholder="Masukkan jumlah cicilan pertama..."
                        />
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] font-semibold text-slate-500">Pilihan Cepat:</span>
                        <button
                          type="button"
                          onClick={() => setInstallmentAmount(Math.round(totalAnnualRent / 3))}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Cicil 1/3 ({formatRupiah(Math.round(totalAnnualRent / 3))})
                        </button>
                        <button
                          type="button"
                          onClick={() => setInstallmentAmount(Math.round(totalAnnualRent / 2))}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Cicil 50% ({formatRupiah(Math.round(totalAnnualRent / 2))})
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* MODE 2: MENU KHUSUS BAYAR SISA CICILAN / PELUNASAN */}
            {menuMode === 'sisa_cicilan' && (
              <div className="bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-amber-50/90 p-4 sm:p-5 rounded-xl border-2 border-amber-300 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-200/80 pb-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-amber-950">
                      <Wallet className="w-4 h-4 text-amber-700" />
                      <span>Menu Pembayaran Sisa Cicilan Sewa Kost</span>
                    </span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Gunakan menu ini untuk membayar Cicilan Ke-2, Cicilan Ke-3, atau melunasi seluruh sisa kekurangan sewa.
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-amber-900 bg-amber-200/70 px-2.5 py-1 rounded-lg border border-amber-300">
                    Batas Lunas: {deadlineDateStr}
                  </span>
                </div>

                {/* Riwayat Pembayaran Cicilan Sebelumnya (Jika ada di riwayat sistem) */}
                {roomInstallmentHistory.length > 0 && (
                  <div className="bg-white/90 rounded-lg p-3 border border-amber-200 space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Riwayat Cicilan Tercatat untuk Kamar {currentTenant.roomNumber}:</span>
                    </div>
                    <div className="space-y-1.5">
                      {roomInstallmentHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200"
                        >
                          <div>
                            <span className="font-bold text-slate-800">
                              Cicilan Ke-{item.installmentInfo?.installmentTerm || 1}
                            </span>
                            <span className="text-slate-500 ml-1.5">({item.createdAt})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-700">{formatRupiah(item.totalAmount)}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.status === 'verified'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status === 'verified' ? 'Terverifikasi' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Langkah 1: Pilih Tahap Pembayaran Sisa Cicilan */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    1. Pilih Tahap Pembayaran Sisa Cicilan:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { term: 2, label: 'Cicilan Ke-2', sub: 'Tahap Kedua' },
                      { term: 3, label: 'Cicilan Ke-3', sub: 'Tahap Ketiga / Akhir' },
                      { term: existingInstallment ? existingInstallment.installmentTerm + 1 : 2, label: 'Pelunasan Penuh', sub: 'Lunasi Sisa Sekaligus', isFullPayoff: true },
                    ].map((opt, idx) => {
                      const isSelected = opt.isFullPayoff
                        ? installmentAmount === priorRemaining && priorRemaining > 0
                        : selectedRemainingTerm === opt.term && installmentAmount !== priorRemaining;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedRemainingTerm(opt.term);
                            if (opt.isFullPayoff) {
                              setInstallmentAmount(priorRemaining);
                            } else if (opt.term === 2 && priorRemaining > 0) {
                              setInstallmentAmount(Math.round(priorRemaining / 2));
                            } else {
                              setInstallmentAmount(priorRemaining);
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-amber-600 bg-amber-500 text-slate-950 font-bold shadow-xs'
                              : 'border-amber-200 bg-white hover:bg-amber-50 text-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold">{opt.label}</div>
                          <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                            {opt.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Langkah 2: Ringkasan Total Sewa & Nominal yang Sudah Dibayar Sebelumnya */}
                <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      2. Rincian Tagihan & Cicilan Sebelumnya:
                    </span>
                    {existingInstallment && (
                      <button
                        type="button"
                        onClick={() => setIsEditingPriorPaid(!isEditingPriorPaid)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isEditingPriorPaid ? 'Gunakan Data Sistem' : 'Sesuaikan Manual'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Total Sewa 1 Tahun (12 Bln):</span>
                      <strong className="text-sm font-bold text-slate-900">{formatRupiah(totalAnnualRent)}</strong>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                      <span className="text-[10px] text-emerald-800 block">Sudah Dibayar Sebelumnya:</span>
                      <strong className="text-sm font-bold text-emerald-700">{formatRupiah(priorPaid)}</strong>
                    </div>

                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                      <span className="text-[10px] text-rose-800 block">Sisa Kekurangan Saat Ini:</span>
                      <strong className="text-sm font-extrabold text-rose-700">{formatRupiah(priorRemaining)}</strong>
                    </div>
                  </div>

                  {/* Input/Penyesuaian jika cicilan pertama dibayar manual / belum tercatat di aplikasi */}
                  {isEditingPriorPaid && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Nominal Cicilan Awal / DP yang Sudah Pernah Anda Bayar Sebelumnya:
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                          Rp
                        </span>
                        <input
                          id="input-prior-paid"
                          type="text"
                          inputMode="numeric"
                          value={manualPriorPaid || ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            const val = Math.min(totalAnnualRent, Math.max(0, parseInt(raw, 10) || 0));
                            setManualPriorPaid(val);
                            const newRem = Math.max(0, totalAnnualRent - val);
                            setInstallmentAmount(newRem);
                          }}
                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                          placeholder="Contoh: 5400000"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-500">Pilih Cepat Sudah Bayar:</span>
                        {[
                          { label: 'Sudah Bayar 1/3', val: Math.round(totalAnnualRent / 3) },
                          { label: 'Sudah Bayar 50%', val: Math.round(totalAnnualRent / 2) },
                          { label: 'Sudah Bayar 2/3', val: Math.round((totalAnnualRent * 2) / 3) },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setManualPriorPaid(preset.val);
                              setInstallmentAmount(Math.max(0, totalAnnualRent - preset.val));
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                              manualPriorPaid === preset.val
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {preset.label} ({formatRupiah(preset.val)})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Langkah 3: Input Nominal Sisa Cicilan yang Dibayar Kali Ini */}
                <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-900">
                    3. Nominal Sisa Cicilan yang Dibayar Sekarang:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                      Rp
                    </span>
                    <input
                      id="input-sisa-cicilan-amount"
                      type="text"
                      inputMode="numeric"
                      value={installmentAmount || ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setInstallmentAmount(Math.max(0, parseInt(raw, 10) || 0));
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-amber-400 rounded-lg text-sm font-extrabold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      placeholder="Masukkan nominal pembayaran sisa cicilan..."
                    />
                  </div>

                  {/* Tombol Pilihan Cepat Pelunasan Sisa */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-semibold text-slate-500">Pilihan Cepat:</span>
                    <button
                      id="btn-lunasi-semua-sisa"
                      type="button"
                      onClick={() => setInstallmentAmount(priorRemaining)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                    >
                      ✓ Lunasi Seluruh Sisa ({formatRupiah(priorRemaining)})
                    </button>
                    {priorRemaining > 100000 && (
                      <button
                        type="button"
                        onClick={() => setInstallmentAmount(Math.round(priorRemaining / 2))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Bayar Separuh Sisa ({formatRupiah(Math.round(priorRemaining / 2))})
                      </button>
                    )}
                  </div>

                  {/* Status Sisa Setelah Pembayaran Ini */}
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Sisa tagihan setelah pembayaran ini:</span>
                    <span
                      className={`font-extrabold ${
                        priorRemaining - (installmentAmount || 0) <= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {priorRemaining - (installmentAmount || 0) <= 0
                        ? '🎉 LUNAS 100% (Sisa Rp 0)'
                        : formatRupiah(Math.max(0, priorRemaining - (installmentAmount || 0)))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Period Breakdown */}
            <div className="bg-indigo-50/60 rounded-lg p-3.5 border border-indigo-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
              <div>
                <span className="text-slate-500">Periode Terhitung:</span>
                <div className="font-bold text-slate-800">
                  {periodStart} {monthsToPay > 1 ? `s/d ${periodEnd}` : ''}
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                  <span className="text-slate-500">Tarif per Bulan:</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <FileSpreadsheet className="w-2.5 h-2.5 text-emerald-600" />
                    Google Sheet
                  </span>
                </div>
                <div className="font-bold text-slate-800 mt-0.5">{formatRupiah(monthlyRate)}</div>
              </div>
            </div>

            {/* Total Display */}
            <div className="p-3.5 bg-slate-900 rounded-lg flex items-center justify-between text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {menuMode === 'sisa_cicilan' ? 'Total Bayar Sisa Cicilan' : 'Total Pembayaran Sewa'}
                </p>
                <p className="text-xs text-slate-300">
                  {paymentType === 'tahunan_cicil'
                    ? menuMode === 'sisa_cicilan'
                      ? `Pembayaran Sisa Cicilan (Cicilan Ke-${currentInstallmentTerm})`
                      : `Cicilan Awal Ke-1 Sewa 1 Tahun`
                    : `${monthsToPay} Bulan × ${formatRupiah(monthlyRate)}`}
                </p>
              </div>
              <span className="text-xl font-mono font-bold text-emerald-400">
                {formatRupiah(totalAmount)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>Metode Pembayaran</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                id="btn-rent-method-bri"
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
                id="btn-rent-method-qris"
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
                id="btn-rent-method-cash"
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

            {/* Payment Details Container */}
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
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Harap sertakan berita transfer:{' '}
                  <strong>
                    {menuMode === 'sisa_cicilan'
                      ? `Cicilan Ke-${currentInstallmentTerm} Kmr ${currentTenant.roomNumber} - ${currentTenant.name}`
                      : `Sewa Kost Kmr ${currentTenant.roomNumber} - ${currentTenant.name}`}
                  </strong>
                </p>
              </div>
            )}

            {paymentMethod === 'qris' && (
              <div className="bg-rose-50/70 rounded-xl p-4 border border-rose-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-rose-600" />
                      <span>Scan Kode QRIS Standar Pembayaran Nasional:</span>
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
                      alt="QRIS Pembayaran Sewa Kost"
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
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 space-y-2 text-xs text-emerald-900">
                <div className="font-bold flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-700" />
                  <span>Petunjuk Pembayaran Tunai (Cash):</span>
                </div>
                <p className="text-slate-600">
                  Pembayaran tunai dapat diserahkan langsung kepada <strong>{settings.adminName}</strong> di kantor pengelola kost.
                </p>
                <div className="bg-white/80 p-2.5 rounded-lg text-[11px] text-slate-700 font-medium border border-emerald-200">
                  📌 <em>Catatan: Untuk pembayaran tunai, Anda <strong>TIDAK PERLU</strong> mengunggah bukti pembayaran. Langsung tekan tombol kirim untuk mencatat jadwal bayar.</em>
                </div>
              </div>
            )}
          </div>

          {/* Proof of Payment Upload */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Bukti Pembayaran</span>
              </label>
              {paymentMethod === 'cash' ? (
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Tidak Perlu (Cash)
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  *Wajib Diunggah
                </span>
              )}
            </div>

            {paymentMethod === 'cash' ? (
              <p className="text-xs text-slate-500">
                Anda memilih pembayaran Cash. Bukti transfer tidak dibutuhkan.
              </p>
            ) : (
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  Unggah tangkapan layar (screenshot) struk{' '}
                  {paymentMethod === 'qris'
                    ? 'pembayaran QRIS (M-Banking / E-Wallet)'
                    : 'm-Banking atau bukti transfer Bank BRI'}
                  :
                </p>

                {isCompressing ? (
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
                      alt="Bukti Transfer"
                      className="w-full max-h-56 object-contain rounded-md mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => setProofImage('')}
                      className="mt-2 text-xs text-red-600 font-bold hover:underline block text-center w-full cursor-pointer"
                    >
                      Hapus / Ganti Foto Bukti
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-lg p-5 text-center cursor-pointer transition-colors block bg-slate-50/50 hover:bg-indigo-50/30">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-indigo-600 block">
                      Klik untuk Pilih Foto Bukti Transfer
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Mendukung format JPG, PNG, atau screenshot
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan Tambahan (Opsional):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={
                  menuMode === 'sisa_cicilan'
                    ? 'Contoh: Pelunasan sisa cicilan sewa kamar via BRImo, mohon dicek kak'
                    : 'Contoh: Sudah saya transfer via BRImo, mohon dicek kak'
                }
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:outline-hidden bg-slate-50"
              />
            </div>
          </div>

          {/* Validation Error Message */}
          {validationError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium leading-relaxed">{validationError}</div>
            </div>
          )}

          {/* Submit Button */}
          <div className="space-y-2">
            <button
              id="btn-submit-rent"
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-lg text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                menuMode === 'sisa_cicilan'
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Mengirim Data...'
                  : menuMode === 'sisa_cicilan'
                  ? `Kirim Pembayaran Sisa Cicilan (${formatRupiah(totalAmount)})`
                  : `Kirim Pembayaran Sewa (${formatRupiah(totalAmount)})`}
              </span>
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Data otomatis tercatat di sistem & terkirim ke Google Sheets pengelola setelah diverifikasi.
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
                  Scan QRIS — {formatRupiah(totalAmount)}
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
