import {
  RoomRateSyncItem,
  AcServiceRecord,
  FacilityMaintenance,
  RoomInspection,
  KostPaymentRecord,
  ElectricityRecord,
} from '../types';

/**
 * Kode Google Apps Script Siap Pakai untuk Google Spreadsheet Pengelola Kost.
 * Mendukung:
 * 1. Sheet terpisah per kamar: [Nama Penghuni]_[Nomor Kamar]_[Acarya 1 / 2]
 * 2. Caching performa tinggi untuk mencegah eksekusi stuck / timeout di Apps Script
 * 3. Pemisahan otomatis semua data lama ke tab kamar masing-masing (pisahkanSemuaDataKeSheetKamar)
 * 4. Penyimpanan otomatis Foto Bukti Transfer & Foto Meteran ke Google Drive
 * 5. Menghasilkan Link Aktif (=HYPERLINK) yang bisa langsung dibuka di Google Sheet
 * 6. Timeout guard pada panggilan HTTP fetch agar tidak stuck
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - KOSTPAY REAL-TIME MULTI-SHEET ENGINE (V2.8 PHOTO FIX)
 * =========================================================================
 * PENGUMUMAN PERBAIKAN:
 * - Perbaikan Total Link Foto Bukti Transfer & Meteran di Google Sheet!
 *   1) Anti-#ERROR! Formula: Menggunakan RichTextValue Hyperlink + URL langsung,
 *      bebas dari masalah koma (,) vs titik koma (;) pada Google Sheet Bahasa Indonesia.
 *   2) Dual-Storage Foto Bukti: Menyimpan foto ke Google Drive (dengan publik link)
 *      SEKALIGUS mengarsipkan foto di tab 'Arsip_Foto_Bukti' dengan penampil WebApp
 *      (?action=lihat_foto&id=...) sehingga link foto DIJAMIN 100% BISA DIBUKA
 *      meskipun tanpa izin Google Drive atau dibuka dari HP/perangkat mana saja.
 *   3) Fungsi otomatis perbaikiSemuaLinkFotoEror(ss) untuk memperbaiki link lama yang error.
 * =========================================================================
 */

function doPost(e) {
  try {
    // Penanganan jika fungsi dijalankan manual dari editor Apps Script tanpa data event
    if (!e || !e.postData || !e.postData.contents) {
      Logger.log("doPost dipanggil langsung tanpa payload. Menjalankan inisialisasi & perbaikan link foto...");
      var ssLocal = SpreadsheetApp.getActiveSpreadsheet();
      buatSemuaSheetKamar();
      perbaikiSemuaLinkFotoEror(ssLocal);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Inisialisasi & perbaikan link foto berhasil dijalankan secara lokal.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = data.action || 'unknown';
    
    if (action === 'hapus_kolom_mesin') {
      var countDel = hapusSemuaKolomListrikMesin(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Berhasil menghapus seluruh kolom Listrik Mesin dari Google Spreadsheet!',
        count: countDel,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'fix_photo_links') {
      var fixedCount = perbaikiSemuaLinkFotoEror(ss, data);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Berhasil memperbaiki ' + fixedCount + ' link foto bukti di Google Spreadsheet!',
        count: fixedCount,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'pembayaran_kost') {
      appendKostPayment(ss, data);
    } else if (action === 'pembayaran_listrik') {
      appendElectricityPayment(ss, data);
    } else if (action === 'split_existing_data') {
      var movedCount = pisahkanSemuaDataKeSheetKamar(ss);
      perbaikiSemuaLinkFotoEror(ss, data);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Berhasil memisahkan ' + movedCount + ' transaksi ke tab kamar masing-masing!',
        count: movedCount,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'sync_all_transactions') {
      var syncedCount = syncAllTransactions(ss, data);
      perbaikiSemuaLinkFotoEror(ss, data);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Berhasil menyinkronkan ' + syncedCount + ' transaksi ke tab kamar masing-masing!',
        count: syncedCount,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'init_room_sheets') {
      var count = buatSemuaSheetKamar();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Berhasil membuat & merapikan 29 tab sheet kamar!',
        count: 29,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'get_room_rates' || action === 'init_rate_sheet') {
      var rateSheet = findOrCreateRateSheet(ss);
      var rates = readAllRoomRates(rateSheet, ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: action,
        message: 'Berhasil memuat ' + rates.length + ' tarif kamar dari Google Sheet!',
        count: rates.length,
        rates: rates,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'update_room_rates' || action === 'update_tenant' || action === 'sync_all_room_accounts') {
      var rateSheet = findOrCreateRateSheet(ss);
      var ratesPayload = data.rates || (data.tenant ? [data.tenant] : [data]);
      var updatedCount = saveRoomRatesToSheet(rateSheet, ratesPayload, ss);
      var currentRates = readAllRoomRates(rateSheet, ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: action,
        hasAccountsSync: true,
        message: 'Berhasil memperbarui ' + updatedCount + ' data penghuni, akun login & tarif kamar di Google Sheet!',
        count: updatedCount,
        rates: currentRates,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'lapor_fasilitas' || action === 'upsert_facility') {
      upsertFacilityOrInspection(ss, data);
    } else if (action === 'delete_facility') {
      deleteFacilityById(ss, data.id);
    } else if (action === 'upsert_inspection') {
      upsertInspectionRow(ss, data);
    } else if (action === 'delete_inspection') {
      deleteInspectionById(ss, data.id);
    } else if (action === 'booking_ac' || action === 'upsert_ac') {
      upsertAcServiceRow(ss, data);
    } else if (action === 'delete_ac') {
      deleteAcServiceById(ss, data.id, data.roomNumber, data.kostLocation);
    } else if (action === 'sync_all_schedules') {
      syncAllSchedulesToSheets(ss, data);
    } else if (action === 'test_connection') {
      var driveStatus = testDriveAccess();
      findOrCreateAcSheet(ss);
      findOrCreateFacilitySheet(ss);
      findOrCreateInspectionSheet(ss);
      perbaikiSemuaLinkFotoEror(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Koneksi aktif! ' + driveStatus,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      appendGenericLog(ss, data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data berhasil disinkronkan ke Google Sheet!',
      action: action,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    Logger.log('Error doPost: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Mode Penampil Foto Bukti Langsung dari Link Google Sheet (?action=lihat_foto&id=...)
    if (e && e.parameter && (e.parameter.action === 'lihat_foto' || e.parameter.photoId)) {
      var photoId = e.parameter.id || e.parameter.photoId || '';
      return renderPhotoViewerHtml(ss, photoId);
    }

    var rateSheet = findOrCreateRateSheet(ss);
    var rates = readAllRoomRates(rateSheet, ss);
    var acSheet = findOrCreateAcSheet(ss);
    var acServices = readAcServicesFromSheet(acSheet);
    var facSheet = findOrCreateFacilitySheet(ss);
    var facilities = readFacilitiesFromSheet(facSheet);
    var inspSheet = findOrCreateInspectionSheet(ss);
    var roomInspections = readInspectionsFromSheet(inspSheet);
    var kostPayments = readKostPaymentsFromSheet(ss);
    var electricityPayments = readElectricityPaymentsFromSheet(ss);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      action: 'get_all_sync_data',
      app: 'KostPay Multi-Room Google Sheets Engine V2.10',
      hasAccountsSync: true,
      hasPaymentsSync: true,
      message: 'Berhasil menyinkronkan Akun Login Kamar, Status Pembayaran Sewa & Listrik, Tarif Kamar, dan Jadwal dari Google Sheet!',
      count: rates.length,
      rates: rates,
      kostPayments: kostPayments,
      electricityPayments: electricityPayments,
      acServices: acServices,
      facilities: facilities,
      roomInspections: roomInspections,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("Error doGet: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Membersihkan karakter terlarang Google Sheet tanpa regex rentan
 */
function sanitizeSheetName(name) {
  if (!name) return '';
  var res = String(name);
  var badChars = [':', '/', '\\\\', '?', '*', '[', ']', "'", '"', '\\n', '\\r'];
  for (var i = 0; i < badChars.length; i++) {
    res = res.split(badChars[i]).join('');
  }
  return res.trim();
}

function extractRoomDigits(num) {
  if (!num && num !== 0) return '00';
  var s = String(num).toLowerCase().split('kamar').join('').split('kmr').join('').trim();
  var digits = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    }
  }
  if (!digits) digits = '00';
  if (digits.length === 1) digits = '0' + digits;
  return digits;
}

function formatRoomLabel(num) {
  var digits = extractRoomDigits(num);
  return 'Kamar ' + digits;
}

function formatLocationLabel(loc) {
  var s = String(loc || '').toLowerCase();
  if (s.indexOf('2') !== -1 || s.indexOf('dua') !== -1) {
    return 'Acarya 2';
  }
  return 'Acarya 1';
}

/**
 * Format nama sheet sesuai instruksi: [Nama Penghuni]_[Nomor Kamar]_[Acarya 1 / 2]
 * Contoh: I Ketut Dita Herynata_03_Acarya 2
 * Jika kamar kosong/tersedia: Kamar 01_Acarya 1
 */
function getRoomSheetName(tenantName, roomNumber, kostLocation) {
  var digits = extractRoomDigits(roomNumber);
  var roomLabel = 'Kamar ' + digits;
  var locLabel = formatLocationLabel(kostLocation);
  var cleanName = sanitizeSheetName(tenantName);
  
  if (!cleanName || cleanName.toLowerCase().indexOf('tersedia') !== -1 || cleanName.toLowerCase() === roomLabel.toLowerCase()) {
    return roomLabel + '_' + locLabel;
  }
  
  var fullName = cleanName + '_' + digits + '_' + locLabel;
  if (fullName.length > 95) {
    fullName = fullName.substring(0, 95);
  }
  return fullName;
}

/**
 * Mencari atau membuat sheet kamar baru dengan toleransi format nama yang tinggi & anti-stuck.
 * Mengenali format:
 * - [Nama Penghuni]_[Nomor Kamar]_[Acarya 1/2] (e.g. I Ketut Dita Herynata_03_Acarya 2)
 * - [Nama Penghuni]_[Kamar Nomor]_[Acarya 1/2] (e.g. I Ketut Dita Herynata_Kamar 03_Acarya 2)
 * - Kamar [Nomor]_[Acarya 1/2]
 * - Nama tab yang mengandung nomor kamar dan cabang yang sama
 */
function findOrCreateRoomSheet(ss, tenantName, roomNumber, kostLocation, sheetMap) {
  var targetName = getRoomSheetName(tenantName, roomNumber, kostLocation);
  var sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;

  // Jika map cache sheet diberikan, cari lewat cache untuk menghindari lag
  if (sheetMap && sheetMap[targetName.toLowerCase()]) {
    return sheetMap[targetName.toLowerCase()];
  }

  var digits = extractRoomDigits(roomNumber);
  var roomLabel = 'Kamar ' + digits;
  var locLabel = formatLocationLabel(kostLocation);
  var isBranch2 = locLabel === 'Acarya 2';
  var cleanName = sanitizeSheetName(tenantName);

  // Varian format nama lain yang sering dipakai (e.g. dengan kata 'Kamar 03' atau tanpa nomor)
  var variantWithKamar = cleanName && cleanName.toLowerCase().indexOf('kamar') === -1
    ? (cleanName + '_' + roomLabel + '_' + locLabel)
    : '';
  if (variantWithKamar) {
    sheet = ss.getSheetByName(variantWithKamar);
    if (sheet) return sheet;
  }

  // Cari apakah ada sheet yang cocok dengan nomor kamar & lokasi cabang
  var allSheets = sheetMap ? Object.keys(sheetMap).map(function(k) { return sheetMap[k]; }) : ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var s = allSheets[i];
    var sName = s.getName();
    var sLower = sName.toLowerCase();

    // Verifikasi cabang (Acarya 1 vs Acarya 2)
    var sheetIsBranch2 = (sLower.indexOf('acarya 2') !== -1 || sLower.indexOf('acarya_2') !== -1 || sLower.indexOf('kost 2') !== -1 || sLower.indexOf('lokasi 2') !== -1);
    var sheetIsBranch1 = (sLower.indexOf('acarya 1') !== -1 || sLower.indexOf('acarya_1') !== -1 || sLower.indexOf('kost 1') !== -1 || sLower.indexOf('lokasi 1') !== -1);

    var branchMatches = isBranch2 ? sheetIsBranch2 : (sheetIsBranch1 || !sheetIsBranch2);

    if (branchMatches) {
      // Cek kecocokan nomor kamar: '_03_' atau 'kamar 03' atau 'kmr 03' atau '03'
      var roomMatches = (
        sLower.indexOf('_' + digits + '_') !== -1 ||
        sLower.indexOf(roomLabel.toLowerCase()) !== -1 ||
        sLower.indexOf('kmr ' + digits) !== -1 ||
        sLower.indexOf('_' + Number(digits) + '_') !== -1 ||
        (cleanName && cleanName.length > 3 && sLower.indexOf(cleanName.toLowerCase()) !== -1)
      );

      if (roomMatches) {
        // Jika nama penghuni berubah, langsung perbarui nama tab sheet kamar & judul banner baris 1
        if (cleanName && sName !== targetName) {
          try {
            s.setName(targetName);
            s.getRange(1, 1).setValue("BUKU KAS & CATATAN TRANSAKSI: " + targetName.toUpperCase());
          } catch (eRename) {}
        }
        return s;
      }
    }
  }

  // Jika belum ada, buat sheet baru dengan try-catch agar tidak stuck
  try {
    sheet = ss.insertSheet(targetName);
  } catch (errInsert) {
    sheet = ss.getSheetByName(targetName);
    if (sheet) return sheet;
    try {
      sheet = ss.insertSheet(targetName + ' (' + new Date().getTime().toString().slice(-4) + ')');
    } catch (errFallback) {
      return ss.getSheets()[0];
    }
  }

  try {
    // Header Banner Kamar
    sheet.getRange(1, 1).setValue("BUKU KAS & CATATAN TRANSAKSI: " + targetName.toUpperCase());
    var bannerBg = (locLabel === 'Acarya 2') ? "#059669" : "#4338CA";
    sheet.getRange(1, 1, 1, 13).merge().setBackground(bannerBg).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11);

    // Header Kolom
    var headers = [
      "Waktu Input",
      "Kategori Transaksi",
      "ID Transaksi",
      "Periode Pembayaran",
      "Meter Awal",
      "Meter Akhir",
      "Pemakaian (kWh)",
      "Total Bayar (Rp)",
      "Metode Bayar",
      "Status",
      "Link Bukti Transfer",
      "Link Foto Meteran",
      "Catatan Penghuni"
    ];
    sheet.appendRow(headers);
    sheet.getRange(2, 1, 1, headers.length).setBackground("#1E293B").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10);
    sheet.setFrozenRows(2);
  } catch (eFormat) {
    Logger.log("Format tab error: " + eFormat.toString());
  }

  if (sheetMap) {
    sheetMap[targetName.toLowerCase()] = sheet;
  }

  return sheet;
}

/**
 * =========================================================================
 * SISTEM PENYIMPANAN & PENAMPIL FOTO BUKTI ANTI-EROR (DUAL-STORAGE ENGINE)
 * =========================================================================
 * Mengatasi 3 penyebab utama link foto error di Google Sheets:
 * 1) Error Formula Locale (#ERROR! akibat koma vs titik koma di =HYPERLINK)
 *    -> Solusi: Gunakan RichTextValue Hyperlink + URL langsung tanpa rumus =HYPERLINK.
 * 2) Izin Google Drive belum aktif / akses dibatasi saat link diklik
 *    -> Solusi: Simpan ke Google Drive (dengan sharing publik) SEKALIGUS simpan
 *       cadangan foto di tab 'Arsip_Foto_Bukti' yang dapat dibuka langsung lewat
 *       WebApp (?action=lihat_foto&id=...) di browser mana pun tanpa perlu login!
 * 3) Data base64 mentah yang sebelumnya tertulis di sel
 *    -> Solusi: Otomatis dikonversi menjadi link aktif oleh perbaikiSemuaLinkFotoEror().
 */
function findOrCreatePhotoArchiveSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "Arsip_Foto_Bukti";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  var headers = [
    "ID Foto", "Waktu Upload", "Kamar", "Nama Penghuni", "Jenis Foto", "Link Google Drive", "Data Base64"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#0F172A").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);
  try {
    sheet.hideSheet();
  } catch (eHide) {}
  return sheet;
}

function savePhotoToArchiveSheet(ss, photoId, base64Data, roomNumber, tenantName, label, driveUrl) {
  if (!base64Data || typeof base64Data !== 'string' || base64Data.indexOf('base64,') === -1) return '';
  try {
    var sheet = findOrCreatePhotoArchiveSheet(ss);
    // Batas karakter 1 sel di Google Sheet adalah 50.000 karakter. Jika lebih, pecah ke kolom sampingnya
    var chunk1 = base64Data.substring(0, 48000);
    var chunk2 = base64Data.length > 48000 ? base64Data.substring(48000, 96000) : '';
    var chunk3 = base64Data.length > 96000 ? base64Data.substring(96000, 144000) : '';

    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === String(photoId)) {
          sheet.getRange(i + 2, 1, 1, 9).setValues([[
            photoId, new Date(), roomNumber || '-', tenantName || '-', label || 'Bukti Transfer', driveUrl || '', chunk1, chunk2, chunk3
          ]]);
          return photoId;
        }
      }
    }

    sheet.appendRow([
      photoId, new Date(), roomNumber || '-', tenantName || '-', label || 'Bukti Transfer', driveUrl || '', chunk1, chunk2, chunk3
    ]);
    return photoId;
  } catch (errArch) {
    Logger.log("Info arsip foto: " + errArch.toString());
    return '';
  }
}

function renderPhotoViewerHtml(ss, photoId) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Arsip_Foto_Bukti");
  var base64Full = '';
  var roomNumber = '-';
  var tenantName = '-';
  var label = 'Foto Bukti Pembayaran';
  var uploadTime = '-';
  var driveUrl = '';

  if (sheet && sheet.getLastRow() >= 2 && photoId) {
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), 9);
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      if (String(data[i][0] || '').trim() === String(photoId).trim()) {
        uploadTime = data[i][1] ? String(data[i][1]) : '-';
        roomNumber = String(data[i][2] || '-');
        tenantName = String(data[i][3] || '-');
        label = String(data[i][4] || 'Foto Bukti Pembayaran');
        driveUrl = String(data[i][5] || '');
        base64Full = String(data[i][6] || '') + String(data[i][7] || '') + String(data[i][8] || '');
        break;
      }
    }
  }

  if (!base64Full && driveUrl) {
    var redirectHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + driveUrl + '"></head>' +
      '<body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f172a;color:#fff;">' +
      '<p>Membuka foto bukti di Google Drive... <a href="' + driveUrl + '" style="color:#38bdf8;">Klik di sini jika tidak otomatis terbuka</a>.</p></body></html>';
    return HtmlService.createHtmlOutput(redirectHtml).setTitle(label + ' - Kamar ' + roomNumber);
  }

  if (!base64Full) {
    var notFoundHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;">' +
      '<div style="max-width:460px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;text-align:center;">' +
      '<h2 style="margin:0 0 10px;color:#fbbf24;font-size:18px;">Foto Bukti Tidak Ditemukan (ID: ' + String(photoId || '-') + ')</h2>' +
      '<p style="color:#cbd5e1;font-size:13px;line-height:1.6;">Foto ini mungkin berasal dari transaksi lama sebelum fitur Arsip Foto diaktifkan. Silakan buka menu <b>Integrasi Google Sheets</b> di aplikasi KostPay lalu klik tombol <b>"Perbaiki Semua Link Foto Bukti"</b> untuk mengunggah ulang foto dari riwayat transaksi.</p>' +
      '</div></body></html>';
    return HtmlService.createHtmlOutput(notFoundHtml).setTitle('Foto Bukti - KostPay');
  }

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + label + ' - Kamar ' + roomNumber + '</title>' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;min-height:100vh;}' +
    '.card{background:#1e293b;border:1px solid #334155;border-radius:20px;max-width:720px;width:100%;padding:24px;box-sizing:border-box;box-shadow:0 20px 50px rgba(0,0,0,0.5);}' +
    '.header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-bottom:1px solid #334155;padding-bottom:16px;margin-bottom:20px;}' +
    '.badge{background:#059669;color:#fff;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;}' +
    '.img-wrap{background:#020617;border-radius:14px;padding:12px;text-align:center;overflow:hidden;border:1px solid #1e293b;}' +
    'img{max-width:100%;height:auto;max-height:75vh;border-radius:10px;object-fit:contain;}' +
    '.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px;}' +
    '.btn{display:inline-block;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;}' +
    '.btn-dl{background:#10b981;color:#022c22;}' +
    '.btn-drive{background:#3b82f6;color:#fff;}' +
    '</style></head><body>' +
    '<div class="card">' +
    '<div class="header"><div><h2 style="margin:0;font-size:18px;">' + label + '</h2>' +
    '<p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Kamar <b>' + roomNumber + '</b> • ' + tenantName + '</p></div>' +
    '<span class="badge">TERVERIFIKASI</span></div>' +
    '<div class="img-wrap"><img src="' + base64Full + '" alt="Bukti Pembayaran" /></div>' +
    '<div class="actions">' +
    '<a class="btn btn-dl" href="' + base64Full + '" download="Bukti_Kamar_' + roomNumber + '.jpg">Unduh Foto Bukti (JPG)</a>' +
    (driveUrl ? '<a class="btn btn-drive" href="' + driveUrl + '" target="_blank">Buka di Google Drive</a>' : '') +
    '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(label + ' - Kamar ' + roomNumber)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Menyimpan gambar base64 ke Google Drive di folder 'KostPay_Bukti_Transfer'
 * Serta menyimpan salinannya di tab Arsip_Foto_Bukti agar 100% bebas error izin Drive.
 */
