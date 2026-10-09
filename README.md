# Referral Ads untuk WordPress

Plugin siap dipasang dari folder `referral-ads` atau ZIP hasil `python3 scripts/package.py`. Pengaturan berada di menu **Referral Ads**. Tidak membutuhkan npm, Composer, atau build frontend saat pemasangan.

**[Unduh ZIP plugin Referral Ads 1.0.0](https://github.com/iskayanuhedei-byte/cb/raw/refs/heads/main/releases/referral-ads-1.0.0.zip)**

Jika tautan langsung tidak terbuka, buka [file ZIP di GitHub](https://github.com/iskayanuhedei-byte/cb/blob/main/releases/referral-ads-1.0.0.zip), kemudian klik **Download raw file**. Masuk ke akun GitHub yang memiliki akses jika repo privat. Gunakan ZIP di folder `releases` untuk upload plugin ke WordPress.

## Aturan utama

`document.referrer` **wajib** cocok dengan daftar domain. Referrer kosong atau tidak cocok berarti tidak ada materi iklan yang dibuat. `google.com` cocok dengan `www.google.com`, tetapi tidak cocok dengan `google.com.evil.example` ataupun `google.co.id`. Browser yang menyembunyikan referrer tetap ditolak. Navigasi internal dievaluasi kembali per halaman; asal kunjungan tidak disimpan untuk melewati pemeriksaan.

Plugin mendukung banner, sticky atas/bawah, native, interstitial, dan popunder melalui tombol yang diklik pengguna. Plugin tidak melakukan klik iklan otomatis. Posisi popunder di belakang halaman bergantung pada browser.

## Mulai menggunakan

1. Upload ZIP melalui **Plugins → Add New → Upload Plugin**, lalu aktifkan.
2. Buka **Referral Ads** dan masukkan domain referrer satu per baris, misalnya `google.com`, `facebook.com`, `detik.com`.
3. Tambah kampanye, pilih format, isi judul/gambar/teks dan tautan.
4. Untuk banner/native/popunder, pilih target yang benar-benar ada di tema Anda. Sticky dan interstitial tidak membutuhkan target penempatan.
5. Aktifkan plugin serta kampanye, lalu **Simpan pengaturan**. Kampanye baru tetap belum tayang sampai disimpan.

Gunakan tautan normal dari situs yang diizinkan untuk menguji; membuka alamat langsung tidak akan menayangkan iklan. Preview admin hanya menampilkan desain, tidak menyimulasikan referrer.

Untuk membuat lokasi khusus di editor blok WordPress, tambahkan blok **Shortcode** berisi `[referral_ads_slot id="promo"]`, kemudian pilih target **ID** bernilai `promo`. Shortcode hanya membuat wadah kosong; syarat referrer tetap berlaku. Untuk target tombol, tautan, atau input, gunakan posisi sebelum/sesudah, bukan menyisipkan iklan di dalamnya.

## Target fleksibel

| Jenis | Contoh nilai |
| --- | --- |
| CSS | `main, article, .site-content` |
| XPath | `//section[@id="promo"]` |
| ID | `promo-slot` |
| Name | `promo-slot`, cocok dengan atribut `name` |
| Class | `promo-slot featured`, elemen harus mempunyai kedua class |
| Atribut | nama `data-testid`, nilai `promo-slot` |
| Teks | `Penawaran`, tag pencarian `section, div` |

Pilih sisipkan sebelum/sesudah elemen atau di awal/akhir isinya. Kandidat yang tersembunyi/nonaktif dilewati. Selector salah atau target belum tersedia tidak menyebabkan penempatan sembarang; plugin menunggu hingga batas pencarian. Jeda awal tetap berlaku walaupun DOM berubah lebih cepat.

## Tautan langsung dan parameter

- **Langsung:** gunakan URL tujuan yang disimpan; path situs seperti `/penawaran/` juga didukung.
- **Parameter:** ambil tujuan dari query halaman, contoh `/artikel/?ad_url=https%3A%2F%2Fpromo.example%2Foffer`. Host tujuan wajib sesuai daftar host tujuan, host situs saat ini, atau host tautan cadangan. Host tujuan juga mencakup subdomainnya. Nilai kosong/tidak diizinkan memakai tautan cadangan. Tanpa URL valid, iklan tidak tampil.
- **Kirim halaman asal:** opsional untuk kedua mode; tambahkan URL halaman saat ini pada parameter `source_page` atau nama yang Anda atur. Aktifkan hanya jika URL halaman itu sesuai untuk dibagikan ke tujuan iklan, karena query URL ikut terkirim.

Tautan menggunakan HTTP(S), membuka tab/jendela baru dengan `sponsored noopener noreferrer`. URL dengan protokol lain atau kredensial tertanam ditolak. Referrer yang menentukan penayangan adalah referrer masuk, terpisah dari URL halaman asal yang diteruskan.

## Pengaturan lain

Ukuran 120–1600 × 50–1200 piksel dengan opsi responsif; native/interstitial memakai lebar maksimum dan tinggi otomatis. Aturan halaman cocok dengan pathname persis atau prefix berakhiran `*`, misalnya `/berita/*`; query tidak diperhitungkan. Perangkat mobile sampai 767 px. Batas per sesi memakai `sessionStorage`, biasanya terpisah per tab. Jika storage tidak tersedia, batas degradasi menjadi per halaman. Semua mode menampilkan satu materi per kampanye per dokumen; `always` berarti tampil lagi pada kunjungan halaman berikutnya, bukan membuka ulang iklan yang baru ditutup.

Interstitial dan sticky mempunyai tombol tutup. Interstitial mendukung tombol Escape dan fokus keyboard. Iklan mempunyai label yang tidak bisa dikosongkan. Tidak ada injeksi HTML mentah, tag jaringan iklan, laporan klik/impression, atau analitik pihak ketiga dalam versi ini.

## Pengembangan dan pemeriksaan

PHP 7.4+ dan WordPress 6.2+; validasi integrasi dilakukan pada WordPress 6.8.3/PHP 8.4 dengan database SQLite untuk lingkungan pengujian. SQLite bukan dependensi plugin produksi.

```sh
node --check referral-ads/assets/admin.js
node --check referral-ads/assets/frontend.js
node tests/frontend.spec.cjs
php tests/config-test.php
node tests/wp-browser.spec.cjs
node tests/save-shape.spec.cjs
python3 scripts/package.py
```

Pengujian browser memerlukan Playwright dan Chromium (di cloud ini sudah tersedia). `tests/config-test.php` menerima `RFA_WP_ROOT` untuk memuat instalasi WordPress pengujian. Instruksi runtime cloud disimpan terpisah dari ZIP plugin; tiap task cloud sudah terisolasi, gunakan checkout ini tanpa membuat worktree baru kecuali diminta.

Di lingkungan cloud ini, jalankan `bash scripts/setup-cloud.sh`, kemudian `bash scripts/start-cloud.sh`. PHP tersedia melalui `/workspace/.rfa-runtime/php-cli`; pengujian integrasi menggunakan situs lokal yang terisolasi dan mengembalikan pengaturan yang ada setelah selesai. PHP/WordPress/SQLite pengujian disimpan di luar checkout plugin. SQLite tidak diperlukan di situs WordPress tujuan. Server lokal diperlukan lagi setelah pemulihan snapshot; proses tidak dianggap ikut tersimpan.

Pengaturan hanya dapat diubah oleh administrator (`manage_options`) dengan nonce AJAX. Data disanitasi dan dibatasi di server. Pengaturan tetap tersimpan ketika plugin dinonaktifkan/dihapus sehingga tidak hilang tanpa sengaja.
