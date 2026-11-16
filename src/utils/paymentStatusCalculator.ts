import {
  TenantProfile,
  KostPaymentRecord,
  ElectricityRecord,
  KostPaymentType,
} from '../types';

export const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const SHORT_INDONESIAN_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mei',
  'jun',
  'jul',
  'agu',
  'sep',
  'okt',
  'nov',
  'des',
];

const DUMMY_SEED_PAYMENT_IDS = new Set([
  'KP-20260901-01',
  'KP-20260902-02',
  'KP-20260903-03',
  'EL-20260901-01',
  'EL-20260902-02',
  'kp-ac2-02-init',
  'kp-ac2-03-init',
  'kp-ac2-06-init',
  'el-ac2-02-init',
  'el-ac2-03-init',
]);

export function isDummySeedPaymentId(id?: string): boolean {
  if (!id) return false;
  return DUMMY_SEED_PAYMENT_IDS.has(String(id).trim());
}

export function normalizeRoomDigits(room?: string | number): string {
  if (room === undefined || room === null) return '00';
  const digits = String(room).replace(/\D/g, '');
  if (!digits) return '00';
  return digits.padStart(2, '0');
}

export function getCurrentPeriodMonthLabel(now: Date = new Date()): string {
  return `${INDONESIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export function getCurrentFullDateLabel(now: Date = new Date()): string {
  const day = String(now.getDate()).padStart(2, '0');
  return `${day} ${INDONESIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Mengekstrak (monthIndex 0-11, year) dari berbagai format string periode/tanggal:
 * - "November 2026" / "Nov 2026"
 * - "November 2026 s/d Oktober 2027" (mengambil bulan awal)
 * - "2026-11-05" / "2026-11-15T..."
 * - "05/11/2026" / "5/11/2026, 10.15.00"
 */
export function parseMonthYearFromText(
  raw?: string
): { monthIndex: number; year: number; day?: number } | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text === '-') return null;

  // Jika ada "s/d", ambil bagian awal untuk start period
  const firstSegment = text.split(/s\/d|sampai|-/i)[0].trim() || text;
  const lower = firstSegment.toLowerCase();

  // 1. Cek nama bulan Bahasa Indonesia (Januari..Desember)
  for (let i = 0; i < INDONESIAN_MONTHS.length; i++) {
    const fullMonth = INDONESIAN_MONTHS[i].toLowerCase();
    const shortMonth = SHORT_INDONESIAN_MONTHS[i];
    if (lower.includes(fullMonth) || new RegExp(`\\b${shortMonth}\\b`, 'i').test(lower)) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      const dayMatch = lower.match(/\b([0-2]?\d|3[01])\b/);
      const day = dayMatch && Number(dayMatch[1]) <= 31 ? parseInt(dayMatch[1], 10) : undefined;
      return { monthIndex: i, year, day };
    }
  }

  // Cek juga pada keseluruhan teks jika segmen pertama hanya tanggal
  const fullLower = text.toLowerCase();
  for (let i = 0; i < INDONESIAN_MONTHS.length; i++) {
    const fullMonth = INDONESIAN_MONTHS[i].toLowerCase();
    if (fullLower.includes(fullMonth)) {
      const yearMatch = fullLower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      return { monthIndex: i, year };
    }
  }

  // 2. Cek format YYYY-MM-DD atau ISO
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = isoMatch[3] ? parseInt(isoMatch[3], 10) : undefined;
    if (month >= 0 && month <= 11) {
      return { monthIndex: month, year, day };
    }
  }

  // 3. Cek format DD/MM/YYYY atau D/M/YYYY (format locale id-ID)
  const idDateMatch = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
  if (idDateMatch) {
    const day = parseInt(idDateMatch[1], 10);
    const month = parseInt(idDateMatch[2], 10) - 1;
    const year = parseInt(idDateMatch[3], 10);
    if (month >= 0 && month <= 11) {
      return { monthIndex: month, year, day };
    }
  }

  // 4. Fallback Date.parse
  const parsedDate = new Date(text);
  if (!isNaN(parsedDate.getTime())) {
    return {
      monthIndex: parsedDate.getMonth(),
      year: parsedDate.getFullYear(),
      day: parsedDate.getDate(),
    };
  }

  return null;
}

/**
 * Mengekstrak durasi bulan sewa (1 bulan, N bulan / 6 bulan, 12 bulan) dari record pembayaran sewa
 */