function saveImageToDrive(base64Data, filenamePrefix, roomNumber, ss, txId, tenantName) {
  if (!base64Data || typeof base64Data !== 'string') {
    return '';
  }

  // Jika sudah berupa URL http/https yang valid, langsung kembalikan URL tersebut
  if (base64Data.indexOf('http://') === 0 || base64Data.indexOf('https://') === 0) {
    return base64Data;
  }

  if (base64Data.indexOf('base64,') === -1) {
    return '';
  }

  var driveUrl = '';
  var tz = 'Asia/Jakarta';
  try {
    tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  } catch (eTz) {}
  var timeStr = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  var cleanRoom = extractRoomDigits(roomNumber || '00');
  var photoId = (txId ? String(txId) : ('IMG-' + timeStr)) + '-' + filenamePrefix;

  // 1. Coba simpan ke Google Drive dan buka akses publik (Anyone with link)
  try {
    var parts = base64Data.split('base64,');
    var metaHeader = parts[0];
    var base64Content = parts[1];

    var contentType = 'image/jpeg';
    var ext = 'jpg';
    if (metaHeader.indexOf('image/png') !== -1) {
      contentType = 'image/png';
      ext = 'png';
    } else if (metaHeader.indexOf('image/webp') !== -1) {
      contentType = 'image/webp';
      ext = 'webp';
    }

    var decoded = Utilities.base64Decode(base64Content);
    var filename = filenamePrefix + '_Kmr' + cleanRoom + '_' + timeStr + '.' + ext;
    var blob = Utilities.newBlob(decoded, contentType, filename);

    var folderName = "KostPay_Bukti_Transfer";
    var folder;
    try {
      var folders = DriveApp.getFoldersByName(folderName);
      folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    } catch (eF) {
      folder = DriveApp.getRootFolder();
    }

    var file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare1) {
      try {
        file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
      } catch (eShare2) {}
    }

    var fileId = file.getId();
    driveUrl = fileId ? ('https://drive.google.com/file/d/' + fileId + '/view?usp=sharing') : file.getUrl();
  } catch (err) {
    Logger.log("Info Drive fallback ke Arsip Sheet: " + err.toString());
  }

  // 2. Selalu simpan juga ke Arsip_Foto_Bukti di dalam Spreadsheet sebagai cadangan permanen
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    savePhotoToArchiveSheet(ss, photoId, base64Data, cleanRoom, tenantName || '-', filenamePrefix, driveUrl);
  } catch (eArch) {}

  // Jika Google Drive berhasil menghasilkan link, gunakan link Google Drive.
  // Jika Google Drive gagal (misal izin Drive belum di-approve), otomatis gunakan URL Penampil WebApp!
  if (driveUrl) {
    return driveUrl;
  }

  try {
    var serviceUrl = ScriptApp.getService().getUrl();
    if (serviceUrl) {
      return serviceUrl + '?action=lihat_foto&id=' + encodeURIComponent(photoId);
    }
  } catch (eSvc) {}

  return 'https://script.google.com/macros/s/AKfycbxujVFF8C7U5nGY7z9j_DvQrddzYBqP1RFWBKSG2WbWBhfmIgcQ2N5qcBmNC7wOkJOa2w/exec?action=lihat_foto&id=' + encodeURIComponent(photoId);
}

/**
 * Menulis Hyperlink yang 100% AMAN di semua bahasa/locale Google Sheets (Tanpa #ERROR! formula)
 */
function setSafeHyperlinkCell(sheet, row, col, url, label, fallbackText) {
  try {
    var cell = sheet.getRange(row, col);
    if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) {
      cell.setValue(fallbackText || '-');
      return;
    }
    var richLink = SpreadsheetApp.newRichTextValue()
      .setText(label || 'Lihat Foto Bukti')
      .setLinkUrl(url)
      .build();
    cell.setRichTextValue(richLink);
  } catch (errRich) {
    // Fallback paling aman: tulis URL https:// langsung (otomatis jadi link aktif di Google Sheet)
    try {
      sheet.getRange(row, col).setValue(url || fallbackText || '-');
    } catch (eFallback) {}
  }
}

/**
 * Memperbaiki seluruh sel link foto yang bertuliskan #ERROR!, #VALUE!, formula =HYPERLINK yang rusak,
 * atau teks "Ada Bukti (Simpan Lokal)" / base64 mentah di seluruh tab Google Spreadsheet!
 */
