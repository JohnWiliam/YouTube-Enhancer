// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      2.3.2
// @description  Personaliza o layout, remove elementos indesejados, elimina blur e adiciona um relógio em tela cheia.
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

    const SCRIPT_VERSION = '2.3.2';
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
            const safe = { ...defaults, ...(config || {}), FEATURES: { ...defaults.FEATURES, ...(config?.FEATURES || {}) }, CLOCK_STYLE: { ...defaults.CLOCK_STYLE, ...(config?.CLOCK_STYLE || {}) } };
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
            safe.FEATURES.FULLSCREEN_CLOCK = this.toBoolean(safe.FEATURES.FULLSCREEN_CLOCK, defaults.FEATURES.FULLSCREEN_CLOCK);
            safe.FEATURES.RTX_VISUAL_MODE = this.toBoolean(safe.FEATURES.RTX_VISUAL_MODE, defaults.FEATURES.RTX_VISUAL_MODE);
            safe.FEATURES.RELEVANT_SHELF_REMOVAL = this.toBoolean(safe.FEATURES.RELEVANT_SHELF_REMOVAL, defaults.FEATURES.RELEVANT_SHELF_REMOVAL);
            safe.FEATURES = {
                LAYOUT_ENHANCEMENT: safe.FEATURES.LAYOUT_ENHANCEMENT,
                SHORTS_REMOVAL: safe.FEATURES.SHORTS_REMOVAL,
                RELEVANT_SHELF_REMOVAL: safe.FEATURES.RELEVANT_SHELF_REMOVAL,
                FULLSCREEN_CLOCK: safe.FEATURES.FULLSCREEN_CLOCK,
                RTX_VISUAL_MODE: safe.FEATURES.RTX_VISUAL_MODE
            };
            return safe;
        },
        debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
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
            if (!savedConfig.FEATURES || typeof savedConfig.FEATURES !== 'object') savedConfig.FEATURES = {};
            if (!savedConfig.CLOCK_STYLE || typeof savedConfig.CLOCK_STYLE !== 'object') savedConfig.CLOCK_STYLE = {};
            if (!savedConfig.version) {
                savedConfig.version = '1.0.0';
                if (!savedConfig.CLOCK_STYLE?.borderRadius) savedConfig.CLOCK_STYLE = { ...savedConfig.CLOCK_STYLE, borderRadius: 12 };
            }
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
            modal: { title: '⚙️ Configurações', closeTitle: 'Fechar', tabs: { features: '🔧 Funcionalidades', appearance: '🎨 Aparência do relógio' }, features: { layout: { title: 'Layout Grid', description: 'Ajusta vídeos por linha' }, videosPerRow: 'Vídeos por linha', videosPerRowHint: 'Define quantos vídeos aparecem', shorts: { title: 'Remover Shorts', description: 'Limpa Shorts da interface' }, relevantShelf: { title: 'Remover (Mais Relevantes)', description: "Remove o elemento 'Mais relevantes' da página de inscrições." }, clock: { title: 'Relógio Flutuante', description: 'Mostra hora sobre o vídeo' }, rtx: { title: 'Modo RTX (sem blur)', description: 'Fundos translúcidos ficam transparentes' }, language: { title: 'Idioma da Interface', description: 'Troca textos entre PT e EN' } }, clockStyle: { textColor: 'Cor do Texto', backgroundColor: 'Cor do Fundo', backgroundOpacity: 'Opacidade Fundo', fontSize: 'Tamanho Fonte (px)', margin: 'Margem (px)', borderRadius: 'Arredondamento (px)' }, buttons: { apply: 'Aplicar', applyAndReload: 'Aplicar e Recarregar' }, reloadNotice: 'A alteração de idioma exige recarregar a página.' },
            menu: { openSettings: '⚙️ Configurações' }
        },
        en: {
            modal: { title: '⚙️ Settings', closeTitle: 'Close', tabs: { features: '🔧 Features', appearance: '🎨 Clock appearance' }, features: { layout: { title: 'Grid Layout', description: 'Adjusts videos per row' }, videosPerRow: 'Videos per row', videosPerRowHint: 'Defines videos in each row', shorts: { title: 'Remove Shorts', description: 'Cleans Shorts from the interface' }, relevantShelf: { title: 'Remove (Most relevant)', description: "Removes the 'Most relevant' element from the Subscriptions page." }, clock: { title: 'Floating Clock', description: 'Shows time over the video' }, rtx: { title: 'RTX Mode (no blur)', description: 'Turns translucent backgrounds transparent' }, language: { title: 'Interface Language', description: 'Switches interface text between English and Portuguese' } }, clockStyle: { textColor: 'Text Color', backgroundColor: 'Background Color', backgroundOpacity: 'Background Opacity', fontSize: 'Font Size (px)', margin: 'Margin (px)', borderRadius: 'Roundness (px)' }, buttons: { apply: 'Apply', applyAndReload: 'Apply and Reload' }, reloadNotice: 'Changing the language requires reloading the page.' },
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
        CONFIG_VERSION: '2.3.2',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        defaults: {
            version: '2.3.2', LANGUAGE: 'pt', VIDEOS_PER_ROW: 5,
            FEATURES: { LAYOUT_ENHANCEMENT: true, SHORTS_REMOVAL: true, RELEVANT_SHELF_REMOVAL: false, FULLSCREEN_CLOCK: true, RTX_VISUAL_MODE: true },
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
            // Escuta a requisições de outras partes/páginas de maneira isolada e segura
            window.addEventListener('yt-enhancer-open-settings', () => this.open('event_api'));
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
            const closeButton = create('button', { id: 'yt-enhancer-close', className: 'close-btn', text: '×' });
            closeButton.title = t('modal.closeTitle', config.LANGUAGE);
            closeButton.setAttribute('aria-label', t('modal.closeTitle', config.LANGUAGE));
            modalHeader.append(
                create('h2', { className: 'modal-title', text: t('modal.title', config.LANGUAGE) }),
                closeButton
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
                createToggle('cfg-relevant-shelf', t('modal.features.relevantShelf.title', config.LANGUAGE), t('modal.features.relevantShelf.description', config.LANGUAGE), config.FEATURES.RELEVANT_SHELF_REMOVAL),
                createToggle('cfg-clock-enable', t('modal.features.clock.title', config.LANGUAGE), t('modal.features.clock.description', config.LANGUAGE), config.FEATURES.FULLSCREEN_CLOCK),
                createToggle('cfg-rtx-visual', t('modal.features.rtx.title', config.LANGUAGE), t('modal.features.rtx.description', config.LANGUAGE), config.FEATURES.RTX_VISUAL_MODE)
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
                createControl('style-font-size', t('modal.clockStyle.fontSize', config.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 12, max: 100, value: config.CLOCK_STYLE.fontSize })),
                createControl('style-margin', t('modal.clockStyle.margin', config.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 200, value: config.CLOCK_STYLE.margin })),
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
            const closeModal = () => { modal.remove(); overlay.remove(); this.cleanupFunctions.forEach(fn => fn()); this.cleanupFunctions = []; };
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
                    RELEVANT_SHELF_REMOVAL: document.getElementById('cfg-relevant-shelf').checked,
                    FULLSCREEN_CLOCK: document.getElementById('cfg-clock-enable').checked,
                    RTX_VISUAL_MODE: document.getElementById('cfg-rtx-visual').checked
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
            setTimeout(() => document.getElementById('cfg-layout')?.focus(), 0);

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
        }
    };

    // =======================================================
    // 3. STYLE MANAGER
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-styles',
        init() {
            EventBus.on('configChanged', (config) => this.apply(config));
            // Garante que o YT não apague o estilo após a navegação SPA
            document.addEventListener('yt-navigate-finish', () => this.apply(ConfigManager.load()));
        },
        apply(config) {
            let css = '.ytp-popup, .ytp-settings-menu { z-index: 71 !important; }';
            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important; } @media (max-width: 1200px) { ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important; } }`;
            }
            if (config.FEATURES.SHORTS_REMOVAL) {
                css += `ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-reel-shelf-renderer, ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]), ytd-guide-entry-renderer:has(a[href^="/shorts"]), ytd-guide-entry-renderer:has(a[href*="/shorts/"]), ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]), ytd-mini-guide-entry-renderer:has(a[href*="/shorts/"]), ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"] { display: none !important; }`;
            }
            if (config.FEATURES.RELEVANT_SHELF_REMOVAL) {
                css += `ytd-browse[page-subtype="subscriptions"] ytd-rich-section-renderer.ytd-rich-grid-renderer.style-scope, ytd-browse[page-subtype="subscriptions"] div#dismissible.style-scope.ytd-rich-shelf-renderer { display: none !important; }`;
            }
            if (config.FEATURES.RTX_VISUAL_MODE) {
                css += `
                    ytd-masthead, #guide, ytd-mini-guide-renderer, ytd-guide-renderer { background: transparent !important; background-color: transparent !important; }
                    tp-yt-paper-dialog, ytd-multi-page-menu-renderer, tp-yt-iron-dropdown, ytd-popup-container tp-yt-paper-dialog, ytd-account-menu { background: var(--yt-spec-base-background, #0f0f0f) !important; background-color: var(--yt-spec-base-background, #0f0f0f) !important; }
                    .ytp-settings-menu, .ytp-panel, .ytp-panel-menu, .ytp-popup.ytp-contextmenu { background: rgba(15, 15, 15, 0.95) !important; background-color: rgba(15, 15, 15, 0.95) !important; text-shadow: none !important; }
                `;
            }
            Utils.injectCSS(css, this.styleId);
        }
    };

    // =======================================================
    // SHORTS MANAGER
    // =======================================================
    const ShortsManager = {
        observer: null, listenersCleanup: [], hiddenElements: new Set(), enabled: false,
        debouncedPrune: Utils.debounce(function() { if (this.enabled) this.prune(); }, 250),
        init(config) { this.updateConfig(config); EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig)); },
        updateConfig(config) {
            const shouldEnable = Boolean(config?.FEATURES?.SHORTS_REMOVAL);
            if (shouldEnable === this.enabled) return;
            this.enabled = shouldEnable;
            if (this.enabled) this.start(); else this.stop();
        },
        start() {
            if (!document.documentElement) return;
            this.prune();
            if (!this.observer) {
                this.observer = new MutationObserver(() => this.debouncedPrune());
                // Observer focado evita gargalo em rolagem
                const targetNode = document.querySelector('ytd-app') || document.body;
                if (targetNode) this.observer.observe(targetNode, { childList: true, subtree: true });
            }
            if (this.listenersCleanup.length === 0) {
                this.listenersCleanup.push(Utils.safeAddEventListener(document, 'yt-navigate-finish', () => this.debouncedPrune()), Utils.safeAddEventListener(document, 'yt-page-data-updated', () => this.debouncedPrune()), Utils.safeAddEventListener(window, 'popstate', () => this.debouncedPrune()));
            }
        },
        stop() {
            if (this.observer) { this.observer.disconnect(); this.observer = null; }
            this.listenersCleanup.forEach((cleanup) => cleanup()); this.listenersCleanup = [];
            this.restoreHiddenElements();
        },
        markHidden(element) {
            if (!(element instanceof HTMLElement) || this.hiddenElements.has(element)) return;
            element.dataset.ytEnhancerPrevDisplay = element.style.display || '';
            element.style.setProperty('display', 'none', 'important');
            this.hiddenElements.add(element);
        },
        restoreHiddenElements() {
            for (const element of this.hiddenElements) {
                if (!(element instanceof HTMLElement)) continue;
                const prev = element.dataset.ytEnhancerPrevDisplay || '';
                if (prev) element.style.display = prev; else element.style.removeProperty('display');
                delete element.dataset.ytEnhancerPrevDisplay;
            }
            this.hiddenElements.clear();
        },
        prune() {
            for (const el of [...this.hiddenElements]) {
                if (!el.isConnected) this.hiddenElements.delete(el);
            }
            const hide = new Set();
            document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]').forEach(n => { hide.add(n); const s = n.closest('ytd-rich-section-renderer'); if (s) hide.add(s); });
            document.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]').forEach(m => { const c = m.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-item-section-renderer'); if(c) hide.add(c); });
            document.querySelectorAll('a[href^="/shorts"], a[href*="/shorts/"], a[title="Shorts"], [aria-label="Shorts"]').forEach(l => { const e = l.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-compact-link-renderer, tp-yt-paper-item'); if(e) hide.add(e); });
            document.querySelectorAll('ytd-reel-item-renderer, ytd-rich-item-renderer:has(a[href^="/shorts/"])').forEach(i => hide.add(i));
            hide.forEach(el => this.markHidden(el));
        },
        cleanup() { this.stop(); }
    };

    // =======================================================
    // 4. CLOCK MANAGER
    // =======================================================
    const ClockManager = {
        clockElement: null, interval: null, timeInterval: null, config: null, observer: null, playerElement: null, fullscreenHandler: null, navigationHandler: null,
        init(config) {
            this.config = config; this.resolvePlayerElement(true);
            EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            this.fullscreenHandler = () => this.handleFullscreen();
            this.navigationHandler = () => { this.resolvePlayerElement(true); this.handleFullscreen(); };
            document.addEventListener('fullscreenchange', this.fullscreenHandler);
            document.addEventListener('yt-navigate-finish', this.navigationHandler);
            this.handleFullscreen();
        },
        resolvePlayerElement(force = false) {
            const current = this.playerElement;
            if (!force && current?.isConnected) return current;
            const player = Utils.DOMCache.get('#movie_player', force) || Utils.DOMCache.get('.html5-video-player', force);
            if (player !== current) {
                if (this.observer) { this.observer.disconnect(); this.observer = null; }
                this.playerElement = player || null;
                if (this.playerElement) this.setupObserver();
            } else if (!player) { this.playerElement = null; }
            return this.playerElement;
        },
        updateConfig(newConfig) { this.config = newConfig; this.updateStyle(); this.adjustPosition(); },
        createClock() {
            if (document.getElementById('yt-enhancer-clock')) return;
            const clock = document.createElement('div');
            clock.id = 'yt-enhancer-clock';
            clock.style.cssText = `position: fixed !important; pointer-events: none !important; z-index: 40 !important; font-family: "Roboto", sans-serif !important; font-weight: 400 !important; padding: 6px 14px !important; text-shadow: 0 1px 3px rgba(0,0,0,0.8) !important; display: none; box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important; transition: bottom 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s !important;`;
            (document.fullscreenElement || document.documentElement).appendChild(clock);
            this.clockElement = clock;
            this.updateStyle();
        },
        setupObserver() {
            if (!this.playerElement) return;
            if (this.observer) this.observer.disconnect();
            this.observer = new MutationObserver(Utils.debounce(() => this.adjustPosition(), 150));
            this.observer.observe(this.playerElement, { attributes: true, attributeFilter: ['class'] });
        },
        adjustPosition() {
            if (!this.clockElement) return;
            if (!this.playerElement?.isConnected) this.resolvePlayerElement(true);
            if (!this.playerElement) return;
            try {
                const fs = document.fullscreenElement != null;
                const controls = !this.playerElement.classList.contains('ytp-autohide');
                const margin = this.config.CLOCK_STYLE.margin;
                this.clockElement.style.bottom = `${(fs && controls) ? margin + 110 : margin}px`;
            } catch (e) {}
        },
        updateStyle() {
            if (!this.clockElement) return;
            const s = this.config.CLOCK_STYLE;
            const hexToRgb = (hex) => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '0,0,0'; };
            this.clockElement.style.backgroundColor = `rgba(${hexToRgb(s.bgColor)}, ${s.bgOpacity})`;
            this.clockElement.style.color = s.color;
            this.clockElement.style.fontSize = `${s.fontSize}px`;
            this.clockElement.style.right = `15px`;
            this.clockElement.style.borderRadius = `${s.borderRadius}px`;
            this.adjustPosition();
        },
        updateTime() {
            if (this.clockElement) this.clockElement.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
        handleFullscreen() {
            if (!this.config.FEATURES.FULLSCREEN_CLOCK) {
                if (this.timeInterval) { clearInterval(this.timeInterval); this.timeInterval = null; }
                this.clockElement?.remove();
                this.clockElement = null;
                return;
            }
            if (!this.playerElement?.isConnected) this.resolvePlayerElement(true);
            if (document.fullscreenElement) {
                if (!this.clockElement) this.createClock();
                if (this.clockElement.parentElement !== document.fullscreenElement) document.fullscreenElement.appendChild(this.clockElement);
                this.clockElement.style.display = 'block';
                this.updateTime();
                this.adjustPosition();
                if (!this.timeInterval) this.timeInterval = setInterval(() => this.updateTime(), 1000);
            } else {
                if (this.clockElement) this.clockElement.style.display = 'none';
                if (this.timeInterval) { clearInterval(this.timeInterval); this.timeInterval = null; }
            }
        },
        cleanup() {
            if (this.observer) this.observer.disconnect();
            if (this.interval) clearInterval(this.interval);
            if (this.timeInterval) clearInterval(this.timeInterval);
            if (this.fullscreenHandler) document.removeEventListener('fullscreenchange', this.fullscreenHandler);
            if (this.navigationHandler) document.removeEventListener('yt-navigate-finish', this.navigationHandler);
            this.clockElement?.remove();
            this.clockElement = null;
            this.interval = null;
            this.timeInterval = null;
            this.observer = null; this.playerElement = null; this.fullscreenHandler = null; this.navigationHandler = null;
        }
    };

    
    // =======================================================
    // INITIALIZATION CORE
    // =======================================================
    const EnhancerCore = {
        init() {
            try {
                Utils.safeAddEventListener(document, 'yt-navigate-start', () => Utils.DOMCache.refresh());
                Utils.safeAddEventListener(document, 'yt-page-data-updated', () => Utils.DOMCache.refresh());

                const config = ConfigManager.load();
                
                Utils.safeAddEventListener(window, 'keydown', (event) => {
                    if (event.altKey && event.shiftKey && (event.code === 'KeyS' || event.key?.toLowerCase() === 's')) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        SettingsLauncher.open('shortcut_alt_shift_s');
                    }
                }, { capture: true });

                SettingsLauncher.registerSafeApi();

                try { StyleManager.init(); StyleManager.apply(config); } catch (e) { console.error('[YT Enhancer] StyleManager init failed:', e); }
                try { ShortsManager.init(config); } catch (e) { console.error('[YT Enhancer] ShortsManager init failed:', e); }
                try { ClockManager.init(config); } catch (e) { console.error('[YT Enhancer] ClockManager init failed:', e); }
                
                Utils.safeAddEventListener(window, 'beforeunload', () => {
                    ClockManager.cleanup(); ShortsManager.cleanup(); Utils.DOMCache.refresh();
                });

                log(`v${ConfigManager.CONFIG_VERSION} Iniciado com sucesso.`);
            } catch (error) { console.error('[YT Enhancer] Falha na inicialização:', error); }
        }
    };

    const Diagnostics = {
        shortcutRegistered: false,
        registerShortcut() {
            if (this.shortcutRegistered) return;
            this.shortcutRegistered = true;

            Utils.safeAddEventListener(window, 'keydown', (event) => {
                if (event.altKey && event.shiftKey && (event.code === 'KeyD' || event.key?.toLowerCase() === 'd')) {
                    console.info('[YT Enhancer][diag] Contexto atual:', { href: location.href });
                }
            }, { capture: true });
        }
    };

    const BootstrapGate = {
        evaluate() {
            const hostnameAllowed = location.hostname === 'www.youtube.com';
            const contextVisible = document.visibilityState !== 'hidden';
            let isTopFrame = false;
            try { isTopFrame = window === window.top; } catch (error) {}
            const shouldInit = isTopFrame || (hostnameAllowed && contextVisible);
            return { shouldInit };
        }
    };

    Diagnostics.registerShortcut();

    if (BootstrapGate.evaluate().shouldInit) {
        SettingsLauncher.registerMenuCommand();
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
