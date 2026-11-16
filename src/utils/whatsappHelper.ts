import { KostPaymentRecord, ElectricityRecord, TenantProfile, AppSettings } from '../types';

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function cleanPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

export function buildWaLink(phone: string, message: string): string {
  const target = cleanPhoneNumber(phone);
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
}

/**
 * 1. Pengingat Jatuh Tempo Sewa Kost Bulanan / Tahunan
 */
export function generateRentReminderMessage(
  tenant: TenantProfile,
  settings: AppSettings,
  customDueDate?: string,
  customPeriod?: string,
  customAmount?: number
): string {
  const amount = customAmount || tenant.monthlyRentRate;
  const dueDate = customDueDate || `Tanggal ${tenant.rentDueDateDay} bulan ini`;
  const period = customPeriod || 'Bulan Berjalan';
  const branchName = tenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';

  return `Halo kak *${tenant.name}* (${branchName} - Kamar *${tenant.roomNumber}*) 👋

Kami dari pengelola *${branchName}* ingin mengingatkan perihal pembayaran sewa kost:

🏠 *Tagihan Sewa Kost (${branchName})*
• Lokasi: *${branchName}*
• Kamar: ${tenant.roomNumber}
• Periode: ${period}
• Nominal: *${formatRupiah(amount)}*
• Batas Jatuh Tempo: *${dueDate}*

💳 *Pilihan Pembayaran:*
1. Transfer Bank BRI: *${settings.briAccountNo}* a.n ${settings.briAccountName}
2. QRIS (Scan QR Code di aplikasi KostPay)
3. Tunai (Cash) langsung ke Pengelola

Silakan lakukan pembayaran dan unggah bukti transfer melalui aplikasi KostPay ya kak. 
Apabila sudah melakukan pembayaran, mohon abaikan pesan ini. Terima kasih banyak! 🙏✨`;
}

/**
 * 2. Pengingat Jatuh Tempo Tagihan Listrik Pulsa (kWh Awal - Akhir)
 */
export function generateElectricityReminderMessage(
  tenant: TenantProfile,
  settings: AppSettings,
  meterData?: {
    period: string;
    initialKwh: number;
    finalKwh: number;
    usageKwh: number;
    kwhCost: number;
    machineFee?: number;
    totalAmount: number;
    dueDate: string;
  }
): string {
  const branchName = tenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';

  if (meterData) {
    return `Halo kak *${tenant.name}* (${branchName} - Kamar *${tenant.roomNumber}*) 👋

Berikut kami sampaikan rincian tagihan listrik pulsa periode *${meterData.period}*:

⚡ *Rincian Penggunaan Listrik (${branchName}):*
• Lokasi: *${branchName}*
• Kamar: ${tenant.roomNumber}
• Stand Meter Awal: ${meterData.initialKwh} kWh
• Stand Meter Akhir: ${meterData.finalKwh} kWh
• Total Pemakaian: *${meterData.usageKwh} kWh* x Rp 2.000 = ${formatRupiah(meterData.kwhCost)}
────────────────────────────
💰 *TOTAL TAGIHAN: ${formatRupiah(meterData.totalAmount)}*
⏰ Batas Jatuh Tempo: *${meterData.dueDate}*

💳 *Metode Pembayaran:*
• Transfer BRI: *${settings.briAccountNo}* a.n ${settings.briAccountName}
• Tunai (Cash) langsung ke Pengelola

Bukti transfer dapat diupload di aplikasi KostPay. Terima kasih banyak kak! 🙏`;
  }

  // Generic reminder if meter not yet calculated
  return `Halo kak *${tenant.name}* (${branchName} - Kamar *${tenant.roomNumber}*) 👋

Pengingat untuk pencatatan dan pembayaran tagihan listrik pulsa *${branchName}* bulan ini (tarif Rp 2.000/kWh).
Batas jatuh tempo tagihan listrik adalah tanggal *${tenant.electricityDueDateDay}* bulan ini.

Silakan masukkan angka stand meter awal & akhir bulan di aplikasi KostPay untuk menghitung otomatis total tagihan dan melakukan pembayaran.

Terima kasih atas kerjasamanya! 🙏`;
}

/**
 * 3. Notifikasi Pengiriman Pembayaran oleh Anak Kost ke Admin
 */