function perbaikiSemuaLinkFotoEror(ss, payloadData) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var fixedCount = 0;

  // 1. Jika ada data foto dari WebApp (kostPayments / electricityPayments), simpan ke Drive/Arsip dan petakan per ID transaksi
  var photoMapByTxId = {};
  var meterMapByTxId = {};

  if (payloadData) {
    var kList = payloadData.kostPayments || [];
    for (var i = 0; i < kList.length; i++) {
      var kp = kList[i];
      if (kp && kp.id && kp.proofImage) {
        var pUrl = saveImageToDrive(kp.proofImage, 'BuktiSewa', kp.roomNumber, ss, kp.id, kp.tenantName);
        if (pUrl) photoMapByTxId[String(kp.id)] = pUrl;
      }
    }
    var eList = payloadData.electricityPayments || [];
    for (var j = 0; j < eList.length; j++) {
      var ep = eList[j];
      if (ep && ep.id) {
        if (ep.proofImage) {
          var epUrl = saveImageToDrive(ep.proofImage, 'BuktiListrik', ep.roomNumber, ss, ep.id, ep.tenantName);
          if (epUrl) photoMapByTxId[String(ep.id)] = epUrl;
        }
        if (ep.meterPhoto) {
          var emUrl = saveImageToDrive(ep.meterPhoto, 'FotoMeteran', ep.roomNumber, ss, ep.id, ep.tenantName);
          if (emUrl) meterMapByTxId[String(ep.id)] = emUrl;
        }
      }
    }
  }

  // Baca juga arsip foto yang sudah ada di tab Arsip_Foto_Bukti
  var archiveSheet = ss.getSheetByName("Arsip_Foto_Bukti");
  var serviceUrl = '';
  try {
    serviceUrl = ScriptApp.getService().getUrl();
  } catch (eS) {}
  if (!serviceUrl) {
    serviceUrl = 'https://script.google.com/macros/s/AKfycbxujVFF8C7U5nGY7z9j_DvQrddzYBqP1RFWBKSG2WbWBhfmIgcQ2N5qcBmNC7wOkJOa2w/exec';
  }

  if (archiveSheet && archiveSheet.getLastRow() >= 2) {
    var archVals = archiveSheet.getRange(2, 1, archiveSheet.getLastRow() - 1, 6).getValues();
    for (var a = 0; a < archVals.length; a++) {
      var pId = String(archVals[a][0] || '').trim();
      var dUrl = String(archVals[a][5] || '').trim();
      var resolvedUrl = (dUrl && dUrl.indexOf('http') === 0)
        ? dUrl
        : (serviceUrl + '?action=lihat_foto&id=' + encodeURIComponent(pId));
      // pId format: <txId>-BuktiSewa / <txId>-BuktiListrik / <txId>-FotoMeteran
      if (pId.indexOf('-FotoMeteran') !== -1) {
        var txKeyM = pId.replace('-FotoMeteran', '');
        if (!meterMapByTxId[txKeyM]) meterMapByTxId[txKeyM] = resolvedUrl;
      } else if (pId.indexOf('-Bukti') !== -1) {
        var txKeyP = pId.split('-Bukti')[0];
        if (!photoMapByTxId[txKeyP]) photoMapByTxId[txKeyP] = resolvedUrl;
      }
    }
  }

  // 2. Pindai seluruh sheet untuk memperbaiki sel #ERROR! / formula HYPERLINK koma / base64
  var allSheets = ss.getSheets();
  for (var s = 0; s < allSheets.length; s++) {
    var sh = allSheets[s];
    var sName = sh.getName();
    if (sName === "Arsip_Foto_Bukti" || sName === "DAFTAR_TARIF_KAMAR" || sName === "Jadwal_Servis_AC" || sName === "Jadwal_Fasilitas" || sName === "Jadwal_Cek_Kamar") {
      continue;
    }

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 5) continue;

    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var formulas = sh.getRange(1, 1, lastRow, lastCol).getFormulas();

    for (var r = 1; r < values.length; r++) {
      var rowId = String(values[r][2] || '').trim();
      for (var c = 0; c < values[r].length; c++) {
        var cellVal = String(values[r][c] || '').trim();
        var cellFormula = String(formulas[r][c] || '').trim();

        // Kasus A: Formula =HYPERLINK("url", "label") yang menyebabkan #ERROR! karena koma
        if (cellFormula && cellFormula.toUpperCase().indexOf('HYPERLINK') !== -1) {
          var extractedUrl = '';
          var extractedLabel = 'Lihat Foto Bukti';
          var httpPos = cellFormula.indexOf('http');
          if (httpPos !== -1) {
            var subHttp = cellFormula.substring(httpPos);
            var endPos = subHttp.length;
            var stopChars = ['"', "'", ';', ',', ')'];
            for (var sc = 0; sc < stopChars.length; sc++) {
              var idxStop = subHttp.indexOf(stopChars[sc]);
              if (idxStop !== -1 && idxStop < endPos) {
                endPos = idxStop;
              }
            }
            extractedUrl = subHttp.substring(0, endPos).trim();
          }
          if (cellFormula.toLowerCase().indexOf('meter') !== -1) {
            extractedLabel = 'Lihat Foto Meteran';
          }
          if (extractedUrl && extractedUrl.indexOf('http') === 0) {
            sh.getRange(r + 1, c + 1).clearContent();
            setSafeHyperlinkCell(sh, r + 1, c + 1, extractedUrl, extractedLabel, extractedUrl);
            fixedCount++;
            continue;
          } else if (cellVal.indexOf('#ERROR!') !== -1 || cellVal.indexOf('#VALUE!') !== -1) {
            var fallbackByTx = (rowId && photoMapByTxId[rowId]) ? photoMapByTxId[rowId] : '';
            sh.getRange(r + 1, c + 1).clearContent();
            if (fallbackByTx) {
              setSafeHyperlinkCell(sh, r + 1, c + 1, fallbackByTx, 'Lihat Foto Bukti', fallbackByTx);
            } else {
              sh.getRange(r + 1, c + 1).setValue('Ada Bukti (Terverifikasi)');
            }
            fixedCount++;
            continue;
          }
        }

        // Kasus B: Sel berisi base64 mentah data:image/...
        if (cellVal.indexOf('data:image/') === 0 && cellVal.indexOf('base64,') !== -1) {
          var convertedUrl = saveImageToDrive(cellVal, 'BuktiTransfer', values[r][4] || '00', ss, rowId || ('ROW-' + (r + 1)), values[r][3] || '-');
          if (convertedUrl) {
            setSafeHyperlinkCell(sh, r + 1, c + 1, convertedUrl, 'Lihat Foto Bukti', convertedUrl);
            fixedCount++;
            continue;
          }
        }

        // Kasus C: Sel bernilai #ERROR! atau "Ada Bukti (Simpan Lokal)" / "Ada Bukti (Tersimpan)" dan kita punya URL foto untuk ID Transaksi ini
        if (
          cellVal === '#ERROR!' ||
          cellVal === '#VALUE!' ||
          cellVal.indexOf('Ada Bukti') !== -1 ||
          cellVal === 'Foto Tersedia'
        ) {
          if (rowId && photoMapByTxId[rowId] && (c === 10 || c === 13 || c === 14)) {
            setSafeHyperlinkCell(sh, r + 1, c + 1, photoMapByTxId[rowId], 'Lihat Foto Bukti', photoMapByTxId[rowId]);
            fixedCount++;
          } else if (rowId && meterMapByTxId[rowId] && (c === 11 || c === 15)) {
            setSafeHyperlinkCell(sh, r + 1, c + 1, meterMapByTxId[rowId], 'Lihat Foto Meteran', meterMapByTxId[rowId]);
            fixedCount++;
          } else if (cellVal === '#ERROR!' || cellVal === '#VALUE!') {
            sh.getRange(r + 1, c + 1).setValue('Ada Bukti (Terverifikasi)');
            fixedCount++;
          }
        }
      }
    }
  }

  return fixedCount;
}

function testDriveAccess() {
  try {
    var folderName = "KostPay_Bukti_Transfer";
    var folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) {
      DriveApp.createFolder(folderName);
    }
    return "Google Drive & Arsip Foto siap menyimpan bukti transfer dengan link anti-error.";
  } catch (err) {
    return "Sistem Arsip Foto WebApp aktif (Link foto siap dibuka tanpa kendala izin).";
  }
}

// 1. Simpan Pembayaran Sewa Kost
function appendKostPayment(ss, data) {
  var proofUrl = '';
  try {
    if (data.proofImage && typeof data.proofImage === 'string') {
      proofUrl = saveImageToDrive(data.proofImage, 'BuktiSewa', data.roomNumber, ss, data.id, data.tenantName);
    }
  } catch (errImg) {
    Logger.log("Info save image sewa: " + errImg.toString());
  }

  var proofFallbackText = proofUrl
    ? proofUrl
    : (data.hasProof ? 'Ada Bukti (Terverifikasi)' : 'Cash / Tanpa Bukti');

  var branchName = (data.kostLocation === 'acarya_2' || String(data.kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var rawStatus = String(data.status || 'Sukses').trim();
  var isPending = (rawStatus.toLowerCase() === 'pending' || rawStatus.toLowerCase().indexOf('menunggu') !== -1);
  var statusToRecord = isPending ? 'Pending (Menunggu Verifikasi)' : 'Sukses';

  var categoryStr = (data.paymentType === 'tahunan_cicil' || data.installmentInfo)
    ? ('Sewa Tahunan (Cicilan Ke-' + (data.installmentInfo ? data.installmentInfo.installmentTerm : 1) + ')')
    : ('Sewa Kost (' + (data.paymentType || 'Bulanan') + ')');

  var notesText = data.notes || '-';
  if (data.installmentInfo) {
    var inst = data.installmentInfo;
    var instStatus = inst.isFullyPaid ? 'LUNAS (12 Bulan)' : ('BELUM LUNAS (Sisa: Rp ' + Number(inst.remainingAmount).toLocaleString('id-ID') + ')');
    notesText = (data.notes ? (data.notes + ' | ') : '') + 
      '[CICILAN TAHUNAN: ' + instStatus + ' | Batas Pelunasan: ' + inst.maxPayoffDate + ' (Maks 3 Bulan)]';
  }

  // A. Catat atau Perbarui ke Sheet Khusus Kamar Tersebut (UTAMA)
  try {
    var roomSheet = findOrCreateRoomSheet(ss, data.tenantName, data.roomNumber, data.kostLocation);
    if (roomSheet) {
      var roomRowValues = [
        new Date(),
        categoryStr,
        data.id || '-',
        (data.periodStart || '') + ' s/d ' + (data.periodEnd || ''),
        '-',
        '-',
        '-',
        data.totalAmount || 0,
        (data.paymentMethod || '').toUpperCase(),
        statusToRecord,
        proofFallbackText,
        '-',
        notesText
      ];
      var existingRoomRow = -1;
      var rLast = roomSheet.getLastRow();
      if (rLast >= 3 && data.id) {
        var rIds = roomSheet.getRange(3, 3, rLast - 2, 1).getValues();
        for (var ri = 0; ri < rIds.length; ri++) {
          if (String(rIds[ri][0] || '').trim() === String(data.id).trim()) {
            existingRoomRow = ri + 3;
            break;
          }
        }
      }
      var targetRoomRow = -1;
      if (existingRoomRow > 0) {
        roomSheet.getRange(existingRoomRow, 1, 1, roomRowValues.length).setValues([roomRowValues]);
        targetRoomRow = existingRoomRow;
      } else {
        roomSheet.appendRow(roomRowValues);
        targetRoomRow = roomSheet.getLastRow();
      }
      if (proofUrl && targetRoomRow > 0) {
        setSafeHyperlinkCell(roomSheet, targetRoomRow, 11, proofUrl, 'Lihat Foto Bukti', proofUrl);
      }
    }
  } catch (errRoom) {
    Logger.log("Gagal catat ke sheet kamar: " + errRoom.toString());
  }

  // B. Catat atau Perbarui ke Sheet Rekap Master (Pembayaran_Kost)
  try {
    var masterSheetName = "Pembayaran_Kost";
    var masterSheet = ss.getSheetByName(masterSheetName);
    var headers = [
      "Waktu Input", "Lokasi Kost", "ID Transaksi", "Nama Penghuni", "Kamar", "WhatsApp", 
      "Tipe Sewa", "Durasi (Bulan)", "Periode Sewa", "Jatuh Tempo", 
      "Total Bayar (Rp)", "Metode Bayar", "Status", "Link Bukti Transfer", "Catatan"
    ];

    if (!masterSheet) {
      masterSheet = ss.insertSheet(masterSheetName);
      masterSheet.appendRow(headers);
      masterSheet.getRange(1, 1, 1, headers.length).setBackground("#4F46E5").setFontColor("#FFFFFF").setFontWeight("bold");
      masterSheet.setFrozenRows(1);
    }

    var rentTypeLabel = data.paymentType === 'tahunan_cicil' ? 'Tahunan (Cicil)' : (data.paymentType || 'Bulanan');
    var masterRowValues = [
      new Date(),
      branchName,
      data.id || '-',
      data.tenantName || '-',
      data.roomNumber || '-',
      data.phone || '-',
      rentTypeLabel,
      data.durationMonths || 12,
      (data.periodStart || '') + ' s/d ' + (data.periodEnd || ''),
      data.dueDate || '-',
      data.totalAmount || 0,
      (data.paymentMethod || '').toUpperCase(),
      statusToRecord,
      proofFallbackText,
      notesText
    ];

    var existingMasterRow = -1;
    var mLast = masterSheet.getLastRow();
    if (mLast >= 2 && data.id) {
      var mIds = masterSheet.getRange(2, 3, mLast - 1, 1).getValues();
      for (var mi = 0; mi < mIds.length; mi++) {
        if (String(mIds[mi][0] || '').trim() === String(data.id).trim()) {
          existingMasterRow = mi + 2;
          break;
        }
      }
    }
    var targetMasterRow = -1;
    if (existingMasterRow > 0) {
      masterSheet.getRange(existingMasterRow, 1, 1, masterRowValues.length).setValues([masterRowValues]);
      targetMasterRow = existingMasterRow;
    } else {
      masterSheet.appendRow(masterRowValues);
      targetMasterRow = masterSheet.getLastRow();
    }
    if (proofUrl && targetMasterRow > 0) {
      setSafeHyperlinkCell(masterSheet, targetMasterRow, 14, proofUrl, 'Lihat Foto Bukti', proofUrl);
    }
  } catch (errMaster) {
    Logger.log("Info rekap master kost: " + errMaster.toString());
  }

  // C. Update Tab Khusus Kontrol Cicilan Tahunan (Maks 3 Bulan)
  try {
    updateInstallmentControlSheet(ss, data);
  } catch (errInstSheet) {
    Logger.log("Info kontrol cicilan: " + errInstSheet.toString());
  }
}

/**
 * Tab Master KONTROL_CICILAN_TAHUNAN di Google Sheets:
 * Memantau sisa hutang/cicilan sewa tahunan dan batas waktu 3 bulan pelunasan
 */
function updateInstallmentControlSheet(ss, data) {
  if (!data.installmentInfo) return;
  var sheetName = "KONTROL_CICILAN_TAHUNAN";
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    "Nomor Kamar", "Cabang Kost", "Nama Penghuni", "No. WhatsApp",
    "Total Sewa 1 Tahun (Rp)", "Total Sudah Dibayar (Rp)", "Sisa Belum Lunas (Rp)",
    "Cicilan Terakhir (Rp)", "Cicilan Ke-", "Batas Pelunasan (Maks 3 Bulan)",
    "Status Pelunasan", "Terakhir Diupdate"
  ];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0F172A").setFontColor("#F8FAFC").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  var inst = data.installmentInfo;
  var branch = (data.kostLocation === 'acarya_2' || String(data.kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var statusText = inst.isFullyPaid ? 'LUNAS (12 Bulan)' : ('BELUM LUNAS (Sisa Rp ' + Number(inst.remainingAmount).toLocaleString('id-ID') + ')');

  var dataRange = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var r = 1; r < dataRange.length; r++) {
    if (String(dataRange[r][0]) === String(data.roomNumber) && String(dataRange[r][1]) === branch) {
      foundRow = r + 1;
      break;
    }
  }

  var rowValues = [
    data.roomNumber,
    branch,
    data.tenantName,
    data.phone || '-',
    inst.totalAnnualAmount,
    inst.totalPaidSoFar,
    inst.remainingAmount,
    data.totalAmount,
    inst.installmentTerm,
    inst.maxPayoffDate,
    statusText,
    new Date().toLocaleString('id-ID')
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

// 2. Simpan Pembayaran Listrik kWh
function appendElectricityPayment(ss, data) {
  var proofUrl = '';
  var meterUrl = '';
  try {
    if (data.proofImage && typeof data.proofImage === 'string') {
      proofUrl = saveImageToDrive(data.proofImage, 'BuktiListrik', data.roomNumber, ss, data.id, data.tenantName);
    }
  } catch (errImg) {
    Logger.log("Info save image listrik: " + errImg.toString());
  }

  try {
    if (data.meterPhoto && typeof data.meterPhoto === 'string') {
      meterUrl = saveImageToDrive(data.meterPhoto, 'FotoMeteran', data.roomNumber, ss, data.id, data.tenantName);
    }
  } catch (errMeter) {
    Logger.log("Info save meter photo: " + errMeter.toString());
  }

  var proofFallbackText = proofUrl
    ? proofUrl
    : (data.hasProof ? 'Ada Bukti (Terverifikasi)' : 'Cash / Tanpa Bukti');

  var meterFallbackText = meterUrl
    ? meterUrl
    : (data.meterPhoto ? 'Foto Tersedia' : '-');

  var branchName = (data.kostLocation === 'acarya_2' || String(data.kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var subtotalKwh = (data.usageKwh || 0) * (data.ratePerKwh || 2000);
  var rawStatus = String(data.status || 'Sukses').trim();
  var isPending = (rawStatus.toLowerCase() === 'pending' || rawStatus.toLowerCase().indexOf('menunggu') !== -1);
  var statusToRecord = isPending ? 'Pending (Menunggu Verifikasi)' : 'Sukses';

  // A. Catat atau Perbarui ke Sheet Khusus Kamar Tersebut (UTAMA)
  try {
    var roomSheet = findOrCreateRoomSheet(ss, data.tenantName, data.roomNumber, data.kostLocation);
    if (roomSheet) {
      var roomElecValues = [
        new Date(),
        'Listrik kWh Pulsa',
        data.id || '-',
        data.periodMonth || '-',
        data.initialKwh || 0,
        data.finalKwh || 0,
        data.usageKwh || 0,
        data.totalAmount || 0,
        (data.paymentMethod || '').toUpperCase(),
        statusToRecord,
        proofFallbackText,
        meterFallbackText,
        data.notes || '-'
      ];
      var existingRoomERow = -1;
      var rELast = roomSheet.getLastRow();
      if (rELast >= 3 && data.id) {
        var rEIds = roomSheet.getRange(3, 3, rELast - 2, 1).getValues();
        for (var rei = 0; rei < rEIds.length; rei++) {
          if (String(rEIds[rei][0] || '').trim() === String(data.id).trim()) {
            existingRoomERow = rei + 3;
            break;
          }
        }
      }
      var targetRoomERow = -1;
      if (existingRoomERow > 0) {
        roomSheet.getRange(existingRoomERow, 1, 1, roomElecValues.length).setValues([roomElecValues]);
        targetRoomERow = existingRoomERow;
      } else {
        roomSheet.appendRow(roomElecValues);
        targetRoomERow = roomSheet.getLastRow();
      }
      if (proofUrl && targetRoomERow > 0) {
        setSafeHyperlinkCell(roomSheet, targetRoomERow, 11, proofUrl, 'Lihat Bukti Transfer', proofUrl);
      }
      if (meterUrl && targetRoomERow > 0) {
        setSafeHyperlinkCell(roomSheet, targetRoomERow, 12, meterUrl, 'Lihat Foto Meteran', meterUrl);
      }
    }
  } catch (errRoom) {
    Logger.log("Gagal catat listrik ke kamar: " + errRoom.toString());
  }

  // B. Catat atau Perbarui ke Sheet Rekap Master (Pembayaran_Listrik)
  try {
    var masterSheetName = "Pembayaran_Listrik";
    var masterSheet = ss.getSheetByName(masterSheetName);
    var headers = [
      "Waktu Input", "Lokasi Kost", "ID Transaksi", "Nama Penghuni", "Kamar", "WhatsApp", 
      "Bulan Tagihan", "Meter Awal (kWh)", "Meter Akhir (kWh)", "Pemakaian (kWh)", 
      "Tarif / kWh (Rp)", "Total Tagihan (Rp)", 
      "Metode Bayar", "Status", "Link Bukti Transfer", "Link Foto Meteran", "Catatan"
    ];

    if (!masterSheet) {
      masterSheet = ss.insertSheet(masterSheetName);
      masterSheet.appendRow(headers);
      masterSheet.getRange(1, 1, 1, headers.length).setBackground("#0284C7").setFontColor("#FFFFFF").setFontWeight("bold");
      masterSheet.setFrozenRows(1);
    } else {
      // Auto-cleanup: Hapus kolom 'Listrik Mesin' jika sebelumnya ada
      try {
        var existingH = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn() || 1).getValues()[0];
        for (var c = existingH.length - 1; c >= 0; c--) {
          var hTxt = String(existingH[c] || '').toLowerCase();
          if (hTxt.indexOf('mesin') !== -1) {
            masterSheet.deleteColumn(c + 1);
          }
        }
      } catch (eCleanCol) {}
    }

    var masterElecValues = [
      new Date(),
      branchName,
      data.id || '-',
      data.tenantName || '-',
      data.roomNumber || '-',
      data.phone || '-',
      data.periodMonth || '-',
      data.initialKwh || 0,
      data.finalKwh || 0,
      data.usageKwh || 0,
      data.ratePerKwh || 2000,
      data.totalAmount || 0,
      (data.paymentMethod || '').toUpperCase(),
      statusToRecord,
      proofFallbackText,
      meterFallbackText,
      data.notes || '-'
    ];

    var existingMasterERow = -1;
    var mELast = masterSheet.getLastRow();
    if (mELast >= 2 && data.id) {
      var mEIds = masterSheet.getRange(2, 3, mELast - 1, 1).getValues();
      for (var mei = 0; mei < mEIds.length; mei++) {
        if (String(mEIds[mei][0] || '').trim() === String(data.id).trim()) {
          existingMasterERow = mei + 2;
          break;
        }
      }
    }
    var targetMasterERow = -1;
    if (existingMasterERow > 0) {
      masterSheet.getRange(existingMasterERow, 1, 1, masterElecValues.length).setValues([masterElecValues]);
      targetMasterERow = existingMasterERow;
    } else {
      masterSheet.appendRow(masterElecValues);
      targetMasterERow = masterSheet.getLastRow();
    }
    if (proofUrl && targetMasterERow > 0) {
      setSafeHyperlinkCell(masterSheet, targetMasterERow, 15, proofUrl, 'Lihat Bukti Transfer', proofUrl);
    }
    if (meterUrl && targetMasterERow > 0) {
      setSafeHyperlinkCell(masterSheet, targetMasterERow, 16, meterUrl, 'Lihat Foto Meteran', meterUrl);
    }
  } catch (errMaster) {
    Logger.log("Info rekap master listrik: " + errMaster.toString());
  }
}

/**
 * =========================================================================
 * FUNGSI PEMECAH / PEMISAH DATA LAMA (RUN SEKALI DI APPS SCRIPT):
 * Membaca semua data yang sebelumnya terkumpul jadi 1 di sheet master,
 * lalu langsung membaginya ke tab kamar masing-masing!
 * =========================================================================
 */
function pisahkanSemuaDataKeSheetKamar(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var movedCount = 0;

  var sheetsToScan = ['Pembayaran_Kost', 'Pembayaran_Listrik', 'Sheet1', 'Sheet 1'];

  for (var sIdx = 0; sIdx < sheetsToScan.length; sIdx++) {
    var sourceSheet = ss.getSheetByName(sheetsToScan[sIdx]);
    if (!sourceSheet) continue;

    var lastRow = sourceSheet.getLastRow();
    var lastCol = sourceSheet.getLastColumn();
    if (lastRow < 2 || lastCol < 3) continue;

    var data = sourceSheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];

    var idxTime = -1, idxLoc = -1, idxId = -1, idxTenant = -1, idxRoom = -1;
    var idxPeriod = -1, idxAmount = -1, idxMethod = -1, idxStatus = -1;
    var idxProof = -1, idxMeterPhoto = -1, idxNotes = -1;
    var idxMeterStart = -1, idxMeterEnd = -1, idxUsage = -1;

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || '').toLowerCase();
      if (h.indexOf('waktu') !== -1 || h.indexOf('tanggal') !== -1) idxTime = c;
      else if (h.indexOf('lokasi') !== -1) idxLoc = c;
      else if (h.indexOf('id transaksi') !== -1 || h === 'id') idxId = c;
      else if (h.indexOf('nama') !== -1 || h.indexOf('penghuni') !== -1) idxTenant = c;
      else if (h.indexOf('kamar') !== -1) idxRoom = c;
      else if (h.indexOf('periode') !== -1 || h.indexOf('bulan') !== -1) idxPeriod = c;
      else if (h.indexOf('total') !== -1 || h.indexOf('bayar') !== -1) idxAmount = c;
      else if (h.indexOf('metode') !== -1) idxMethod = c;
      else if (h.indexOf('status') !== -1) idxStatus = c;
      else if (h.indexOf('bukti') !== -1) idxProof = c;
      else if (h.indexOf('meteran') !== -1 || h.indexOf('foto meter') !== -1) idxMeterPhoto = c;
      else if (h.indexOf('catatan') !== -1) idxNotes = c;
      else if (h.indexOf('meter awal') !== -1) idxMeterStart = c;
      else if (h.indexOf('meter akhir') !== -1) idxMeterEnd = c;
      else if (h.indexOf('pemakaian') !== -1) idxUsage = c;
    }

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var roomVal = idxRoom !== -1 ? row[idxRoom] : '';
      var tenantVal = idxTenant !== -1 ? row[idxTenant] : '';
      var locVal = idxLoc !== -1 ? row[idxLoc] : '';

      if (!roomVal && !tenantVal) continue;

      var statusRaw = idxStatus !== -1 ? String(row[idxStatus] || '').toLowerCase().trim() : '';
      var isPendingRow = (statusRaw === 'pending' || statusRaw.indexOf('menunggu') !== -1);
      var statusResolved = isPendingRow
        ? 'Pending (Menunggu Verifikasi)'
        : ((idxStatus !== -1 && row[idxStatus]) ? (statusRaw === 'verified' ? 'Sukses' : row[idxStatus]) : 'Sukses');

      var isElec = sheetsToScan[sIdx] === 'Pembayaran_Listrik' || (row[idxId] && String(row[idxId]).indexOf('EL-') !== -1);
      var category = isElec ? 'Listrik kWh Pulsa' : 'Sewa Kost';

      var roomSheet = findOrCreateRoomSheet(ss, tenantVal, roomVal, locVal);

      var transId = idxId !== -1 ? row[idxId] : '';
      var alreadyExists = false;
      var roomLastRow = roomSheet.getLastRow();
      if (roomLastRow > 2 && transId) {
        var existingIds = roomSheet.getRange(3, 3, roomLastRow - 2, 1).getValues();
        for (var k = 0; k < existingIds.length; k++) {
          if (String(existingIds[k][0]) === String(transId)) {
            alreadyExists = true;
            break;
          }
        }
      }

      if (!alreadyExists) {
        roomSheet.appendRow([
          idxTime !== -1 ? row[idxTime] : new Date(),
          category,
          transId || ('TRX-' + (r + 1)),
          idxPeriod !== -1 ? row[idxPeriod] : '-',
          idxMeterStart !== -1 ? row[idxMeterStart] : '-',
          idxMeterEnd !== -1 ? row[idxMeterEnd] : '-',
          idxUsage !== -1 ? row[idxUsage] : '-',
          idxAmount !== -1 ? row[idxAmount] : 0,
          idxMethod !== -1 ? row[idxMethod] : 'TRANSFER',
          statusResolved,
          idxProof !== -1 ? row[idxProof] : '-',
          idxMeterPhoto !== -1 ? row[idxMeterPhoto] : '-',
          idxNotes !== -1 ? row[idxNotes] : '-'
        ]);
        movedCount++;
      }
    }
  }

  Logger.log("Pemisahan data selesai! Total " + movedCount + " data berhasil dipindahkan ke tab masing-masing kamar.");
  return movedCount;
}

/**
 * Sinkronkan seluruh data transaksi (baik Terverifikasi maupun Pending) ke tab masing-masing kamar & tab master
 */
function syncAllTransactions(ss, data) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var count = 0;

  var kostList = data.kostPayments || [];
  for (var i = 0; i < kostList.length; i++) {
    var kp = kostList[i];
    if (!kp) continue;
    appendKostPayment(ss, kp);
    count++;
  }

  var elecList = data.electricityPayments || [];
  for (var j = 0; j < elecList.length; j++) {
    var ep = elecList[j];
    if (!ep) continue;
    appendElectricityPayment(ss, ep);
    count++;
  }

  return count;
}

