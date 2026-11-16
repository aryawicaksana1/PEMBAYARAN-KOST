import React, { useState } from 'react';
import {
  Building,
  Banknote,
  Copy,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  QrCode,
  Download,
  ZoomIn,
  X,
} from 'lucide-react';
import { AppSettings } from '../types';

interface PaymentMethodsModalProps {
  settings: AppSettings;
  onClose: () => void;
}

export const PaymentMethodsModal: React.FC<PaymentMethodsModalProps> = ({
  settings,
  onClose,
}) => {
  const [copiedBank, setCopiedBank] = useState(false);
  const [copiedNmid, setCopiedNmid] = useState(false);
  const [activeTab, setActiveTab] = useState<'bri' | 'qris' | 'cash'>('bri');
  const [zoomQris, setZoomQris] = useState(false);

  const qrisUrl = settings.qrisImageUrl || '/qris-acarya.jpg';

  const handleCopy = () => {
    navigator.clipboard.writeText(settings.briAccountNo.replace(/\D/g, ''));
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const handleCopyNmid = () => {
    navigator.clipboard.writeText('ID1026521970321');
    setCopiedNmid(true);
    setTimeout(() => setCopiedNmid(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          id="btn-back-methods"
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Metode Pembayaran Resmi
          </h2>
          <p className="text-xs text-slate-500">
            Pilihan pembayaran resmi kost: Transfer Bank BRI, QRIS (Scan QR Code), dan Tunai (Cash)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
        <button
          id="tab-method-bri"
          type="button"
          onClick={() => setActiveTab('bri')}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'bri'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Transfer BRI</span>
        </button>
        <button
          id="tab-method-qris"
          type="button"
          onClick={() => setActiveTab('qris')}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'qris'
              ? 'bg-white text-rose-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <QrCode className="w-4 h-4 text-rose-600 shrink-0" />
          <span>QRIS (Scan QR)</span>
        </button>
        <button
          id="tab-method-cash"
          type="button"
          onClick={() => setActiveTab('cash')}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'cash'
              ? 'bg-white text-emerald-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Cash (Tunai)</span>
        </button>
      </div>

      {/* BRI Tab */}
      {activeTab === 'bri' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-2xs">
                BRI
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Transfer Bank Rakyat Indonesia (BRI)
                </h3>
                <p className="text-xs text-slate-500">
                  Dapat ditransfer via ATM, BRImo, SMS Banking, atau Antar Bank (Kode BRI: 002)
                </p>
              </div>
            </div>
          </div>

          {/* Card Account */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center text-xs opacity-75 font-medium">
              <span>REKENING PENERIMA PEMBAYARAN KOST</span>
              <span className="font-bold text-blue-400">BANK BRI</span>
            </div>

            <div>
              <div className="text-xs text-slate-400">Nomor Rekening:</div>
              <div className="text-xl sm:text-2xl font-mono font-bold tracking-wider mt-0.5 text-white">
                {settings.briAccountNo}
              </div>
            </div>

            <div className="flex justify-between items-end pt-2 border-t border-slate-800">
              <div>
                <div className="text-[10px] text-slate-400 uppercase">Nama Pemilik Rekening:</div>
                <div className="text-sm font-bold tracking-wide text-slate-200">
                  {settings.briAccountName}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              >
                {copiedBank ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedBank ? 'Tersalin!' : 'Salin No Rek'}</span>
              </button>
            </div>
          </div>

          {/* Guide Steps */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2 text-xs text-slate-700">
            <h4 className="font-bold text-slate-900">Petunjuk Transfer via BRImo / m-Banking:</h4>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>Buka aplikasi BRImo atau m-Banking bank Anda.</li>
              <li>Pilih menu <strong>Transfer</strong> ➔ <strong>Tambah Penerima Baru</strong>.</li>
              <li>Pilih Bank BRI dan masukkan nomor rekening di atas.</li>
              <li>Pastikan nama penerima tertera <strong>{settings.briAccountName}</strong>.</li>
              <li>Masukkan nominal tagihan sewa / listrik secara tepat.</li>
              <li>Simpan struk transaksi dan upload bukti di form pembayaran.</li>
            </ol>
          </div>
        </div>
      )}

      {/* QRIS Tab */}
      {activeTab === 'qris' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-red-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Pembayaran via QRIS Nasional
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                    SATU QRIS UNTUK SEMUA
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Mendukung semua M-Banking (BRImo, BCA, Livin, BNI) & E-Wallet (GoPay, OVO, DANA, ShopeePay)
                </p>
              </div>
            </div>
          </div>

          {/* QRIS Card Display */}
          <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl p-4 sm:p-6 border-2 border-rose-100 shadow-inner flex flex-col items-center space-y-4">
            <div className="relative group max-w-xs w-full bg-white rounded-2xl p-2.5 shadow-md border border-slate-200">
              <img
                src={qrisUrl}
                alt="QRIS Pembayaran Kost"
                onClick={() => setZoomQris(true)}
                className="w-full h-auto rounded-xl object-contain cursor-zoom-in transition-transform duration-200 group-hover:scale-[1.01]"
              />
              <button
                type="button"
                onClick={() => setZoomQris(true)}
                className="absolute bottom-4 right-4 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 shadow-md backdrop-blur-xs cursor-pointer transition-all"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>Perbesar QR</span>
              </button>
            </div>

            {/* NMID & Actions */}
            <div className="w-full max-w-sm bg-slate-900 text-white rounded-xl p-3.5 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  NMID QRIS Resmi (A01):
                </span>
                <span className="text-xs sm:text-sm font-mono font-bold text-white tracking-wide">
                  ID1026521970321
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyNmid}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1 border border-slate-700 cursor-pointer shrink-0"
              >
                {copiedNmid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedNmid ? 'Tersalin!' : 'Salin NMID'}</span>
              </button>
            </div>

            {/* Action Buttons: Download & Zoom */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full max-w-sm">
              <a
                href={qrisUrl}
                download="QRIS-Acarya-Kost.jpg"
                className="flex-1 py-2.5 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Gambar QRIS</span>
              </a>
              <button
                type="button"
                onClick={() => setZoomQris(true)}
                className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4 text-slate-600" />
                <span>Layar Penuh</span>
              </button>
            </div>
          </div>

          {/* Guide Steps */}
          <div className="bg-rose-50/60 rounded-xl p-4 border border-rose-200/80 space-y-2 text-xs text-slate-700">
            <h4 className="font-bold text-rose-950 flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-rose-600" />
              <span>Cara Mudah Membayar dengan QRIS:</span>
            </h4>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>Buka aplikasi M-Banking (BRImo, BCA Mobile, Livin Mandiri, dll.) atau E-Wallet (GoPay, DANA, OVO, ShopeePay).</li>
              <li>Pilih menu <strong>QRIS / Scan QR</strong>, lalu arahkan kamera ke kode QR di atas (atau pilih <strong>Unggah dari Galeri</strong> setelah mengunduh gambar QRIS).</li>
              <li>Masukkan nominal tagihan sewa kost atau listrik sesuai perhitungan aplikasi.</li>
              <li>Selesaikan pembayaran, lalu <strong>simpan tangkapan layar (screenshot) bukti pembayaran</strong>.</li>
              <li>Unggah bukti pembayaran QRIS pada menu <strong>Sewa Kost</strong> atau <strong>Listrik kWh</strong>.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Cash Tab */}
      {activeTab === 'cash' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Pembayaran Tunai (Cash) Langsung
              </h3>
              <p className="text-xs text-slate-500">
                Bayar tatap muka langsung kepada pengelola di kantor kost
              </p>
            </div>
          </div>

          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 space-y-3 text-xs text-emerald-950">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Ketentuan Khusus Pembayaran Cash:</span>
            </div>
            <div className="space-y-1.5 leading-relaxed text-slate-700">
              <p>
                • <strong>Bebas Bukti Transfer:</strong> Anda <strong>TIDAK PERLU</strong> mengunggah foto bukti pembayaran di aplikasi jika membayar secara tunai.
              </p>
              <p>
                • Cukup pilih metode <strong>Cash</strong> di form Sewa Kost atau Listrik lalu tekan <strong>Kirim</strong>, data otomatis tercatat sebagai pembayaran tunai menunggu penerimaan uang.
              </p>
              <p>
                • Lokasi penyerahan tunai:
                <br />
                &nbsp;&nbsp;📍 <strong>Acarya Kost 1:</strong> Jl. Acarya I No. 10 (Lokasi 1)
                <br />
                &nbsp;&nbsp;📍 <strong>Acarya Kost 2:</strong> Jl. Acarya II No. 25 (Lokasi 2)
              </p>
              <p>
                • Petugas Penerima: <strong>{settings.adminName}</strong>
              </p>
            </div>
          </div>
        </div>
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
                  Scan QRIS — {settings.kostName}
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