export function generateTenantSubmissionNotification(
  payment: KostPaymentRecord | ElectricityRecord,
  isElectricity: boolean,
  settings: AppSettings
): string {
  const branchName = payment.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';

  if (isElectricity) {
    const el = payment as ElectricityRecord;
    return `Halo Pengelola *${settings.kostName}* 👋
Saya *${el.tenantName}* (${branchName} - Kamar *${el.roomNumber}*) telah melakukan konfirmasi pembayaran listrik:

⚡ *Rincian Listrik:*
• Lokasi: *${branchName}*
• Kamar: ${el.roomNumber}
• Periode: ${el.periodMonth}
• Meter: ${el.initialKwh} kWh ➔ ${el.finalKwh} kWh (${el.usageKwh} kWh)
• Total Bayar: *${formatRupiah(el.totalAmount)}*
• Metode: *${el.paymentMethod.toUpperCase()}*
• ID: ${el.id}

Bukti pembayaran telah saya lampirkan di aplikasi KostPay. Mohon dicek dan diverifikasi. Terima kasih! 🙏`;
  }

  const kp = payment as KostPaymentRecord;
  const tipeSewaStr =
    kp.paymentType === 'tahunan_cicil'
      ? `Tahunan (Sistem Cicilan Ke-${kp.installmentInfo?.installmentTerm || 1}) • Sisa: ${formatRupiah(kp.installmentInfo?.remainingAmount || 0)}`
      : kp.paymentType === 'tahunan'
      ? 'Tahunan Penuh (1 Tahun)'
      : kp.paymentType === 'beberapa_bulan'
      ? `${kp.durationMonths} Bulan`
      : 'Bulanan';

  const installmentNote = kp.installmentInfo
    ? `\n• Status Cicilan: ${kp.installmentInfo.isFullyPaid ? 'LUNAS (12 Bulan)' : `Belum Lunas (Sisa: ${formatRupiah(kp.installmentInfo.remainingAmount)})`}\n• Batas Pelunasan (Maks 3 Bulan): ${kp.installmentInfo.maxPayoffDate}`
    : '';

  return `Halo Pengelola *${settings.kostName}* 👋
Saya *${kp.tenantName}* (${branchName} - Kamar *${kp.roomNumber}*) telah melakukan konfirmasi pembayaran sewa kost:

🏠 *Rincian Sewa Kost:*
• Lokasi: *${branchName}*
• Kamar: ${kp.roomNumber}
• Tipe: ${tipeSewaStr}
• Periode: ${kp.periodStart} s/d ${kp.periodEnd}
• Total Bayar Saat Ini: *${formatRupiah(kp.totalAmount)}*${installmentNote}
• Metode: *${kp.paymentMethod.toUpperCase()}*
• ID: ${kp.id}

Bukti pembayaran telah saya upload di aplikasi KostPay. Mohon dicek dan diverifikasi. Terima kasih! 🙏`;
}

/**
 * 4. Pengingat Sisa Pelunasan Cicilan Sewa Tahunan (Wajib Lunas Maksimal 3 Bulan)
 */
export function generateInstallmentReminderMessage(
  tenant: TenantProfile,
  settings: AppSettings,
  installment: {
    totalAnnualAmount: number;
    paidAmount: number;
    remainingAmount: number;
    maxPayoffDate: string;
    daysLeft?: number;
    termNumber?: number;
  }
): string {
  const branchName = tenant.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
  let days = installment.daysLeft;
  if (days === undefined) {
    try {
      const parts = installment.maxPayoffDate.split('/');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        days = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
      } else {
        days = 30;
      }
    } catch {
      days = 30;
    }
  }

  const statusNote =
    days <= 0
      ? '⚠️ *PERINGATAN: Batas pelunasan 3 bulan telah jatuh tempo!*'
      : `⏳ *Sisa Waktu Pelunasan: ${days} hari lagi* (Batas maksimal 3 bulan sejak mulai sewa)`;

  return `Halo kak *${tenant.name}* (${branchName} - Kamar *${tenant.roomNumber}*) 👋

Kami dari pengelola *${branchName}* ingin menginformasikan status cicilan sewa tahunan kamar Anda:

🏠 *Status Cicilan Sewa Tahunan (${branchName}):*
• Lokasi: *${branchName}*
• Kamar: ${tenant.roomNumber}
• Total Biaya Sewa 1 Tahun: *${formatRupiah(installment.totalAnnualAmount)}*
• Total Sudah Dibayarkan: *${formatRupiah(installment.paidAmount)}*
• Sisa Kekurangan Belum Lunas: *${formatRupiah(installment.remainingAmount)}*
• Batas Akhir Pelunasan (Maks 3 Bulan): *${installment.maxPayoffDate}*

${statusNote}

Sesuai ketentuan kost kami, pembayaran sewa tahunan dengan sistem cicilan wajib dilunasi dalam batas waktu maksimal 3 bulan sejak awal periode sewa.

💳 *Pilihan Pembayaran:*
• Transfer Bank BRI: *${settings.briAccountNo}* a.n ${settings.briAccountName}
• Tunai (Cash) ke Pengelola Kost

Silakan lakukan pembayaran sisa cicilan dan unggah bukti transfer melalui aplikasi KostPay ya kak. Terima kasih banyak atas kerjasamanya! 🙏✨`;
}

