(function () {
    'use strict';

    var config = window.RFA_CONFIG;
    if (!config || config.enabled !== true || !Array.isArray(config.campaigns)) {
        return;
    }

    var rendered = new Set();
    var pending = new Set();
    var placementWarnings = new Set();
    var activeDialog = null;
    var activeDialogCleanup = null;
    var stickySlots = { top: null, bottom: null };
    var defaultPlacement = {
        type: 'css',
        value: 'main, article, .site-content',
        attribute: 'data-testid',
        textExact: false,
        tags: 'button, a, div, section',
        insert: 'prepend'
    };

    function debug(message, campaign) {
        if (config.debug === true && window.console && console.debug) {
            console.debug('[Referral Ads] ' + message, campaign ? campaign.id : '');
        }
    }

    function bounded(value, fallback, minimum, maximum) {
        var number = Number(value);
        return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
    }

    function cleanHost(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return '';
        }
        try {
            var input = value.trim();
            var parsed = new URL(input.indexOf('://') >= 0 ? input : 'https://' + input);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return '';
            }
            return parsed.hostname.toLowerCase().replace(/\.$/, '');
        } catch (error) {
            return '';
        }
    }

    function hostMatches(host, allowed) {
        host = host.toLowerCase().replace(/\.$/, '');
        return allowed.some(function (entry) {
            var permitted = cleanHost(entry);
            var ipAddress = permitted && (/^\d{1,3}(\.\d{1,3}){3}$/.test(permitted) || permitted.charAt(0) === '[');
            return permitted && (host === permitted || (!ipAddress && host.endsWith('.' + permitted)));
        });
    }

    function referrerAllowed() {
        if (!document.referrer || !Array.isArray(config.referrers) || !config.referrers.length) {
            return false;
        }
        try {
            var referrer = new URL(document.referrer);
            return (referrer.protocol === 'http:' || referrer.protocol === 'https:') &&
                hostMatches(referrer.hostname, config.referrers);
        } catch (error) {
            return false;
        }
    }

    // A direct visit, an empty allowlist, or an unapproved referrer never starts an ad.
    if (!referrerAllowed()) {
        debug('Iklan diblokir: referrer tidak diizinkan.');
        return;
    }

    function pageAllowed(campaign) {
        var paths = Array.isArray(campaign.pages) ? campaign.pages : [];
        var matches = paths.some(function (value) {
            if (typeof value !== 'string' || !value.trim()) {
                return false;
            }
            var pattern = value.trim();
            return pattern.endsWith('*') ?
                window.location.pathname.startsWith(pattern.slice(0, -1)) :
                window.location.pathname === pattern;
        });
        if (campaign.pageMode === 'include' && !matches) {
            return false;
        }
        if (campaign.pageMode === 'exclude' && matches) {
            return false;
        }
        var mobile = window.matchMedia ? window.matchMedia('(max-width: 767px)').matches : window.innerWidth <= 767;
        return campaign.devices !== 'mobile' && campaign.devices !== 'desktop' ||
            (campaign.devices === 'mobile' && mobile) || (campaign.devices === 'desktop' && !mobile);
    }

    function sessionKey(campaign) {
        return 'rfa:shown:' + campaign.id;
    }

    function sessionShown(campaign) {
        if (campaign.frequency !== 'session') {
            return false;
        }
        try {
            return window.sessionStorage.getItem(sessionKey(campaign)) === '1';
        } catch (error) {
            // Storage denial falls back to one rendering in this document.
            return false;
        }
    }

    function markShown(campaign) {
        rendered.add(campaign.id);
        if (campaign.frequency === 'session') {
            try {
                window.sessionStorage.setItem(sessionKey(campaign), '1');
            } catch (error) {
                debug('Penyimpanan sesi tidak tersedia; frekuensi berlaku per halaman.', campaign);
            }
        }
    }

    function safeUrl(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return null;
        }
        try {
            var result = new URL(value.trim(), window.location.href);
            if ((result.protocol !== 'http:' && result.protocol !== 'https:') || result.username || result.password) {
                return null;
            }
            return result;
        } catch (error) {
            return null;
        }
    }

    function destination(campaign) {
        var direct = safeUrl(campaign.directUrl);
        var result = direct;
        if (campaign.linkMode === 'parameter') {
            var parameters = new URLSearchParams(window.location.search);
            var candidate = safeUrl(parameters.get(campaign.parameterName || 'ad_url'));
            var allowed = [window.location.hostname];
            if (direct) {
                allowed.push(direct.hostname);
            }
            if (Array.isArray(campaign.allowedLinkHosts)) {
                allowed = allowed.concat(campaign.allowedLinkHosts);
            }
            if (candidate && hostMatches(candidate.hostname, allowed)) {
                result = candidate;
            } else if (parameters.has(campaign.parameterName || 'ad_url')) {
                debug('Tujuan parameter tidak valid atau host belum diizinkan; memakai tautan langsung.', campaign);
            }
        }
        if (result && campaign.forwardPage === true) {
            result.searchParams.set(campaign.sourceParameter || 'source_page', window.location.href);
        }
        return result;
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function disabled(element) {
        return element.disabled === true || !!element.closest('[disabled], [aria-disabled="true"], [inert]');
    }

    function visible(element) {
        if (!element.getClientRects().length) {
            return false;
        }
        var current = element;
        while (current && current.nodeType === 1) {
            var style = window.getComputedStyle(current);
            if (current.hidden || style.display === 'none' || style.visibility === 'hidden' ||
                style.visibility === 'collapse' || Number(style.opacity) === 0) {
                return false;
            }
            current = current.parentElement;
        }
        return true;
    }

    function placementFor(campaign) {
        return Object.assign({}, defaultPlacement, campaign.placement || {});
    }

    function candidates(placement) {
        var value = String(placement.value || '').trim();
        if (!value && placement.type !== 'attribute') {
            return [];
        }
        switch (placement.type) {
        case 'id':
            var element = document.getElementById(value);
            return element ? [element] : [];
        case 'name':
            return Array.from(document.getElementsByName(value));
        case 'class':
            return Array.from(document.getElementsByClassName(value));
        case 'attribute':
            var attribute = String(placement.attribute || 'data-testid').trim();
            if (!/^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/.test(attribute)) {
                return [];
            }
            return Array.from(document.getElementsByTagName('*')).filter(function (candidate) {
                return candidate.hasAttribute(attribute) && (!value || candidate.getAttribute(attribute) === value);
            });
        case 'text':
            var text = normalizeText(value);
            return Array.from(document.querySelectorAll(placement.tags || defaultPlacement.tags)).filter(function (candidate) {
                var content = normalizeText(candidate.textContent);
                return placement.textExact === true ? content === text : content.indexOf(text) >= 0;
            });
        case 'xpath':
            var snapshot = document.evaluate(value, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            var items = [];
            for (var index = 0; index < snapshot.snapshotLength; index += 1) {
                items.push(snapshot.snapshotItem(index));
            }
            return items;
        case 'css':
        default:
            return Array.from(document.querySelectorAll(value));
        }
    }

    function findTarget(campaign) {
        var placement = placementFor(campaign);
        var items;
        try {
            items = candidates(placement);
        } catch (error) {
            return null;
        }
        var nonContainers = /^(AREA|BASE|BR|COL|EMBED|HEAD|HR|HTML|IFRAME|IMG|INPUT|LINK|META|OBJECT|OPTGROUP|OPTION|PARAM|SCRIPT|SOURCE|STYLE|TEMPLATE|TITLE|TRACK|WBR)$/;
        var interactive = 'a[href], button, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"])';
        for (var index = 0; index < items.length; index += 1) {
            var item = items[index];
            if (!item || item.nodeType !== 1 || !item.isConnected || item.closest('[data-rfa-campaign]') || disabled(item)) {
                continue;
            }
            if (item.closest('head, script, style, template') || item.tagName === 'HTML') {
                continue;
            }
            var inside = placement.insert !== 'before' && placement.insert !== 'after';
            if (inside && (nonContainers.test(item.tagName) || item.closest(interactive))) {
                if (!placementWarnings.has(campaign.id)) {
                    placementWarnings.add(campaign.id);
                    debug('Wadah penempatan tidak dapat diisi iklan. Pilih before/after untuk tombol atau tautan.', campaign);
                }
                continue;
            }
            if (!inside && (!item.parentElement || item.parentElement.closest(interactive))) {
                continue;
            }
            var insertionParent = inside ? item : item.parentElement;
            if (!insertionParent || insertionParent.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
                continue;
            }
            if (campaign.requireVisible !== false && !visible(item)) {
                continue;
            }
            return item;
        }
        return null;
    }

    function node(tag, className, text) {
        var element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        if (text !== undefined && text !== '') {
            element.textContent = String(text);
        }
        return element;
    }

    function buildCreative(campaign, url) {
        var popunder = campaign.format === 'popunder';
        var creative = node(popunder ? 'div' : 'a', 'rfa-creative');
        if (!popunder) {
            creative.href = url.href;
            creative.target = '_blank';
            creative.rel = 'sponsored noopener noreferrer';
            creative.setAttribute('aria-label', (campaign.headline || campaign.name || 'Iklan') + ' — buka di tab baru');
        }
        var image = safeUrl(campaign.imageUrl);
        if (image) {
            var media = node('img', 'rfa-image');
            media.src = image.href;
            media.alt = campaign.imageAlt || '';
            media.loading = 'lazy';
            media.decoding = 'async';
            media.referrerPolicy = 'no-referrer';
            creative.appendChild(media);
        }
        var content = node('div', 'rfa-content');
        content.appendChild(node('span', 'rfa-label', campaign.label || 'Iklan'));
        if (campaign.headline) {
            content.appendChild(node('span', 'rfa-headline', campaign.headline));
        }
        if (campaign.description) {
            content.appendChild(node('span', 'rfa-description', campaign.description));
        }
        if (popunder) {
            var button = node('button', 'rfa-action rfa-popup-button', campaign.buttonText || 'Buka iklan di jendela baru');
            button.type = 'button';
            button.addEventListener('click', function (event) {
                if (!event.isTrusted) {
                    return;
                }
                var width = Math.round(bounded(campaign.width, 728, 120, 1600));
                var height = Math.round(bounded(campaign.height, 600, 50, 1200));
                window.open(url.href, '_blank', 'popup=yes,noopener,noreferrer,width=' + width + ',height=' + height);
            });
            content.appendChild(button);
            content.appendChild(node('span', 'rfa-window-note', 'Dibuka di jendela baru setelah Anda klik.'));
        } else {
            content.appendChild(node('span', 'rfa-action', campaign.buttonText || 'Lihat selengkapnya'));
        }
        creative.appendChild(content);
        return creative;
    }

    function createRoot(campaign, url) {
        var root = node('aside', 'rfa-ad rfa-ad--' + campaign.format);
        root.setAttribute('data-rfa-campaign', campaign.id);
        root.setAttribute('data-rfa-format', campaign.format);
        root.setAttribute('aria-label', campaign.label || 'Iklan');
        var width = bounded(campaign.width, 728, 120, 1600);
        var height = bounded(campaign.height, 90, 50, 1200);
        root.style.setProperty('--rfa-width', width + 'px');
        root.style.setProperty('--rfa-height', height + 'px');
        if (campaign.format === 'banner' || campaign.format === 'sticky') {
            if (height < 80) {
                root.classList.add('rfa-ad--short');
            }
            if (width < 400 && height >= 200) {
                root.classList.add('rfa-ad--vertical');
            }
            if (width < 240 && height < 200) {
                root.classList.add('rfa-ad--narrow');
            }
        }
        if (campaign.responsive !== false) {
            root.classList.add('rfa-responsive');
        }
        root.appendChild(buildCreative(campaign, url));
        return root;
    }

    function addClose(root, campaign, onClose) {
        var button = node('button', 'rfa-close');
        var icon = node('span', 'rfa-close-icon', '×');
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        button.type = 'button';
        var remaining = Math.ceil(bounded(campaign.closeDelay, 0, 0, 30));
        var countdown = node('span', 'rfa-close-count');
        if (remaining > 0) {
            button.appendChild(countdown);
        }
        var timer = null;
        var closed = false;
        function update() {
            button.disabled = remaining > 0;
            button.setAttribute('aria-disabled', String(remaining > 0));
            button.setAttribute('aria-label', remaining > 0 ? 'Tutup iklan tersedia dalam ' + remaining + ' detik' : 'Tutup iklan');
            countdown.textContent = remaining > 0 ? String(remaining) : '';
        }
        function close() {
            if (closed || button.disabled) {
                return;
            }
            closed = true;
            if (timer !== null) {
                window.clearInterval(timer);
            }
            onClose();
            root.remove();
        }
        update();
        if (remaining > 0) {
            var unlockAt = Date.now() + remaining * 1000;
            timer = window.setInterval(function () {
                remaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
                update();
                if (remaining === 0) {
                    window.clearInterval(timer);
                    timer = null;
                }
            }, 250);
        }
        button.addEventListener('click', close);
        root.appendChild(button);
        return {
            button: button,
            close: close,
            dispose: function () {
                if (timer !== null) {
                    window.clearInterval(timer);
                    timer = null;
                }
            }
        };
    }

    function showDialog(campaign, url) {
        if (activeDialog && !activeDialog.isConnected && activeDialogCleanup) {
            activeDialogCleanup(false);
        }
        if (activeDialog || !document.body) {
            return false;
        }
        var previousFocus = document.activeElement;
        var previousOverflow = document.body.style.getPropertyValue('overflow');
        var previousOverflowPriority = document.body.style.getPropertyPriority('overflow');
        var overlay = node('div', 'rfa-overlay');
        var root = createRoot(campaign, url);
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', campaign.headline || campaign.name || 'Iklan');
        root.setAttribute('tabindex', '-1');
        var controls = addClose(root, campaign, function () {
            release(true);
            overlay.remove();
        });
        function release(restoreFocus) {
            document.removeEventListener('keydown', handleKey, true);
            document.removeEventListener('focusin', keepFocus, true);
            controls.dispose();
            activeDialog = null;
            activeDialogCleanup = null;
            if (document.body.style.overflow === 'hidden' && document.body.style.getPropertyPriority('overflow') === 'important') {
                if (previousOverflow) {
                    document.body.style.setProperty('overflow', previousOverflow, previousOverflowPriority);
                } else {
                    document.body.style.removeProperty('overflow');
                }
            }
            if (restoreFocus && previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
                previousFocus.focus({ preventScroll: true });
            }
        }
        function keepFocus(event) {
            if (!root.isConnected) {
                release(false);
                return;
            }
            if (!root.contains(event.target)) {
                root.focus({ preventScroll: true });
            }
        }
        function handleKey(event) {
            if (!root.isConnected) {
                release(false);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                controls.close();
            }
            if (event.key !== 'Tab') {
                return;
            }
            var focusable = Array.from(root.querySelectorAll('a[href], button:not(:disabled), [tabindex="0"]'));
            if (!focusable.length) {
                event.preventDefault();
                root.focus({ preventScroll: true });
                return;
            }
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) {
                event.preventDefault();
                first.focus();
            }
        }
        overlay.appendChild(root);
        document.body.appendChild(overlay);
        document.body.style.setProperty('overflow', 'hidden', 'important');
        activeDialog = root;
        activeDialogCleanup = release;
        document.addEventListener('keydown', handleKey, true);
        document.addEventListener('focusin', keepFocus, true);
        root.focus({ preventScroll: true });
        return true;
    }

    function render(campaign, url) {
        if (campaign.format === 'interstitial') {
            return showDialog(campaign, url);
        }
        if (campaign.format === 'sticky') {
            var position = campaign.stickyPosition === 'top' ? 'top' : 'bottom';
            if (stickySlots[position] && !stickySlots[position].isConnected) {
                stickySlots[position] = null;
            }
            if (stickySlots[position] || !document.body) {
                return false;
            }
            var sticky = createRoot(campaign, url);
            sticky.classList.add('rfa-sticky--' + position);
            addClose(sticky, campaign, function () {
                stickySlots[position] = null;
            });
            document.body.appendChild(sticky);
            stickySlots[position] = sticky;
            return true;
        }
        var target = findTarget(campaign);
        if (!target) {
            return false;
        }
        var root = createRoot(campaign, url);
        var insert = placementFor(campaign).insert;
        switch (insert) {
        case 'before':
            target.parentNode.insertBefore(root, target);
            break;
        case 'after':
            target.parentNode.insertBefore(root, target.nextSibling);
            break;
        case 'append':
            target.appendChild(root);
            break;
        case 'prepend':
        default:
            target.insertBefore(root, target.firstChild);
        }
        return true;
    }

    function schedule(campaign) {
        if (!campaign || campaign.enabled !== true || typeof campaign.id !== 'string' ||
            !/^[a-zA-Z0-9_-]+$/.test(campaign.id) || pending.has(campaign.id) || rendered.has(campaign.id) ||
            sessionShown(campaign) || !pageAllowed(campaign)) {
            return;
        }
        if (['banner', 'native', 'sticky', 'interstitial', 'popunder'].indexOf(campaign.format) < 0) {
            return;
        }
        var url = destination(campaign);
        if (!url) {
            debug('Iklan dilewati: tujuan tautan tidak valid.', campaign);
            return;
        }
        pending.add(campaign.id);
        // Observe only after the initial delay. Earlier DOM changes cannot bypass it.
        window.setTimeout(function () {
            var observer = null;
            var interval = null;
            var expiry = null;
            var debounce = null;
            var stopped = false;
            function cleanup() {
                stopped = true;
                pending.delete(campaign.id);
                if (observer) {
                    observer.disconnect();
                }
                window.clearInterval(interval);
                window.clearTimeout(expiry);
                window.clearTimeout(debounce);
            }
            function attempt() {
                debounce = null;
                if (stopped) {
                    return;
                }
                if (rendered.has(campaign.id) || sessionShown(campaign)) {
                    cleanup();
                    return;
                }
                try {
                    if (render(campaign, url)) {
                        markShown(campaign);
                        cleanup();
                        debug('Iklan ditampilkan.', campaign);
                    }
                } catch (error) {
                    debug('Penempatan belum tersedia; akan dicoba kembali.', campaign);
                }
            }
            attempt();
            if (stopped) {
                return;
            }
            if (window.MutationObserver && document.documentElement) {
                observer = new MutationObserver(function () {
                    if (!stopped && debounce === null) {
                        debounce = window.setTimeout(attempt, 30);
                    }
                });
                observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
            }
            interval = window.setInterval(attempt, 250);
            expiry = window.setTimeout(function () {
                cleanup();
                debug('Batas waktu penempatan tercapai.', campaign);
            }, bounded(campaign.timeout, 15000, 1000, 120000));
        }, bounded(campaign.delay, 500, 0, 60000));
    }

    function start() {
        config.campaigns.forEach(schedule);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}());
