=== Referral Ads ===
Contributors: referralads
Tags: advertising, banner, referrer, sticky, native
Requires at least: 6.2
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Plugin iklan dengan referrer wajib, target fleksibel, dan pengaturan kampanye dalam bahasa Indonesia.

== Description ==

Referral Ads menampilkan materi iklan milik Anda hanya jika document.referrer berasal dari domain yang diizinkan. Pengunjung langsung, referrer kosong, atau domain yang tidak cocok tidak memicu iklan.

Format: banner, sticky atas/bawah, native, interstitial, dan popunder berbasis klik pengguna. Pilih ukuran sendiri atau preset, atur halaman/perangkat, jeda, batas tayang per sesi, dan target CSS, XPath, ID, name, class, atribut, atau teks.

Mode tautan langsung atau tujuan dari parameter URL dengan daftar host tujuan. URL halaman asal bisa diteruskan sebagai parameter opsional. Tidak mengklik iklan otomatis, tidak menyisipkan HTML/JavaScript mentah, dan tidak memanggil layanan analitik pihak ketiga.

== Installation ==

1. Unggah ZIP lewat Plugins > Add New > Upload Plugin, lalu aktifkan.
2. Buka menu Referral Ads.
3. Isi domain referrer, misalnya google.com, facebook.com, detik.com, satu per baris.
4. Tambahkan kampanye, pilih format, isi materi dan URL tujuan.
5. Untuk banner/native/popunder, tentukan target elemen yang ada di halaman.
6. Aktifkan plugin dan kampanye, lalu simpan.

== Frequently Asked Questions ==

= Mengapa pengunjung dari domain yang diizinkan masih tidak melihat iklan? =
Browser/situs sumber bisa menghapus referrer karena Referrer-Policy, mode privasi, atau perpindahan HTTPS ke HTTP. Referrer kosong tetap ditolak. Pastikan kampanye aktif, target ada, aturan halaman/perangkat cocok, dan batas sesi belum tercapai.

= Apakah google.com mencakup www.google.com? =
Ya, domain dan subdomain yang benar cocok. google.com.evil.example tidak cocok. google.co.id adalah domain berbeda dan perlu ditambahkan sendiri.

= Apakah referensi tetap berlaku setelah berpindah halaman di situs? =
Setiap halaman mengecek document.referrer-nya sendiri. Navigasi internal akan memiliki referrer situs Anda; tambahkan domain itu hanya jika memang ingin memperbolehkannya. Plugin tidak menyimpan asal kunjungan sebagai cara melewati pemeriksaan wajib.

= Bagaimana mode parameter tautan bekerja? =
Contoh halaman: /artikel/?ad_url=https%3A%2F%2Fpromo.example%2Foffer. Tetapkan parameter ad_url dan izinkan promo.example sebagai host tujuan. Host situs saat ini serta host tautan cadangan juga diizinkan. Parameter kosong/tidak aman/tidak diizinkan memakai tautan cadangan. Jika tidak ada URL tujuan valid, kampanye tidak tampil.

= Apakah popunder selalu muncul di belakang halaman? =
Tidak. Tombol iklan membuka jendela/tab baru hanya setelah klik pengguna. Browser menentukan posisi dan dapat memblokir popup. Plugin tidak membajak klik pada halaman dan tidak menjamin posisi di belakang.

= Apakah bisa memakai skrip jaringan iklan pihak ketiga? =
Versi ini memakai materi gambar/teks dan URL HTTP(S). Tag HTML, iframe, dan JavaScript jaringan iklan belum didukung.

= Apakah ada laporan klik atau impression? =
Belum. Tidak ada pelacakan server atau integrasi analitik dalam versi ini.

== Changelog ==

= 1.0.0 =
* Kampanye multi-format, referrer wajib, selector fleksibel, UI Indonesia, dan mode tautan parameter.