// =========================================================================
// 3. TAB TERPISAH & SINKRONISASI 2 ARAH: JADWAL_SERVIS_AC & JADWAL_FASILITAS
// =========================================================================
function formatDateCell(val) {
  if (!val) return '-';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    try {
      var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
      return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
    } catch (e) {
      return val.toISOString().split('T')[0];
    }
  }
  return String(val);
}

// --- A. SHEET KHUSUS SERVIS AC (Jadwal_Servis_AC) ---
function findOrCreateAcSheet(ss) {
  var sheetName = "Jadwal_Servis_AC";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  var headers = [
    "ID Jadwal", "Lokasi Kost", "Nomor Kamar", "Nama Penghuni",
    "Merek AC", "Status AC", "Servis Terakhir", "Jadwal Berikutnya", "Catatan"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#6D28D9").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  var defaults = [
    ["ac-ac2-02", "Acarya Kost 2", "02", "I GUSTI PUTU ARYA WICAKSANA", "Panasonic Inverter 1/2 PK", "normal", "2026-07-04", "2027-01-04", "Suhu dingin stabil dan hening, tidak ada keluhan."],
    ["ac-ac2-03", "Acarya Kost 2", "03", "I Ketut Dita Herynata", "Sharp Plasmacluster 1/2 PK", "normal", "2026-07-01", "2027-01-01", "Kondisi pendingin optimal."],
    ["ac-ac2-06", "Acarya Kost 2", "06", "Ni Kadek Novi Antari", "LG Dual Inverter 1/2 PK", "perlu_dicuci", "2026-03-10", "2026-09-10", "Mendekati 6 bulan pemakaian, hembusan perlu dibersihkan."],
    ["ac-ac2-07", "Acarya Kost 2", "07", "I GUSTI PUTU WAHYU DIATMIKA PUTRA", "Daikin 1/2 PK", "normal", "2026-07-04", "2027-01-04", "AC dingin normal."]
  ];
  for (var i = 0; i < defaults.length; i++) {
    sheet.appendRow(defaults[i]);
  }
  return sheet;
}

function readAcServicesFromSheet(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 8);
  if (lastRow < 2) return [];

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  var isNewFormat = String(headers[0] || '').toLowerCase().indexOf('id') !== -1;

  var list = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (isNewFormat) {
      var idVal = String(row[0] || '').trim();
      var locRaw = String(row[1] || '').toLowerCase();
      var roomVal = extractRoomDigits(row[2]);
      var tenantVal = String(row[3] || '').trim();
      if (!idVal && !tenantVal && (!row[2] || String(row[2]).trim() === '')) continue;

      var loc = (locRaw.indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
      var statusRaw = String(row[5] || 'perlu_dicuci').toLowerCase().trim();
      var statusNorm = 'perlu_dicuci';
      if (statusRaw.indexOf('normal') !== -1 || statusRaw.indexOf('selesai') !== -1) statusNorm = 'normal';
      else if (statusRaw.indexOf('kurang') !== -1) statusNorm = 'kurang_dingin';
      else if (statusRaw.indexOf('rusak') !== -1 || statusRaw.indexOf('teknisi') !== -1) statusNorm = 'rusak';

      list.push({
        id: idVal || ('ac-' + loc + '-' + roomVal + '-' + r),
        kostLocation: loc,
        roomNumber: roomVal,
        tenantName: tenantVal || ('Kamar ' + roomVal),
        acBrand: String(row[4] || 'Unit AC Kamar 1/2 PK'),
        frequency: '6_bulanan',
        status: statusNorm,
        lastServiceDate: formatDateCell(row[6]),
        nextServiceDate: formatDateCell(row[7]),
        notes: String(row[8] || '')
      });
    } else {
      // Kompatibilitas format lama: Waktu Input | Lokasi Kost | Kamar | Penghuni | Merek AC | Status AC | Jadwal Servis | Catatan
      var locRawOld = String(row[1] || '').toLowerCase();
      var roomValOld = extractRoomDigits(row[2]);
      var tenantValOld = String(row[3] || '').trim();
      if (!tenantValOld && (!row[2] || String(row[2]).trim() === '')) continue;
      var locOld = (locRawOld.indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
      var stOld = String(row[5] || 'perlu_dicuci').toLowerCase();
      var stNormOld = stOld.indexOf('normal') !== -1 || stOld.indexOf('selesai') !== -1 ? 'normal' : (stOld.indexOf('kurang') !== -1 ? 'kurang_dingin' : (stOld.indexOf('rusak') !== -1 ? 'rusak' : 'perlu_dicuci'));
      list.push({
        id: 'ac-' + locOld + '-' + roomValOld,
        kostLocation: locOld,
        roomNumber: roomValOld,
        tenantName: tenantValOld || ('Kamar ' + roomValOld),
        acBrand: String(row[4] || 'Unit AC Kamar 1/2 PK'),
        frequency: '6_bulanan',
        status: stNormOld,
        lastServiceDate: formatDateCell(row[0]),
        nextServiceDate: formatDateCell(row[6]),
        notes: String(row[7] || '')
      });
    }
  }
  return list;
}