export function resolveRentDurationMonths(record: KostPaymentRecord): number {
  if (record.durationMonths && Number(record.durationMonths) > 0) {
    return Number(record.durationMonths);
  }
  if (record.paymentType === 'tahunan' || record.paymentType === 'tahunan_cicil') {
    return 12;
  }
  if (record.paymentType === 'bulanan') {
    return 1;
  }

  // Coba hitung dari selisih periodStart s/d periodEnd jika tipe beberapa_bulan
  const startParsed = parseMonthYearFromText(record.periodStart);
  const endParsed = parseMonthYearFromText(record.periodEnd);
  if (startParsed && endParsed) {
    const diff =
      (endParsed.year - startParsed.year) * 12 +
      (endParsed.monthIndex - startParsed.monthIndex) +
      1;
    if (diff > 0 && diff <= 60) {
      return diff;
    }
  }

  // Coba deteksi angka bulan pada notes atau paymentType
  const combined = `${record.paymentType || ''} ${record.notes || ''}`.toLowerCase();
  if (combined.includes('tahunan') || combined.includes('12 bulan')) return 12;
  if (combined.includes('6 bulan') || combined.includes('enam bulan')) return 6;
  const numBulanMatch = combined.match(/(\d+)\s*bulan/);
  if (numBulanMatch) {
    const n = parseInt(numBulanMatch[1], 10);
    if (n > 0 && n <= 60) return n;
  }

  return 1;
}

export interface RentStatusCalculationResult {
  status: 'lunas' | 'belum_bayar' | 'jatuh_tempo';
  hasSheetData: boolean;
  durationMonths: number;
  paymentType?: KostPaymentType;
  periodLabel: string;
  nextDueDate: Date | null;
  nextDueDateLabel: string;
  statusDetailText: string;
  latestRecord: KostPaymentRecord | null;
}

/**
 * Menghitung Status Pembayaran Sewa Kamar dari Data Google Sheet:
 * - Jika data di Google Sheet kosong untuk kamar tersebut -> otomatis 'belum_bayar' (atau 'jatuh_tempo' jika sudah masuk/lewat tanggal jatuh tempo).
 * - Jika membayar Bulanan (1 bulan) -> Lunas selama 1 bulan, dan otomatis berubah menjadi 'jatuh_tempo' setelah melewati tanggal jatuh tempo bulan berikutnya.
 * - Jika membayar 6 Bulan / N Bulan -> Lunas selama 6 / N bulan, dan otomatis berubah menjadi 'jatuh_tempo' setelah jatuh tempo bulan ke-(N+1).
 * - Jika membayar Tahunan (12 bulan) -> Lunas selama 12 bulan, dan setelah 12 bulan pada tanggal jatuh tempo otomatis berubah menjadi 'jatuh_tempo'.
 */