export function formatReceiptNumber(payment: KostPaymentRecord | ElectricityRecord): string {
  if (payment.receiptNumber) return payment.receiptNumber;
  const branchCode = payment.kostLocation === 'acarya_2' ? 'AC2' : 'AC1';
  const year = new Date().getFullYear();
  const cleanId = payment.id.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `INV/${branchCode}/${year}/KMR${payment.roomNumber}/${cleanId}`;
}

/**
 * 5. Nota / Kwitansi Pembayaran Resmi (Otomatis Setelah Pembayaran Terverifikasi)
 */
export function generateVerifiedReceiptWaMessage(
  payment: KostPaymentRecord | ElectricityRecord,
  isElectricity: boolean,
  settings: AppSettings
): string {
  const branchName = payment.kostLocation === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
  const branchAddress =
    payment.kostLocation === 'acarya_2'
      ? 'Jl. Pulau Timor, Desa Padang Keling, Kabupaten Buleleng, Bali 81115'
      : 'Perumahan Banyuning Lestari Blok K1, Banyuning, Kec. Buleleng, Singaraja, Bali 81119';
  const receiptNo = formatReceiptNumber(payment);
  const verifiedTime = payment.verifiedAt || payment.createdAt || new Date().toLocaleString('id-ID');
  const methodLabel =
    payment.paymentMethod === 'bri'
      ? 'Transfer Bank BRI'
      : payment.paymentMethod === 'qris'
      ? 'QRIS (Scan QR Code)'
      : 'Tunai (Cash)';

  if (isElectricity) {
    const el = payment as ElectricityRecord;
    return `🧾 *NOTA PEMBAYARAN RESMI - ${branchName.toUpperCase()}*
📍 _${branchAddress}_
━━━━━━━━━━━━━━━━━━━━━━━━━━
• *No. Nota:* ${receiptNo}
• *ID Transaksi:* ${el.id}
• *Status:* ✅ *LUNAS & TERVERIFIKASI*
• *Waktu Verifikasi:* ${verifiedTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 *DATA PENGHUNI*
• Nama: *${el.tenantName}*
• Kamar: *Kamar ${el.roomNumber}* (${branchName})

⚡ *RINCIAN TAGIHAN LISTRIK*
• Periode Bulan: *${el.periodMonth}*
• Stand Meter: ${el.initialKwh} kWh ➔ ${el.finalKwh} kWh
• Pemakaian: *${el.usageKwh} kWh* × Rp 2.000
• Metode Bayar: ${methodLabel}
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL DIBAYAR: ${formatRupiah(el.totalAmount)}*
━━━━━━━━━━━━━━━━━━━━━━━━━━
Terima kasih kak *${el.tenantName}*, pembayaran listrik Anda telah *TERVERIFIKASI SAH* dan tercatat di sistem *${settings.kostName}*. Nota digital juga dapat dilihat & diunduh kapan saja di menu *Riwayat Bayar* aplikasi KostPay. 🙏✨`;
  }

  const kp = payment as KostPaymentRecord;
  const tipeSewaStr =
    kp.paymentType === 'tahunan_cicil'
      ? `Sewa Tahunan (Cicilan Ke-${kp.installmentInfo?.installmentTerm || 1})`
      : kp.paymentType === 'tahunan'
      ? 'Sewa 1 Tahun (Lunas Penuh)'
      : `${kp.durationMonths} Bulan`;

  const cicilanDetail = kp.installmentInfo
    ? `\n• Total Sewa 1 Tahun: ${formatRupiah(kp.installmentInfo.totalAnnualAmount)}\n• Akumulasi Terbayar: *${formatRupiah(kp.installmentInfo.totalPaidSoFar)}*\n• Sisa Tagihan: *${kp.installmentInfo.isFullyPaid ? 'Rp 0 (LUNAS)' : formatRupiah(kp.installmentInfo.remainingAmount)}*\n• Batas Pelunasan: ${kp.installmentInfo.maxPayoffDate}`
    : '';

  return `🧾 *NOTA PEMBAYARAN RESMI - ${branchName.toUpperCase()}*
📍 _${branchAddress}_
━━━━━━━━━━━━━━━━━━━━━━━━━━
• *No. Nota:* ${receiptNo}
• *ID Transaksi:* ${kp.id}
• *Status:* ✅ *${kp.installmentInfo && !kp.installmentInfo.isFullyPaid ? 'CICILAN TERVERIFIKASI' : 'LUNAS & TERVERIFIKASI'}*
• *Waktu Verifikasi:* ${verifiedTime}
━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 *DATA PENGHUNI*
• Nama: *${kp.tenantName}*
• Kamar: *Kamar ${kp.roomNumber}* (${branchName})

🏠 *RINCIAN SEWA KOST*
• Jenis Sewa: *${tipeSewaStr}*
• Periode Sewa: ${kp.periodStart} s/d ${kp.periodEnd}${cicilanDetail}
• Metode Bayar: ${methodLabel}
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL DIBAYAR: ${formatRupiah(kp.totalAmount)}*
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔏 *CAP RESMI: LUNAS & TERVERIFIKASI SAH*
_Disahkan oleh: ${settings.adminName || 'BOS ACARYA'}_

Terima kasih kak *${kp.tenantName}*, pembayaran sewa kost Anda telah *TERVERIFIKASI SAH* dan tercatat di sistem *${settings.kostName}*. Nota digital berstempel LUNAS juga dapat dilihat & diunduh kapan saja di menu *Riwayat Bayar* aplikasi KostPay. 🙏✨`;
}

