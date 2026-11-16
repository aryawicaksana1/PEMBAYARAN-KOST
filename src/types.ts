export type PaymentMethod = 'bri' | 'qris' | 'cash';

export type KostLocation = 'acarya_1' | 'acarya_2';

export interface KostBranchInfo {
  id: KostLocation;
  name: string;
  shortName: string;
  address: string;
  description: string;
}

export const KOST_BRANCHES: KostBranchInfo[] = [
  {
    id: 'acarya_1',
    name: 'Acarya Kost 1',
    shortName: 'Kost 1',
    address: 'Perumahan Banyuning Lestari Blok K1, Banyuning, Kec. Buleleng, Singaraja, Bali 81119',
    description: 'Fasilitas Lengkap, Kamar Mandi Dalam, Parkir Luas',
  },
  {
    id: 'acarya_2',
    name: 'Acarya Kost 2',
    shortName: 'Kost 2',
    address: 'Jl. Pulau Timor, Desa Padang Keling, Kabupaten Buleleng, Bali 81115',
    description: 'Suasana Tenang, Dekat Kampus & Perkantoran',
  },
];

export function getKostName(loc?: KostLocation | string): string {
  if (loc === 'acarya_2') return 'Acarya Kost 2';
  return 'Acarya Kost 1';
}

export type KostPaymentType = 'bulanan' | 'beberapa_bulan' | 'tahunan' | 'tahunan_cicil';

export type PaymentStatus = 'pending' | 'verified' | 'rejected';

export interface AnnualInstallmentInfo {
  isInstallment: boolean;
  totalAnnualAmount: number;     // Total sewa 1 tahun (12x tarif bulanan)
  paidThisTerm: number;          // Nominal yang dibayar pada transaksi ini
  totalPaidSoFar: number;        // Total yang sudah dibayarkan sejauh ini
  remainingAmount: number;       // Sisa kekurangan yang harus dilunasi
  installmentTerm: number;       // Cicilan ke berapa (1, 2, 3...)
  maxPayoffDate: string;         // Batas akhir pelunasan (maksimal 3 bulan)
  isFullyPaid: boolean;          // true jika remainingAmount <= 0
}

export interface TenantAnnualInstallment {
  isActive: boolean;
  totalAnnualAmount: number;
  paidAmount: number;
  remainingAmount: number;
  startDate: string;
  maxPayoffDate: string;         // Batas akhir pelunasan maksimal 3 bulan
  installmentTerm: number;
  isFullyPaid: boolean;
  lastPaymentDate?: string;
}

export interface KostPaymentRecord {
  id: string;
  kostLocation?: KostLocation;
  tenantName: string;
  roomNumber: string;
  phone: string;
  paymentType: KostPaymentType;
  durationMonths: number;
  monthlyRate: number;
  totalAmount: number;
  periodStart: string; // e.g. "Oktober 2026"
  periodEnd: string;   // e.g. "Desember 2026"
  dueDate: string;     // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  proofImage?: string; // base64 / data URL
  notes?: string;
  status: PaymentStatus;
  createdAt: string;
  verifiedAt?: string;
  receiptNumber?: string;
  syncedToSheets?: boolean;
  installmentInfo?: AnnualInstallmentInfo;
}

export interface ElectricityRecord {
  id: string;
  kostLocation?: KostLocation;
  tenantName: string;
  roomNumber: string;
  phone: string;
  periodMonth: string; // e.g. "September 2026"
  initialKwh: number;
  finalKwh: number;
  usageKwh: number;
  ratePerKwh: number;  // 2000
  machineFee?: number; // 0 (tidak dikenakan biaya mesin)
  totalAmount: number;
  dueDate: string;     // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  proofImage?: string;
  meterPhoto?: string;
  notes?: string;
  status: PaymentStatus;
  createdAt: string;
  verifiedAt?: string;
  receiptNumber?: string;
  syncedToSheets?: boolean;
}

export interface FacilityMaintenance {
  id: string;
  kostLocation?: KostLocation;
  title: string;
  category: 'kebersihan' | 'pompa_air' | 'wifi' | 'listrik_lorong' | 'dapur' | 'sampah';
  frequency: 'mingguan';
  targetDay: string; // e.g. "Setiap Sabtu"
  nextDate: string;  // YYYY-MM-DD
  lastCheckedDate: string;
  status: 'selesai' | 'terjadwal' | 'dalam_proses';
  notes: string;
  pic: string;
}

export interface RoomInspection {
  id: string;
  kostLocation?: KostLocation;
  roomNumber: string;
  tenantName: string;
  frequency: '6_bulanan';
  lastInspectionDate: string;
  nextInspectionDate: string; // +6 months
  status: 'layak' | 'perlu_perbaikan' | 'terjadwal';
  wallCondition: string;
  plumbingCondition: string;
  ventilationCondition: string;
  doorAndLockCondition: string;
  notes: string;
}

export interface AcServiceRecord {
  id: string;
  kostLocation?: KostLocation;
  roomNumber: string;
  tenantName: string;
  acBrand: string;
  frequency: '6_bulanan';
  lastServiceDate: string;
  nextServiceDate: string; // +6 months
  status: 'normal' | 'kurang_dingin' | 'perlu_dicuci' | 'rusak';
  lastTechnician?: string;
  notes?: string;
}

export interface TenantProfile {
  id: string;
  kostLocation?: KostLocation;
  name: string;
  roomNumber: string;
  phone: string;
  parentPhone?: string; // No. WA Orang Tua
  origin?: string;      // Asal daerah / kota
  checkInDate?: string; // Tanggal Masuk (e.g. "04 Juli 2026")
  checkOutDate?: string;// Tanggal Keluar (e.g. "-")
  status?: 'DIHUNI' | 'TERSEDIA';
  isOccupied?: boolean;
  monthlyRentRate: number;
  rentDueDateDay: number; // e.g. 5 (tiap tgl 5)
  electricityDueDateDay: number; // e.g. 10 (tiap tgl 10)
  activeRentStatus: 'lunas' | 'belum_bayar' | 'jatuh_tempo';
  activeElectricityStatus: 'lunas' | 'belum_bayar' | 'jatuh_tempo';
  lastInitialKwh?: number;
  username?: string;
  password?: string;
  annualInstallment?: TenantAnnualInstallment;
}

export type AuthRole = 'admin' | 'tenant';

export interface AuthSession {
  role: AuthRole;
  tenantId?: string;
  username: string;
  name: string;
  roomNumber?: string;
  kostLocation?: KostLocation;
}

export interface RoomRateSyncItem {
  kostLocation: KostLocation;
  roomNumber: string;
  tenantName?: string;
  monthlyRentRate: number;
  machineFee?: number;
  rentDueDateDay?: number;
  notes?: string;
  username?: string;
  password?: string;
  phone?: string;
  isOccupied?: boolean;
}

export interface AppSettings {
  adminPhone: string;
  adminName: string;
  kostName: string;
  kostAddress: string;
  briAccountNo: string;
  briAccountName: string;
  qrisImageUrl?: string;
  ratePerKwh: number;
  machineFee?: number;
  googleWebAppUrl: string;
  lastRatesSyncedAt?: string;
  waGatewayToken?: string;
  autoSendWaReceipt?: boolean;
}