export function computeTenantRentStatusInfo(
  tenant: TenantProfile,
  kostPayments: KostPaymentRecord[],
  now: Date = new Date()
): RentStatusCalculationResult {
  const dueDay = tenant.rentDueDateDay || 5;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (!tenant.isOccupied || tenant.status === 'TERSEDIA') {
    return {
      status: 'belum_bayar',
      hasSheetData: false,
      durationMonths: 0,
      periodLabel: '-',
      nextDueDate: null,
      nextDueDateLabel: '-',
      statusDetailText: 'Kamar Tersedia (Belum Dihuni)',
      latestRecord: null,
    };
  }

  const targetRoom = normalizeRoomDigits(tenant.roomNumber);
  const targetLoc = tenant.kostLocation || 'acarya_1';

  // Ambil hanya pembayaran sewa yang valid (terverifikasi / tercatat di Google Sheet) untuk kamar ini
  const validRoomPayments = (kostPayments || []).filter((p) => {
    if (!p || isDummySeedPaymentId(p.id)) return false;
    if (p.status !== 'verified') return false;
    const pRoom = normalizeRoomDigits(p.roomNumber);
    const pLoc = p.kostLocation || 'acarya_1';
    return pRoom === targetRoom && pLoc === targetLoc;
  });

  // Jika data di Google Sheet masih kosong untuk kamar ini:
  if (validRoomPayments.length === 0) {
    const isPastDueThisMonth = now.getDate() >= dueDay;
    const currentMonthDueLabel = `${String(dueDay).padStart(2, '0')} ${INDONESIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    return {
      status: isPastDueThisMonth ? 'jatuh_tempo' : 'belum_bayar',
      hasSheetData: false,
      durationMonths: 0,
      periodLabel: `${INDONESIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`,
      nextDueDate: new Date(now.getFullYear(), now.getMonth(), dueDay),
      nextDueDateLabel: currentMonthDueLabel,
      statusDetailText: isPastDueThisMonth
        ? `Jatuh Tempo (${currentMonthDueLabel}) • Data Google Sheet belum ada pembayaran`
        : `Belum Bayar • Jatuh tempo tgl ${currentMonthDueLabel}`,
      latestRecord: null,
    };
  }

  // Evaluasi setiap pembayaran untuk mencari periode cakupan sewa paling akhir
  let bestResult: {
    record: KostPaymentRecord;
    durationMonths: number;
    startMonth: number;
    startYear: number;
    nextDueDate: Date;
    nextDueDateLabel: string;
  } | null = null;

  for (const rec of validRoomPayments) {
    const durationMonths = resolveRentDurationMonths(rec);
    const parsedStart =
      parseMonthYearFromText(rec.periodStart) ||
      parseMonthYearFromText(rec.dueDate) ||
      parseMonthYearFromText(rec.createdAt) || {
        monthIndex: now.getMonth(),
        year: now.getFullYear(),
      };

    const totalStartMonths = parsedStart.year * 12 + parsedStart.monthIndex;
    const nextCycleTotalMonths = totalStartMonths + durationMonths;
    const expYear = Math.floor(nextCycleTotalMonths / 12);
    const expMonth = nextCycleTotalMonths % 12;

    const maxDaysInExpMonth = new Date(expYear, expMonth + 1, 0).getDate();
    const clampedDueDay = Math.min(dueDay, maxDaysInExpMonth);
    const nextDueDate = new Date(expYear, expMonth, clampedDueDay, 0, 0, 0, 0);
    const nextDueDateLabel = `${String(clampedDueDay).padStart(2, '0')} ${INDONESIAN_MONTHS[expMonth]} ${expYear}`;

    if (!bestResult || nextDueDate.getTime() >= bestResult.nextDueDate.getTime()) {
      bestResult = {
        record: rec,
        durationMonths,
        startMonth: parsedStart.monthIndex,
        startYear: parsedStart.year,
        nextDueDate,
        nextDueDateLabel,
      };
    }
  }

  if (!bestResult) {
    const isPastDueThisMonth = now.getDate() >= dueDay;
    return {
      status: isPastDueThisMonth ? 'jatuh_tempo' : 'belum_bayar',
      hasSheetData: false,
      durationMonths: 0,
      periodLabel: '-',
      nextDueDate: null,
      nextDueDateLabel: '-',
      statusDetailText: 'Belum ada data pembayaran sewa',
      latestRecord: null,
    };
  }

  const { record, durationMonths, nextDueDate, nextDueDateLabel } = bestResult;
  const durationLabel =
    durationMonths === 12
      ? 'Tahunan (12 Bulan)'
      : durationMonths === 1
      ? 'Bulanan (1 Bulan)'
      : `${durationMonths} Bulan`;

  // Cek apakah hari ini masih berada dalam masa aktif sewa (sebelum tanggal jatuh tempo periode berikutnya)
  if (todayStart.getTime() < nextDueDate.getTime()) {
    // Jika sewa tahunan sistem cicilan yang belum lunas penuh, cek batas waktu pelunasan 3 bulan
    if (
      record.paymentType === 'tahunan_cicil' &&
      record.installmentInfo &&
      !record.installmentInfo.isFullyPaid
    ) {
      const parsedMaxPayoff = parseMonthYearFromText(record.installmentInfo.maxPayoffDate);
      if (parsedMaxPayoff && parsedMaxPayoff.day) {
        const payoffDeadline = new Date(
          parsedMaxPayoff.year,
          parsedMaxPayoff.monthIndex,
          parsedMaxPayoff.day,
          23,
          59,
          59
        );
        if (todayStart.getTime() > payoffDeadline.getTime()) {
          return {
            status: 'jatuh_tempo',
            hasSheetData: true,
            durationMonths,
            paymentType: record.paymentType,
            periodLabel: `${record.periodStart} s/d ${record.periodEnd}`,
            nextDueDate,
            nextDueDateLabel,
            statusDetailText: `Cicilan Tahunan Melewati Batas Pelunasan (${record.installmentInfo.maxPayoffDate})`,
            latestRecord: record,
          };
        }
      }
      return {
        status: 'belum_bayar',
        hasSheetData: true,
        durationMonths,
        paymentType: record.paymentType,
        periodLabel: `${record.periodStart} s/d ${record.periodEnd}`,
        nextDueDate,
        nextDueDateLabel,
        statusDetailText: `Cicilan Tahunan Aktif (Ke-${record.installmentInfo.installmentTerm}) • Batas Lunas: ${record.installmentInfo.maxPayoffDate}`,
        latestRecord: record,
      };
    }

    return {
      status: 'lunas',
      hasSheetData: true,
      durationMonths,
      paymentType: record.paymentType,
      periodLabel:
        record.periodStart && record.periodEnd && record.periodStart !== record.periodEnd
          ? `${record.periodStart} s/d ${record.periodEnd}`
          : record.periodStart || getCurrentPeriodMonthLabel(now),
      nextDueDate,
      nextDueDateLabel,
      statusDetailText: `Lunas ${durationLabel} • Berlaku s/d ${nextDueDateLabel}`,
      latestRecord: record,
    };
  }

  // Masa sewa (1 bulan / 6 bulan / 12 bulan) sudah berakhir dan telah mencapai/melewati tanggal jatuh tempo!
  return {
    status: 'jatuh_tempo',
    hasSheetData: true,
    durationMonths,
    paymentType: record.paymentType,
    periodLabel: `${INDONESIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    nextDueDate,
    nextDueDateLabel,
    statusDetailText: `Masa sewa ${durationLabel} telah berakhir (${nextDueDateLabel}) • Saatnya bayar periode baru`,
    latestRecord: record,
  };
}

export interface ElectricityStatusCalculationResult {
  status: 'lunas' | 'belum_bayar' | 'jatuh_tempo';
  hasSheetDataThisMonth: boolean;
  currentMonthLabel: string;
  dueDateLabel: string;
  statusDetailText: string;
  latestRecordThisMonth: ElectricityRecord | null;
  latestOverallRecord: ElectricityRecord | null;
}

/**
 * Menghitung Status Pembayaran Listrik dari Data Google Sheet:
 * - Menggunakan Tanggal & Bulan berjalan: Setiap bulan penyewa wajib membayar listrik.
 * - Jika di Google Sheet sudah ada pembayaran listrik terverifikasi untuk kamar ini pada Bulan & Tahun berjalan -> 'lunas'.
 * - Jika di Google Sheet belum ada pembayaran listrik untuk Bulan & Tahun berjalan (atau Google Sheet kosong):
 *   -> Jika tanggal hari ini >= tanggal jatuh tempo listrik -> 'jatuh_tempo'
 *   -> Jika tanggal hari ini < tanggal jatuh tempo listrik -> 'belum_bayar'
 */
export function computeTenantElectricityStatusInfo(
  tenant: TenantProfile,
  electricityPayments: ElectricityRecord[],
  now: Date = new Date()
): ElectricityStatusCalculationResult {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentMonthLabel = `${INDONESIAN_MONTHS[currentMonth]} ${currentYear}`;
  const dueDay = tenant.electricityDueDateDay || tenant.rentDueDateDay || 10;
  const dueDateLabel = `${String(dueDay).padStart(2, '0')} ${currentMonthLabel}`;

  if (!tenant.isOccupied || tenant.status === 'TERSEDIA') {
    return {
      status: 'belum_bayar',
      hasSheetDataThisMonth: false,
      currentMonthLabel,
      dueDateLabel: '-',
      statusDetailText: 'Kamar Tersedia (Belum Dihuni)',
      latestRecordThisMonth: null,
      latestOverallRecord: null,
    };
  }

  const targetRoom = normalizeRoomDigits(tenant.roomNumber);
  const targetLoc = tenant.kostLocation || 'acarya_1';

  const validRoomElec = (electricityPayments || []).filter((p) => {
    if (!p || isDummySeedPaymentId(p.id)) return false;
    if (p.status !== 'verified') return false;
    const pRoom = normalizeRoomDigits(p.roomNumber);
    const pLoc = p.kostLocation || 'acarya_1';
    return pRoom === targetRoom && pLoc === targetLoc;
  });

  const latestOverallRecord = validRoomElec.length > 0 ? validRoomElec[0] : null;

  // Cari apakah ada pembayaran listrik untuk Bulan & Tahun berjalan
  let matchedThisMonth: ElectricityRecord | null = null;
  for (const rec of validRoomElec) {
    const parsedPeriod = parseMonthYearFromText(rec.periodMonth);
    const parsedCreated = parseMonthYearFromText(rec.createdAt);
    const parsedDue = parseMonthYearFromText(rec.dueDate);

    const matchesPeriod =
      parsedPeriod &&
      parsedPeriod.monthIndex === currentMonth &&
      parsedPeriod.year === currentYear;

    const matchesCreated =
      !parsedPeriod &&
      parsedCreated &&
      parsedCreated.monthIndex === currentMonth &&
      parsedCreated.year === currentYear;

    const matchesDue =
      !parsedPeriod &&
      !parsedCreated &&
      parsedDue &&
      parsedDue.monthIndex === currentMonth &&
      parsedDue.year === currentYear;

    if (matchesPeriod || matchesCreated || matchesDue) {
      matchedThisMonth = rec;
      break;
    }
  }

  if (matchedThisMonth) {
    const nextMonthIdx = (currentMonth + 1) % 12;
    const nextYear = currentYear + (currentMonth === 11 ? 1 : 0);
    const nextDueLabel = `${String(dueDay).padStart(2, '0')} ${INDONESIAN_MONTHS[nextMonthIdx]} ${nextYear}`;
    return {
      status: 'lunas',
      hasSheetDataThisMonth: true,
      currentMonthLabel,
      dueDateLabel: nextDueLabel,
      statusDetailText: `Lunas Bulan ${currentMonthLabel} • Jadwal berikutnya: ${nextDueLabel}`,
      latestRecordThisMonth: matchedThisMonth,
      latestOverallRecord,
    };
  }

  // Belum ada pembayaran listrik untuk bulan berjalan di Google Sheet
  const isPastDueThisMonth = now.getDate() >= dueDay;
  return {
    status: isPastDueThisMonth ? 'jatuh_tempo' : 'belum_bayar',
    hasSheetDataThisMonth: false,
    currentMonthLabel,
    dueDateLabel,
    statusDetailText: isPastDueThisMonth
      ? `Jatuh Tempo Listrik Bulan ${currentMonthLabel} (Tgl ${dueDateLabel})`
      : `Belum Bayar Listrik Bulan ${currentMonthLabel} (Jatuh tempo: ${dueDateLabel})`,
    latestRecordThisMonth: null,
    latestOverallRecord,
  };
}

/**
 * Menyinkronkan & menghitung ulang activeRentStatus dan activeElectricityStatus seluruh kamar
 * secara dinamis berdasarkan data transaksi dari Google Sheet dan tanggal/bulan berjalan.
 */
export function recalculateTenantsWithSheetData(
  tenants: TenantProfile[],
  kostPayments: KostPaymentRecord[],
  electricityPayments: ElectricityRecord[],
  now: Date = new Date()
): TenantProfile[] {
  return tenants.map((t) => {
    const rentInfo = computeTenantRentStatusInfo(t, kostPayments, now);
    const elecInfo = computeTenantElectricityStatusInfo(t, electricityPayments, now);

    // Perbarui stand kWh terakhir jika ada data dari Google Sheet
    const updatedLastKwh =
      elecInfo.latestOverallRecord && elecInfo.latestOverallRecord.finalKwh > 0
        ? elecInfo.latestOverallRecord.finalKwh
        : t.lastInitialKwh;

    // Perbarui info cicilan tahunan dari transaksi terakhir jika ada, atau kosongkan jika tidak ada di Google Sheet
    let updatedAnnualInstallment = t.annualInstallment;
    if (!rentInfo.hasSheetData) {
      updatedAnnualInstallment = undefined;
    } else if (
      rentInfo.latestRecord &&
      rentInfo.latestRecord.paymentType === 'tahunan_cicil' &&
      rentInfo.latestRecord.installmentInfo
    ) {
      const info = rentInfo.latestRecord.installmentInfo;
      updatedAnnualInstallment = {
        isActive: !info.isFullyPaid,
        totalAnnualAmount: info.totalAnnualAmount,
        paidAmount: info.totalPaidSoFar,
        remainingAmount: info.remainingAmount,
        startDate: rentInfo.latestRecord.createdAt || new Date().toLocaleDateString('id-ID'),
        maxPayoffDate: info.maxPayoffDate,
        installmentTerm: info.installmentTerm,
        isFullyPaid: info.isFullyPaid,
        lastPaymentDate: rentInfo.latestRecord.createdAt,
      };
    }

    return {
      ...t,
      activeRentStatus: rentInfo.status,
      activeElectricityStatus: elecInfo.status,
      lastInitialKwh: updatedLastKwh,
      annualInstallment: updatedAnnualInstallment,
    };
  });
}