/**
 * Mengirim Nota Resmi secara otomatis ke nomor WhatsApp penyewa:
 * 1. Jika Token WhatsApp Gateway (Fonnte) diisi di pengaturan, kirim otomatis di latar belakang (tanpa perlu klik kirim di WA).
 * 2. Jika belum ada token gateway, otomatis membuka ruang chat WhatsApp penyewa dengan isi Nota Resmi yang sudah siap kirim.
 */
export async function autoDispatchVerifiedReceiptToTenant(
  payment: KostPaymentRecord | ElectricityRecord,
  isElectricity: boolean,
  tenantPhone: string,
  settings: AppSettings
): Promise<{ method: 'gateway' | 'wa_direct' | 'no_phone'; success: boolean; message: string }> {
  const cleanTarget = tenantPhone ? cleanPhoneNumber(tenantPhone) : '';
  if (!cleanTarget || cleanTarget.length < 9) {
    return {
      method: 'no_phone',
      success: false,
      message: 'Nomor WhatsApp penyewa belum terdaftar di data kamar.',
    };
  }

  const message = generateVerifiedReceiptWaMessage(payment, isElectricity, settings);
  const gatewayToken = (settings.waGatewayToken || '').trim();

  // Jika Admin mengisi Token Fonnte WhatsApp Gateway, kirim otomatis di background
  if (gatewayToken) {
    try {
      const formData = new FormData();
      formData.append('target', cleanTarget);
      formData.append('message', message);

      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: gatewayToken,
        },
        body: formData,
      });
      const json = await res.json();
      if (json && json.status === true) {
        return {
          method: 'gateway',
          success: true,
          message: `Nota Resmi otomatis terkirim ke WhatsApp ${payment.tenantName} (${tenantPhone}) via WhatsApp Gateway!`,
        };
      }
    } catch (err) {
      console.warn('Fallback ke WhatsApp Direct karena Gateway gagal:', err);
    }
  }

  // Default: Otomatis buka WhatsApp langsung ke nomor penyewa dengan pesan Nota Resmi
  const waUrl = buildWaLink(cleanTarget, message);
  try {
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  } catch (e) {
    console.warn('Popup WA diblokir browser:', e);
  }

  return {
    method: 'wa_direct',
    success: true,
    message: `Nota Resmi otomatis disiapkan & diarahkan ke WhatsApp ${payment.tenantName} (${tenantPhone})!`,
  };
}