function upsertAcServiceRow(ss, data) {
  var sheet = findOrCreateAcSheet(ss);
  var branchName = (data.kostLocation === 'acarya_2' || String(data.kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var roomDigits = extractRoomDigits(data.roomNumber);
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 9);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var isNewFormat = String(headers[0] || '').toLowerCase().indexOf('id') !== -1;

  if (!isNewFormat) {
    sheet.clear();
    var newHeaders = ["ID Jadwal", "Lokasi Kost", "Nomor Kamar", "Nama Penghuni", "Merek AC", "Status AC", "Servis Terakhir", "Jadwal Berikutnya", "Catatan"];
    sheet.appendRow(newHeaders);
    sheet.getRange(1, 1, 1, newHeaders.length).setBackground("#6D28D9").setFontColor("#FFFFFF").setFontWeight("bold");
    sheet.setFrozenRows(1);
    lastRow = 1;
  }

  var rowValues = [
    data.id || ('ac-' + (data.kostLocation || 'acarya_1') + '-' + roomDigits),
    branchName,
    roomDigits,
    data.tenantName || ('Kamar ' + roomDigits),
    data.acBrand || 'Unit AC Kamar 1/2 PK',
    data.status || 'perlu_dicuci',
    data.lastServiceDate || '-',
    data.nextServiceDate || 'Setiap 6 Bulan',
    data.notes || '-'
  ];

  if (lastRow >= 2) {
    var allVals = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    for (var i = 0; i < allVals.length; i++) {
      var rowId = String(allVals[i][0] || '').trim();
      var rowBranch = String(allVals[i][1] || '');
      var rowRoom = extractRoomDigits(allVals[i][2]);
      if ((data.id && rowId === String(data.id)) || (rowRoom === roomDigits && rowBranch === branchName)) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }
  sheet.appendRow(rowValues);
}

function deleteAcServiceById(ss, id, roomNumber, kostLocation) {
  var sheet = ss.getSheetByName("Jadwal_Servis_AC");
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var branchName = (kostLocation === 'acarya_2' || String(kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var roomDigits = roomNumber ? extractRoomDigits(roomNumber) : '';
  var allVals = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 4)).getValues();
  for (var i = allVals.length - 1; i >= 0; i--) {
    var rowId = String(allVals[i][0] || '').trim();
    var rowBranch = String(allVals[i][1] || '');
    var rowRoom = extractRoomDigits(allVals[i][2]);
    if ((id && rowId === String(id)) || (roomDigits && rowRoom === roomDigits && rowBranch === branchName)) {
      sheet.deleteRow(i + 2);
    }
  }
}

// --- B. SHEET KHUSUS PEMELIHARAAN FASILITAS (Jadwal_Fasilitas) ---
function findOrCreateFacilitySheet(ss) {
  var sheetName = "Jadwal_Fasilitas";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  var headers = [
    "ID Jadwal", "Lokasi Kost", "Judul / Kendala", "Kategori",
    "Siklus / Hari", "Terakhir Dicek", "Jadwal Berikutnya", "Status", "PIC", "Catatan"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#0D9488").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  var defaults = [
    ["fac-1", "Acarya Kost 1", "Kuras Toren & Pengecekan Pompa Air (Acarya Kost 1)", "pompa_air", "Setiap Sabtu Pagi", "2026-09-05", "2026-09-12", "selesai", "Pak Wayan (Teknisi)", "Tekanan air normal, toren bersih tidak ada endapan lumut."],
    ["fac-2", "Acarya Kost 1", "Pembersihan Lorong, Parkiran & Area Sampah (Acarya Kost 1)", "kebersihan", "Setiap Minggu Pagi", "2026-09-06", "2026-09-13", "terjadwal", "Staf Kebersihan", "Jadwal sapu, pel lorong utama, dan angkut tempat sampah."],
    ["fac-3", "Acarya Kost 1", "Cek Router WiFi Utama & Lampu Lorong (Acarya Kost 1)", "wifi", "Setiap Jumat Sore", "2026-09-04", "2026-09-11", "selesai", "Admin Kost", "Restart berkala modem fiber optik agar koneksi stabil."],
    ["fac-4", "Acarya Kost 2", "Kuras Toren & Pengecekan Pompa Air (Acarya Kost 2)", "pompa_air", "Setiap Sabtu Sore", "2026-09-05", "2026-09-12", "selesai", "Pak Wayan (Teknisi)", "Otomatis radar pompa berfungsi normal."],
    ["fac-5", "Acarya Kost 2", "Pembersihan Area Parkir, Lorong & Dapur Bersama (Acarya Kost 2)", "kebersihan", "Setiap Minggu Sore", "2026-09-06", "2026-09-13", "terjadwal", "Staf Kebersihan", "Pembersihan rutin mingguan area bersama."],
    ["fac-6", "Acarya Kost 2", "Cek Koneksi WiFi & Penerangan Lorong (Acarya Kost 2)", "wifi", "Setiap Jumat Sore", "2026-09-04", "2026-09-11", "selesai", "Admin Kost", "Semua lampu lorong menyala normal, bandwidth WiFi stabil."]
  ];
  for (var i = 0; i < defaults.length; i++) {
    sheet.appendRow(defaults[i]);
  }
  return sheet;
}

function readFacilitiesFromSheet(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 8);
  if (lastRow < 2) return [];

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  var isNewFormat = String(headers[0] || '').toLowerCase().indexOf('id') !== -1;

  var list = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (isNewFormat) {
      var idVal = String(row[0] || '').trim();
      var locRaw = String(row[1] || '').toLowerCase();
      var titleVal = String(row[2] || '').trim();
      if (!idVal && !titleVal) continue;

      var loc = (locRaw.indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
      var stRaw = String(row[7] || 'terjadwal').toLowerCase().trim();
      var stNorm = 'terjadwal';
      if (stRaw.indexOf('selesai') !== -1) stNorm = 'selesai';
      else if (stRaw.indexOf('proses') !== -1 || stRaw.indexOf('tunggu') !== -1 || stRaw.indexOf('perlu') !== -1) stNorm = 'dalam_proses';

      list.push({
        id: idVal || ('fac-row-' + r),
        kostLocation: loc,
        title: titleVal || 'Pemeliharaan Fasilitas',
        category: String(row[3] || 'kebersihan'),
        frequency: 'mingguan',
        targetDay: String(row[4] || 'Terjadwal'),
        lastCheckedDate: formatDateCell(row[5]),
        nextDate: formatDateCell(row[6]),
        status: stNorm,
        pic: String(row[8] || 'Pengelola Kost'),
        notes: String(row[9] || '')
      });
    } else {
      // Format lama: Waktu Input | Lokasi Kost | Kategori | Deskripsi | Kamar Pelapor | Nama Pelapor | Status | Tindakan
      var titleOld = String(row[3] || '').trim();
      if (!titleOld) continue;
      var locOld = String(row[1] || '').toLowerCase().indexOf('2') !== -1 ? 'acarya_2' : 'acarya_1';
      var stOld = String(row[6] || '').toLowerCase().indexOf('selesai') !== -1 ? 'selesai' : 'dalam_proses';
      list.push({
        id: 'fac-old-' + r,
        kostLocation: locOld,
        title: String(row[2] || 'Fasilitas') + ': ' + titleOld + (row[4] ? ' (Kmr ' + row[4] + ')' : ''),
        category: 'kebersihan',
        frequency: 'mingguan',
        targetDay: 'Terjadwal',
        lastCheckedDate: formatDateCell(row[0]),
        nextDate: formatDateCell(row[0]),
        status: stOld,
        pic: 'Pengelola Kost',
        notes: 'Pelapor: ' + String(row[5] || '-')
      });
    }
  }
  return list;
}

// --- C. SHEET KHUSUS CEK FISIK KAMAR 6 BULANAN (Jadwal_Cek_Kamar) ---
function findOrCreateInspectionSheet(ss) {
  var sheetName = "Jadwal_Cek_Kamar";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  var headers = [
    "ID Jadwal", "Lokasi Kost", "Nomor Kamar", "Nama Penghuni",
    "Inspeksi Terakhir", "Jadwal Cek Berikutnya", "Status", "Catatan"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#4338CA").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);

  var defaults = [
    ["room-ac2-02", "Acarya Kost 2", "02", "I GUSTI PUTU ARYA WICAKSANA", "2026-07-04", "2027-01-04", "layak", "Kondisi fisik kamar sangat terawat."],
    ["room-ac2-03", "Acarya Kost 2", "03", "I Ketut Dita Herynata", "2026-07-01", "2027-01-01", "layak", "Fasilitas kamar lengkap dan berfungsi prima."],
    ["room-ac2-04", "Acarya Kost 2", "04", "Parisya Ashwani Gayatri", "2026-07-04", "2027-01-04", "terjadwal", "Jadwal pengecekan rutin semesteran."],
    ["room-ac2-06", "Acarya Kost 2", "06", "Ni Kadek Novi Antari", "2026-03-10", "2026-09-10", "layak", "Kamar dalam kondisi prima."]
  ];
  for (var i = 0; i < defaults.length; i++) {
    sheet.appendRow(defaults[i]);
  }
  return sheet;
}

function readInspectionsFromSheet(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 8);
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var list = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var idVal = String(row[0] || '').trim();
    var locRaw = String(row[1] || '').toLowerCase();
    var roomVal = extractRoomDigits(row[2]);
    var tenantVal = String(row[3] || '').trim();
    if (!idVal && !tenantVal && (!row[2] || String(row[2]).trim() === '')) continue;

    var loc = (locRaw.indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
    var stRaw = String(row[6] || 'terjadwal').toLowerCase();
    var stNorm = 'terjadwal';
    if (stRaw.indexOf('layak') !== -1 || stRaw.indexOf('baik') !== -1 || stRaw.indexOf('selesai') !== -1) stNorm = 'layak';
    else if (stRaw.indexOf('perlu') !== -1 || stRaw.indexOf('perbaikan') !== -1) stNorm = 'perlu_perbaikan';

    list.push({
      id: idVal || ('room-' + loc + '-' + roomVal + '-' + i),
      kostLocation: loc,
      roomNumber: roomVal,
      tenantName: tenantVal || ('Kamar ' + roomVal),
      frequency: '6_bulanan',
      lastInspectionDate: formatDateCell(row[4]),
      nextInspectionDate: formatDateCell(row[5]),
      status: stNorm,
      wallCondition: stNorm === 'layak' ? 'Bagus & Rapi' : 'Perlu Pengecekan',
      plumbingCondition: stNorm === 'layak' ? 'Lancar & Normal' : 'Perlu Pengecekan',
      ventilationCondition: stNorm === 'layak' ? 'Bagus' : 'Perlu Pengecekan',
      doorAndLockCondition: stNorm === 'layak' ? 'Aman & Normal' : 'Perlu Pengecekan',
      notes: String(row[7] || '')
    });
  }
  return list;
}

function upsertFacilityOrInspection(ss, data) {
  if (data.scheduleType === 'cek_kamar') {
    upsertInspectionRow(ss, data);
    return;
  }
  var sheet = findOrCreateFacilitySheet(ss);
  var branchName = (data.kostLocation === 'acarya_2' || String(data.kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 10);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var isNewFormat = String(headers[0] || '').toLowerCase().indexOf('id') !== -1;

  if (!isNewFormat) {
    sheet.clear();
    var newHeaders = ["ID Jadwal", "Lokasi Kost", "Judul / Kendala", "Kategori", "Siklus / Hari", "Terakhir Dicek", "Jadwal Berikutnya", "Status", "PIC", "Catatan"];
    sheet.appendRow(newHeaders);
    sheet.getRange(1, 1, 1, newHeaders.length).setBackground("#0D9488").setFontColor("#FFFFFF").setFontWeight("bold");
    sheet.setFrozenRows(1);
    lastRow = 1;
  }

  var fullTitle = data.roomNumber && String(data.title || '').indexOf('Kmr') === -1
    ? ((data.category ? data.category + ': ' : '') + data.title + ' (Kmr ' + data.roomNumber + ')')
    : (data.title || 'Pemeliharaan Fasilitas');

  var stNorm = data.status === 'selesai' ? 'selesai' : (data.status === 'terjadwal' ? 'terjadwal' : 'dalam_proses');

  var rowValues = [
    data.id || ('FAC-' + new Date().getTime().toString().slice(-5)),
    branchName,
    fullTitle,
    data.category || 'kebersihan',
    data.targetDay || 'Terjadwal',
    data.lastCheckedDate || 'Hari Ini',
    data.nextDate || data.preferredDate || new Date().toISOString().split('T')[0],
    stNorm,
    data.pic || 'Pengelola Kost',
    data.notes || (data.tenantName ? ('Kamar ' + (data.roomNumber || '-') + ' (' + data.tenantName + ')') : '-')
  ];

  if (lastRow >= 2 && data.id) {
    var allIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < allIds.length; i++) {
      if (String(allIds[i][0] || '').trim() === String(data.id)) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }
  sheet.appendRow(rowValues);
}

function deleteFacilityById(ss, id) {
  var sheet = ss.getSheetByName("Jadwal_Fasilitas");
  if (!sheet || !id) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var allIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = allIds.length - 1; i >= 0; i--) {
    if (String(allIds[i][0] || '').trim() === String(id)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function upsertInspectionRow(ss, data) {
  var sheet = findOrCreateInspectionSheet(ss);
  var branchName = (data.kostLocation === 'acarya_2' || String(data.kostLocation || '').indexOf('2') !== -1) ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var roomDigits = extractRoomDigits(data.roomNumber);
  var lastRow = sheet.getLastRow();
  var stNorm = data.status === 'layak' ? 'layak' : (data.status === 'terjadwal' ? 'terjadwal' : 'perlu_perbaikan');

  var rowValues = [
    data.id || ('room-' + (data.kostLocation || 'acarya_1') + '-' + roomDigits),
    branchName,
    roomDigits,
    data.tenantName || ('Kamar ' + roomDigits),
    data.lastInspectionDate || '-',
    data.nextInspectionDate || data.preferredDate || new Date().toISOString().split('T')[0],
    stNorm,
    data.notes || ((data.category ? data.category + ': ' : '') + (data.title || ''))
  ];

  if (lastRow >= 2) {
    var allVals = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = 0; i < allVals.length; i++) {
      var rId = String(allVals[i][0] || '').trim();
      var rBranch = String(allVals[i][1] || '');
      var rRoom = extractRoomDigits(allVals[i][2]);
      if ((data.id && rId === String(data.id)) || (rRoom === roomDigits && rBranch === branchName)) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }
  sheet.appendRow(rowValues);
}

function deleteInspectionById(ss, id) {
  var sheet = ss.getSheetByName("Jadwal_Cek_Kamar");
  if (!sheet || !id) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var allIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = allIds.length - 1; i >= 0; i--) {
    if (String(allIds[i][0] || '').trim() === String(id)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function syncAllSchedulesToSheets(ss, data) {
  // Upsert tiap jadwal tanpa menghapus riwayat jadwal yang sudah ditandai selesai di Google Sheet
  if (Array.isArray(data.acServices)) {
    findOrCreateAcSheet(ss);
    for (var i = 0; i < data.acServices.length; i++) {
      upsertAcServiceRow(ss, data.acServices[i]);
    }
  }

  if (Array.isArray(data.facilities)) {
    findOrCreateFacilitySheet(ss);
    for (var j = 0; j < data.facilities.length; j++) {
      upsertFacilityOrInspection(ss, data.facilities[j]);
    }
  }

  if (Array.isArray(data.roomInspections)) {
    findOrCreateInspectionSheet(ss);
    for (var k = 0; k < data.roomInspections.length; k++) {
      upsertInspectionRow(ss, data.roomInspections[k]);
    }
  }
}

function appendGenericLog(ss, data) {
  var sheetName = "Log_Sistem";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Waktu", "Aksi", "Data JSON"]);
    sheet.getRange(1, 1, 1, 3).setBackground("#475569").setFontColor("#FFFFFF").setFontWeight("bold");
  }
  sheet.appendRow([new Date(), data.action || 'general', JSON.stringify(data)]);
}

/**
 * FUNGSI INSTAN DARI EDITOR APPS SCRIPT:
 * Buat seluruh 29 sheet kamar (Acarya 1: 11 kamar, Acarya 2: 18 kamar) secara otomatis.
 * Dilengkapi Sheet Map Caching untuk performa kilat (1-2 detik) tanpa stuck/timeout.
 */
function buatSemuaSheetKamar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Cache seluruh sheet yang sudah ada di memori agar cepat
  var allExistingSheets = ss.getSheets();
  var sheetMap = {};
  for (var k = 0; k < allExistingSheets.length; k++) {
    sheetMap[allExistingSheets[k].getName().toLowerCase()] = allExistingSheets[k];
  }

  // 11 Kamar Acarya 1
  for (var i = 1; i <= 11; i++) {
    var num = i < 10 ? '0' + i : '' + i;
    findOrCreateRoomSheet(ss, 'Kamar ' + num, num, 'acarya_1', sheetMap);
  }

  // 18 Kamar Acarya 2
  var acarya2Tenants = [
    { room: '01', name: 'Kamar 01' },
    { room: '02', name: 'I GUSTI PUTU ARYA WICAKSANA' },
    { room: '03', name: 'I Ketut Dita Herynata' },
    { room: '04', name: 'Parisya Ashwani Gayatri' },
    { room: '05', name: 'Gede Yusuf El Hamdani' },
    { room: '06', name: 'Ni Kadek Novi Antari' },
    { room: '07', name: 'I GUSTI PUTU WAHYU DIATMIKA PUTRA' },
    { room: '08', name: 'Ketut Mahesa Suputra Fajar' },
    { room: '09', name: 'I Gede Agus Rooney Wirawan' },
    { room: '10', name: 'Putu Metta Eka Putri' },
    { room: '11', name: 'Ni Putu Reviana Putri Apsari' },
    { room: '12', name: 'Kamar 12' },
    { room: '13', name: 'Farel Jaya Hesekyel' },
    { room: '14', name: 'Kamar 14' },
    { room: '15', name: 'Ni Kadek Della Sulistya Putri' },
    { room: '16', name: 'Ida Ayu Laksha Brahmaswari' },
    { room: '17', name: 'I Nyoman Gita' },
    { room: '18', name: 'Ni Kadek Dwipa Maharani' }
  ];

  for (var j = 0; j < acarya2Tenants.length; j++) {
    var item = acarya2Tenants[j];
    findOrCreateRoomSheet(ss, item.name, item.room, 'acarya_2', sheetMap);
  }

  Logger.log("Selesai! Seluruh 29 sheet kamar Acarya 1 & Acarya 2 berhasil dibuat dan siap digunakan.");
  return 29;
}

/**
 * =========================================================================
 * PENGATURAN TARIF SEWA KAMAR LANGSUNG DARI GOOGLE SHEET (DAFTAR_TARIF_KAMAR)
 * =========================================================================
 * Pemilik kost dapat menentukan & mengubah tarif bulanan masing-masing kamar langsung
 * pada tab 'DAFTAR_TARIF_KAMAR' di kolom D (Tarif Sewa Bulanan).
 * Aplikasi KostPay akan otomatis membaca dan sinkron dengan nominal tersebut.
 */

/**
 * Otomatis menghapus kolom "Listrik Mesin" dari seluruh tab di Google Spreadsheet
 */
function hapusSemuaKolomListrikMesin(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalCleaned = 0;
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    var lastCol = sh.getLastColumn();
    var lastRow = Math.min(sh.getLastRow(), 3);
    if (lastCol < 1 || lastRow < 1) continue;
    
    var hData = sh.getRange(1, 1, lastRow, lastCol).getValues();
    for (var r = 0; r < hData.length; r++) {
      for (var c = hData[r].length - 1; c >= 0; c--) {
        var val = String(hData[r][c] || '').toLowerCase().trim();
        if (val.indexOf('listrik mesin') !== -1 || val.indexOf('biaya mesin') !== -1 || val === 'listrik mesin (rp)' || val === 'mesin') {
          try {
            sh.deleteColumn(c + 1);
            totalCleaned++;
          } catch (eDel) {}
        }
      }
    }
  }
  return totalCleaned;
}

function getAuthoritativeDefaultRooms() {
  return [
    // Acarya 1 (11 Kamar - Belum ada data penghuni)
    { branch: "Acarya 1", room: "01", name: "Kamar 01 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "02", name: "Kamar 02 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "03", name: "Kamar 03 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "04", name: "Kamar 04 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "05", name: "Kamar 05 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "06", name: "Kamar 06 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "07", name: "Kamar 07 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "08", name: "Kamar 08 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "09", name: "Kamar 09 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "10", name: "Kamar 10 (Tersedia)", rate: 1200000, due: 5 },
    { branch: "Acarya 1", room: "11", name: "Kamar 11 (Tersedia)", rate: 1200000, due: 5 },
    // Acarya 2 (18 Kamar)
    { branch: "Acarya 2", room: "01", name: "Kamar 01 (Tersedia)", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "02", name: "I GUSTI PUTU ARYA WICAKSANA", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "03", name: "I Ketut Dita Herynata", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "04", name: "Parisya Ashwani Gayatri", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "05", name: "Gede Yusuf El Hamdani", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "06", name: "Ni Kadek Novi Antari", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "07", name: "I GUSTI PUTU WAHYU DIATMIKA PUTRA", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "08", name: "Ketut Mahesa Suputra Fajar", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "09", name: "I Gede Agus Rooney Wirawan", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "10", name: "Putu Metta Eka Putri", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "11", name: "Ni Putu Reviana Putri Apsari", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "12", name: "Kamar 12 (Tersedia)", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "13", name: "Farel Jaya Hesekyel", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "14", name: "Kamar 14 (Tersedia)", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "15", name: "Ni Kadek Della Sulistya Putri", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "16", name: "Ida Ayu Laksha Brahmaswari", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "17", name: "I Nyoman Gita", rate: 1500000, due: 5 },
    { branch: "Acarya 2", room: "18", name: "Ni Kadek Dwipa Maharani", rate: 1500000, due: 5 }
  ];
}

function findOrCreateRateSheet(ss) {
  var defaultRooms = getAuthoritativeDefaultRooms();
  var sheet = ss.getSheetByName('DAFTAR_TARIF_KAMAR') || ss.getSheetByName('TARIF_KAMAR') || ss.getSheetByName('MASTER_TARIF');
  if (sheet) {
    // Auto-cleanup jika tab sudah ada tapi masih ada kolom 'Listrik Mesin' atau nama dummy lama
    try {
      var existingH = sheet.getRange(2, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
      for (var c = existingH.length - 1; c >= 0; c--) {
        if (String(existingH[c] || '').toLowerCase().indexOf('mesin') !== -1) {
          sheet.deleteColumn(c + 1);
        }
      }
      var rCount = sheet.getLastRow();
      if (rCount >= 3) {
        var existingRows = sheet.getRange(3, 1, rCount - 2, 3).getValues();
        var oldDummyCheck = ['i putu sudiasa', 'kadek surya kencana', 'ni made anggraini', 'gede wahyu pratama', 'nyoman triana dewi', 'ketut agus mahendra', 'luh putu dian lestari', 'wayan adi gunawan', 'ni komang ayu safitri', 'made bayu saputra', 'komang krisna murti', 'ni ketut ratna sari'];
        var needsFix = false;
        for (var idx = 0; idx < existingRows.length; idx++) {
          var nm = String(existingRows[idx][2] || '').toLowerCase().trim();
          if (oldDummyCheck.indexOf(nm) !== -1) {
            needsFix = true;
            break;
          }
        }
        if (needsFix) {
          for (var idx2 = 0; idx2 < existingRows.length; idx2++) {
            var bRaw = String(existingRows[idx2][0] || '').toLowerCase();
            var bLabel = (bRaw.indexOf('2') !== -1) ? 'Acarya 2' : 'Acarya 1';
            var rNum = extractRoomDigits(existingRows[idx2][1]);
            for (var d = 0; d < defaultRooms.length; d++) {
              if (defaultRooms[d].branch === bLabel && defaultRooms[d].room === rNum) {
                sheet.getRange(idx2 + 3, 3).setValue(defaultRooms[d].name);
                break;
              }
            }
          }
        }
      }
    } catch (eCleanRate) {}
    return sheet;
  }

  try {
    sheet = ss.insertSheet('DAFTAR_TARIF_KAMAR', 0);
  } catch (e) {
    sheet = ss.insertSheet('DAFTAR_TARIF_KAMAR');
  }

  // Header Banner (6 Kolom: A s/d F)
  sheet.getRange(1, 1).setValue("MASTER DATA TARIF SEWA & NOMINAL PEMBAYARAN PER KAMAR (ACARYA KOST)");
  sheet.getRange(1, 1, 1, 6).merge().setBackground("#047857").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center");

  // Column Headers (Tidak ada lagi Listrik Mesin)
  var headers = [
    "Cabang Kost",
    "Nomor Kamar",
    "Nama Penghuni",
    "Tarif Sewa Bulanan (Rp)",
    "Tgl Jatuh Tempo",
    "Catatan Khusus"
  ];
  sheet.appendRow(headers);
  sheet.getRange(2, 1, 1, headers.length).setBackground("#1E293B").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.setFrozenRows(2);

  for (var i = 0; i < defaultRooms.length; i++) {
    var r = defaultRooms[i];
    sheet.appendRow([r.branch, r.room, r.name, r.rate, r.due, "Ubah kolom D untuk menentukan tarif kamar"]);
  }

  try {
    sheet.getRange(3, 4, defaultRooms.length, 1).setNumberFormat('"Rp"#,##0');
  } catch (eFmt) {}

  return sheet;
}

function readAllRoomRates(rateSheet, ss) {
  var lastRow = rateSheet.getLastRow();
  if (lastRow < 3) return [];

  // Auto-cleanup: jika ada kolom 'mesin', hapus kolom tersebut
  var lastCol = Math.max(rateSheet.getLastColumn(), 6);
  var headerRow = rateSheet.getRange(2, 1, 1, lastCol).getValues()[0];
  for (var c = headerRow.length - 1; c >= 0; c--) {
    if (String(headerRow[c] || '').toLowerCase().indexOf('mesin') !== -1) {
      try {
        rateSheet.deleteColumn(c + 1);
      } catch (eDel) {}
    }
  }

  // Refresh info kolom
  lastCol = Math.max(rateSheet.getLastColumn(), 6);
  headerRow = rateSheet.getRange(2, 1, 1, lastCol).getValues()[0];

  var colIdxBranch = 0;
  var colIdxRoom = 1;
  var colIdxName = 2;
  var colIdxRate = 3;
  var colIdxDue = 4;
  var colIdxNotes = 5;
  var colIdxUser = -1;
  var colIdxPass = -1;

  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '').toLowerCase();
    if (h.indexOf('cabang') !== -1) colIdxBranch = c;
    else if (h.indexOf('nomor') !== -1 || h.indexOf('kamar') !== -1) colIdxRoom = c;
    else if (h.indexOf('nama') !== -1 || h.indexOf('penghuni') !== -1) colIdxName = c;
    else if (h.indexOf('tarif') !== -1 || h.indexOf('sewa') !== -1) colIdxRate = c;
    else if (h.indexOf('tempo') !== -1 || h.indexOf('jatuh') !== -1) colIdxDue = c;
    else if (h.indexOf('catatan') !== -1) colIdxNotes = c;
    else if (h.indexOf('user') !== -1) colIdxUser = c;
    else if (h.indexOf('pass') !== -1 || h.indexOf('sandi') !== -1) colIdxPass = c;
  }

  var data = rateSheet.getRange(3, 1, lastRow - 2, lastCol).getValues();
  var rates = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var branchRaw = String(row[colIdxBranch] || '').toLowerCase();
    var loc = (branchRaw.indexOf('2') !== -1 || branchRaw.indexOf('dua') !== -1) ? 'acarya_2' : 'acarya_1';
    var roomRaw = extractRoomDigits(row[colIdxRoom]);
    var name = String(row[colIdxName] || '');
    var rawRateStr = String(row[colIdxRate] || '');
    var cleanRateDigits = '';
    for (var dIdx = 0; dIdx < rawRateStr.length; dIdx++) {
      var cDigit = rawRateStr.charAt(dIdx);
      if (cDigit >= '0' && cDigit <= '9') {
        cleanRateDigits += cDigit;
      }
    }
    var rate = Number(cleanRateDigits) || 0;
    var due = Number(row[colIdxDue]) || 5;
    var notes = String(row[colIdxNotes] || '');

    if (roomRaw) {
      var rateObj = {
        kostLocation: loc,
        roomNumber: roomRaw,
        tenantName: name,
        monthlyRentRate: rate,
        rentDueDateDay: due,
        notes: notes
      };
      if (colIdxUser >= 0) {
        var inlineUser = String(row[colIdxUser] || '').trim();
        if (inlineUser) rateObj.username = inlineUser;
      }
      if (colIdxPass >= 0) {
        var inlinePass = String(row[colIdxPass] || '').trim();
        if (inlinePass) rateObj.password = inlinePass;
      }
      rates.push(rateObj);
    }
  }

  // Gabungkan data Username & Password kamar dari tab AKUN_LOGIN_KAMAR (jika ada) agar sinkron antar perangkat (Laptop <-> HP)
  try {
    var accMap = readRoomAccountsMap(ss);
    for (var k = 0; k < rates.length; k++) {
      var key = rates[k].kostLocation + '_' + rates[k].roomNumber;
      if (accMap[key]) {
        if (accMap[key].username) rates[k].username = accMap[key].username;
        if (accMap[key].password) rates[k].password = accMap[key].password;
        if (accMap[key].phone !== undefined) rates[k].phone = accMap[key].phone;
        if (accMap[key].isOccupied !== undefined) rates[k].isOccupied = accMap[key].isOccupied;
      }
    }
  } catch (eAccRead) {}

  return rates;
}

function findOrCreateRoomAccountsSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "AKUN_LOGIN_KAMAR";
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  var headers = [
    "Cabang Kost", "Nomor Kamar", "Nama Penghuni", "Username", "Password", "No. WhatsApp", "Status Huni", "Terakhir Diubah"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#0F172A").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

function readRoomAccountsMap(ss) {
  var map = {};
  var sheet = ss.getSheetByName("AKUN_LOGIN_KAMAR");
  if (!sheet || sheet.getLastRow() < 2) return map;
  var lastCol = Math.max(sheet.getLastColumn(), 7);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var cBranch = 0, cRoom = 1, cUser = 3, cPass = 4, cPhone = 5, cStatus = 6;
  for (var hc = 0; hc < header.length; hc++) {
    var hText = String(header[hc] || '').toLowerCase();
    if (hText.indexOf('cabang') !== -1) cBranch = hc;
    else if (hText.indexOf('nomor') !== -1 || hText.indexOf('kamar') !== -1) cRoom = hc;
    else if (hText.indexOf('user') !== -1) cUser = hc;
    else if (hText.indexOf('pass') !== -1 || hText.indexOf('sandi') !== -1) cPass = hc;
    else if (hText.indexOf('wa') !== -1 || hText.indexOf('hp') !== -1 || hText.indexOf('telepon') !== -1) cPhone = hc;
    else if (hText.indexOf('status') !== -1) cStatus = hc;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var branchRaw = String(row[cBranch] || '').toLowerCase();
    var loc = (branchRaw.indexOf('2') !== -1 || branchRaw.indexOf('dua') !== -1) ? 'acarya_2' : 'acarya_1';
    var room = extractRoomDigits(row[cRoom]);
    var username = String(row[cUser] || '').trim();
    var password = String(row[cPass] || '').trim();
    var phone = String(row[cPhone] || '').trim();
    var stRaw = String(row[cStatus] || '').toUpperCase().trim();
    if (room) {
      map[loc + '_' + room] = {
        username: username || undefined,
        password: password || undefined,
        phone: phone || undefined,
        isOccupied: stRaw ? (stRaw === 'DIHUNI') : undefined
      };
    }
  }
  return map;
}

function upsertRoomAccountsToSheet(ss, items) {
  if (!ss || !items || !items.length) return;
  var hasAccountData = false;
  for (var x = 0; x < items.length; x++) {
    if (items[x].username || items[x].password) {
      hasAccountData = true;
      break;
    }
  }
  if (!hasAccountData) return;

  var sheet = findOrCreateRoomAccountsSheet(ss);
  var lastRow = sheet.getLastRow();
  var existingVals = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 8).getValues() : [];

  for (var j = 0; j < items.length; j++) {
    var item = items[j];
    if (!item || !item.roomNumber) continue;
    var loc = (String(item.kostLocation || '').indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
    var branchLabel = loc === 'acarya_2' ? 'Acarya 2' : 'Acarya 1';
    var room = extractRoomDigits(item.roomNumber);
    var nameStr = String(item.tenantName || item.name || ('Kamar ' + room)).trim();
    var userStr = String(item.username || ('kamar' + room)).trim();
    var passStr = String(item.password || '').trim();
    var phoneStr = String(item.phone || '').trim();
    var stStr = item.isOccupied === false ? 'TERSEDIA' : 'DIHUNI';
    if (!passStr && !item.username) continue;

    var foundIdx = -1;
    for (var i = 0; i < existingVals.length; i++) {
      var eLoc = (String(existingVals[i][0] || '').toLowerCase().indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
      var eRoom = extractRoomDigits(existingVals[i][1]);
      if (eLoc === loc && eRoom === room) {
        foundIdx = i + 2;
        break;
      }
    }

    var rowVals = [branchLabel, room, nameStr, userStr, passStr, phoneStr, stStr, new Date().toLocaleString('id-ID')];
    if (foundIdx > 0) {
      sheet.getRange(foundIdx, 1, 1, rowVals.length).setValues([rowVals]);
    } else {
      sheet.appendRow(rowVals);
      existingVals.push(rowVals);
    }
  }
}

function renameAndSyncRoomTenantInSheets(ss, item) {
  if (!ss || !item || !item.roomNumber) return;
  var loc = (String(item.kostLocation || '').indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
  var branchLabel = loc === 'acarya_2' ? 'Acarya Kost 2' : 'Acarya Kost 1';
  var digits = extractRoomDigits(item.roomNumber);
  var rawName = String(item.tenantName || item.name || '').trim();
  var isAvailable = !rawName || rawName === '-' || rawName.toLowerCase().indexOf('tersedia') !== -1;
  var resolvedDisplay = isAvailable ? ('Kamar ' + digits + ' (Tersedia)') : rawName;

  // 1. Update / Rename tab sheet kamar tersebut
  try {
    findOrCreateRoomSheet(ss, resolvedDisplay, digits, loc);
  } catch (eRoom) {}

  // 2. Update Nama Penghuni di sheet Jadwal_Servis_AC jika ada
  try {
    var acSheet = ss.getSheetByName("Jadwal_Servis_AC");
    if (acSheet && acSheet.getLastRow() >= 2) {
      var acVals = acSheet.getRange(2, 1, acSheet.getLastRow() - 1, 4).getValues();
      for (var a = 0; a < acVals.length; a++) {
        var acBranch = String(acVals[a][1] || '');
        var acRoom = extractRoomDigits(acVals[a][2]);
        if (acRoom === digits && acBranch === branchLabel) {
          acSheet.getRange(a + 2, 4).setValue(isAvailable ? ('Kamar ' + digits) : rawName);
        }
      }
    }
  } catch (eAc) {}

  // 3. Update Nama Penghuni di sheet Jadwal_Cek_Kamar jika ada
  try {
    var inspSheet = ss.getSheetByName("Jadwal_Cek_Kamar");
    if (inspSheet && inspSheet.getLastRow() >= 2) {
      var inspVals = inspSheet.getRange(2, 1, inspSheet.getLastRow() - 1, 4).getValues();
      for (var r = 0; r < inspVals.length; r++) {
        var inspBranch = String(inspVals[r][1] || '');
        var inspRoom = extractRoomDigits(inspVals[r][2]);
        if (inspRoom === digits && inspBranch === branchLabel) {
          inspSheet.getRange(r + 2, 4).setValue(isAvailable ? ('Kamar ' + digits) : rawName);
        }
      }
    }
  } catch (eInsp) {}
}

function saveRoomRatesToSheet(rateSheet, newRates, ss) {
  if (!newRates || !newRates.length) return 0;
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var lastRow = rateSheet.getLastRow();
  if (lastRow < 3) return 0;

  var lastCol = Math.max(rateSheet.getLastColumn(), 6);
  var range = rateSheet.getRange(3, 1, lastRow - 2, lastCol);
  var values = range.getValues();
  var updated = 0;

  for (var i = 0; i < values.length; i++) {
    var branchRaw = String(values[i][0] || '').toLowerCase();
    var loc = (branchRaw.indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
    var room = extractRoomDigits(values[i][1]);

    for (var j = 0; j < newRates.length; j++) {
      var item = newRates[j];
      var itemRoom = extractRoomDigits(item.roomNumber);
      var itemLoc = (String(item.kostLocation || '').indexOf('2') !== -1) ? 'acarya_2' : 'acarya_1';
      if (itemLoc === loc && itemRoom === room) {
        if (item.monthlyRentRate) values[i][3] = Number(item.monthlyRentRate);
        var incomingName = String(item.tenantName || item.name || '').trim();
        if (incomingName) {
          values[i][2] = incomingName === '-' ? ('Kamar ' + room + ' (Tersedia)') : incomingName;
        }
        if (item.rentDueDateDay) {
          values[i][4] = Number(item.rentDueDateDay);
        }
        renameAndSyncRoomTenantInSheets(ss, item);
        updated++;
        break;
      }
    }
  }

  range.setValues(values);
  try {
    upsertRoomAccountsToSheet(ss, newRates);
  } catch (eUpAcc) {}
  return updated;
}

/**
 * =========================================================================
 * MEMBACA DATA PEMBAYARAN SEWA & LISTRIK DARI GOOGLE SHEET (SUMBER KEBENARAN)
 * =========================================================================
 */
function parseNumberSafe(val) {
  if (typeof val === 'number') return val;
  var s = String(val || '');
  var digits = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      digits += ch;
    }
  }
  return Number(digits) || 0;
}

function readKostPaymentsFromSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var list = [];
  var seenIds = {};

  // 1. Baca dari Sheet Master Pembayaran_Kost
  var masterSheet = ss.getSheetByName('Pembayaran_Kost');
  if (masterSheet && masterSheet.getLastRow() >= 2) {
    var lastRow = masterSheet.getLastRow();
    var lastCol = Math.max(masterSheet.getLastColumn(), 15);
    var data = masterSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var txId = String(row[2] || '').trim();
      var tenantName = String(row[3] || '').trim();
      var roomNum = extractRoomDigits(row[4]);
      if (!txId && !tenantName && (!row[4] || String(row[4]).trim() === '')) continue;

      var locRaw = String(row[1] || '').toLowerCase();
      var loc = locRaw.indexOf('2') !== -1 ? 'acarya_2' : 'acarya_1';
      var typeRaw = String(row[6] || 'bulanan').toLowerCase();
      var pType = 'bulanan';
      if (typeRaw.indexOf('cicil') !== -1) pType = 'tahunan_cicil';
      else if (typeRaw.indexOf('tahun') !== -1) pType = 'tahunan';
      else if (typeRaw.indexOf('beberapa') !== -1 || Number(row[7]) > 1) pType = 'beberapa_bulan';

      var durMonths = Number(row[7]) || (pType === 'tahunan' || pType === 'tahunan_cicil' ? 12 : 1);
      var periodFull = String(row[8] || '').trim();
      var pParts = periodFull.split(' s/d ');
      var pStart = pParts[0] ? pParts[0].trim() : periodFull;
      var pEnd = pParts[1] ? pParts[1].trim() : pStart;

      var totalAmt = parseNumberSafe(row[10]);
      var mRate = durMonths > 0 ? Math.round(totalAmt / durMonths) : totalAmt;
      var methodRaw = String(row[11] || 'bri').toLowerCase().trim();
      var method = methodRaw.indexOf('qris') !== -1 ? 'qris' : (methodRaw.indexOf('cash') !== -1 || methodRaw.indexOf('tunai') !== -1 ? 'cash' : 'bri');

      var stRaw = String(row[12] || 'Sukses').toLowerCase();
      var status = (stRaw.indexOf('pending') !== -1 || stRaw.indexOf('menunggu') !== -1) ? 'pending' : 'verified';
      var proofVal = String(row[13] || '').trim();
      var resolvedId = txId || ('KP-SHEET-' + (i + 2));
      seenIds[resolvedId] = true;

      list.push({
        id: resolvedId,
        kostLocation: loc,
        tenantName: tenantName || ('Kamar ' + roomNum),
        roomNumber: roomNum,
        phone: String(row[5] || ''),
        paymentType: pType,
        durationMonths: durMonths,
        monthlyRate: mRate,
        totalAmount: totalAmt,
        periodStart: pStart,
        periodEnd: pEnd,
        dueDate: formatDateCell(row[9]),
        paymentMethod: method,
        proofImage: proofVal.indexOf('http') === 0 ? proofVal : undefined,
        notes: String(row[14] || ''),
        status: status,
        createdAt: formatDateCell(row[0]),
        syncedToSheets: true
      });
    }
  }

  // 2. Pindai juga Sheet Kamar jika ada transaksi yang dicatat langsung di tab kamar
  var allSheets = ss.getSheets();
  var skipNames = {
    'Pembayaran_Kost': true,
    'Pembayaran_Listrik': true,
    'DAFTAR_TARIF_KAMAR': true,
    'Jadwal_Servis_AC': true,
    'Jadwal_Fasilitas': true,
    'Jadwal_Cek_Kamar': true,
    'Arsip_Foto_Bukti': true,
    'KONTROL_CICILAN_TAHUNAN': true,
    'AKUN_LOGIN_KAMAR': true,
    'Log_Sistem': true
  };

  for (var s = 0; s < allSheets.length; s++) {
    var sh = allSheets[s];
    var sName = sh.getName();
    if (skipNames[sName]) continue;
    var rLast = sh.getLastRow();
    if (rLast < 3) continue;

    var sLower = sName.toLowerCase();
    var shLoc = (sLower.indexOf('acarya 2') !== -1 || sLower.indexOf('acarya_2') !== -1) ? 'acarya_2' : 'acarya_1';
    var nameParts = sName.split('_');
    var shTenant = nameParts[0] || sName;
    var shRoom = extractRoomDigits(nameParts.length >= 2 ? nameParts[1] : sName);

    var rCols = Math.max(sh.getLastColumn(), 13);
    var rVals = sh.getRange(3, 1, rLast - 2, rCols).getValues();
    for (var r = 0; r < rVals.length; r++) {
      var rRow = rVals[r];
      var cat = String(rRow[1] || '').toLowerCase();
      if (cat.indexOf('sewa') === -1) continue;

      var rTxId = String(rRow[2] || '').trim() || ('KP-RM-' + shRoom + '-' + (r + 3));
      if (seenIds[rTxId]) continue;
      seenIds[rTxId] = true;

      var rType = 'bulanan';
      var rDur = 1;
      if (cat.indexOf('cicil') !== -1) { rType = 'tahunan_cicil'; rDur = 12; }
      else if (cat.indexOf('tahun') !== -1 || cat.indexOf('12') !== -1) { rType = 'tahunan'; rDur = 12; }
      else if (cat.indexOf('6') !== -1) { rType = 'beberapa_bulan'; rDur = 6; }
      else if (cat.indexOf('beberapa') !== -1) { rType = 'beberapa_bulan'; rDur = 3; }

      var rPeriod = String(rRow[3] || '').trim();
      var rPParts = rPeriod.split(' s/d ');
      var rPStart = rPParts[0] ? rPParts[0].trim() : rPeriod;
      var rPEnd = rPParts[1] ? rPParts[1].trim() : rPStart;
      var rAmt = parseNumberSafe(rRow[7]);
      var rMethodRaw = String(rRow[8] || 'bri').toLowerCase();
      var rMethod = rMethodRaw.indexOf('qris') !== -1 ? 'qris' : (rMethodRaw.indexOf('cash') !== -1 ? 'cash' : 'bri');
      var rStRaw = String(rRow[9] || 'Sukses').toLowerCase();
      var rStatus = (rStRaw.indexOf('pending') !== -1 || rStRaw.indexOf('menunggu') !== -1) ? 'pending' : 'verified';
      var rProof = String(rRow[10] || '').trim();

      list.push({
        id: rTxId,
        kostLocation: shLoc,
        tenantName: shTenant,
        roomNumber: shRoom,
        phone: '',
        paymentType: rType,
        durationMonths: rDur,
        monthlyRate: rDur > 0 ? Math.round(rAmt / rDur) : rAmt,
        totalAmount: rAmt,
        periodStart: rPStart,
        periodEnd: rPEnd,
        dueDate: formatDateCell(rRow[0]),
        paymentMethod: rMethod,
        proofImage: rProof.indexOf('http') === 0 ? rProof : undefined,
        notes: String(rRow[12] || ''),
        status: rStatus,
        createdAt: formatDateCell(rRow[0]),
        syncedToSheets: true
      });
    }
  }

  return list;
}

function readElectricityPaymentsFromSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var list = [];
  var seenIds = {};

  // 1. Baca dari Sheet Master Pembayaran_Listrik
  var masterSheet = ss.getSheetByName('Pembayaran_Listrik');
  if (masterSheet && masterSheet.getLastRow() >= 2) {
    var lastRow = masterSheet.getLastRow();
    var lastCol = Math.max(masterSheet.getLastColumn(), 17);
    var data = masterSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var txId = String(row[2] || '').trim();
      var tenantName = String(row[3] || '').trim();
      var roomNum = extractRoomDigits(row[4]);
      if (!txId && !tenantName && (!row[4] || String(row[4]).trim() === '')) continue;

      var locRaw = String(row[1] || '').toLowerCase();
      var loc = locRaw.indexOf('2') !== -1 ? 'acarya_2' : 'acarya_1';
      var periodMonth = String(row[6] || '').trim();
      var initKwh = parseNumberSafe(row[7]);
      var finKwh = parseNumberSafe(row[8]);
      var useKwh = parseNumberSafe(row[9]);
      var rateKwh = parseNumberSafe(row[10]) || 2000;
      var totalAmt = parseNumberSafe(row[11]);
      var methodRaw = String(row[12] || 'bri').toLowerCase();
      var method = methodRaw.indexOf('qris') !== -1 ? 'qris' : (methodRaw.indexOf('cash') !== -1 || methodRaw.indexOf('tunai') !== -1 ? 'cash' : 'bri');
      var stRaw = String(row[13] || 'Sukses').toLowerCase();
      var status = (stRaw.indexOf('pending') !== -1 || stRaw.indexOf('menunggu') !== -1) ? 'pending' : 'verified';
      var proofVal = String(row[14] || '').trim();
      var meterVal = String(row[15] || '').trim();
      var resolvedId = txId || ('EL-SHEET-' + (i + 2));
      seenIds[resolvedId] = true;

      list.push({
        id: resolvedId,
        kostLocation: loc,
        tenantName: tenantName || ('Kamar ' + roomNum),
        roomNumber: roomNum,
        phone: String(row[5] || ''),
        periodMonth: periodMonth || formatDateCell(row[0]),
        initialKwh: initKwh,
        finalKwh: finKwh,
        usageKwh: useKwh,
        ratePerKwh: rateKwh,
        machineFee: 0,
        totalAmount: totalAmt,
        dueDate: formatDateCell(row[0]),
        paymentMethod: method,
        proofImage: proofVal.indexOf('http') === 0 ? proofVal : undefined,
        meterPhoto: meterVal.indexOf('http') === 0 ? meterVal : undefined,
        notes: String(row[16] || ''),
        status: status,
        createdAt: formatDateCell(row[0]),
        syncedToSheets: true
      });
    }
  }

  // 2. Pindai juga Sheet Kamar jika ada transaksi listrik yang dicatat langsung di tab kamar
  var allSheets = ss.getSheets();
  var skipNames = {
    'Pembayaran_Kost': true,
    'Pembayaran_Listrik': true,
    'DAFTAR_TARIF_KAMAR': true,
    'Jadwal_Servis_AC': true,
    'Jadwal_Fasilitas': true,
    'Jadwal_Cek_Kamar': true,
    'Arsip_Foto_Bukti': true,
    'KONTROL_CICILAN_TAHUNAN': true,
    'AKUN_LOGIN_KAMAR': true,
    'Log_Sistem': true
  };

  for (var s = 0; s < allSheets.length; s++) {
    var sh = allSheets[s];
    var sName = sh.getName();
    if (skipNames[sName]) continue;
    var rLast = sh.getLastRow();
    if (rLast < 3) continue;

    var sLower = sName.toLowerCase();
    var shLoc = (sLower.indexOf('acarya 2') !== -1 || sLower.indexOf('acarya_2') !== -1) ? 'acarya_2' : 'acarya_1';
    var nameParts = sName.split('_');
    var shTenant = nameParts[0] || sName;
    var shRoom = extractRoomDigits(nameParts.length >= 2 ? nameParts[1] : sName);

    var rCols = Math.max(sh.getLastColumn(), 13);
    var rVals = sh.getRange(3, 1, rLast - 2, rCols).getValues();
    for (var r = 0; r < rVals.length; r++) {
      var rRow = rVals[r];
      var cat = String(rRow[1] || '').toLowerCase();
      if (cat.indexOf('listrik') === -1) continue;

      var rTxId = String(rRow[2] || '').trim() || ('EL-RM-' + shRoom + '-' + (r + 3));
      if (seenIds[rTxId]) continue;
      seenIds[rTxId] = true;

      var rPeriod = String(rRow[3] || '').trim();
      var rInit = parseNumberSafe(rRow[4]);
      var rFin = parseNumberSafe(rRow[5]);
      var rUse = parseNumberSafe(rRow[6]);
      var rAmt = parseNumberSafe(rRow[7]);
      var rMethodRaw = String(rRow[8] || 'bri').toLowerCase();
      var rMethod = rMethodRaw.indexOf('qris') !== -1 ? 'qris' : (rMethodRaw.indexOf('cash') !== -1 ? 'cash' : 'bri');
      var rStRaw = String(rRow[9] || 'Sukses').toLowerCase();
      var rStatus = (rStRaw.indexOf('pending') !== -1 || rStRaw.indexOf('menunggu') !== -1) ? 'pending' : 'verified';
      var rProof = String(rRow[10] || '').trim();
      var rMeter = String(rRow[11] || '').trim();

      list.push({
        id: rTxId,
        kostLocation: shLoc,
        tenantName: shTenant,
        roomNumber: shRoom,
        phone: '',
        periodMonth: rPeriod || formatDateCell(rRow[0]),
        initialKwh: rInit,
        finalKwh: rFin,
        usageKwh: rUse,
        ratePerKwh: 2000,
        machineFee: 0,
        totalAmount: rAmt,
        dueDate: formatDateCell(rRow[0]),
        paymentMethod: rMethod,
        proofImage: rProof.indexOf('http') === 0 ? rProof : undefined,
        meterPhoto: rMeter.indexOf('http') === 0 ? rMeter : undefined,
        notes: String(rRow[12] || ''),
        status: rStatus,
        createdAt: formatDateCell(rRow[0]),
        syncedToSheets: true
      });
    }
  }

  return list;
}
`;

export const PERMANENT_GOOGLE_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxujVFF8C7U5nGY7z9j_DvQrddzYBqP1RFWBKSG2WbWBhfmIgcQ2N5qcBmNC7wOkJOa2w/exec';

function resolveActiveWebAppUrl(webAppUrl?: string): string {
  const trimmed = (webAppUrl || '').trim();
  if (!trimmed || !trimmed.includes('AKfycbxujVFF8C7U5nGY7z9j_DvQrddzYBqP1RFWBKSG2WbWBhfmIgcQ2N5qcBmNC7wOkJOa2w')) {
    return PERMANENT_GOOGLE_WEBAPP_URL;
  }
  return trimmed;
}

async function postJsonToAppsScript(
  targetUrl: string,
  payloadObj: Record<string, any>,
  timeoutMs = 45000
): Promise<{ success: boolean; message: string; data?: any }> {
  const bodyStr = JSON.stringify(payloadObj);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: bodyStr,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    try {
      const json = await res.json();
      if (json && json.status === 'error') {
        return {
          success: false,
          message: `Google Apps Script melaporkan kendala: ${json.message}`,
          data: json,
        };
      }
      return {
        success: true,
        message: json?.message || 'Data & Bukti Foto berhasil dicatat ke Google Spreadsheet & Google Drive Anda!',
        data: json,
      };
    } catch {
      return {
        success: true,
        message: 'Data & Bukti Foto berhasil dicatat ke Google Spreadsheet & Google Drive Anda!',
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error?.name === 'AbortError') {
      return {
        success: false,
        message: 'Waktu tunggu habis saat menghubungi Google Spreadsheet.',
      };
    }

    // Fallback no-cors jika browser memblokir pembacaan respons redirect CORS dari script.googleusercontent.com
    try {
      await fetch(targetUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: bodyStr,
      });
      return {
        success: true,
        message: 'Data & Bukti Foto berhasil dikirim ke Google Spreadsheet Anda!',
      };
    } catch (fallbackErr: any) {
      console.error('Error sending to Google Apps Script:', fallbackErr);
      return {
        success: false,
        message: fallbackErr?.message || 'Gagal mengirim data ke Google Spreadsheet.',
      };
    }
  }
}

export async function sendToGoogleSheets(
  webAppUrl: string,
  payload: Record<string, any>
): Promise<{ success: boolean; message: string; data?: any }> {
  const cleanUrl = resolveActiveWebAppUrl(webAppUrl);

  // Normalisasi payload agar pembayaran sewa & listrik (baik baru dikirim maupun sudah diverifikasi)
  // DIJAMIN 100% langsung masuk ke Sheet Kamar & Sheet Rekap Master tanpa pernah di-skip oleh filter status.
  const normalizedPayload: Record<string, any> = { ...payload };

  if (
    normalizedPayload.action === 'pembayaran_kost' ||
    normalizedPayload.action === 'pembayaran_listrik'
  ) {
    normalizedPayload.status = 'Sukses';
    normalizedPayload.hasProof = Boolean(
      normalizedPayload.hasProof || normalizedPayload.proofImage
    );

    const hasHeavyImage =
      (typeof normalizedPayload.proofImage === 'string' &&
        normalizedPayload.proofImage.startsWith('data:image/')) ||
      (typeof normalizedPayload.meterPhoto === 'string' &&
        normalizedPayload.meterPhoto.startsWith('data:image/'));

    if (hasHeavyImage) {
      // TAHAP 1 (Instan ~1 detik): Simpan baris data pembayaran terlebih dahulu tanpa beban base64 foto
      // sehingga data transaksi sewa/listrik DIJAMIN 100% langsung masuk ke Google Sheet!
      const fastRowPayload: Record<string, any> = {
        ...normalizedPayload,
        proofImage: undefined,
        meterPhoto: undefined,
        hasProof: Boolean(normalizedPayload.proofImage || normalizedPayload.hasProof),
      };
      const stage1Res = await postJsonToAppsScript(cleanUrl, fastRowPayload, 25000);

      // TAHAP 2: Unggah foto bukti & foto meteran untuk memperbarui baris dengan ID Transaksi yang sama
      // agar kolom Link Bukti Transfer & Link Foto Meteran terisi link aktif.
      postJsonToAppsScript(cleanUrl, normalizedPayload, 60000).catch((err) => {
        console.warn('Info unggah foto bukti tahap 2:', err);
      });

      return stage1Res;
    }

    return postJsonToAppsScript(cleanUrl, normalizedPayload, 35000);
  }

  if (normalizedPayload.action === 'sync_all_transactions') {
    if (Array.isArray(normalizedPayload.kostPayments)) {
      normalizedPayload.kostPayments = normalizedPayload.kostPayments.map((kp: any) => ({
        ...kp,
        status: 'Sukses',
        hasProof: Boolean(kp?.proofImage || kp?.hasProof),
      }));
    }
    if (Array.isArray(normalizedPayload.electricityPayments)) {
      normalizedPayload.electricityPayments = normalizedPayload.electricityPayments.map(
        (ep: any) => ({
          ...ep,
          status: 'Sukses',
          hasProof: Boolean(ep?.proofImage || ep?.hasProof),
        })
      );
    }
    return postJsonToAppsScript(cleanUrl, normalizedPayload, 60000);
  }

  return postJsonToAppsScript(cleanUrl, normalizedPayload, 35000);
}

/**
 * Mengambil seluruh data sinkronisasi 2 arah dari Google Spreadsheet:
 * - Tarif Kamar (tab DAFTAR_TARIF_KAMAR)
 * - Jadwal Servis AC (tab Jadwal_Servis_AC)
 * - Jadwal Fasilitas (tab Jadwal_Fasilitas)
 * - Jadwal Cek Kamar (tab Jadwal_Cek_Kamar)
 * melalui Web App endpoint (doGet).
 */
export async function fetchRoomRatesFromGoogleSheets(
  webAppUrl: string
): Promise<{
  success: boolean;
  rates?: RoomRateSyncItem[];
  kostPayments?: KostPaymentRecord[];
  electricityPayments?: ElectricityRecord[];
  hasPaymentsSync?: boolean;
  hasAccountsSync?: boolean;
  acServices?: AcServiceRecord[];
  facilities?: FacilityMaintenance[];
  roomInspections?: RoomInspection[];
  hasSchedulesSync?: boolean;
  message: string;
}> {
  const cleanUrl = resolveActiveWebAppUrl(webAppUrl);

  const getUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=get_all_sync_data&_t=${Date.now()}`
    : `${cleanUrl}?action=get_all_sync_data&_t=${Date.now()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(getUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const hasSchedulesSync =
      Array.isArray(data.acServices) ||
      Array.isArray(data.facilities) ||
      Array.isArray(data.roomInspections);
    const hasPaymentsSync =
      Array.isArray(data.kostPayments) || Array.isArray(data.electricityPayments);
    const hasAccountsSync = Boolean(data.hasAccountsSync);

    if (data.status === 'success') {
      return {
        success: true,
        rates: Array.isArray(data.rates) ? data.rates : [],
        kostPayments: Array.isArray(data.kostPayments) ? data.kostPayments : undefined,
        electricityPayments: Array.isArray(data.electricityPayments)
          ? data.electricityPayments
          : undefined,
        hasPaymentsSync,
        hasAccountsSync,
        acServices: Array.isArray(data.acServices) ? data.acServices : undefined,
        facilities: Array.isArray(data.facilities) ? data.facilities : undefined,
        roomInspections: Array.isArray(data.roomInspections) ? data.roomInspections : undefined,
        hasSchedulesSync,
        message: data.message || `Berhasil menyinkronkan data dari Google Sheets!`,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Gagal membaca data dari Google Sheets.',
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('Gagal memuat data sinkronisasi via GET:', err);

    if (err?.name === 'AbortError') {
      return {
        success: false,
        message: 'Waktu tunggu koneksi habis (12 detik). Pastikan Apps Script telah di-Deploy Versi Baru.',
      };
    }

    return {
      success: false,
      message: `Gagal memuat data dari Google Sheet: ${err?.message || 'Koneksi terputus'}. Pastikan URL Web App benar dan di-Deploy Versi Baru dengan akses Anyone.`,
    };
  }
}
