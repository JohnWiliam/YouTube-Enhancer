// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      2.4.1
// @description  Personaliza o layout, remove elementos indesejados e adiciona um relógio em tela cheia.
// @author       John Wiliam & IA
// @match        *://*.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @updateURL    https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js
// @downloadURL  https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_addElement
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '2.4.1';
    const FLAG = `__yt_enhancer_v${SCRIPT_VERSION.replace(/\./g, '_')}__`;
    if (window[FLAG]) return;
    window[FLAG] = true;

    const log = (msg) => console.log(`[YT Enhancer] ${msg}`);

    // =======================================================
    // EVENT BUS SYSTEM
    // =======================================================
    const EventBus = {
        events: new Map(),
        on(event, callback) {
            if (!this.events.has(event)) this.events.set(event, []);
            this.events.get(event).push(callback);
            return () => this.off(event, callback);
        },
        off(event, callback) {
            if (!this.events.has(event)) return;
            const callbacks = this.events.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        },
        emit(event, data) {
            if (!this.events.has(event)) return;
            [...this.events.get(event)].forEach(callback => {
                try { callback(data); } catch (e) { console.error(`EventBus error [${event}]:`, e); }
            });
        },
        clear() {
            this.events.clear();
        }
    };

    // =======================================================
    // UTILITÁRIOS
    // =======================================================
    const Utils = {
        clamp(value, min, max, fallback = min) {
            const num = Number(value);
            return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
        },
        isHexColor(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); },
        toBoolean(value, fallback = false) {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
            if (typeof value === 'number') return value !== 0;
            return fallback;
        },
        sanitizeConfig(config, defaults) {
            const featureValues = Object.fromEntries(Object.keys(defaults.FEATURES).map((key) => [key, config?.FEATURES?.[key] ?? defaults.FEATURES[key]]));
            const safe = { ...defaults, ...(config || {}), FEATURES: featureValues, CLOCK_STYLE: { ...defaults.CLOCK_STYLE, ...(config?.CLOCK_STYLE || {}) } };
            safe.LANGUAGE = ['pt', 'en'].includes(safe.LANGUAGE) ? safe.LANGUAGE : defaults.LANGUAGE;
            safe.VIDEOS_PER_ROW = this.clamp(safe.VIDEOS_PER_ROW, 3, 8, defaults.VIDEOS_PER_ROW);
            safe.CLOCK_STYLE.bgOpacity = this.clamp(safe.CLOCK_STYLE.bgOpacity, 0, 1, defaults.CLOCK_STYLE.bgOpacity);
            safe.CLOCK_STYLE.fontSize = this.clamp(safe.CLOCK_STYLE.fontSize, 12, 48, defaults.CLOCK_STYLE.fontSize);
            safe.CLOCK_STYLE.margin = this.clamp(safe.CLOCK_STYLE.margin, 0, 120, defaults.CLOCK_STYLE.margin);
            safe.CLOCK_STYLE.borderRadius = this.clamp(safe.CLOCK_STYLE.borderRadius, 0, 50, defaults.CLOCK_STYLE.borderRadius);
            safe.CLOCK_STYLE.color = this.isHexColor(safe.CLOCK_STYLE.color) ? safe.CLOCK_STYLE.color : defaults.CLOCK_STYLE.color;
            safe.CLOCK_STYLE.bgColor = this.isHexColor(safe.CLOCK_STYLE.bgColor) ? safe.CLOCK_STYLE.bgColor : defaults.CLOCK_STYLE.bgColor;
            safe.FEATURES.LAYOUT_ENHANCEMENT = this.toBoolean(safe.FEATURES.LAYOUT_ENHANCEMENT, defaults.FEATURES.LAYOUT_ENHANCEMENT);
            safe.FEATURES.SHORTS_REMOVAL = this.toBoolean(safe.FEATURES.SHORTS_REMOVAL, defaults.FEATURES.SHORTS_REMOVAL);
            safe.FEATURES.REMOVE_RELEVANT = this.toBoolean(safe.FEATURES.REMOVE_RELEVANT, defaults.FEATURES.REMOVE_RELEVANT);
            safe.FEATURES.FULLSCREEN_CLOCK = this.toBoolean(safe.FEATURES.FULLSCREEN_CLOCK, defaults.FEATURES.FULLSCREEN_CLOCK);
            return safe;
        },
        debounce(func, wait) {
            let timeout = null;
            const debounced = function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    timeout = null;
                    func.apply(this, args);
                }, wait);
            };
            debounced.cancel = () => {
                clearTimeout(timeout);
                timeout = null;
            };
            return debounced;
        },
        scheduleFrame(callback) {
            let frameId = 0;
            let pending = false;
            const run = () => {
                frameId = 0;
                pending = false;
                callback();
            };
            const scheduled = () => {
                if (pending) return;
                pending = true;
                frameId = requestAnimationFrame(run);
            };
            scheduled.cancel = () => {
                if (frameId) cancelAnimationFrame(frameId);
                frameId = 0;
                pending = false;
            };
            return scheduled;
        },
        getAppRoot() {
            return document.querySelector('ytd-app, ytd-page-manager') || document.body || document.documentElement;
        },
        queryWithin(root, selector) {
            if (!(root instanceof Element || root instanceof Document)) return [];
            const matches = root instanceof Element && root.matches(selector) ? [root] : [];
            return matches.concat([...root.querySelectorAll(selector)]);
        },
        DOMCache: {
            cache: new Map(),
            get(selector, force = false) {
                if (!force && this.cache.has(selector)) {
                    const el = this.cache.get(selector);
                    if (el && el.isConnected) return el;
                    this.cache.delete(selector);
                }
                const el = document.querySelector(selector);
                if (el) this.cache.set(selector, el);
                return el;
            },
            refresh() { this.cache.clear(); }
        },
        safeAddEventListener(element, event, handler, options = {}) {
            if (!element) return () => {};
            const safeHandler = (e) => { try { return handler(e); } catch (err) { console.error(`[Event] ${event}:`, err); } };
            element.addEventListener(event, safeHandler, options);
            return () => element.removeEventListener(event, safeHandler, options);
        },
        migrateConfig(savedConfig, currentVersion) {
            if (!savedConfig || typeof savedConfig !== 'object') return null;
            const previousVersion = savedConfig.version || '1.0.0';
            if (!savedConfig.FEATURES || typeof savedConfig.FEATURES !== 'object') savedConfig.FEATURES = {};
            if (!savedConfig.CLOCK_STYLE || typeof savedConfig.CLOCK_STYLE !== 'object') savedConfig.CLOCK_STYLE = {};
            if (!savedConfig.version) {
                savedConfig.version = '1.0.0';
                if (!Object.prototype.hasOwnProperty.call(savedConfig.CLOCK_STYLE, 'borderRadius')) savedConfig.CLOCK_STYLE = { ...savedConfig.CLOCK_STYLE, borderRadius: 12 };
            }
            if (!Object.prototype.hasOwnProperty.call(savedConfig.FEATURES, 'REMOVE_RELEVANT')) savedConfig.FEATURES.REMOVE_RELEVANT = true;
            if (previousVersion !== currentVersion && savedConfig.CLOCK_STYLE.bgColor?.toLowerCase() === '#191919') savedConfig.CLOCK_STYLE.bgColor = '#000000';
            savedConfig.version = currentVersion;
            return savedConfig;
        },
        injectCSS(css, id) {
            try {
                const old = document.getElementById(id);
                if (old) old.remove();

                let styleEl = null;
                if (typeof GM_addStyle === 'function') {
                    styleEl = GM_addStyle(css) || null;
                    if (styleEl && id) styleEl.id = id;
                } else if (typeof GM_addElement === 'function') {
                    styleEl = GM_addElement('style', { id, textContent: css }) || null;
                } else {
                    styleEl = document.createElement('style');
                    styleEl.id = id;
                    styleEl.textContent = css;
                    (document.head || document.documentElement).appendChild(styleEl);
                }

                if (!styleEl && id) styleEl = document.getElementById(id);
                return Boolean(styleEl && styleEl.isConnected);
            } catch (error) {
                console.error('[YT Enhancer] CSS injection failed:', error);
                return false;
            }
        }
    };

    // =======================================================
    // 1. I18N + CONFIG MANAGER
    // =======================================================
    const I18N = {
        pt: {
            modal: { title: '⚙️ Configurações', closeTitle: 'Fechar', tabs: { features: '🔧 Funcionalidades', appearance: '🎨 Aparência do relógio' }, features: { layout: { title: 'Layout Grid', description: 'Ajusta vídeos por linha' }, videosPerRow: 'Vídeos por linha', videosPerRowHint: 'Define quantos vídeos aparecem', shorts: { title: 'Remover Shorts', description: 'Limpa Shorts da interface' }, relevant: { title: 'Remover (Mais Relevantes)', description: "Remove o elemento 'Mais relevantes' da página de inscrições." }, clock: { title: 'Relógio Flutuante', description: 'Mostra hora sobre o vídeo' }, language: { title: 'Idioma da Interface', description: 'Troca textos entre PT e EN' } }, clockStyle: { textColor: 'Cor do Texto', backgroundColor: 'Cor do Fundo', backgroundOpacity: 'Opacidade Fundo', fontSize: 'Tamanho Fonte (px)', margin: 'Margem (px)', borderRadius: 'Arredondamento (px)' }, buttons: { apply: 'Aplicar', applyAndReload: 'Aplicar e Recarregar' }, reloadNotice: 'A alteração de idioma exige recarregar a página.' },
            menu: { openSettings: '⚙️ Configurações' }
        },
        en: {
            modal: { title: '⚙️ Settings', closeTitle: 'Close', tabs: { features: '🔧 Features', appearance: '🎨 Clock appearance' }, features: { layout: { title: 'Grid Layout', description: 'Adjusts videos per row' }, videosPerRow: 'Videos per row', videosPerRowHint: 'Defines videos in each row', shorts: { title: 'Remove Shorts', description: 'Cleans Shorts from UI' }, relevant: { title: 'Remove (Most Relevant)', description: "Removes the 'Most relevant' element from the Subscriptions page." }, clock: { title: 'Floating Clock', description: 'Shows time over the video' }, language: { title: 'Interface Language', description: 'Switch texts between EN and PT' } }, clockStyle: { textColor: 'Text Color', backgroundColor: 'Background Color', backgroundOpacity: 'Background Opacity', fontSize: 'Font Size (px)', margin: 'Margin (px)', borderRadius: 'Roundness (px)' }, buttons: { apply: 'Apply', applyAndReload: 'Apply and Reload' }, reloadNotice: 'Changing the language requires reloading the page.' },
            menu: { openSettings: '⚙️ Settings' }
        }
    };

    const t = (key, lang = null) => {
        const resolvedLang = (lang || ConfigManager.load()?.LANGUAGE || 'en').toLowerCase();
        const segments = key.split('.');
        const getValue = (dictionary) => segments.reduce((acc, segment) => acc?.[segment], dictionary);
        return getValue(I18N[resolvedLang]) ?? getValue(I18N.en) ?? getValue(I18N.pt) ?? key;
    };

    const ConfigManager = {
        CONFIG_VERSION: '2.4.1',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        defaults: {
            version: '2.4.1', LANGUAGE: 'pt', VIDEOS_PER_ROW: 5,
            FEATURES: { LAYOUT_ENHANCEMENT: true, SHORTS_REMOVAL: true, REMOVE_RELEVANT: true, FULLSCREEN_CLOCK: true },
            CLOCK_STYLE: { color: '#ffffff', bgColor: '#000000', bgOpacity: 0.3, fontSize: 22, margin: 30, borderRadius: 25, position: 'bottom-right' }
        },
        load() {
            try {
                const saved = GM_getValue(this.STORAGE_KEY);
                return Utils.sanitizeConfig(Utils.migrateConfig(saved, this.CONFIG_VERSION) || {}, this.defaults);
            } catch (e) { return Utils.sanitizeConfig({}, this.defaults); }
        },
        save(config) {
            try {
                const sanitized = Utils.sanitizeConfig(config, this.defaults);
                sanitized.version = this.CONFIG_VERSION;
                GM_setValue(this.STORAGE_KEY, sanitized);
                EventBus.emit('configChanged', sanitized);
                return true;
            } catch (e) { return false; }
        }
    };

    const SettingsLauncher = {
        menuRegistered: false,
        apiRegistered: false,
        apiCleanup: null,
        opening: false,
        open(source = 'unknown') {
            if (this.opening) return;
            this.opening = true;
            Promise.resolve(UIManager.openSettings((newConfig) => ConfigManager.save(newConfig)))
                .then((opened) => {
                    if (!opened) console.warn(`[YT Enhancer] Falha ao abrir modal de configurações (source=${source}).`);
                })
                .catch((error) => console.error(`[YT Enhancer] Exceção ao abrir configurações.`, error))
                .finally(() => this.opening = false);
        },
        registerMenuCommand() {
            if (this.menuRegistered || typeof GM_registerMenuCommand !== 'function') return;
            this.menuRegistered = true;

            const lang = ConfigManager.load().LANGUAGE;
            const label = t('menu.openSettings', lang);
            const callback = () => this.open('menu');

            try { GM_registerMenuCommand(label, callback, { id: 'yt-enhancer-settings-cmd', autoClose: true }); } 
            catch (error) { try { GM_registerMenuCommand(label, callback); } catch (e) {} }
        },
        registerSafeApi() {
            if (this.apiRegistered) return;
            this.apiRegistered = true;
            this.apiCleanup = Utils.safeAddEventListener(window, 'yt-enhancer-open-settings', () => this.open('event_api'));
        },
        cleanup() {
            this.apiCleanup?.();
            this.apiCleanup = null;
            this.apiRegistered = false;
        }
    };

    // =======================================================
    // 2. UI MANAGER (Modal Blindado)
    // =======================================================
    const UIManager = {
        cleanupFunctions: [], styleId: 'yt-enhancer-modal-style',
        applyModalInlineFallback(modalElement) {
            if (!modalElement) return;
            modalElement.style.cssText = 'position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; background: #121212 !important; color: #f1f1f1 !important; z-index: 2147483647 !important;';
        },
        ensureRootReady(maxAttempts = 60, interval = 50) {
            return new Promise((resolve) => {
                let attempts = 0;
                const check = () => {
                    if (document.documentElement && document.body) { resolve(true); return; }
                    attempts += 1;
                    if (attempts >= maxAttempts) { resolve(false); return; }
                    setTimeout(check, interval);
                };
                check();
            });
        },
        async openSettings(onSave) {
            const config = ConfigManager.load();
            const rootReady = await this.ensureRootReady();
            if (!rootReady) return false;

            const stylesInjected = this.ensureStyles();
            this.cleanupFunctions.forEach(fn => fn());
            this.cleanupFunctions = [];

            document.getElementById('yt-enhancer-settings-modal')?.remove();
            document.getElementById('yt-enhancer-overlay')?.remove();

            const create = (tag, options = {}) => {
                const el = document.createElement(tag);
                if (options.id) el.id = options.id;
                if (options.className) el.className = options.className;
                if (options.text) el.textContent = options.text;
                if (options.type) el.type = options.type;
                if (options.title) el.title = options.title;
                if (options.value !== undefined) el.value = options.value;
                if (options.checked !== undefined) el.checked = !!options.checked;
                if (options.min !== undefined) el.min = String(options.min);
                if (options.max !== undefined) el.max = String(options.max);
                if (options.step !== undefined) el.step = String(options.step);
                if (options.forId) el.htmlFor = options.forId;
                if (options.dataset) Object.assign(el.dataset, options.dataset);
                return el;
            };

            const overlay = create('div', { id: 'yt-enhancer-overlay' });
            overlay.style.cssText = 'position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.75) !important; z-index: 2147483646 !important; pointer-events: auto !important;';

            const modal = create('div', { id: 'yt-enhancer-settings-modal', className: 'yt-enhancer-modal' });
            if (!stylesInjected) this.applyModalInlineFallback(modal);

            const modalHeader = create('div', { className: 'modal-header' });
            modalHeader.append(
                create('h2', { className: 'modal-title', text: t('modal.title', config.LANGUAGE) }),
                create('button', { id: 'yt-enhancer-close', className: 'close-btn', text: '×', title: t('modal.closeTitle', config.LANGUAGE) })
            );

            const tabsNav = create('div', { className: 'tabs-nav' });
            const tabFeaturesBtn = create('button', { className: 'tab-btn active', text: t('modal.tabs.features', config.LANGUAGE), dataset: { target: 'tab-features' } });
            const tabAppearanceBtn = create('button', { className: 'tab-btn', text: t('modal.tabs.appearance', config.LANGUAGE), dataset: { target: 'tab-appearance' } });
            tabsNav.append(tabFeaturesBtn, tabAppearanceBtn);

            const modalContent = create('div', { className: 'modal-content' });
            const tabFeatures = create('div', { id: 'tab-features', className: 'tab-pane active' });
            const optionsList = create('div', { className: 'options-list' });

            const createToggle = (id, title, description, checked) => {
                const label = create('label', { className: 'feature-toggle' });
                const textWrap = create('div', { className: 'toggle-text' });
                textWrap.append(create('strong', { text: title }), create('span', { text: description }));
                const switchWrap = create('div', { className: 'toggle-switch' });
                switchWrap.append(create('input', { id, type: 'checkbox', checked }), create('span', { className: 'slider' }));
                label.append(textWrap, switchWrap);
                return label;
            };

            optionsList.append(
                createToggle('cfg-layout', t('modal.features.layout.title', config.LANGUAGE), t('modal.features.layout.description', config.LANGUAGE), config.FEATURES.LAYOUT_ENHANCEMENT)
            );

            const layoutSettings = create('label', { id: 'layout-settings', className: 'feature-toggle feature-card-input', forId: 'cfg-videos-row' });
            layoutSettings.style.display = config.FEATURES.LAYOUT_ENHANCEMENT ? 'flex' : 'none';
            const layoutText = create('div', { className: 'toggle-text' });
            layoutText.append(create('strong', { text: t('modal.features.videosPerRow', config.LANGUAGE) }), create('span', { text: t('modal.features.videosPerRowHint', config.LANGUAGE) }));
            layoutSettings.append(layoutText, create('input', { id: 'cfg-videos-row', className: 'styled-input-small', type: 'number', min: 3, max: 8, value: config.VIDEOS_PER_ROW }));
            optionsList.append(layoutSettings);

            optionsList.append(
                createToggle('cfg-shorts', t('modal.features.shorts.title', config.LANGUAGE), t('modal.features.shorts.description', config.LANGUAGE), config.FEATURES.SHORTS_REMOVAL),
                createToggle('cfg-remove-relevant', t('modal.features.relevant.title', config.LANGUAGE), t('modal.features.relevant.description', config.LANGUAGE), config.FEATURES.REMOVE_RELEVANT),
                createToggle('cfg-clock-enable', t('modal.features.clock.title', config.LANGUAGE), t('modal.features.clock.description', config.LANGUAGE), config.FEATURES.FULLSCREEN_CLOCK)
            );

            const languageCard = create('label', { className: 'feature-toggle feature-card-select', forId: 'cfg-language' });
            const languageText = create('div', { className: 'toggle-text' });
            languageText.append(create('strong', { text: t('modal.features.language.title', config.LANGUAGE) }), create('span', { text: t('modal.features.language.description', config.LANGUAGE) }));
            const languageSelect = create('select', { id: 'cfg-language', className: 'styled-select' });
            [{ value: 'en', label: 'English' }, { value: 'pt', label: 'Português' }].forEach(({ value, label }) => {
                const option = create('option', { value, text: label });
                if (config.LANGUAGE === value) option.selected = true;
                languageSelect.appendChild(option);
            });
            languageCard.append(languageText, languageSelect);
            optionsList.append(languageCard);
            tabFeatures.appendChild(optionsList);

            const tabAppearance = create('div', { id: 'tab-appearance', className: 'tab-pane' });
            const appearanceGrid = create('div', { className: 'appearance-grid' });
            const createControl = (id, labelText, inputEl, valueEl = null) => {
                const group = create('div', { className: 'control-group' });
                group.append(create('label', { text: labelText }));
                if (valueEl) {
                    const wrap = create('div', { className: 'color-input-wrapper' });
                    wrap.append(inputEl, valueEl);
                    group.append(wrap);
                } else {
                    group.append(inputEl);
                }
                inputEl.id = id;
                return group;
            };

            appearanceGrid.append(
                createControl('style-color', t('modal.clockStyle.textColor', config.LANGUAGE), create('input', { type: 'color', value: config.CLOCK_STYLE.color }), create('span', { className: 'color-value', text: config.CLOCK_STYLE.color })),
                createControl('style-bg-color', t('modal.clockStyle.backgroundColor', config.LANGUAGE), create('input', { type: 'color', value: config.CLOCK_STYLE.bgColor }), create('span', { className: 'color-value', text: config.CLOCK_STYLE.bgColor })),
                createControl('style-bg-opacity', t('modal.clockStyle.backgroundOpacity', config.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 1, step: 0.1, value: config.CLOCK_STYLE.bgOpacity })),
                createControl('style-font-size', t('modal.clockStyle.fontSize', config.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 12, max: 48, value: config.CLOCK_STYLE.fontSize })),
                createControl('style-margin', t('modal.clockStyle.margin', config.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 120, value: config.CLOCK_STYLE.margin })),
                createControl('style-border-radius', t('modal.clockStyle.borderRadius', config.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 50, value: config.CLOCK_STYLE.borderRadius || 12 }))
            );
            tabAppearance.appendChild(appearanceGrid);
            modalContent.append(tabFeatures, tabAppearance);

            const modalFooter = create('div', { className: 'modal-footer' });
            const reloadNotice = create('p', { id: 'yt-enhancer-reload-note', className: 'reload-note', text: t('modal.reloadNotice', config.LANGUAGE) });
            reloadNotice.style.display = 'none';
            const modalActions = create('div', { className: 'modal-actions' });
            const btnApply = create('button', { id: 'yt-enhancer-apply', className: 'btn btn-primary', text: t('modal.buttons.apply', config.LANGUAGE) });
            const btnReload = create('button', { id: 'yt-enhancer-reload', className: 'btn btn-primary', text: t('modal.buttons.applyAndReload', config.LANGUAGE) });
            btnReload.style.display = 'none';
            
            modalActions.append(btnApply, btnReload);
            modalFooter.append(reloadNotice, modalActions);
            modal.append(modalHeader, tabsNav, modalContent, modalFooter);

            const mountTarget = document.documentElement || document.body;
            mountTarget.append(overlay, modal);

            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'yt-enhancer-modal-title');
            modalHeader.querySelector('.modal-title').id = 'yt-enhancer-modal-title';

            const focusable = () => Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.closest('.tab-pane') || el.closest('.tab-pane').classList.contains('active'));
            let closed = false;
            const closeModal = () => {
                if (closed) return;
                closed = true;
                modal.remove();
                overlay.remove();
                const cleanupFunctions = this.cleanupFunctions;
                this.cleanupFunctions = [];
                cleanupFunctions.forEach((cleanup) => cleanup());
            };
            this.cleanupFunctions.push(Utils.safeAddEventListener(overlay, 'click', closeModal));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('yt-enhancer-close'), 'click', closeModal));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document, 'keydown', (e) => {
                if (e.key === 'Escape') closeModal();
                if (e.key === 'Tab') {
                    const nodes = focusable();
                    if (!nodes.length) return;
                    const first = nodes[0];
                    const last = nodes[nodes.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }));

            [tabFeaturesBtn, tabAppearanceBtn].forEach((btn) => {
                this.cleanupFunctions.push(Utils.safeAddEventListener(btn, 'click', () => {
                    [tabFeaturesBtn, tabAppearanceBtn].forEach((b) => b.classList.remove('active'));
                    [tabFeatures, tabAppearance].forEach((pane) => pane.classList.remove('active'));
                    btn.classList.add('active');
                    (btn.dataset.target === 'tab-features' ? tabFeatures : tabAppearance).classList.add('active');
                }));
            });

            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-layout'), 'change', (e) => {
                layoutSettings.style.display = e.target.checked ? 'flex' : 'none';
            }));

            ['style-color', 'style-bg-color'].forEach(id => {
                this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById(id), 'input', (e) => {
                    if (e.target.nextElementSibling) e.target.nextElementSibling.textContent = e.target.value;
                }));
            });

            const getNewConfig = () => Utils.sanitizeConfig({
                LANGUAGE: document.getElementById('cfg-language').value,
                VIDEOS_PER_ROW: parseInt(document.getElementById('cfg-videos-row').value, 10) || 5,
                FEATURES: {
                    LAYOUT_ENHANCEMENT: document.getElementById('cfg-layout').checked,
                    SHORTS_REMOVAL: document.getElementById('cfg-shorts').checked,
                    REMOVE_RELEVANT: document.getElementById('cfg-remove-relevant').checked,
                    FULLSCREEN_CLOCK: document.getElementById('cfg-clock-enable').checked
                },
                CLOCK_STYLE: {
                    color: document.getElementById('style-color').value,
                    bgColor: document.getElementById('style-bg-color').value,
                    bgOpacity: parseFloat(document.getElementById('style-bg-opacity').value),
                    fontSize: parseInt(document.getElementById('style-font-size').value, 10),
                    margin: parseInt(document.getElementById('style-margin').value, 10),
                    borderRadius: parseInt(document.getElementById('style-border-radius').value, 10),
                    position: 'bottom-right'
                }
            }, ConfigManager.defaults);

            const updateSaveButtons = () => {
                const newConfig = getNewConfig();
                const requiresReload = newConfig.LANGUAGE !== config.LANGUAGE;
                btnApply.style.display = requiresReload ? 'none' : 'block';
                btnReload.style.display = requiresReload ? 'block' : 'none';
                reloadNotice.style.display = requiresReload ? 'block' : 'none';
            };

            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-language'), 'change', updateSaveButtons));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnApply, 'click', () => { onSave(getNewConfig()); closeModal(); }));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnReload, 'click', () => { onSave(getNewConfig()); closeModal(); setTimeout(() => window.location.reload(), 100); }));
            const focusTimer = setTimeout(() => document.getElementById('cfg-layout')?.focus(), 0);
            this.cleanupFunctions.push(() => clearTimeout(focusTimer));

            return true;
        },

        ensureStyles() {
            const css = `
                .yt-enhancer-modal { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: min(420px, calc(100vw - 32px)) !important; max-height: 80vh !important; background: #121212 !important; color: #f1f1f1 !important; border: 1px solid #333 !important; border-radius: 12px !important; box-shadow: 0 12px 24px rgba(0,0,0,0.8) !important; font-family: 'Roboto', Arial, sans-serif !important; font-size: 14px !important; display: flex !important; flex-direction: column !important; z-index: 2147483647 !important; isolation: isolate !important; }
                .yt-enhancer-modal input::-webkit-outer-spin-button, .yt-enhancer-modal input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                .yt-enhancer-modal input[type=number] { -moz-appearance: textfield; }
                .modal-header { height: 50px; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: flex-end; padding: 0 15px; position: relative; }
                .modal-title { position: absolute; left: 50%; transform: translateX(-50%); margin: 0; font-size: 16px; font-weight: 500; color: #fff; }
                .close-btn { background: none; border: none; color: #aaa; font-size: 24px; cursor: pointer; padding: 0 5px; }
                .close-btn:hover { color: #fff; }
                .tabs-nav { display: flex; background: #1a1a1a; border-bottom: 1px solid #333; }
                .tab-btn { flex: 1; padding: 12px; background: transparent; border: none; color: #888; cursor: pointer; font-weight: 500; border-bottom: 2px solid transparent; }
                .tab-btn:hover { color: #ccc; background: #222; }
                .tab-btn.active { color: #3ea6ff; border-bottom-color: #3ea6ff; background: #1a1a1a; }
                .modal-content { padding: 20px; overflow-y: auto; flex: 1; }
                .tab-pane { display: none; }
                .tab-pane.active { display: block; animation: fadeEffect 0.2s; }
                @keyframes fadeEffect { from {opacity: 0;} to {opacity: 1;} }
                .options-list { display: flex; flex-direction: column; gap: 15px; }
                .feature-toggle { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1e1e1e; border-radius: 8px; cursor: pointer; }
                .feature-toggle:hover { background: #252525; }
                .feature-card-select, .feature-card-input { gap: 16px; }
                .feature-card-select .styled-select { max-width: 140px; }
                .toggle-text strong { display: block; font-size: 14px; margin-bottom: 2px; }
                .toggle-text span { font-size: 12px; color: #aaa; }
                .toggle-switch { position: relative; width: 40px; height: 22px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #555; border-radius: 22px; transition: .3s; }
                .slider:before { position: absolute; content: ''; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: .3s; }
                .yt-enhancer-modal input:checked + .slider { background-color: #3ea6ff; }
                .yt-enhancer-modal input:checked + .slider:before { transform: translateX(18px); }
                .appearance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .control-group { display: flex; flex-direction: column; gap: 8px; }
                .styled-input, .styled-select { background: #1a1a1a; border: 1px solid #333; color: white; padding: 10px; border-radius: 6px; width: 100%; box-sizing: border-box; }
                .styled-input-small { width: 60px; padding: 5px; background: #222; border: 1px solid #444; color: white; border-radius: 4px; text-align: center; }
                .color-input-wrapper { display: flex; align-items: center; gap: 10px; background: #1a1a1a; padding: 5px; border: 1px solid #333; border-radius: 6px; }
                .yt-enhancer-modal input[type='color'] { border: none; width: 30px; height: 30px; padding: 0; background: none; cursor: pointer; }
                .modal-footer { padding: 15px 20px; border-top: 1px solid #333; display: flex; align-items: center; gap: 12px; }
                .reload-note { margin: 0; color: #f6cf6a; font-size: 12px; flex: 1; min-width: 0; }
                .modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-left: auto; }
                .btn { min-width: 156px; padding: 8px 20px; border: none; border-radius: 18px; cursor: pointer; font-weight: 500; display: inline-flex; justify-content: center; }
                .btn-primary { background: #3ea6ff; color: #000; }
                .btn-primary:hover { opacity: 0.9; }
            `;
            return Utils.injectCSS(css, this.styleId);
        },
        cleanup() {
            const cleanupFunctions = this.cleanupFunctions;
            this.cleanupFunctions = [];
            cleanupFunctions.forEach((cleanup) => cleanup());
            document.getElementById('yt-enhancer-settings-modal')?.remove();
            document.getElementById('yt-enhancer-overlay')?.remove();
            document.getElementById(this.styleId)?.remove();
        }
    };

    // =======================================================
    // 3. STYLE MANAGER
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-styles',
        cleanupFunctions: [],
        lastCss: null,
        init() {
            this.cleanupFunctions.push(
                EventBus.on('configChanged', (config) => this.apply(config)),
                Utils.safeAddEventListener(document, 'yt-navigate-finish', () => this.apply(ConfigManager.load()))
            );
        },
        apply(config) {
            let css = '';
            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important; } @media (max-width: 1200px) { ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important; } }`;
            }
            if (config.FEATURES.SHORTS_REMOVAL) {
                css += `ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-reel-shelf-renderer, ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]), ytd-guide-entry-renderer:has(a[href="/shorts"], a[href^="/shorts/"]), ytd-mini-guide-entry-renderer:has(a[href="/shorts"], a[href^="/shorts/"]) { display: none !important; }`;
            }
            if (css === this.lastCss && document.getElementById(this.styleId)) return;
            this.lastCss = css;
            Utils.injectCSS(css, this.styleId);
        },
        cleanup() {
            this.cleanupFunctions.forEach((cleanup) => cleanup());
            this.cleanupFunctions = [];
            this.lastCss = null;
            document.getElementById(this.styleId)?.remove();
        }
    };

    // =======================================================
    // SHORTS MANAGER
    // =======================================================
    const ShortsManager = {
        observer: null,
        listenersCleanup: [],
        eventCleanup: null,
        hiddenElements: new Set(),
        previousDisplay: new WeakMap(),
        pendingRoots: new Set(),
        enabled: false,
        scheduledPrune: null,
        init(config) {
            this.scheduledPrune = Utils.scheduleFrame(() => this.flushPendingRoots());
            this.eventCleanup = EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            this.updateConfig(config);
        },
        updateConfig(config) {
            const shouldEnable = Boolean(config?.FEATURES?.SHORTS_REMOVAL);
            if (shouldEnable === this.enabled) return;
            this.enabled = shouldEnable;
            if (this.enabled) this.start();
            else this.stop();
        },
        start() {
            if (!document.documentElement) return;
            this.queueRoot(Utils.getAppRoot());
            if (!this.observer) {
                this.observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) this.queueRoot(node);
                    }
                });
                this.observer.observe(Utils.getAppRoot(), { childList: true, subtree: true });
            }
            if (this.listenersCleanup.length === 0) {
                const rescan = () => this.queueRoot(Utils.getAppRoot());
                this.listenersCleanup.push(
                    Utils.safeAddEventListener(document, 'yt-navigate-finish', rescan),
                    Utils.safeAddEventListener(document, 'yt-page-data-updated', rescan),
                    Utils.safeAddEventListener(window, 'popstate', rescan)
                );
            }
        },
        stop() {
            this.observer?.disconnect();
            this.observer = null;
            this.scheduledPrune?.cancel();
            this.pendingRoots.clear();
            this.listenersCleanup.forEach((cleanup) => cleanup());
            this.listenersCleanup = [];
            this.restoreHiddenElements();
        },
        queueRoot(node) {
            if (!this.enabled) return;
            const root = node instanceof Element || node instanceof Document ? node : node?.parentElement;
            if (!root) return;
            for (const pendingRoot of this.pendingRoots) {
                if (pendingRoot.contains(root)) return;
                if (root.contains(pendingRoot)) this.pendingRoots.delete(pendingRoot);
            }
            this.pendingRoots.add(root);
            this.scheduledPrune();
        },
        markHidden(element) {
            if (!(element instanceof HTMLElement) || this.hiddenElements.has(element)) return;
            this.previousDisplay.set(element, {
                value: element.style.getPropertyValue('display'),
                priority: element.style.getPropertyPriority('display')
            });
            element.style.setProperty('display', 'none', 'important');
            this.hiddenElements.add(element);
        },
        restoreHiddenElements() {
            for (const element of this.hiddenElements) {
                if (!(element instanceof HTMLElement)) continue;
                const previous = this.previousDisplay.get(element);
                const stillOwned = element.style.getPropertyValue('display') === 'none'
                    && element.style.getPropertyPriority('display') === 'important';
                if (stillOwned && previous) {
                    if (previous.value) element.style.setProperty('display', previous.value, previous.priority);
                    else element.style.removeProperty('display');
                }
                this.previousDisplay.delete(element);
            }
            this.hiddenElements.clear();
        },
        flushPendingRoots() {
            for (const element of this.hiddenElements) {
                if (!element.isConnected) {
                    this.hiddenElements.delete(element);
                    this.previousDisplay.delete(element);
                }
            }
            if (!this.enabled) return;
            const roots = [...this.pendingRoots];
            this.pendingRoots.clear();
            for (const root of roots) this.pruneRoot(root);
        },
        pruneRoot(root) {
            Utils.queryWithin(root, 'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]').forEach((shelf) => {
                this.markHidden(shelf.closest('ytd-rich-section-renderer') || shelf);
            });
            Utils.queryWithin(root, 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]').forEach((marker) => {
                this.markHidden(marker.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer'));
            });
            Utils.queryWithin(root, 'a[href="/shorts"], a[href^="/shorts/"]').forEach((link) => {
                this.markHidden(link.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-compact-link-renderer, tp-yt-paper-item, ytd-reel-item-renderer, ytd-rich-item-renderer'));
            });
        },
        cleanup() {
            this.stop();
            this.eventCleanup?.();
            this.eventCleanup = null;
            this.scheduledPrune = null;
        }
    };

    // =======================================================
    // RELEVANT SUBSCRIPTIONS SHELF MANAGER
    // =======================================================
    const RelevantShelfManager = {
        observer: null,
        listenersCleanup: [],
        eventCleanup: null,
        hiddenElements: new Set(),
        previousDisplay: new WeakMap(),
        pendingRoots: new Set(),
        enabled: false,
        scheduledPrune: null,
        relevantTitles: new Set(['most relevant', 'mais relevantes']),
        init(config) {
            this.scheduledPrune = Utils.scheduleFrame(() => this.flushPendingRoots());
            this.eventCleanup = EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            this.updateConfig(config);
        },
        updateConfig(config) {
            const shouldEnable = Boolean(config?.FEATURES?.REMOVE_RELEVANT);
            if (shouldEnable === this.enabled) return;
            this.enabled = shouldEnable;
            if (this.enabled) this.start();
            else this.stop();
        },
        start() {
            if (!document.documentElement) return;
            this.queueRoot(Utils.getAppRoot());
            if (!this.observer) {
                this.observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.addedNodes.length > 0) this.queueRoot(mutation.target);
                    }
                });
                this.observer.observe(Utils.getAppRoot(), { childList: true, subtree: true });
            }
            if (this.listenersCleanup.length === 0) {
                const rescan = () => this.queueRoot(Utils.getAppRoot());
                this.listenersCleanup.push(
                    Utils.safeAddEventListener(document, 'yt-navigate-finish', rescan),
                    Utils.safeAddEventListener(document, 'yt-page-data-updated', rescan),
                    Utils.safeAddEventListener(window, 'popstate', rescan)
                );
            }
        },
        stop() {
            this.observer?.disconnect();
            this.observer = null;
            this.scheduledPrune?.cancel();
            this.pendingRoots.clear();
            this.listenersCleanup.forEach((cleanup) => cleanup());
            this.listenersCleanup = [];
            this.restoreHiddenElements();
        },
        queueRoot(node) {
            const root = node instanceof Element || node instanceof Document ? node : node?.parentElement;
            if (!root) return;
            const scanRoot = root.closest?.('ytd-rich-shelf-renderer, ytd-rich-section-renderer') || root;
            for (const pendingRoot of this.pendingRoots) {
                if (pendingRoot.contains(scanRoot)) return;
                if (scanRoot.contains(pendingRoot)) this.pendingRoots.delete(pendingRoot);
            }
            this.pendingRoots.add(scanRoot);
            this.scheduledPrune();
        },
        normalizeTitle(value) {
            return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        },
        isRelevantShelf(shelf) {
            const titleSelectors = [
                ':scope #rich-shelf-header #title',
                ':scope #title-container > #title',
                ':scope .rich-shelf-header #title',
                ':scope #title'
            ];
            return titleSelectors.some((selector) => [...shelf.querySelectorAll(selector)].some((title) => (
                this.relevantTitles.has(this.normalizeTitle(title.textContent || ''))
            )));
        },
        markHidden(element) {
            if (!(element instanceof HTMLElement) || this.hiddenElements.has(element)) return;
            this.previousDisplay.set(element, {
                value: element.style.getPropertyValue('display'),
                priority: element.style.getPropertyPriority('display')
            });
            element.style.setProperty('display', 'none', 'important');
            this.hiddenElements.add(element);
        },
        restoreHiddenElements() {
            for (const element of this.hiddenElements) {
                if (!(element instanceof HTMLElement)) continue;
                const previous = this.previousDisplay.get(element);
                const stillOwned = element.style.getPropertyValue('display') === 'none'
                    && element.style.getPropertyPriority('display') === 'important';
                if (stillOwned && previous) {
                    if (previous.value) element.style.setProperty('display', previous.value, previous.priority);
                    else element.style.removeProperty('display');
                }
                this.previousDisplay.delete(element);
            }
            this.hiddenElements.clear();
        },
        flushPendingRoots() {
            for (const element of this.hiddenElements) {
                if (!element.isConnected) {
                    this.hiddenElements.delete(element);
                    this.previousDisplay.delete(element);
                }
            }
            if (!this.enabled || location.pathname !== '/feed/subscriptions') {
                this.restoreHiddenElements();
                this.pendingRoots.clear();
                return;
            }
            const roots = [...this.pendingRoots];
            this.pendingRoots.clear();
            for (const root of roots) this.pruneRoot(root);
        },
        pruneRoot(root) {
            Utils.queryWithin(root, 'ytd-rich-shelf-renderer').forEach((shelf) => {
                if (!this.isRelevantShelf(shelf)) return;
                this.markHidden(shelf.closest('ytd-rich-section-renderer') || shelf);
            });
        },
        cleanup() {
            this.stop();
            this.eventCleanup?.();
            this.eventCleanup = null;
            this.scheduledPrune = null;
        }
    };

    // =======================================================
    // CLOCK MANAGER
    // =======================================================
    const ClockManager = {
        clockElement: null,
        updateTimer: null,
        config: null,
        observer: null,
        structureObserver: null,
        observerCallback: null,
        observedMenus: new Set(),
        menuSelector: '.ytp-settings-menu, .ytp-contextmenu, .ytp-popup.ytp-contextmenu, .ytp-panel-menu',
        playerElement: null,
        fullscreenHandler: null,
        navigationHandler: null,
        visibilityCleanup: null,
        eventCleanup: null,
        init(config) {
            this.config = config;
            this.observerCallback = Utils.scheduleFrame(() => {
                this.adjustPosition();
                this.refreshVisibility();
            });
            this.eventCleanup = EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            this.fullscreenHandler = () => this.handleFullscreen();
            this.navigationHandler = () => {
                if (!this.config.FEATURES.FULLSCREEN_CLOCK) return;
                this.resolvePlayerElement(true);
                this.handleFullscreen();
            };
            document.addEventListener('fullscreenchange', this.fullscreenHandler);
            document.addEventListener('yt-navigate-finish', this.navigationHandler);
            this.updateConfig(config);
        },
        resolvePlayerElement(force = false) {
            if (!this.config?.FEATURES?.FULLSCREEN_CLOCK) return null;
            const current = this.playerElement;
            if (!force && current?.isConnected) return current;
            const fullscreenPlayer = document.fullscreenElement?.matches?.('#movie_player, .html5-video-player')
                ? document.fullscreenElement
                : document.fullscreenElement?.querySelector?.('#movie_player, .html5-video-player');
            const player = fullscreenPlayer || Utils.DOMCache.get('#movie_player', force) || Utils.DOMCache.get('.html5-video-player', force);
            if (player !== current) {
                this.disconnectObservers();
                this.visibilityCleanup?.();
                this.visibilityCleanup = null;
                this.playerElement = player || null;
                if (this.playerElement && document.fullscreenElement) {
                    this.setupObserver();
                    this.setupVisibilityListeners();
                }
            } else if (!player) {
                this.playerElement = null;
            }
            return this.playerElement;
        },
        updateConfig(newConfig) {
            this.config = newConfig;
            if (!newConfig.FEATURES.FULLSCREEN_CLOCK) {
                this.stopRuntime();
                return;
            }
            this.resolvePlayerElement();
            this.updateStyle();
            this.handleFullscreen();
        },
        createClock() {
            const existing = document.getElementById('yt-enhancer-clock');
            if (existing) {
                this.clockElement = existing;
                return;
            }
            const clock = document.createElement('div');
            clock.id = 'yt-enhancer-clock';
            clock.style.cssText = `position: fixed !important; pointer-events: none !important; z-index: 2147483647 !important; font-family: "Roboto", sans-serif !important; font-weight: 400 !important; padding: 6px 14px !important; text-shadow: 0 1px 3px rgba(0,0,0,0.8) !important; display: none; box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important; transition: bottom 0.18s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s !important; will-change: bottom !important;`;
            (document.fullscreenElement || document.documentElement).appendChild(clock);
            this.clockElement = clock;
            this.updateStyle();
        },
        ensureClockMount() {
            const fullscreenRoot = document.fullscreenElement;
            if (fullscreenRoot && this.clockElement && this.clockElement.parentElement !== fullscreenRoot) {
                fullscreenRoot.appendChild(this.clockElement);
            }
        },
        setupObserver() {
            if (!this.playerElement || !this.config.FEATURES.FULLSCREEN_CLOCK) return;
            this.disconnectObservers();
            this.observer = new MutationObserver(() => this.observerCallback());
            this.structureObserver = new MutationObserver((mutations) => {
                let menuStructureChanged = false;
                let hasDetachedMenu = false;
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        menuStructureChanged = this.observeMenusWithin(node) || menuStructureChanged;
                    }
                    if (mutation.removedNodes.length > 0 && !hasDetachedMenu) {
                        hasDetachedMenu = [...this.observedMenus].some((menu) => !menu.isConnected || !this.playerElement.contains(menu));
                    }
                }
                if (hasDetachedMenu) {
                    this.refreshMenuObservers();
                    menuStructureChanged = true;
                }
                if (menuStructureChanged) this.observerCallback();
            });
            this.structureObserver.observe(this.playerElement, { childList: true, subtree: true });
            this.refreshMenuObservers();
        },
        observeMenusWithin(root) {
            if (!this.observer) return false;
            let observedNewMenu = false;
            for (const menu of Utils.queryWithin(root, this.menuSelector)) {
                if (this.observedMenus.has(menu)) continue;
                this.observer.observe(menu, {
                    attributes: true,
                    attributeFilter: ['class', 'style', 'aria-hidden']
                });
                this.observedMenus.add(menu);
                observedNewMenu = true;
            }
            return observedNewMenu;
        },
        refreshMenuObservers() {
            if (!this.observer || !this.playerElement) return;
            this.observer.disconnect();
            this.observedMenus.clear();
            this.observer.observe(this.playerElement, {
                attributes: true,
                attributeFilter: ['class']
            });
            this.observeMenusWithin(this.playerElement);
        },
        disconnectObservers() {
            this.observer?.disconnect();
            this.structureObserver?.disconnect();
            this.observer = null;
            this.structureObserver = null;
            this.observedMenus.clear();
        },
        setupVisibilityListeners() {
            if (!this.playerElement || this.visibilityCleanup) return;
            const refresh = () => this.observerCallback();
            const cleanups = [
                Utils.safeAddEventListener(this.playerElement, 'mousemove', refresh, { passive: true }),
                Utils.safeAddEventListener(this.playerElement, 'pointermove', refresh, { passive: true }),
                Utils.safeAddEventListener(this.playerElement, 'touchstart', refresh, { passive: true }),
                Utils.safeAddEventListener(this.playerElement, 'transitionend', refresh, { passive: true }),
                Utils.safeAddEventListener(document, 'keydown', refresh, { passive: true, capture: true })
            ];
            this.visibilityCleanup = () => {
                cleanups.forEach((cleanup) => cleanup());
                this.visibilityCleanup = null;
            };
        },
        areControlsVisible() {
            if (!this.playerElement) return false;
            if (!this.playerElement.classList.contains('ytp-autohide')) return true;
            const controls = this.playerElement.querySelector('.ytp-chrome-bottom, .ytp-gradient-bottom');
            if (!controls) return false;
            const style = getComputedStyle(controls);
            return controls.getClientRects().length > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity) > 0.05;
        },
        adjustPosition() {
            if (!this.clockElement) return;
            if (!this.playerElement?.isConnected) this.resolvePlayerElement(true);
            if (!this.playerElement) return;
            const margin = this.config.CLOCK_STYLE.margin;
            this.clockElement.style.bottom = `${this.areControlsVisible() ? margin + 110 : margin}px`;
        },
        isPlayerMenuOpen() {
            const fullscreenRoot = document.fullscreenElement;
            if (!fullscreenRoot) return false;
            return [...fullscreenRoot.querySelectorAll(this.menuSelector)].some((element) => {
                const style = getComputedStyle(element);
                return element.getClientRects().length > 0
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && Number(style.opacity) !== 0;
            });
        },
        refreshVisibility() {
            if (!this.clockElement) return;
            const shouldShow = Boolean(this.config?.FEATURES?.FULLSCREEN_CLOCK
                && document.fullscreenElement
                && !this.isPlayerMenuOpen());
            this.clockElement.style.display = shouldShow ? 'block' : 'none';
        },
        updateStyle() {
            if (!this.clockElement) return;
            const style = this.config.CLOCK_STYLE;
            const hexToRgb = (hex) => {
                const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return match ? `${parseInt(match[1], 16)},${parseInt(match[2], 16)},${parseInt(match[3], 16)}` : '0,0,0';
            };
            this.clockElement.style.backgroundColor = `rgba(${hexToRgb(style.bgColor)}, ${style.bgOpacity})`;
            this.clockElement.style.color = style.color;
            this.clockElement.style.fontSize = `${style.fontSize}px`;
            this.clockElement.style.right = '15px';
            this.clockElement.style.borderRadius = `${style.borderRadius}px`;
            this.adjustPosition();
        },
        updateTime() {
            if (this.clockElement) {
                this.clockElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        },
        scheduleTimeUpdate() {
            clearTimeout(this.updateTimer);
            const now = new Date();
            const delay = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds() + 50;
            this.updateTimer = setTimeout(() => {
                this.updateTimer = null;
                if (!document.fullscreenElement || !this.config.FEATURES.FULLSCREEN_CLOCK) return;
                this.updateTime();
                this.scheduleTimeUpdate();
            }, delay);
        },
        handleFullscreen() {
            if (!this.config.FEATURES.FULLSCREEN_CLOCK) {
                this.stopRuntime();
                return;
            }
            if (document.fullscreenElement) {
                this.resolvePlayerElement(true);
                if (!this.clockElement) this.createClock();
                this.ensureClockMount();
                if (!this.observer) this.setupObserver();
                this.setupVisibilityListeners();
                this.updateStyle();
                this.updateTime();
                this.refreshVisibility();
                this.scheduleTimeUpdate();
            } else {
                this.stopRuntime();
            }
        },
        stopRuntime() {
            this.disconnectObservers();
            this.observerCallback?.cancel();
            this.visibilityCleanup?.();
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
            this.clockElement?.remove();
            this.clockElement = null;
            this.playerElement = null;
        },
        cleanup() {
            this.stopRuntime();
            if (this.fullscreenHandler) document.removeEventListener('fullscreenchange', this.fullscreenHandler);
            if (this.navigationHandler) document.removeEventListener('yt-navigate-finish', this.navigationHandler);
            this.eventCleanup?.();
            this.eventCleanup = null;
            this.observerCallback = null;
            this.fullscreenHandler = null;
            this.navigationHandler = null;
            this.config = null;
        }
    };
    
    // =======================================================
    // INITIALIZATION CORE
    // =======================================================
    const EnhancerCore = {
        initialized: false,
        cleanupFunctions: [],
        init() {
            if (this.initialized) return;
            this.initialized = true;
            try {
                this.cleanupFunctions.push(
                    Utils.safeAddEventListener(document, 'yt-navigate-start', () => Utils.DOMCache.refresh()),
                    Utils.safeAddEventListener(document, 'yt-page-data-updated', () => Utils.DOMCache.refresh()),
                    Utils.safeAddEventListener(window, 'keydown', (event) => {
                        if (event.altKey && event.shiftKey && (event.code === 'KeyS' || event.key?.toLowerCase() === 's')) {
                            event.preventDefault();
                            event.stopPropagation();
                            event.stopImmediatePropagation();
                            SettingsLauncher.open('shortcut_alt_shift_s');
                        }
                    }, { capture: true })
                );

                const config = ConfigManager.load();
                SettingsLauncher.registerSafeApi();

                try { StyleManager.init(); StyleManager.apply(config); } catch (error) { console.error('[YT Enhancer] StyleManager init failed:', error); }
                try { ShortsManager.init(config); } catch (error) { console.error('[YT Enhancer] ShortsManager init failed:', error); }
                try { RelevantShelfManager.init(config); } catch (error) { console.error('[YT Enhancer] RelevantShelfManager init failed:', error); }
                try { ClockManager.init(config); } catch (error) { console.error('[YT Enhancer] ClockManager init failed:', error); }

                this.cleanupFunctions.push(Utils.safeAddEventListener(window, 'beforeunload', () => this.cleanup(), { once: true }));
                log(`v${ConfigManager.CONFIG_VERSION} iniciado com sucesso.`);
            } catch (error) {
                console.error('[YT Enhancer] Falha na inicialização:', error);
                this.cleanup();
            }
        },
        cleanup() {
            if (!this.initialized) return;
            this.initialized = false;
            const cleanupFunctions = this.cleanupFunctions;
            this.cleanupFunctions = [];
            cleanupFunctions.forEach((cleanup) => cleanup());
            UIManager.cleanup();
            ClockManager.cleanup();
            ShortsManager.cleanup();
            RelevantShelfManager.cleanup();
            StyleManager.cleanup();
            SettingsLauncher.cleanup();
            Utils.DOMCache.refresh();
            EventBus.clear();
        }
    };

    const BootstrapGate = {
        evaluate() {
            const hostnameAllowed = location.hostname === 'www.youtube.com';
            let isTopFrame = false;
            try { isTopFrame = window === window.top; } catch (error) {}
            const shouldInit = hostnameAllowed && isTopFrame;
            return { shouldInit };
        }
    };


    if (BootstrapGate.evaluate().shouldInit) {
        SettingsLauncher.registerMenuCommand();
        try { StyleManager.apply(ConfigManager.load()); } catch (error) { console.error('[YT Enhancer] Early style injection failed:', error); }
        if (document.readyState === 'loading') {
            Utils.safeAddEventListener(document, 'DOMContentLoaded', () => {
                SettingsLauncher.registerMenuCommand();
                EnhancerCore.init();
            });
        } else {
            SettingsLauncher.registerMenuCommand();
            EnhancerCore.init();
        }
    }

})();
