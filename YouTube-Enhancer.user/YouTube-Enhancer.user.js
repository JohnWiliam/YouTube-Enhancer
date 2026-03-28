// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      2.2.0
// @description  Reduz uso de CPU (Smart Mode), personaliza layout, remove Shorts, elimina blur, adiciona relógio e gerencia Layout em Abas (Tabview).
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
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '2.2.0';
    const FLAG = `__yt_enhancer_v${SCRIPT_VERSION.replace(/\./g, '_')}__`;
    if (window[FLAG]) return;
    window[FLAG] = true;

    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
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
            if (!savedConfig.version) {
                savedConfig.version = '1.0.0';
                if (!savedConfig.CLOCK_STYLE?.borderRadius) savedConfig.CLOCK_STYLE = { ...savedConfig.CLOCK_STYLE, borderRadius: 12 };
            }
            if (savedConfig.FEATURES && typeof savedConfig.FEATURES.TABVIEW_LAYOUT === 'undefined') {
                savedConfig.FEATURES.TABVIEW_LAYOUT = false;
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
                return false;
            }
        }
    };

    // =======================================================
    // 1. I18N + CONFIG MANAGER
    // =======================================================
    const I18N = {
        pt: {
            modal: { title: '⚙️ Configurações', closeTitle: 'Fechar', tabs: { features: '🔧 Funcionalidades', appearance: '🎨 Aparência do relógio' }, features: { cpuTamer: { title: 'Redução Inteligente de CPU', description: 'Otimiza quando oculto (economiza bateria)' }, layout: { title: 'Layout Grid', description: 'Ajusta vídeos por linha' }, videosPerRow: 'Vídeos por linha', videosPerRowHint: 'Define quantos vídeos aparecem', shorts: { title: 'Remover Shorts', description: 'Limpa Shorts da interface' }, clock: { title: 'Relógio Flutuante', description: 'Mostra hora sobre o vídeo' }, rtx: { title: 'Modo RTX (sem blur)', description: 'Fundos translúcidos ficam transparentes' }, tabview: { title: 'Layout em Abas (Tabview)', description: 'Organiza vídeos, descrição e comentários em abas laterais' }, language: { title: 'Idioma da Interface', description: 'Troca textos entre PT e EN' } }, clockStyle: { textColor: 'Cor do Texto', backgroundColor: 'Cor do Fundo', backgroundOpacity: 'Opacidade Fundo', fontSize: 'Tamanho Fonte (px)', margin: 'Margem (px)', borderRadius: 'Arredondamento (px)' }, buttons: { apply: 'Aplicar', applyAndReload: 'Aplicar e Recarregar' }, reloadNotice: 'Aba lateral, Idioma e CPU exigem recarregar a página.' },
            menu: { openSettings: '⚙️ Configurações' }
        },
        en: {
            modal: { title: '⚙️ Settings', closeTitle: 'Close', tabs: { features: '🔧 Features', appearance: '🎨 Clock appearance' }, features: { cpuTamer: { title: 'Smart CPU Reduction', description: 'Optimizes when hidden (saves battery)' }, layout: { title: 'Grid Layout', description: 'Adjusts videos per row' }, videosPerRow: 'Videos per row', videosPerRowHint: 'Defines videos in each row', shorts: { title: 'Remove Shorts', description: 'Cleans Shorts from UI' }, clock: { title: 'Floating Clock', description: 'Shows time over the video' }, rtx: { title: 'RTX Mode (no blur)', description: 'Turns translucent backgrounds transparent' }, tabview: { title: 'Tabbed Layout (Tabview)', description: 'Rearranges videos, info, and comments into side tabs' }, language: { title: 'Interface Language', description: 'Switch texts between EN and PT' } }, clockStyle: { textColor: 'Text Color', backgroundColor: 'Background Color', backgroundOpacity: 'Background Opacity', fontSize: 'Font Size (px)', margin: 'Margin (px)', borderRadius: 'Roundness (px)' }, buttons: { apply: 'Apply', applyAndReload: 'Apply and Reload' }, reloadNotice: 'Tabview, Language and CPU require reloading.' },
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
        CONFIG_VERSION: '2.2.0',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        defaults: {
            version: '2.2.0', LANGUAGE: 'pt', VIDEOS_PER_ROW: 4,
            FEATURES: { CPU_TAMER: true, LAYOUT_ENHANCEMENT: true, SHORTS_REMOVAL: true, FULLSCREEN_CLOCK: true, RTX_VISUAL_MODE: true, TABVIEW_LAYOUT: false },
            CLOCK_STYLE: { color: '#ffffff', bgColor: '#191919', bgOpacity: 0.3, fontSize: 22, margin: 30, borderRadius: 25, position: 'bottom-right' }
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
                .catch((error) => {
                    console.error(`[YT Enhancer] Exceção ao abrir configurações (source=${source}).`, error);
                })
                .finally(() => {
                    this.opening = false;
                });
        },
        registerMenuCommand() {
            if (this.menuRegistered || typeof GM_registerMenuCommand !== 'function') return;
            this.menuRegistered = true;

            const lang = ConfigManager.load().LANGUAGE;
            const label = t('menu.openSettings', lang);
            const callback = () => this.open('menu');

            try {
                GM_registerMenuCommand(label, callback, { id: 'yt-enhancer-settings-cmd', autoClose: true });
            } catch (error) {
                try {
                    GM_registerMenuCommand(label, callback);
                } catch (fallbackError) {}
            }
        },
        registerFallbackApi() {
            try {
                targetWindow.YT_ENHANCER_OPEN_SETTINGS = () => this.open('window_api');
            } catch (error) {}
        }
    };

    // =======================================================
    // 2. UI MANAGER (Modal Blindado)
    // =======================================================
    const UIManager = {
        cleanupFunctions: [],
        styleId: 'yt-enhancer-modal-style',
        styleFallbackLogCode: 'UI_MODAL_STYLE_FALLBACK',

        applyModalInlineFallback(modalElement, reason = 'unknown') {
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
            if (!stylesInjected) this.applyModalInlineFallback(modal, 'injectCSS_failed');

            const modalHeader = create('div', { className: 'modal-header' });
            modalHeader.append(
                create('h2', { className: 'modal-title', text: t('modal.title', config.LANGUAGE) }),
                create('button', { id: 'yt-enhancer-close', className: 'close-btn', text: '×' })
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
                createToggle('cfg-cpu-tamer', t('modal.features.cpuTamer.title', config.LANGUAGE), t('modal.features.cpuTamer.description', config.LANGUAGE), config.FEATURES.CPU_TAMER),
                createToggle('cfg-layout', t('modal.features.layout.title', config.LANGUAGE), t('modal.features.layout.description', config.LANGUAGE), config.FEATURES.LAYOUT_ENHANCEMENT)
            );

            const layoutSettings = create('label', { id: 'layout-settings', className: 'feature-toggle feature-card-input', forId: 'cfg-videos-row' });
            layoutSettings.style.display = config.FEATURES.LAYOUT_ENHANCEMENT ? 'flex' : 'none';
            const layoutText = create('div', { className: 'toggle-text' });
            layoutText.append(create('strong', { text: t('modal.features.videosPerRow', config.LANGUAGE) }), create('span', { text: t('modal.features.videosPerRowHint', config.LANGUAGE) }));
            layoutSettings.append(layoutText, create('input', { id: 'cfg-videos-row', className: 'styled-input-small', type: 'number', min: 3, max: 8, value: config.VIDEOS_PER_ROW }));
            optionsList.append(layoutSettings);

            optionsList.append(
                createToggle('cfg-tabview', t('modal.features.tabview.title', config.LANGUAGE), t('modal.features.tabview.description', config.LANGUAGE), config.FEATURES.TABVIEW_LAYOUT),
                createToggle('cfg-shorts', t('modal.features.shorts.title', config.LANGUAGE), t('modal.features.shorts.description', config.LANGUAGE), config.FEATURES.SHORTS_REMOVAL),
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

            const closeModal = () => { modal.remove(); overlay.remove(); this.cleanupFunctions.forEach(fn => fn()); };
            this.cleanupFunctions.push(Utils.safeAddEventListener(overlay, 'click', closeModal));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('yt-enhancer-close'), 'click', closeModal));

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
                    CPU_TAMER: document.getElementById('cfg-cpu-tamer').checked,
                    LAYOUT_ENHANCEMENT: document.getElementById('cfg-layout').checked,
                    SHORTS_REMOVAL: document.getElementById('cfg-shorts').checked,
                    FULLSCREEN_CLOCK: document.getElementById('cfg-clock-enable').checked,
                    RTX_VISUAL_MODE: document.getElementById('cfg-rtx-visual').checked,
                    TABVIEW_LAYOUT: document.getElementById('cfg-tabview').checked
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
                const requiresReload = newConfig.FEATURES.CPU_TAMER !== config.FEATURES.CPU_TAMER || 
                                       newConfig.LANGUAGE !== config.LANGUAGE ||
                                       newConfig.FEATURES.TABVIEW_LAYOUT !== config.FEATURES.TABVIEW_LAYOUT;
                btnApply.style.display = requiresReload ? 'none' : 'block';
                btnReload.style.display = requiresReload ? 'block' : 'none';
                reloadNotice.style.display = requiresReload ? 'block' : 'none';
            };

            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-cpu-tamer'), 'change', updateSaveButtons));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-language'), 'change', updateSaveButtons));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-tabview'), 'change', updateSaveButtons));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnApply, 'click', () => { onSave(getNewConfig()); closeModal(); }));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnReload, 'click', () => { onSave(getNewConfig()); closeModal(); setTimeout(() => window.location.reload(), 100); }));

            return true;
        },

        ensureStyles() {
            const css = `
                .yt-enhancer-modal { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: min(420px, calc(100vw - 32px)) !important; max-height: 80vh !important; background: #121212 !important; color: #f1f1f1 !important; border: 1px solid #333 !important; border-radius: 12px !important; box-shadow: 0 12px 24px rgba(0,0,0,0.8) !important; font-family: 'Roboto', Arial, sans-serif !important; font-size: 14px !important; display: flex !important; flex-direction: column !important; z-index: 2147483647 !important; isolation: isolate !important; }
                input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
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
                input:checked + .slider { background-color: #3ea6ff; }
                input:checked + .slider:before { transform: translateX(18px); }
                .appearance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .control-group { display: flex; flex-direction: column; gap: 8px; }
                .styled-input, .styled-select { background: #1a1a1a; border: 1px solid #333; color: white; padding: 10px; border-radius: 6px; width: 100%; box-sizing: border-box; }
                .styled-input-small { width: 60px; padding: 5px; background: #222; border: 1px solid #444; color: white; border-radius: 4px; text-align: center; }
                .color-input-wrapper { display: flex; align-items: center; gap: 10px; background: #1a1a1a; padding: 5px; border: 1px solid #333; border-radius: 6px; }
                input[type='color'] { border: none; width: 30px; height: 30px; padding: 0; background: none; cursor: pointer; }
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
        init() { EventBus.on('configChanged', (config) => this.apply(config)); },
        apply(config) {
            let css = '';
            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important; } @media (max-width: 1200px) { ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important; } }`;
            }
            if (config.FEATURES.SHORTS_REMOVAL) {
                css += `ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-reel-shelf-renderer, ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]), ytd-guide-entry-renderer:has(a[href^="/shorts"]), ytd-guide-entry-renderer:has(a[href*="/shorts/"]), ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]), ytd-mini-guide-entry-renderer:has(a[href*="/shorts/"]), ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"] { display: none !important; }`;
            }
            if (config.FEATURES.RTX_VISUAL_MODE) {
                css += `
                    *, :before, :after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
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
        debouncedPrune: Utils.debounce(function() { if (this.enabled) this.prune(); }, 150),
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
                this.observer.observe(document.documentElement, { childList: true, subtree: true });
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
            const hide = new Set();
            document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]').forEach(n => { hide.add(n); const s = n.closest('ytd-rich-section-renderer'); if(s) hide.add(s); });
            document.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]').forEach(m => { const c = m.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-item-section-renderer'); if(c) hide.add(c); });
            document.querySelectorAll('a[href^="/shorts"], a[href*="/shorts/"], a[title="Shorts"], [aria-label="Shorts"]').forEach(l => { const e = l.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-compact-link-renderer, tp-yt-paper-item'); if(e) hide.add(e); });
            document.querySelectorAll('ytd-reel-item-renderer, ytd-rich-item-renderer:has(a[href^="/shorts/"])').forEach(i => hide.add(i));
            hide.forEach(el => this.markHidden(el));
        },
        cleanup() { this.stop(); }
    };

    // =======================================================
    // 4. SMART CPU TAMER
    // =======================================================
    const SmartCpuTamer = {
        initialized: false,
        originals: { setInterval: null, setTimeout: null, requestAnimationFrame: null, cancelAnimationFrame: null },
        state: { hidden: false, playing: false, throttlingLevel: 0 },
        handlers: { visibility: null, play: null, pause: null, ended: null },
        mainMediaElement: null, mediaStatePoller: null, rafFallbackTimers: new Map(), rafFallbackId: 0,
        gracePeriodTimer: null, GRACE_PERIOD_MS: 30000, 
        
        init() {
            if (this.initialized) return;
            this.originals.setInterval = targetWindow.setInterval;
            this.originals.setTimeout = targetWindow.setTimeout;
            this.originals.requestAnimationFrame = targetWindow.requestAnimationFrame;
            this.originals.cancelAnimationFrame = targetWindow.cancelAnimationFrame;
            this.bindEvents();
            this.overrideTimers();
            this.initialized = true;
            this.updateState();
        },

        cleanup() {
            if (!this.initialized) return;
            const applyOverride = (name, original) => {
                try {
                    if (typeof exportFunction === 'function') exportFunction(original, targetWindow, { defineAs: name });
                    else targetWindow[name] = original;
                } catch(e) {}
            };
            applyOverride('setInterval', this.originals.setInterval);
            applyOverride('setTimeout', this.originals.setTimeout);
            applyOverride('requestAnimationFrame', this.originals.requestAnimationFrame);
            applyOverride('cancelAnimationFrame', this.originals.cancelAnimationFrame);
            
            if (this.handlers.visibility) document.removeEventListener('visibilitychange', this.handlers.visibility);
            if (this.handlers.play) document.removeEventListener('play', this.handlers.play, true);
            if (this.handlers.pause) document.removeEventListener('pause', this.handlers.pause, true);
            if (this.handlers.ended) document.removeEventListener('ended', this.handlers.ended, true);
            this.handlers = { visibility: null, play: null, pause: null, ended: null };

            if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
            this.rafFallbackTimers.forEach(id => clearTimeout(id));
            this.rafFallbackTimers.clear();
            if (this.mediaStatePoller) clearInterval(this.mediaStatePoller);
            this.gracePeriodTimer = null; this.mediaStatePoller = null; this.mainMediaElement = null;
            this.initialized = false;
        },

        resolveMainMediaElement(force = false) {
            if (!force && this.mainMediaElement?.isConnected) return this.mainMediaElement;
            this.mainMediaElement = Utils.DOMCache.get('#movie_player video.html5-main-video', true) || Utils.DOMCache.get('.html5-video-player video.html5-main-video', true) || Utils.DOMCache.get('#movie_player video', true) || null;
            return this.mainMediaElement;
        },

        isMainPlayerMediaEventTarget(target) {
            if (!(target instanceof HTMLMediaElement) || !target.isConnected) return false;
            return target === this.resolveMainMediaElement();
        },

        refreshPlayingFromMainMedia() {
            const media = this.resolveMainMediaElement(true);
            this.state.playing = !!(media && !media.paused && !media.ended && media.readyState > 2);
        },

        bindEvents() {
            this.handlers.visibility = () => {
                if (document.visibilityState === 'hidden') {
                    this.state.hidden = true;
                    if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
                    this.gracePeriodTimer = setTimeout(() => { this.gracePeriodTimer = null; this.updateState(true); }, this.GRACE_PERIOD_MS);
                } else {
                    this.state.hidden = false;
                    if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
                    this.gracePeriodTimer = null;
                    this.updateState();
                }
            };
            document.addEventListener('visibilitychange', this.handlers.visibility);
            this.handlers.play = (e) => { if (this.isMainPlayerMediaEventTarget(e.target)) { this.state.playing = true; this.updateState(); } };
            this.handlers.pause = (e) => { if (this.isMainPlayerMediaEventTarget(e.target)) { this.state.playing = false; this.updateState(); } };
            this.handlers.ended = (e) => { if (this.isMainPlayerMediaEventTarget(e.target)) { this.state.playing = false; this.updateState(); } };
            document.addEventListener('play', this.handlers.play, true);
            document.addEventListener('pause', this.handlers.pause, true);
            document.addEventListener('ended', this.handlers.ended, true);

            this.mediaStatePoller = setInterval(() => {
                const was = this.state.playing;
                this.refreshPlayingFromMainMedia();
                if (was !== this.state.playing) this.updateState();
            }, 1500);

            this.state.hidden = document.visibilityState === 'hidden';
            this.refreshPlayingFromMainMedia();
        },

        updateState(forceOptimization = false) {
            this.refreshPlayingFromMainMedia();
            const graceActive = this.state.hidden && !forceOptimization && this.gracePeriodTimer;
            if (!this.state.hidden || graceActive) this.state.throttlingLevel = 0; 
            else if (this.state.playing) this.state.throttlingLevel = 1; 
            else this.state.throttlingLevel = 2; 
        },

        overrideTimers() {
            const self = this;
            const norm = (d) => Number.isFinite(Number(d)) ? Number(d) : 0;
            const applyOverride = (name, customFunc) => {
                try {
                    if (typeof exportFunction === 'function') exportFunction(customFunc, targetWindow, { defineAs: name });
                    else targetWindow[name] = customFunc;
                } catch (e) {}
            };

            applyOverride('setInterval', function(callback, delay, ...args) {
                let d = norm(delay);
                if (self.state.throttlingLevel === 2) d = Math.max(d, 5000); 
                else if (self.state.throttlingLevel === 1) d = Math.max(d, 1000); 
                return self.originals.setInterval.apply(targetWindow, [callback, d, ...args]);
            });

            applyOverride('setTimeout', function(callback, delay, ...args) {
                let d = norm(delay);
                if (self.state.throttlingLevel === 2) d = Math.max(d, 2000);
                else if (self.state.throttlingLevel === 1) d = Math.max(d, 250); 
                return self.originals.setTimeout.apply(targetWindow, [callback, d, ...args]);
            });

            applyOverride('requestAnimationFrame', function(callback) {
                if (self.state.throttlingLevel > 0) {
                    const id = ++self.rafFallbackId;
                    const d = self.state.throttlingLevel === 1 ? 33 : 1000;
                    const tid = self.originals.setTimeout.call(targetWindow, () => {
                        self.rafFallbackTimers.delete(id);
                        callback(performance.now());
                    }, d); 
                    self.rafFallbackTimers.set(id, tid);
                    return id;
                }
                return self.originals.requestAnimationFrame.call(targetWindow, callback);
            });

            applyOverride('cancelAnimationFrame', function(id) {
                if (self.rafFallbackTimers.has(id)) {
                    clearTimeout(self.rafFallbackTimers.get(id));
                    return self.rafFallbackTimers.delete(id);
                }
                if (typeof self.originals.cancelAnimationFrame === 'function') return self.originals.cancelAnimationFrame.call(targetWindow, id);
                return clearTimeout(id);
            });
        }
    };

    // =======================================================
    // 5. CLOCK MANAGER
    // =======================================================
    const ClockManager = {
        clockElement: null, interval: null, timeInterval: null, config: null, observer: null, playerElement: null, fullscreenHandler: null, navigationHandler: null,
        init(config) {
            this.config = config; this.resolvePlayerElement(true); this.createClock();
            EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            this.fullscreenHandler = () => this.handleFullscreen();
            this.navigationHandler = () => { this.resolvePlayerElement(true); this.handleFullscreen(); };
            document.addEventListener('fullscreenchange', this.fullscreenHandler);
            document.addEventListener('yt-navigate-finish', this.navigationHandler);
            this.interval = setInterval(() => this.handleFullscreen(), 2000);
        },
        resolvePlayerElement(force = false) {
            const current = this.playerElement;
            if (!force && current?.isConnected) return current;
            const player = Utils.DOMCache.get('#movie_player', true) || Utils.DOMCache.get('.html5-video-player', true);
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
            clock.style.cssText = `position: fixed !important; pointer-events: none !important; z-index: 2147483647 !important; font-family: "Roboto", sans-serif !important; font-weight: 400 !important; padding: 6px 14px !important; text-shadow: 0 1px 3px rgba(0,0,0,0.8) !important; display: none; box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important; transition: bottom 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s !important;`;
            document.documentElement.appendChild(clock);
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
                if (this.clockElement) this.clockElement.style.display = 'none';
                return;
            }
            if (!this.playerElement?.isConnected) this.resolvePlayerElement(true);
            if (document.fullscreenElement) {
                if (!this.clockElement) this.createClock();
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
            this.observer = null; this.playerElement = null; this.fullscreenHandler = null; this.navigationHandler = null;
        }
    };

    // =======================================================
    // 6. TABVIEW MANAGER (Extração otimizada)
    // =======================================================
    const TabviewManager = {
        initialized: false,
        init(config) {
            if (config.FEATURES.TABVIEW_LAYOUT && !this.initialized) {
                this.injectTabview();
                this.initialized = true;
            }
        },
        injectTabview() {
            log('Iniciando Layout em Abas (Tabview) com suporte PT e EN...');
            const VAL_ROUNDED_A1 = 12;
            const css = `@keyframes relatedElementProvided{0%{background-position-x:3px}to{background-position-x:4px}}html[tabview-loaded=icp] #related.ytd-watch-flexy{animation:relatedElementProvided 1ms linear 0s 1 normal forwards}html[tabview-loaded=icp] #right-tabs #related.ytd-watch-flexy,html[tabview-loaded=icp] #right-tabs ytd-expander#expander,html[tabview-loaded=icp] [hidden] #related.ytd-watch-flexy,html[tabview-loaded=icp] [hidden] ytd-expander#expander,html[tabview-loaded=icp] ytd-comments ytd-expander#expander{animation:initial}#secondary.ytd-watch-flexy{position:relative}#secondary-inner.style-scope.ytd-watch-flexy{height:100%}ytd-watch-flexy #secondary{--tyt-secondary-mt:var(--ytd-margin-6x);--tyt-secondary-mb:var(--ytd-margin-6x);--tyt-secondary-mr:var(--ytd-margin-6x)}ytd-watch-flexy[reduced-top-margin] #secondary{--tyt-secondary-mt:var(--ytd-margin-3x);--tyt-secondary-mb:var(--ytd-margin-3x)}secondary-wrapper{border:0;box-sizing:border-box;contain:size style;flex-wrap:nowrap;height:100%;left:0;max-height:calc(100vh - var(--ytd-toolbar-height, 56px));padding:0;padding-bottom:var(--tyt-secondary-mb);padding-right:var(--tyt-secondary-mr);padding-top:var(--tyt-secondary-mt);position:absolute;right:0;top:0}#right-tabs,secondary-wrapper{display:flex;flex-direction:column;margin:0}#right-tabs{flex-grow:1;padding:0;position:relative}[tyt-tab=""] #right-tabs{flex-grow:0}[tyt-tab=""] #right-tabs .tab-content{border:0}#right-tabs .tab-content{flex-grow:1}ytd-watch-flexy[hide-default-text-inline-expander] #primary.style-scope.ytd-watch-flexy ytd-text-inline-expander{display:none}ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden{--comment-pre-load-sizing:90px;border:0;contain:strict;display:block!important;height:var(--comment-pre-load-sizing)!important;left:2px;margin:0;overflow:hidden;padding:0;pointer-events:none!important;position:fixed!important;top:2px;visibility:collapse;width:var(--comment-pre-load-sizing)!important;z-index:-1}ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden ytd-comments#comments>ytd-item-section-renderer#sections{border:0;contain:strict;display:block!important;height:var(--comment-pre-load-sizing);margin:0;overflow:hidden;padding:0;width:var(--comment-pre-load-sizing)}ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden ytd-comments#comments>ytd-item-section-renderer#sections>#contents{border:0;contain:strict;display:flex!important;flex-direction:row;gap:60px;height:var(--comment-pre-load-sizing);margin:0;overflow:hidden;padding:0;width:var(--comment-pre-load-sizing)}ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden ytd-comments#comments #contents{--comment-pre-load-display:none}ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden ytd-comments#comments #contents>:last-child,ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden ytd-comments#comments #contents>:only-of-type{--comment-pre-load-display:block}ytd-watch-flexy:not([keep-comments-scroller]) #tab-comments.tab-content-hidden ytd-comments#comments #contents>*{display:var(--comment-pre-load-display)!important}#right-tabs #material-tabs{border:1px solid var(--ytd-searchbox-legacy-border-color);display:flex;overflow:hidden;padding:0;position:relative}[tyt-tab] #right-tabs #material-tabs{border-radius:var(--tyt-rounded-a1) var(--tyt-rounded-a1) var(--tyt-rounded-a1) var(--tyt-rounded-a1)}[tyt-tab^="#"] #right-tabs #material-tabs{border-radius:var(--tyt-rounded-a1) var(--tyt-rounded-a1) 0 0}ytd-watch-flexy:not([is-two-columns_]) #right-tabs #material-tabs{outline:0}#right-tabs #material-tabs a.tab-btn[tyt-tab-content]>*{pointer-events:none}#right-tabs #material-tabs a.tab-btn[tyt-tab-content]>.font-size-right{display:none;pointer-events:auto}ytd-watch-flexy #right-tabs .tab-content{border:1px solid var(--ytd-searchbox-legacy-border-color);border-radius:0 0 var(--tyt-rounded-a1) var(--tyt-rounded-a1);border-top:0;box-sizing:border-box;display:block;display:flex;flex-direction:row;overflow:hidden;padding:0;position:relative;top:0}ytd-watch-flexy:not([is-two-columns_]) #right-tabs .tab-content{height:100%}ytd-watch-flexy #right-tabs .tab-content-cld{--tab-content-padding:var(--ytd-margin-4x);box-sizing:border-box;contain:layout paint;display:block;overflow:auto;padding:var(--tab-content-padding);position:relative;width:100%}#right-tabs,.tab-content,.tab-content-cld{animation:none;transition:none}#right-tabs #emojis.ytd-commentbox{inset:auto 0 auto 0;width:auto}ytd-watch-flexy[is-two-columns_] #right-tabs .tab-content-cld{contain:size style;height:100%;position:absolute;width:100%}ytd-watch-flexy #right-tabs .tab-content-cld.tab-content-hidden{contain:size layout paint style;display:none;width:100%}@supports (color:var(--tabview-tab-btn-define )){ytd-watch-flexy #right-tabs .tab-btn{background:var(--yt-spec-general-background-a)}html{--tyt-tab-btn-flex-grow:1;--tyt-tab-btn-flex-basis:0%;--tyt-tab-bar-color-1-def:#ff4533;--tyt-tab-bar-color-2-def:var(--yt-brand-light-red);--tyt-tab-bar-color-1:var(--main-color,var(--tyt-tab-bar-color-1-def));--tyt-tab-bar-color-2:var(--main-color,var(--tyt-tab-bar-color-2-def))}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content]{--tyt-tab-btn-color:var(--yt-spec-text-secondary);background-color:var(--ytd-searchbox-legacy-button-color);border:0;border-bottom:4px solid transparent;color:var(--tyt-tab-btn-color);cursor:pointer;display:inline-block;flex-basis:0%;flex-basis:var(--tyt-tab-btn-flex-basis);flex-grow:1;flex-grow:var(--tyt-tab-btn-flex-grow);flex-shrink:1;font-size:12px;font-weight:500;line-height:18px;overflow:hidden;padding:14px 8px 10px;position:relative;text-align:center;text-decoration:none;text-overflow:clip;text-transform:uppercase;text-transform:var(--yt-button-text-transform,inherit);transition:border .2s linear .1s;white-space:nowrap}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content]>svg{fill:var(--iron-icon-fill-color,currentcolor);stroke:var(--iron-icon-stroke-color,none);color:var(--yt-button-color,inherit);height:18px;margin-right:0;opacity:.5;padding-right:0;vertical-align:bottom}ytd-watch-flexy #right-tabs .tab-btn{--tabview-btn-txt-ml:8px}ytd-watch-flexy[tyt-comment-disabled] #right-tabs .tab-btn[tyt-tab-content="#tab-comments"]{--tabview-btn-txt-ml:0px}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content]>svg+span{margin-left:var(--tabview-btn-txt-ml)}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content] svg{pointer-events:none}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content].active{--tyt-tab-btn-color:var(--yt-spec-text-primary);background-color:var(--ytd-searchbox-legacy-button-focus-color);border-bottom-color:var(--tyt-tab-bar-color-1);border-bottom:2px solid var(--tyt-tab-bar-color-2);font-weight:500;outline:0}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content].active svg{opacity:.9}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content]:not(.active):hover{--tyt-tab-btn-color:var(--yt-spec-text-primary);background-color:var(--ytd-searchbox-legacy-button-hover-color)}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content]:not(.active):hover svg{opacity:.9}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content]{user-select:none!important}ytd-watch-flexy #right-tabs .tab-btn[tyt-tab-content].tab-btn-hidden{display:none}ytd-watch-flexy[tyt-comment-disabled] #right-tabs .tab-btn[tyt-tab-content="#tab-comments"],ytd-watch-flexy[tyt-comment-disabled] #right-tabs .tab-btn[tyt-tab-content="#tab-comments"]:hover{--tyt-tab-btn-color:var(--yt-spec-text-disabled)}ytd-watch-flexy[tyt-comment-disabled] #right-tabs .tab-btn[tyt-tab-content="#tab-comments"] span#tyt-cm-count:empty{display:none}ytd-watch-flexy #right-tabs .tab-btn span#tyt-cm-count:empty:after{color:currentColor;display:inline-block;font-size:inherit;text-align:left;transform:scaleX(.8);width:4em}}@supports (color:var(--tyt-cm-count-define )){ytd-watch-flexy{--tyt-x-loading-content-letter-spacing:2px}html{--tabview-text-loading:"Loading";--tabview-text-fetching:"Fetching";--tabview-panel-loading:var(--tabview-text-loading)}ytd-watch-flexy #right-tabs .tab-btn span#tyt-cm-count:empty:after{content:var(--tabview-text-loading);letter-spacing:var(--tyt-x-loading-content-letter-spacing)}}@supports (color:var(--tabview-font-size-btn-define )){.font-size-right{align-content:space-evenly;bottom:0;display:inline-flex;flex-direction:column;justify-content:space-evenly;padding:4px 0;pointer-events:none;position:absolute;right:0;top:0;width:16px}html body ytd-watch-flexy.style-scope .font-size-btn{user-select:none!important}.font-size-btn{--tyt-font-size-btn-display:none;background-color:var(--yt-spec-badge-chip-background);box-sizing:border-box;color:var(--yt-spec-text-secondary);cursor:pointer;display:var(--tyt-font-size-btn-display,none);font-family:Menlo,Lucida Console,Monaco,Consolas,monospace;font-weight:900;height:12px;line-height:100%;margin:0;padding:0;pointer-events:all;position:relative;transform-origin:left top;transition:background-color 90ms linear,color 90ms linear;width:12px}.font-size-btn:hover{background-color:var(--yt-spec-text-primary);color:var(--yt-spec-general-background-a)}@supports (zoom:0.5){.tab-btn .font-size-btn{--tyt-font-size-btn-display:none}.tab-btn.active:hover .font-size-btn{--tyt-font-size-btn-display:inline-block}}}body ytd-watch-flexy:not([is-two-columns_]) #columns.ytd-watch-flexy{flex-direction:column}body ytd-watch-flexy:not([is-two-columns_]) #secondary.ytd-watch-flexy{box-sizing:border-box;display:block;width:100%}body ytd-watch-flexy:not([is-two-columns_]) #secondary.ytd-watch-flexy secondary-wrapper{contain:content;height:auto;padding-left:var(--ytd-margin-6x)}body ytd-watch-flexy:not([is-two-columns_]) #secondary.ytd-watch-flexy secondary-wrapper #right-tabs{overflow:auto}[tyt-chat="+"]{--tyt-chat-grow:1}[tyt-chat="+"] secondary-wrapper>[tyt-chat-container]{display:flex;flex-direction:column;flex-grow:var(--tyt-chat-grow);flex-shrink:0}[tyt-chat="+"] secondary-wrapper>[tyt-chat-container]>#chat{flex-grow:var(--tyt-chat-grow)}ytd-watch-flexy[is-two-columns_]:not([theater]) #columns.style-scope.ytd-watch-flexy{min-height:calc(100vh - var(--ytd-toolbar-height, 56px))}ytd-watch-flexy[is-two-columns_]:not([full-bleed-player]) ytd-live-chat-frame#chat{height:auto!important;min-height:auto!important}ytd-watch-flexy[tyt-tab^="#"]:not([is-two-columns_]):not([tyt-chat="+"]) #right-tabs{min-height:var(--ytd-watch-flexy-chat-max-height)}body ytd-watch-flexy:not([is-two-columns_]) #chat.ytd-watch-flexy{margin-top:0}body ytd-watch-flexy:not([is-two-columns_]) ytd-watch-metadata.ytd-watch-flexy{margin-bottom:0}ytd-watch-metadata.ytd-watch-flexy ytd-metadata-row-container-renderer{display:none}#tab-info [show-expand-button] #expand-sizer.ytd-text-inline-expander{visibility:initial}#tab-info #collapse.button.ytd-text-inline-expander{display:none}#tab-info #social-links.style-scope.ytd-video-description-infocards-section-renderer>#left-arrow-container.ytd-video-description-infocards-section-renderer>#left-arrow,#tab-info #social-links.style-scope.ytd-video-description-infocards-section-renderer>#right-arrow-container.ytd-video-description-infocards-section-renderer>#right-arrow{border:6px solid transparent;opacity:.65}#tab-info #social-links.style-scope.ytd-video-description-infocards-section-renderer>#left-arrow-container.ytd-video-description-infocards-section-renderer>#left-arrow:hover,#tab-info #social-links.style-scope.ytd-video-description-infocards-section-renderer>#right-arrow-container.ytd-video-description-infocards-section-renderer>#right-arrow:hover{opacity:1}#tab-info #social-links.style-scope.ytd-video-description-infocards-section-renderer>div#left-arrow-container:before{background:transparent;content:"";display:block;height:40px;left:-20px;position:absolute;top:0;width:40px;z-index:-1}#tab-info #social-links.style-scope.ytd-video-description-infocards-section-renderer>div#right-arrow-container:before{background:transparent;content:"";display:block;height:40px;position:absolute;right:-20px;top:0;width:40px;z-index:-1}body ytd-watch-flexy[is-two-columns_][tyt-egm-panel_] #columns.style-scope.ytd-watch-flexy #panels.style-scope.ytd-watch-flexy{display:flex;flex-direction:column;flex-grow:1;flex-shrink:0}body ytd-watch-flexy[is-two-columns_][tyt-egm-panel_] #columns.style-scope.ytd-watch-flexy #panels.style-scope.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[target-id][visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED]{display:flex;flex-direction:column;flex-grow:1;flex-shrink:0;height:auto;max-height:none;min-height:auto}secondary-wrapper [visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED] #body.ytd-transcript-renderer:not(:empty),secondary-wrapper [visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED] #content.ytd-transcript-renderer:not(:empty),secondary-wrapper [visibility=ENGAGEMENT_PANEL_VISIBILITY_EXPANDED] ytd-transcript-renderer:not(:empty){flex-grow:1;height:auto;max-height:none;min-height:auto}secondary-wrapper #content.ytd-engagement-panel-section-list-renderer{position:relative}secondary-wrapper #content.ytd-engagement-panel-section-list-renderer>[panel-target-id]:only-child{contain:style size}secondary-wrapper #content.ytd-engagement-panel-section-list-renderer ytd-transcript-segment-list-renderer.ytd-transcript-search-panel-renderer{contain:strict;flex-grow:1}secondary-wrapper #content.ytd-engagement-panel-section-list-renderer ytd-transcript-segment-renderer.style-scope.ytd-transcript-segment-list-renderer,secondary-wrapper #content.ytd-engagement-panel-section-list-renderer ytd-transcript-segment-renderer.style-scope.ytd-transcript-segment-list-renderer>.segment{contain:layout paint style}body ytd-watch-flexy[theater] #secondary.ytd-watch-flexy{margin-top:var(--ytd-margin-3x);padding-top:0}body ytd-watch-flexy[theater] secondary-wrapper{margin-top:0;padding-top:0}body ytd-watch-flexy[theater] #chat.ytd-watch-flexy{margin-bottom:var(--ytd-margin-2x)}#tab-comments ytd-comments#comments [field-of-cm-count]{margin-top:0}#tab-info>ytd-expandable-video-description-body-renderer{margin-bottom:var(--ytd-margin-3x)}#tab-info [class]:last-child{margin-bottom:0;padding-bottom:0}#tab-info ytd-rich-metadata-row-renderer ytd-rich-metadata-renderer{max-width:none}ytd-watch-flexy[is-two-columns_] secondary-wrapper #chat.ytd-watch-flexy{margin-bottom:var(--ytd-margin-3x)}ytd-watch-flexy[tyt-tab] tp-yt-paper-tooltip{contain:content;white-space:nowrap}ytd-watch-info-text tp-yt-paper-tooltip.style-scope.ytd-watch-info-text{margin-bottom:-300px;margin-top:-96px}[hide-default-text-inline-expander] #bottom-row #description.ytd-watch-metadata{font-size:1.2rem;line-height:1.8rem}[hide-default-text-inline-expander] #bottom-row #description.ytd-watch-metadata yt-animated-rolling-number{font-size:inherit}[hide-default-text-inline-expander] #bottom-row #description.ytd-watch-metadata #info-container.style-scope.ytd-watch-info-text{align-items:center}ytd-watch-flexy[hide-default-text-inline-expander]{--tyt-bottom-watch-metadata-margin:6px}[hide-default-text-inline-expander] #bottom-row #description.ytd-watch-metadata>#description-inner.ytd-watch-metadata{margin:6px 12px}[hide-default-text-inline-expander] ytd-watch-metadata[title-headline-xs] h1.ytd-watch-metadata{font-size:1.8rem}ytd-watch-flexy[is-two-columns_][hide-default-text-inline-expander] #below.style-scope.ytd-watch-flexy ytd-merch-shelf-renderer{border:0;margin:0;padding:0}ytd-watch-flexy[is-two-columns_][hide-default-text-inline-expander] #below.style-scope.ytd-watch-flexy ytd-watch-metadata.ytd-watch-flexy{margin-bottom:6px}#tab-info yt-video-attribute-view-model .yt-video-attribute-view-model--horizontal .yt-video-attribute-view-model__link-container .yt-video-attribute-view-model__hero-section{flex-shrink:0}#tab-info yt-video-attribute-view-model .yt-video-attribute-view-model__overflow-menu{background:var(--yt-emoji-picker-category-background-color);border-radius:99px}#tab-info yt-video-attribute-view-model .yt-video-attribute-view-model--image-square.yt-video-attribute-view-model--image-large .yt-video-attribute-view-model__hero-section{max-height:128px}#tab-info yt-video-attribute-view-model .yt-video-attribute-view-model--image-large .yt-video-attribute-view-model__hero-section{max-width:128px}#tab-info ytd-reel-shelf-renderer #items.yt-horizontal-list-renderer ytd-reel-item-renderer.yt-horizontal-list-renderer{max-width:142px}ytd-watch-info-text#ytd-watch-info-text.style-scope.ytd-watch-metadata #date-text.style-scope.ytd-watch-info-text,ytd-watch-info-text#ytd-watch-info-text.style-scope.ytd-watch-metadata #view-count.style-scope.ytd-watch-info-text{align-items:center}ytd-watch-info-text:not([detailed]) #info.ytd-watch-info-text a.yt-simple-endpoint.yt-formatted-string{pointer-events:none}body ytd-app>ytd-popup-container>tp-yt-iron-dropdown>#contentWrapper>[slot=dropdown-content]{backdrop-filter:none}#tab-info [tyt-clone-refresh-count]{overflow:visible!important}#tab-info #items.ytd-horizontal-card-list-renderer yt-video-attribute-view-model.ytd-horizontal-card-list-renderer{contain:layout}#tab-info #thumbnail-container.ytd-structured-description-channel-lockup-renderer,#tab-info ytd-media-lockup-renderer[is-compact] #thumbnail-container.ytd-media-lockup-renderer{flex-shrink:0}secondary-wrapper ytd-donation-unavailable-renderer{--ytd-margin-6x:var(--ytd-margin-2x);--ytd-margin-5x:var(--ytd-margin-2x);--ytd-margin-4x:var(--ytd-margin-2x);--ytd-margin-3x:var(--ytd-margin-2x)}[tyt-no-less-btn] #less{display:none}.tyt-metadata-hover-resized #analytics-button,.tyt-metadata-hover-resized #purchase-button,.tyt-metadata-hover-resized #sponsor-button,.tyt-metadata-hover-resized #subscribe-button{display:none!important}.tyt-metadata-hover #upload-info{flex-basis:100vw;flex-shrink:0;max-width:max-content;min-width:max-content}#tab-info ytd-structured-description-playlist-lockup-renderer[collections] #playlist-thumbnail.style-scope.ytd-structured-description-playlist-lockup-renderer{max-width:100%}#tab-info ytd-structured-description-playlist-lockup-renderer[collections] #lockup-container.ytd-structured-description-playlist-lockup-renderer{padding:1px}#tab-info ytd-structured-description-playlist-lockup-renderer[collections] #thumbnail.ytd-structured-description-playlist-lockup-renderer{outline:1px solid hsla(0,0%,50%,.5)}ytd-live-chat-frame#chat[collapsed] ytd-message-renderer~#show-hide-button.ytd-live-chat-frame>ytd-toggle-button-renderer.ytd-live-chat-frame{padding:0}.tyt-info-invisible{display:none}[tyt-playlist-expanded] secondary-wrapper>ytd-playlist-panel-renderer#playlist{flex-grow:1;flex-shrink:1;max-height:unset!important;overflow:auto}[tyt-playlist-expanded] secondary-wrapper>ytd-playlist-panel-renderer#playlist>#container{max-height:unset!important}secondary-wrapper ytd-playlist-panel-renderer{--ytd-margin-6x:var(--ytd-margin-3x)}ytd-watch-flexy[theater] ytd-playlist-panel-renderer[collapsible][collapsed] .header.ytd-playlist-panel-renderer{padding:6px 8px}ytd-watch-flexy[theater] #playlist.ytd-watch-flexy{margin-bottom:var(--ytd-margin-2x)}ytd-watch-flexy[theater] #right-tabs .tab-btn[tyt-tab-content]{border-bottom:0 solid transparent;padding:8px 4px 6px}ytd-watch-flexy{--tyt-bottom-watch-metadata-margin:12px}ytd-watch-flexy[rounded-info-panel],ytd-watch-flexy[rounded-player-large]{--tyt-rounded-a1:${VAL_ROUNDED_A1}px}#bottom-row.style-scope.ytd-watch-metadata .item.ytd-watch-metadata{margin-right:var(--tyt-bottom-watch-metadata-margin,12px);margin-top:var(--tyt-bottom-watch-metadata-margin,12px)}#cinematics{contain:layout style size}body[data-ytlstm-theater-mode] #secondary-inner[class]>secondary-wrapper[class]:not(#chat-container):not(#chat){display:flex!important}body[data-ytlstm-theater-mode] secondary-wrapper{all:unset;height:100vh}body[data-ytlstm-theater-mode] #right-tabs{display:none}body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] [tyt-chat="+"]{--tyt-chat-grow:unset}body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] #chat-container.style-scope,body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] #columns.style-scope.ytd-watch-flexy,body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] #secondary-inner.style-scope.ytd-watch-flexy,body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] #secondary.style-scope.ytd-watch-flexy,body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] [tyt-chat-container].style-scope,body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] secondary-wrapper{pointer-events:none}body[data-ytlstm-theater-mode] [data-ytlstm-chat-over-video] #chat[class]{pointer-events:auto}@supports (color:var(--tyt-fix-20251124 )){#below ytd-watch-metadata .ytTextCarouselItemViewModelImageType{height:16px;width:16px}#below ytd-watch-metadata yt-text-carousel-item-view-model{column-gap:6px}#below ytd-watch-metadata ytd-watch-info-text#ytd-watch-info-text{font-size:inherit;line-height:inherit}}` + `[tyt-tab] #right-tabs #material-tabs,[tyt-tab^="#"] #right-tabs #material-tabs{border-radius:12px 12px 0 0!important}ytd-watch-flexy #right-tabs .tab-content{border-radius:0 0 12px 12px!important}ytd-watch-flexy[is-two-columns_] #right-tabs .tab-content-cld{scrollbar-color:rgba(0,0,0,.25) transparent;scrollbar-width:thin}ytd-watch-flexy[is-two-columns_] #right-tabs .tab-content-cld::-webkit-scrollbar{width:4px}ytd-watch-flexy[is-two-columns_] #right-tabs .tab-content-cld::-webkit-scrollbar-thumb{background-color:rgba(0,0,0,.25);border-radius:4px}ytd-watch-flexy[is-two-columns_] #right-tabs .tab-content-cld::-webkit-scrollbar-track{background:transparent}`;
            Utils.injectCSS(css, 'yt-enhancer-tabview-css');

            const executionScript = () => {
                if (typeof trustedTypes !== "undefined" && trustedTypes.defaultPolicy === null) {
                    let s = (s2) => s2; trustedTypes.createPolicy("default", { createHTML: s, createScriptURL: s, createScript: s });
                }
                const defaultPolicy = typeof trustedTypes !== "undefined" && trustedTypes.defaultPolicy || { createHTML: (s) => s };
                function createHTML(s) { return defaultPolicy.createHTML(s); }

                let pageLang = "en";
                const langWords = {
                    "en": { "info": "Info", "videos": "Videos", "playlist": "Playlist" },
                    "pt": { "info": "Descrição", "videos": "Vídeos", "playlist": "Lista" }
                };

                const getWord = (tag) => langWords[pageLang]?.[tag] || langWords["en"][tag] || "";
                
                const getLang = () => {
                    let htmlLang = ((document || 0).documentElement || 0).lang || "";
                    return htmlLang.startsWith("pt") ? "pt" : "en";
                };

                const getLangForPage = () => {
                    pageLang = getLang();
                };

                const svgComments = `<path d="M80 27H12A12 12 90 0 0 0 39v42a12 12 90 0 0 12 12h12v20a2 2 90 0 0 3.4 2L47 93h33a12 12 90 0 0 12-12V39a12 12 90 0 0-12-12zM20 47h26a2 2 90 1 1 0 4H20a2 2 90 1 1 0-4zm52 28H20a2 2 90 1 1 0-4h52a2 2 90 1 1 0 4zm0-12H20a2 2 90 1 1 0-4h52a2 2 90 1 1 0 4zm36-58H40a12 12 90 0 0-12 12v6h52c9 0 16 7 16 16v42h0v4l7 7a2 2 90 0 0 3-1V71h2a12 12 90 0 0 12-12V17a12 12 90 0 0-12-12z"/>`;
                const svgVideos = `<path d="M89 10c0-4-3-7-7-7H7c-4 0-7 3-7 7v70c0 4 3 7 7 7h75c4 0 7-3 7-7V10zm-62 2h13v10H27V12zm-9 66H9V68h9v10zm0-56H9V12h9v10zm22 56H27V68h13v10zm-3-25V36c0-2 2-3 4-2l12 8c2 1 2 4 0 5l-12 8c-2 1-4 0-4-2zm25 25H49V68h13v10zm0-56H49V12h13v10zm18 56h-9V68h9v10zm0-56h-9V12h9v10z"/>`;
                const svgInfo = `<path d="M30 0C13.3 0 0 13.3 0 30s13.3 30 30 30 30-13.3 30-30S46.7 0 30 0zm6.2 46.6c-1.5.5-2.6 1-3.6 1.3a10.9 10.9 0 0 1-3.3.5c-1.7 0-3.3-.5-4.3-1.4a4.68 4.68 0 0 1-1.6-3.6c0-.4.2-1 .2-1.5a20.9 20.9 90 0 1 .3-2l2-6.8c.1-.7.3-1.3.4-1.9a8.2 8.2 90 0 0 .3-1.6c0-.8-.3-1.4-.7-1.8s-1-.5-2-.5a4.53 4.53 0 0 0-1.6.3c-.5.2-1 .2-1.3.4l.6-2.1c1.2-.5 2.4-1 3.5-1.3s2.3-.6 3.3-.6c1.9 0 3.3.6 4.3 1.3s1.5 2.1 1.5 3.5c0 .3 0 .9-.1 1.6a10.4 10.4 90 0 1-.4 2.2l-1.9 6.7c-.2.5-.2 1.1-.4 1.8s-.2 1.3-.2 1.6c0 .9.2 1.6.6 1.9s1.1.5 2.1.5a6.1 6.1 90 0 0 1.5-.3 9 9 90 0 0 1.4-.4l-.6 2.2zm-3.8-35.2a1 1 0 010 8.6 1 1 0 010-8.6z"/>`;
                const svgPlayList = `<path d="M0 3h12v2H0zm0 4h12v2H0zm0 4h8v2H0zm16 0V7h-2v4h-4v2h4v4h2v-4h4v-2z"/>`;
                const svgElm = (w, h, vw, vh, p, m) => `<svg${m ? ` class=${m}` : ""} width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">${p}</svg>`;

                const getTabsHTML = () => {
                    const sTabBtnVideos = `${svgElm(16, 16, 90, 90, svgVideos)}<span>${getWord("videos")}</span>`;
                    const sTabBtnInfo = `${svgElm(16, 16, 60, 60, svgInfo)}<span>${getWord("info")}</span>`;
                    const sTabBtnPlayList = `${svgElm(16, 16, 20, 20, svgPlayList)}<span>${getWord("playlist")}</span>`;
                    let str1 = `<paper-ripple class="style-scope yt-icon-button"><div id="background" class="style-scope paper-ripple" style="opacity:0;"></div><div id="waves" class="style-scope paper-ripple"></div></paper-ripple>`;
                    const str_tabs = [
                        `<a id="tab-btn1" tyt-tab-content="#tab-info" class="tab-btn">${sTabBtnInfo}${str1}</a>`,
                        `<a id="tab-btn3" tyt-tab-content="#tab-comments" class="tab-btn">${svgElm(16, 16, 120, 120, svgComments)}<span id="tyt-cm-count"></span>${str1}</a>`,
                        `<a id="tab-btn4" tyt-tab-content="#tab-videos" class="tab-btn">${sTabBtnVideos}${str1}</a>`,
                        `<a id="tab-btn5" tyt-tab-content="#tab-list" class="tab-btn tab-btn-hidden">${sTabBtnPlayList}${str1}</a>`
                    ].join("");
                    return `<div id="right-tabs"><tabview-view-pos-thead></tabview-view-pos-thead><header><div id="material-tabs">${str_tabs}</div></header><div class="tab-content"><div id="tab-info" class="tab-content-cld tab-content-hidden" tyt-hidden></div><div id="tab-comments" class="tab-content-cld tab-content-hidden" tyt-hidden></div><div id="tab-videos" class="tab-content-cld tab-content-hidden" tyt-hidden></div><div id="tab-list" class="tab-content-cld tab-content-hidden" tyt-hidden></div></div></div>`;
                };

                let elements = { related: null, comments: null, infoExpander: null, flexy: null, playlist: null, chat: null };
                
                const observeDOM = () => {
                    setInterval(() => {
                        if(!elements.flexy) elements.flexy = document.querySelector('ytd-watch-flexy');
                        if(elements.flexy && !document.getElementById('right-tabs')) {
                            const related = document.querySelector('#related');
                            if(related && related.parentNode) {
                                getLangForPage();
                                let docTmp = document.createElement("template");
                                docTmp.innerHTML = createHTML(getTabsHTML());
                                let rightTabs = docTmp.content.firstElementChild;
                                related.parentNode.insertBefore(rightTabs, related);

                                const secondaryWrapper = document.createElement("secondary-wrapper");
                                secondaryWrapper.id = "secondary-inner-wrapper";
                                const secondaryInner = document.querySelector("#secondary-inner.style-scope.ytd-watch-flexy");
                                if(secondaryInner) {
                                    while(secondaryInner.firstChild) secondaryWrapper.appendChild(secondaryInner.firstChild);
                                    secondaryInner.appendChild(secondaryWrapper);
                                }
                                secondaryWrapper.appendChild(rightTabs);

                                rightTabs.querySelector("#material-tabs").addEventListener("click", (e) => {
                                    const a = e.target.closest('a[tyt-tab-content]');
                                    if(a) {
                                        document.querySelectorAll('#material-tabs a').forEach(btn => btn.classList.remove('active'));
                                        document.querySelectorAll('.tab-content-cld').forEach(tc => { tc.classList.add('tab-content-hidden'); tc.setAttribute('tyt-hidden', ''); });
                                        a.classList.add('active');
                                        const target = document.querySelector(a.getAttribute('tyt-tab-content'));
                                        if(target) { target.classList.remove('tab-content-hidden'); target.removeAttribute('tyt-hidden'); }
                                    }
                                });

                                document.querySelector('#tab-videos').appendChild(related);
                                const comments = document.querySelector('#comments');
                                if(comments) document.querySelector('#tab-comments').appendChild(comments);
                                const info = document.querySelector('ytd-watch-metadata');
                                if(info) document.querySelector('#tab-info').appendChild(info);
                            }
                        }
                    }, 1500);
                };
                observeDOM();
            };

            const script = document.createElement('script');
            script.textContent = '(' + executionScript.toString() + ')();';
            document.documentElement.appendChild(script);
            script.remove();
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

                SettingsLauncher.registerFallbackApi();

                try { if (config.FEATURES.CPU_TAMER) SmartCpuTamer.init(); } catch (e) {}
                try { StyleManager.init(); StyleManager.apply(config); } catch (e) {}
                try { ShortsManager.init(config); } catch (e) {}
                try { ClockManager.init(config); } catch (e) {}
                try { TabviewManager.init(config); } catch (e) {}
                
                EventBus.on('configChanged', (newConfig) => {
                    try {
                        if (newConfig.FEATURES.CPU_TAMER && !SmartCpuTamer.initialized) SmartCpuTamer.init();
                        else if (!newConfig.FEATURES.CPU_TAMER && SmartCpuTamer.initialized) SmartCpuTamer.cleanup();
                    } catch(e) {}
                });
                
                Utils.safeAddEventListener(window, 'beforeunload', () => {
                    SmartCpuTamer.cleanup(); ClockManager.cleanup(); ShortsManager.cleanup(); Utils.DOMCache.refresh();
                });

                log(`v${ConfigManager.CONFIG_VERSION} Iniciado com sucesso.`);
            } catch (error) {}
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
