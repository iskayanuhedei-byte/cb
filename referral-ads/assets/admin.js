(function () {
  'use strict';

  var mount = document.getElementById('rfa-admin');
  var boot = window.RFA_ADMIN;
  if (!mount || !boot) return;

  var clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  var config = clone(boot.config || { enabled: false, referrers: [], debug: false, campaigns: [] });
  config.campaigns = Array.isArray(config.campaigns) ? config.campaigns : [];
  config.referrers = Array.isArray(config.referrers) ? config.referrers : [];
  var saved = JSON.stringify(config);
  var selectedId = config.campaigns.length ? config.campaigns[0].id : null;
  var saving = false;
  var message = '';
  var messageType = '';
  var openSection = 'creative';

  var formats = [
    { id: 'banner', icon: '▰', name: 'Banner', note: 'Di antara konten halaman' },
    { id: 'sticky', icon: '▱', name: 'Sticky', note: 'Menempel di tepi layar' },
    { id: 'native', icon: '▤', name: 'Native', note: 'Kartu menyatu dengan konten' },
    { id: 'interstitial', icon: '▣', name: 'Interstitial', note: 'Overlay dengan tombol tutup' },
    { id: 'popunder', icon: '↗', name: 'Popunder', note: 'Jendela baru lewat klik nyata' }
  ];
  var placementTypes = [ ['css', 'CSS selector'], ['xpath', 'XPath'], ['id', 'ID elemen'], ['name', 'Atribut name'], ['class', 'Nama class'], ['attribute', 'Atribut kustom'], ['text', 'Teks elemen'] ];
  var sections = [ ['creative', '01', 'Tampilan'], ['links', '02', 'Tautan'], ['placement', '03', 'Penempatan'], ['rules', '04', 'Aturan tayang'] ];

  function icon(type) {
    var shapes = {
      banner: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h12M6 14h7"/>',
      sticky: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 15h20"/>',
      native: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M7 11h10M7 15h6"/>',
      interstitial: '<rect x="2" y="2" width="20" height="20" rx="2"/><rect x="7" y="6" width="10" height="12" rx="1"/>',
      popunder: '<path d="M13 3h8v8M21 3L10 14M9 5H3v16h16v-6"/>'
    };
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shapes[type] + '</svg>';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function selected() { return config.campaigns.find(function (c) { return c.id === selectedId; }); }
  function dirty() { return JSON.stringify(config) !== saved; }
  function formatName(id) { var f = formats.find(function (item) { return item.id === id; }); return f ? f.name : id; }
  function uid() {
    var random = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return 'ad-' + random.replace(/[^a-z0-9-]/gi, '').slice(0, 48);
  }
  function defaults() {
    return {
      id: uid(), name: 'Kampanye baru', enabled: true, format: 'banner', headline: 'Temukan sesuatu yang menarik',
      description: 'Tuliskan manfaat utama penawaran Anda di sini.', label: 'Iklan', buttonText: 'Lihat penawaran', imageUrl: '', imageAlt: '',
      linkMode: 'direct', directUrl: '', parameterName: 'ad_url', allowedLinkHosts: [], forwardPage: false, sourceParameter: 'source_page',
      width: 728, height: 90, responsive: true, stickyPosition: 'bottom',
      placement: { type: 'css', value: 'main, article, .site-content', attribute: 'data-testid', textExact: false, tags: 'button, a, div, section', insert: 'prepend' },
      pageMode: 'all', pages: [], devices: 'all', delay: 500, timeout: 15000, closeDelay: 0, frequency: 'page', requireVisible: true
    };
  }
  function list(value) { return String(value || '').split(/[\n,]+/).map(function (item) { return item.trim(); }).filter(Boolean); }
  function get(object, path) { return path.split('.').reduce(function (result, key) { return result == null ? '' : result[key]; }, object); }
  function set(object, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (result, key) { if (!result[key]) result[key] = {}; return result[key]; }, object);
    target[last] = value;
  }
  function fieldId(path, scope) { return 'rfa-' + (scope || 'campaign') + '-' + path.replace(/\./g, '-'); }
  function input(path, label, options) {
    options = options || {};
    var scope = options.scope || 'campaign';
    var data = scope === 'global' ? config : selected();
    var value = get(data, path);
    var id = fieldId(path, scope);
    var hint = options.hint ? '<span id="' + id + '-hint" class="rfa-field-hint">' + esc(options.hint) + '</span>' : '';
    var attributes = ' id="' + id + '" data-field="' + esc(path) + '" data-scope="' + scope + '"' + (options.hint ? ' aria-describedby="' + id + '-hint"' : '');
    var control;
    if (options.select) {
      control = '<select' + attributes + '>' + options.select.map(function (pair) {
        return '<option value="' + esc(pair[0]) + '"' + (value === pair[0] ? ' selected' : '') + '>' + esc(pair[1]) + '</option>';
      }).join('') + '</select>';
    } else if (options.textarea) {
      control = '<textarea' + attributes + (options.list ? ' data-list="true"' : ' maxlength="' + (path === 'description' ? 1000 : 500) + '"') + ' rows="' + (options.rows || 3) + '" placeholder="' + esc(options.placeholder || '') + '">' + esc(options.list && Array.isArray(value) ? value.join('\n') : value) + '</textarea>';
    } else {
      var maxLength = path === 'directUrl' || path === 'placement.value' ? 2000 : path === 'parameterName' || path === 'sourceParameter' ? 64 : path === 'placement.tags' ? 500 : path === 'placement.attribute' ? 100 : 250;
      control = '<input' + attributes + ' type="' + (options.type || 'text') + '" value="' + esc(value) + '"' + (options.type === 'number' ? '' : ' maxlength="' + maxLength + '"') + (options.min != null ? ' min="' + options.min + '"' : '') + (options.max != null ? ' max="' + options.max + '"' : '') + (options.step != null ? ' step="' + options.step + '"' : '') + ' placeholder="' + esc(options.placeholder || '') + '"' + (options.required ? ' required' : '') + '>';
    }
    return '<div class="rfa-field' + (options.wide ? ' rfa-field-wide' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + control + hint + '</div>';
  }
  function toggle(path, label, hint, scope) {
    scope = scope || 'campaign';
    var data = scope === 'global' ? config : selected();
    var id = fieldId(path, scope);
    return '<label class="rfa-toggle-field" for="' + id + '"><span><strong>' + esc(label) + '</strong>' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</span><span class="rfa-switch"><input type="checkbox" id="' + id + '" data-field="' + esc(path) + '" data-scope="' + scope + '"' + (get(data, path) ? ' checked' : '') + '><span aria-hidden="true"></span></span></label>';
  }
  function header() {
    return '<header class="rfa-topbar"><div class="rfa-brand"><span class="rfa-logo" aria-hidden="true">R<span>' + icon('popunder') + '</span></span><div><h1>Referral Ads</h1><p>Iklan yang tampil untuk pengunjung yang tepat.</p></div></div><div class="rfa-save-area"><span id="rfa-save-state" class="rfa-save-state"></span><button type="button" class="rfa-btn rfa-btn-primary" data-action="save"' + (saving ? ' disabled' : '') + '>' + (saving ? 'Menyimpan…' : 'Simpan perubahan') + '</button></div></header>';
  }
  function globalPanel() {
    return '<section class="rfa-global-panel" aria-labelledby="rfa-global-heading"><div class="rfa-panel-heading"><div><span class="rfa-eyebrow">GERBANG REFERRER</span><h2 id="rfa-global-heading">Mulai dari sumber pengunjung</h2><p>Setiap format iklan mengikuti aturan ini.</p></div><span class="rfa-lock-badge">Wajib cocok</span></div><div class="rfa-global-grid"><div>' +
      input('referrers', 'Domain referrer yang diizinkan', { scope: 'global', textarea: true, list: true, rows: 3, placeholder: 'google.com\nfacebook.com\ndetik.com', hint: 'Satu domain per baris. Subdomain ikut cocok; evilgoogle.com tidak cocok dengan google.com.' }) +
      '<div id="rfa-referrer-warning" class="rfa-note rfa-note-amber">Referrer kosong atau di luar daftar selalu memblokir iklan. Beberapa browser dan aplikasi dapat menghapus referrer.</div></div><div class="rfa-global-switches">' +
      toggle('enabled', 'Aktifkan semua iklan', 'Saklar utama seluruh kampanye.', 'global') + toggle('debug', 'Mode diagnosis', 'Tampilkan alasan pemblokiran di konsol browser.', 'global') +
      '<p class="rfa-global-footnote">Referrer dibaca dari document.referrer. Parameter URL tidak dapat menggantikan syarat ini.</p></div></div></section>';
  }
  function campaignItems() {
    if (!config.campaigns.length) return '<p class="rfa-sidebar-empty">Belum ada kampanye. Buat yang pertama untuk mulai mengatur iklan.</p>';
    return config.campaigns.map(function (c) {
      return '<button class="rfa-campaign-item' + (c.id === selectedId ? ' is-selected' : '') + '" type="button" data-action="select" data-id="' + esc(c.id) + '"' + (c.id === selectedId ? ' aria-current="true"' : '') + '><span class="rfa-campaign-dot' + (c.enabled ? ' is-active' : '') + '" aria-label="' + (c.enabled ? 'Aktif' : 'Nonaktif') + '"></span><span class="rfa-campaign-title"><strong>' + esc(c.name || 'Tanpa nama') + '</strong><small>' + esc(formatName(c.format)) + '</small></span><span class="rfa-campaign-arrow" aria-hidden="true">›</span></button>';
    }).join('');
  }
  function sidebar() {
    return '<aside class="rfa-sidebar" aria-label="Daftar kampanye"><div class="rfa-sidebar-heading"><h2>Kampanye <span id="rfa-campaign-count">' + config.campaigns.length + '</span></h2><button type="button" class="rfa-icon-btn" data-action="add" aria-label="Tambah kampanye">+</button></div><div id="rfa-campaign-list" class="rfa-campaign-list">' + campaignItems() + '</div><button type="button" class="rfa-btn rfa-btn-outline rfa-add-btn" data-action="add">+ Buat kampanye</button><div class="rfa-sidebar-tip"><span aria-hidden="true">◎</span><strong>Tip penempatan</strong><p>Gunakan shortcode <code>[referral_ads_slot id="promo"]</code>, lalu targetkan ID <code>promo</code> agar lokasi banner konsisten.</p></div></aside>';
  }
  function creative(c) {
    var sizes = [ ['728×90', 728, 90], ['300×250', 300, 250], ['320×100', 320, 100], ['970×250', 970, 250], ['160×600', 160, 600] ];
    return '<div class="rfa-format-grid" role="group" aria-label="Format iklan">' + formats.map(function (f) {
      return '<button type="button" data-action="format" data-value="' + f.id + '" class="rfa-format-card' + (c.format === f.id ? ' is-selected' : '') + '" aria-pressed="' + (c.format === f.id) + '"><span class="rfa-format-icon" aria-hidden="true">' + icon(f.id) + '</span><strong>' + f.name + '</strong><small>' + f.note + '</small></button>';
    }).join('') + '</div>' + (c.format === 'popunder' ? '<div class="rfa-note">Popunder menampilkan tombol yang membuka jendela baru hanya setelah pengunjung mengekliknya. Browser menentukan apakah jendela dapat berada di belakang.</div>' : '') +
      '<div class="rfa-fields">' + input('headline', 'Judul iklan', { wide: true, placeholder: 'Penawaran yang ingin Anda tampilkan' }) + input('description', 'Deskripsi', { wide: true, textarea: true, rows: 2 }) + input('label', 'Label iklan', { placeholder: 'Iklan' }) + input('buttonText', 'Teks tombol', { placeholder: 'Lihat penawaran' }) +
      '<div class="rfa-field rfa-field-wide"><label for="rfa-campaign-imageUrl">Gambar iklan</label><div class="rfa-media-row"><input type="url" id="rfa-campaign-imageUrl" data-field="imageUrl" data-scope="campaign" value="' + esc(c.imageUrl) + '" placeholder="https://contoh.com/banner.jpg"><button type="button" class="rfa-btn rfa-btn-outline" data-action="media">Pilih media</button></div><span class="rfa-field-hint">Pilih dari pustaka WordPress atau masukkan URL gambar HTTP(S).</span></div>' + input('imageAlt', 'Deskripsi gambar (alt)', { wide: true, hint: 'Jelaskan gambar untuk pengunjung yang memakai pembaca layar.' }) +
      input('width', c.format === 'banner' || c.format === 'sticky' ? 'Lebar (px)' : 'Lebar maksimal kartu (px)', { type: 'number', min: 120, max: 1600 }) + input('height', 'Tinggi banner (px)', { type: 'number', min: 50, max: 1200, hint: c.format === 'banner' || c.format === 'sticky' ? 'Berlaku untuk banner dan sticky.' : 'Kartu ini memakai tinggi otomatis.' }) + '</div>' +
      '<div class="rfa-size-presets"><span>Preset ukuran</span>' + sizes.map(function (s) { return '<button type="button" class="rfa-chip' + (c.width === s[1] && c.height === s[2] ? ' is-selected' : '') + '" data-action="size" data-width="' + s[1] + '" data-height="' + s[2] + '">' + s[0] + '</button>'; }).join('') + '</div>' +
      toggle('responsive', 'Responsif', 'Ukuran menyesuaikan layar agar tidak meluber.') + (c.format === 'sticky' ? '<div class="rfa-fields">' + input('stickyPosition', 'Posisi sticky', { select: [['bottom', 'Bawah layar'], ['top', 'Atas layar']] }) + '</div>' : '');
  }
  function links(c) {
    return '<div class="rfa-fields">' + input('linkMode', 'Sumber tautan tujuan', { select: [['direct', 'Tautan langsung'], ['parameter', 'Parameter URL halaman']] }) + input('directUrl', c.linkMode === 'parameter' ? 'Tautan cadangan' : 'Tautan tujuan', { type: 'url', placeholder: 'https://contoh.com/penawaran', hint: c.linkMode === 'parameter' ? 'Digunakan jika parameter tidak ada atau tujuan tidak diizinkan.' : 'Tautan relatif, misalnya /penawaran, juga didukung.' }) +
      (c.linkMode === 'parameter' ? input('parameterName', 'Nama parameter tujuan', { placeholder: 'ad_url', hint: 'Contoh: halaman ini memiliki ?ad_url=https%3A%2F%2Fcontoh.com%2Fpromo' }) + input('allowedLinkHosts', 'Domain tujuan parameter yang diizinkan', { textarea: true, list: true, placeholder: 'contoh.com\npartner.com', hint: 'Domain situs ini dan domain tautan cadangan otomatis diizinkan. Domain lain harus ditambahkan di sini.' }) : '') + '</div>' +
      toggle('forwardPage', 'Kirim alamat halaman asal', 'Tambahkan URL halaman saat ini sebagai parameter pada tautan tujuan.') + (c.forwardPage ? '<div class="rfa-fields">' + input('sourceParameter', 'Nama parameter halaman asal', { placeholder: 'source_page', hint: 'Contoh: https://tujuan.com/promo?source_page=https%3A%2F%2Fsitus.com%2Fartikel' }) + '</div>' : '') +
      '<div class="rfa-note">Tautan hanya menggunakan HTTP(S). Iklan ditandai sebagai sponsored dan dibuka dalam tab atau jendela baru. Parameter tujuan tidak mengubah aturan referrer wajib.</div>';
  }
  function placement(c) {
    if (c.format === 'sticky' || c.format === 'interstitial') return '<div class="rfa-note"><strong>' + esc(formatName(c.format)) + ' memakai posisi layar.</strong> Target elemen tidak diperlukan untuk format ini. Anda tetap dapat membatasi halaman dan perangkat melalui Aturan tayang.</div>';
    var hints = {
      css: 'Contoh: main, #promo, [name="iklan"], .article-content', xpath: 'Contoh: //main atau //*[@name="iklan"]', id: 'Masukkan ID tanpa tanda #. Contoh: promo',
      name: 'Mencocokkan atribut name, bukan judul kampanye. Contoh: iklan', class: 'Masukkan nama class tanpa titik. Contoh: article-content', attribute: 'Nilai atribut yang ingin dicocokkan. Contoh: banner-slot', text: 'Cari elemen melalui teks yang terlihat di dalamnya.'
    };
    return '<div class="rfa-fields">' + input('placement.type', 'Jenis target', { select: placementTypes }) + input('placement.insert', 'Posisi terhadap target', { select: [['prepend', 'Awal di dalam target'], ['append', 'Akhir di dalam target'], ['before', 'Sebelum target'], ['after', 'Sesudah target']] }) +
      (c.placement.type === 'attribute' ? input('placement.attribute', 'Nama atribut', { placeholder: 'data-testid', hint: 'Contoh: data-testid, aria-label, title, atau atribut kustom.' }) : '') + input('placement.value', c.placement.type === 'text' ? 'Teks target' : 'Nilai target', { wide: true, hint: hints[c.placement.type] || '' }) +
      (c.placement.type === 'text' ? input('placement.tags', 'Elemen yang dicari', { wide: true, placeholder: 'button, a, div, section', hint: 'Selector dipisahkan koma. Persempit pencarian agar target lebih akurat.' }) : '') + '</div>' +
      (c.placement.type === 'text' ? toggle('placement.textExact', 'Teks harus sama persis', 'Matikan untuk mencocokkan potongan teks.') : '') + toggle('requireVisible', 'Gunakan target yang terlihat', 'Target tersembunyi dilewati; kandidat berikutnya ikut diperiksa.') +
      '<div class="rfa-note">Untuk target tombol, tautan, input, atau elemen tanpa konten seperti gambar, pilih <strong>Sebelum target</strong> atau <strong>Sesudah target</strong>. Iklan disisipkan ke kandidat pertama yang cocok dan dapat digunakan. Jika target belum tersedia, pencarian dilanjutkan hingga batas waktu. Target yang tidak ditemukan tidak memunculkan iklan di lokasi lain.</div>';
  }
  function rules(c) {
    return '<div class="rfa-fields">' + input('pageMode', 'Halaman yang boleh menampilkan iklan', { select: [['all', 'Semua halaman'], ['include', 'Hanya halaman di daftar'], ['exclude', 'Semua kecuali halaman di daftar']] }) + input('devices', 'Perangkat', { select: [['all', 'Semua perangkat'], ['desktop', 'Desktop (768 px ke atas)'], ['mobile', 'Seluler (767 px ke bawah)']] }) +
      (c.pageMode !== 'all' ? input('pages', 'Daftar path halaman', { wide: true, textarea: true, list: true, placeholder: '/artikel/*\n/promo', hint: 'Satu path per baris. Gunakan * di akhir untuk awalan path. Query string tidak dipakai.' }) : '') +
      input('delay', 'Jeda awal (milidetik)', { type: 'number', min: 0, max: 60000, step: 100, hint: '500 ms = 0,5 detik. Perubahan DOM tidak mempercepat jeda ini.' }) + input('timeout', 'Batas pencarian target (milidetik)', { type: 'number', min: 1000, max: 120000, step: 1000, hint: 'Setelah batas waktu, observer dan timer pencarian dihentikan.' }) +
      input('frequency', 'Frekuensi tayang', { select: [['page', 'Sekali per halaman'], ['session', 'Sekali per sesi tab'], ['always', 'Setiap halaman dimuat']], hint: 'Iklan yang ditutup tidak dibuka ulang dalam dokumen yang sama.' }) +
      (c.format === 'sticky' || c.format === 'interstitial' ? input('closeDelay', 'Jeda tombol tutup (detik)', { type: 'number', min: 0, max: 30, hint: '0 berarti pengunjung dapat langsung menutup iklan.' }) : '') + '</div>' +
      '<div class="rfa-note">Sesi memakai sessionStorage. Jika browser menolak penyimpanan, iklan tetap dapat berjalan dengan aturan sekali dalam dokumen saat ini.</div>';
  }
  function editor(c) {
    if (!c) return '<section class="rfa-empty"><div class="rfa-empty-art" aria-hidden="true">▰<span>↗</span></div><span class="rfa-eyebrow">KAMPANYE PERTAMA ANDA</span><h2>Atur satu iklan, pilih cara tampilnya.</h2><p>Mulai dengan banner, lalu tentukan tautan, target halaman, dan aturan tayang. Referrer wajib berlaku untuk semua format.</p><button type="button" class="rfa-btn rfa-btn-primary" data-action="add">+ Buat kampanye pertama</button></section>';
    var sectionContent = { creative: creative, links: links, placement: placement, rules: rules };
    return '<section class="rfa-editor" aria-labelledby="rfa-editor-heading"><div class="rfa-editor-heading"><div><span class="rfa-eyebrow">EDITOR KAMPANYE</span><h2 id="rfa-editor-heading">' + esc(c.name || 'Tanpa nama') + '</h2></div><div class="rfa-editor-actions"><button type="button" class="rfa-icon-btn" data-action="duplicate" aria-label="Duplikat kampanye" title="Duplikat kampanye">⧉</button><button type="button" class="rfa-icon-btn rfa-danger" data-action="delete" aria-label="Hapus kampanye" title="Hapus kampanye">×</button></div></div><div class="rfa-campaign-basic">' + input('name', 'Nama kampanye', { placeholder: 'Contoh: Promo pembaca Google' }) + toggle('enabled', 'Kampanye aktif', 'Tetap mengikuti saklar utama.') + '</div><nav class="rfa-section-nav" aria-label="Bagian pengaturan">' + sections.map(function (s) { return '<button type="button" data-action="section" data-value="' + s[0] + '"' + (openSection === s[0] ? ' aria-current="step"' : '') + ' class="' + (openSection === s[0] ? 'is-selected' : '') + '"><span>' + s[1] + '</span>' + s[2] + '</button>'; }).join('') + '</nav><div class="rfa-editor-body">' + sectionContent[openSection](c) + '</div></section>';
  }
  function safePreviewUrl(raw) {
    if (!raw) return '';
    try { var url = new URL(raw, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (error) { return ''; }
  }
  function previewContent(c) {
    if (!c) return '<div class="rfa-preview-placeholder">Preview muncul setelah Anda membuat kampanye.</div>';
    var image = safePreviewUrl(c.imageUrl);
    return '<div class="rfa-preview-site" aria-hidden="true"><div class="rfa-preview-site-nav"><i></i><span></span><span></span><span></span></div><div class="rfa-preview-lines"><i></i><i></i><i></i></div><div class="rfa-preview-stage rfa-preview-' + esc(c.format) + '">' + (c.format === 'interstitial' ? '<div class="rfa-preview-backdrop"></div>' : '') + '<div class="rfa-preview-ad" style="--rfa-preview-ratio:' + Number(c.width || 728) + '/' + Number(c.height || 90) + '">' + (c.format === 'sticky' || c.format === 'interstitial' ? '<span class="rfa-preview-close">×</span>' : '') + '<span class="rfa-preview-ad-label">' + esc(c.label || 'Iklan') + '</span>' + (image ? '<img src="' + esc(image) + '" alt="" loading="lazy">' : '<div class="rfa-preview-image"><span>✦</span></div>') + '<div class="rfa-preview-copy"><strong>' + esc(c.headline || 'Judul iklan') + '</strong><p>' + esc(c.description || 'Deskripsi penawaran Anda') + '</p><span class="rfa-preview-button">' + esc(c.buttonText || 'Lihat penawaran') + (c.format === 'popunder' ? ' ↗' : '') + '</span></div></div></div><div class="rfa-preview-lines rfa-preview-lines-bottom"><i></i><i></i><i></i></div></div><div class="rfa-preview-meta"><span>' + esc(formatName(c.format)) + '</span><span>' + (c.format === 'banner' || c.format === 'sticky' ? Number(c.width) + ' × ' + Number(c.height) + ' px' : 'Lebar maks. ' + Number(c.width) + ' px') + '</span></div>';
  }
  function preview() {
    return '<aside class="rfa-preview-panel" aria-labelledby="rfa-preview-heading"><div class="rfa-panel-heading"><div><span class="rfa-eyebrow">LIVE PREVIEW</span><h2 id="rfa-preview-heading">Tampilan iklan</h2></div><span class="rfa-live-dot" aria-hidden="true"></span></div><div id="rfa-preview-content">' + previewContent(selected()) + '</div><p class="rfa-preview-caption">Ilustrasi tata letak, diperkecil untuk preview. Tampilan akhir mengikuti ruang dan tema situs.</p><div class="rfa-checklist"><h3>Sebelum ditayangkan</h3><p><span>1</span>Isi daftar domain referrer.</p><p><span>2</span>Pastikan tautan dan target valid.</p><p><span>3</span>Simpan, lalu kunjungi situs dari sumber yang diizinkan.</p></div></aside>';
  }
  function render(restoreFocus) {
    var focus = restoreFocus && document.activeElement;
    var focusId = focus && focus.id;
    var start = focus && typeof focus.selectionStart === 'number' ? focus.selectionStart : null;
    var end = focus && typeof focus.selectionEnd === 'number' ? focus.selectionEnd : null;
    mount.innerHTML = '<div class="rfa-app">' + header() + '<div id="rfa-notice" class="rfa-notice" role="status" aria-live="polite"></div>' + globalPanel() + '<div class="rfa-workspace">' + sidebar() + '<main class="rfa-editor-wrap">' + editor(selected()) + '</main>' + preview() + '</div><footer class="rfa-footer">Referral Ads <span>v' + esc(boot.version || '1.0.0') + '</span><span>Konten iklan tanpa HTML atau JavaScript kustom.</span></footer></div>';
    updateStatus();
    if (focusId) {
      var replacement = document.getElementById(focusId);
      if (replacement) {
        replacement.focus({ preventScroll: true });
        if (start !== null && (/^(text|url|search|tel|password)$/.test(replacement.type || '') || replacement.tagName === 'TEXTAREA')) {
          try { replacement.setSelectionRange(start, end); } catch (error) { /* Non-text input. */ }
        }
      }
    }
  }
  function updateStatus() {
    var status = mount.querySelector('#rfa-save-state');
    if (status) {
      status.textContent = saving ? 'Sedang menyimpan' : dirty() ? 'Ada perubahan belum disimpan' : 'Semua perubahan tersimpan';
      status.classList.toggle('is-dirty', dirty());
    }
    var saveButton = mount.querySelector('[data-action="save"]');
    if (saveButton) { saveButton.disabled = saving; saveButton.textContent = saving ? 'Menyimpan…' : 'Simpan perubahan'; }
    var notice = mount.querySelector('#rfa-notice');
    if (notice) {
      notice.textContent = message;
      notice.className = 'rfa-notice' + (message ? ' is-visible rfa-notice-' + messageType : '');
    }
    var warning = mount.querySelector('#rfa-referrer-warning');
    if (warning) warning.textContent = config.referrers.length ? 'Referrer kosong atau di luar daftar selalu memblokir iklan. Beberapa browser dan aplikasi dapat menghapus referrer.' : 'Daftar masih kosong: semua iklan akan diblokir sampai domain referrer ditambahkan.';
  }
  function updatePreview() {
    var panel = mount.querySelector('#rfa-preview-content');
    if (panel) panel.innerHTML = previewContent(selected());
    var heading = mount.querySelector('#rfa-editor-heading');
    if (heading && selected()) heading.textContent = selected().name || 'Tanpa nama';
    var items = mount.querySelector('#rfa-campaign-list');
    if (items) items.innerHTML = campaignItems();
    var count = mount.querySelector('#rfa-campaign-count');
    if (count) count.textContent = String(config.campaigns.length);
    updateStatus();
  }
  function announce(text, type) { message = text; messageType = type || 'success'; updateStatus(); }
  function isHttpUrl(raw) {
    if (!raw) return true;
    raw = String(raw).trim();
    if (/^\/(?!\/)/.test(raw) && raw.indexOf('\\') === -1) return true;
    if (!/^https?:\/\//i.test(raw) || raw.indexOf('\\') !== -1) return false;
    try { var url = new URL(raw); return /^https?:$/.test(url.protocol) && !!url.hostname && !url.username && !url.password; } catch (error) { return false; }
  }
  function validDomain(domain) {
    domain = String(domain).trim();
    if (/\s/.test(domain)) return false;
    try {
      var hasScheme = domain.indexOf('://') !== -1;
      var url = new URL(hasScheme ? domain : 'https://' + domain);
      var host = url.hostname.replace(/\.$/, '');
      if (!/^https?:$/.test(url.protocol) || host.length > 253 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(host)) return false;
      if (!hasScheme && (/[\/:?#@]/.test(domain))) return false;
      return host.split('.').every(function (label) { return label.length <= 63; });
    } catch (error) { return false; }
  }
  function validate() {
    var errors = [];
    if (config.referrers.length > 100) errors.push('Maksimal 100 domain referrer dapat disimpan.');
    config.referrers.forEach(function (domain) { if (!validDomain(domain)) errors.push('Domain referrer tidak valid: ' + domain); });
    config.campaigns.forEach(function (c) {
      var name = c.name || 'Kampanye tanpa nama';
      if (!c.name.trim()) errors.push('Isi nama setiap kampanye.');
      if (!isHttpUrl(c.directUrl)) errors.push(name + ': tautan tujuan harus memakai HTTP(S) atau path relatif.');
      if (!isHttpUrl(c.imageUrl)) errors.push(name + ': URL gambar harus memakai HTTP(S).');
      if (c.linkMode === 'direct' && c.enabled && !c.directUrl.trim()) errors.push(name + ': isi tautan tujuan atau nonaktifkan kampanye sementara.');
      if (c.linkMode === 'parameter' && !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(c.parameterName || '')) errors.push(name + ': nama parameter harus diawali huruf dan hanya berisi huruf, angka, _ atau -.');
      if (c.forwardPage && !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(c.sourceParameter || '')) errors.push(name + ': nama parameter halaman asal harus diawali huruf dan hanya berisi huruf, angka, _ atau -.');
      c.allowedLinkHosts.forEach(function (domain) { if (!validDomain(domain)) errors.push(name + ': domain tujuan parameter tidak valid: ' + domain); });
      if (c.pageMode !== 'all' && c.pages.some(function (path) { return path.charAt(0) !== '/' || path.indexOf('//') === 0 || /[?#]/.test(path) || path.slice(0, -1).indexOf('*') !== -1; })) errors.push(name + ': gunakan path yang diawali / tanpa query atau #; * hanya boleh di akhir.');
      [['width', 120, 1600], ['height', 50, 1200], ['delay', 0, 60000], ['timeout', 1000, 120000], ['closeDelay', 0, 30]].forEach(function (rule) {
        if (!Number.isFinite(c[rule[0]]) || c[rule[0]] < rule[1] || c[rule[0]] > rule[2]) errors.push(name + ': nilai ' + rule[0] + ' harus antara ' + rule[1] + ' dan ' + rule[2] + '.');
      });
      if (c.format !== 'sticky' && c.format !== 'interstitial') {
        if (!String(c.placement.value || '').trim()) errors.push(name + ': isi nilai target penempatan.');
        if (c.placement.type === 'css') { try { document.querySelectorAll(c.placement.value); } catch (error) { errors.push(name + ': CSS selector tidak valid.'); } }
        if (c.placement.type === 'xpath') { try { document.evaluate(c.placement.value, document, null, XPathResult.ANY_TYPE, null); } catch (error) { errors.push(name + ': XPath tidak valid.'); } }
        if (c.placement.type === 'attribute' && !/^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/.test(c.placement.attribute || '')) errors.push(name + ': nama atribut tidak valid.');
      }
    });
    return errors;
  }
  async function save() {
    if (saving) return;
    var errors = validate();
    if (errors.length) { announce(errors[0] + (errors.length > 1 ? ' (+' + (errors.length - 1) + ' hal lain perlu diperbaiki.)' : ''), 'error'); return; }
    saving = true;
    announce('');
    updateStatus();
    var snapshot = JSON.stringify(config);
    try {
      var form = new FormData();
      form.append('action', 'rfa_save');
      form.append('nonce', boot.nonce);
      form.append('config', snapshot);
      var response = await fetch(boot.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form });
      var result = await response.json();
      if (!response.ok || !result.success || !result.data || !result.data.config) throw new Error(result.data && result.data.message ? result.data.message : 'Server tidak dapat menyimpan konfigurasi.');
      var returned = clone(result.data.config);
      saved = JSON.stringify(returned);
      if (JSON.stringify(config) === snapshot) {
        config = returned;
        if (!selected()) selectedId = config.campaigns.length ? config.campaigns[0].id : null;
        saving = false;
        message = 'Pengaturan tersimpan. ' + (config.referrers.length ? 'Kampanye mengikuti daftar referrer Anda.' : 'Isi domain referrer untuk mulai menayangkan iklan.');
        messageType = 'success';
        render(true);
      } else {
        saving = false;
        announce('Versi yang dikirim sudah tersimpan. Perubahan terbaru masih perlu disimpan.', 'success');
      }
    } catch (error) {
      saving = false;
      announce('Belum tersimpan: ' + (error && error.message ? error.message : 'periksa koneksi lalu coba lagi.'), 'error');
    }
  }
  mount.addEventListener('input', function (event) {
    var target = event.target;
    if (!target.dataset.field || target.type === 'checkbox' || target.tagName === 'SELECT') return;
    var data = target.dataset.scope === 'global' ? config : selected();
    if (!data) return;
    var value = target.dataset.list ? list(target.value) : target.type === 'number' ? (target.value === '' ? null : Number(target.value)) : target.value;
    set(data, target.dataset.field, value);
    message = '';
    updatePreview();
  });
  mount.addEventListener('change', function (event) {
    var target = event.target;
    if (!target.dataset.field) return;
    if (target.type !== 'checkbox' && target.tagName !== 'SELECT') return;
    var data = target.dataset.scope === 'global' ? config : selected();
    if (!data) return;
    set(data, target.dataset.field, target.type === 'checkbox' ? target.checked : target.value);
    message = '';
    if (['linkMode', 'forwardPage', 'placement.type', 'pageMode'].indexOf(target.dataset.field) !== -1) render(true); else updatePreview();
  });
  mount.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button || !mount.contains(button)) return;
    var action = button.dataset.action;
    var c = selected();
    if (action === 'save') { save(); return; }
    if (action === 'add') {
      if (config.campaigns.length >= 50) { announce('Maksimal 50 kampanye. Hapus kampanye yang tidak dipakai untuk menambah yang baru.', 'error'); return; }
      var created = defaults();
      created.name = 'Kampanye ' + (config.campaigns.length + 1);
      config.campaigns.push(created);
      selectedId = created.id;
      openSection = 'creative';
      message = '';
      render();
      document.getElementById('rfa-campaign-name').focus();
      return;
    }
    if (action === 'select') { selectedId = button.dataset.id; message = ''; render(); return; }
    if (!c) return;
    if (action === 'section') { openSection = button.dataset.value; render(); return; }
    if (action === 'format') { c.format = button.dataset.value; render(); return; }
    if (action === 'size') { c.width = Number(button.dataset.width); c.height = Number(button.dataset.height); render(); return; }
    if (action === 'duplicate') {
      if (config.campaigns.length >= 50) { announce('Maksimal 50 kampanye. Hapus kampanye yang tidak dipakai sebelum menduplikat.', 'error'); return; }
      var copy = clone(c); copy.id = uid(); copy.name += ' — salinan'; copy.enabled = false;
      config.campaigns.push(copy); selectedId = copy.id; render(); announce('Kampanye diduplikat dalam keadaan nonaktif. Sesuaikan lalu aktifkan.'); return;
    }
    if (action === 'delete') {
      if (!window.confirm('Hapus kampanye “' + c.name + '”? Penghapusan berlaku setelah Anda menyimpan.')) return;
      config.campaigns = config.campaigns.filter(function (item) { return item.id !== c.id; });
      selectedId = config.campaigns.length ? config.campaigns[0].id : null; render(); announce('Kampanye dihapus dari draf. Simpan perubahan untuk menerapkan.'); return;
    }
    if (action === 'media') {
      if (!window.wp || !window.wp.media) { announce('Pustaka media belum tersedia. Anda dapat memasukkan URL gambar secara langsung.', 'error'); return; }
      var campaignId = c.id;
      var frame = window.wp.media({ title: 'Pilih gambar iklan', button: { text: 'Gunakan gambar' }, multiple: false, library: { type: 'image' } });
      frame.on('select', function () {
        var attachment = frame.state().get('selection').first().toJSON();
        var campaign = config.campaigns.find(function (item) { return item.id === campaignId; });
        if (!campaign) return;
        campaign.imageUrl = attachment.url || '';
        if (!campaign.imageAlt) campaign.imageAlt = attachment.alt || '';
        render(true);
      });
      frame.open();
    }
  });
  window.addEventListener('beforeunload', function (event) { if (!dirty()) return; event.preventDefault(); event.returnValue = ''; });
  render();
})();
