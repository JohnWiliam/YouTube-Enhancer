// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      2.3.1
// @description  Reduz uso de CPU, personaliza layout, remove Shorts de forma incremental, adiciona relógio e modo RTX. (Refatorado - Alta Estabilidade)
// @author       John Wiliam & IA
// @match        *://www.youtube.com/*
// @noframes
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @updateURL    https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js
// @downloadURL  https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    /**
     * @typedef {Object} EnhancerConfig
     * @property {string} version
     * @property {string} LANGUAGE
     * @property {number} VIDEOS_PER_ROW
     * @property {Object} FEATURES
     * @property {Object} CLOCK_STYLE
     */

    const CONSTANTS = {
        SCRIPT_VERSION: '2.3.1',
        FLAG: '__yt_enhancer_initialized__',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        UI_ZINDEX: 99999,
        GRACE_PERIOD_MS: 5000, // Tempo de espera antes do throttling
        LIMITS: {
            videosPerRow: { min: 3, max: 8, def: 4 },
            fontSize: { min: 12, max: 48, def: 22 },
            margin: { min: 0, max: 120, def: 30 },
            borderRadius: { min: 0, max: 50, def: 25 },
            bgOpacity: { min: 0, max: 1, def: 0.3 }
        }
    };

    if (window[CONSTANTS.FLAG]) return;
    window[CONSTANTS.FLAG] = true;

    // Isolar o acesso ao contexto, evitamos unsafeWindow a menos que crítico.
    const targetWindow = window;

    // =======================================================
    // LOG & DEBUG
    // =======================================================
    const Logger = {
        level: 'info', // debug, info, warn, error
        log(msg, ...args) { if (['debug', 'info'].includes(this.level)) console.log(`[YT Enhancer] ${msg}`, ...args); },
        warn(msg, ...args) { if (['debug', 'info', 'warn'].includes(this.level)) console.warn(`[YT Enhancer] ⚠️ ${msg}`, ...args); },
        error(msg, ...args) { console.error(`[YT Enhancer] ❌ ${msg}`, ...args); }
    };

    // =======================================================
    // EVENT BUS SYSTEM (Aprimorado com ciclo de vida e cleanup)
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
                try { callback(data); } catch (e) { Logger.error(`EventBus emit [${event}]:`, e); }
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
        hexToRgb(hex) {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '0,0,0';
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
                    const cached = this.cache.get(selector);
                    if (cached && cached.isConnected) return cached;
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
            const safeHandler = (e) => { try { return handler(e); } catch (err) { Logger.error(`[Event] ${event}:`, err); } };
            element.addEventListener(event, safeHandler, options);
            return () => { if (element) element.removeEventListener(event, safeHandler, options); };
        },
        injectCSS(css, id) {
            try {
                const old = document.getElementById(id);
                if (old) old.remove();

                const styleEl = document.createElement('style');
                styleEl.id = id;
                styleEl.textContent = css;
                (document.head || document.documentElement).appendChild(styleEl);

                return Boolean(styleEl.isConnected);
            } catch (error) {
                Logger.error('Erro ao injetar CSS manual:', error);
                return false;
            }
        }
    };

    // =======================================================
    // 1. I18N + CONFIG MANAGER
    // =======================================================
    const I18N = {
        pt: {
            modal: { title: '⚙️ Configurações', closeTitle: 'Fechar', tabs: { features: '🔧 Funcionalidades', appearance: '🎨 Relógio' }, features: { cpuTamer: { title: 'Redução Inteligente de CPU', description: 'Otimiza abas inativas' }, layout: { title: 'Layout Grid', description: 'Ajusta vídeos por linha' }, videosPerRow: 'Vídeos', videosPerRowHint: 'Quantidade por linha', shorts: { title: 'Remover Shorts', description: 'Oculta curtas da interface' }, clock: { title: 'Relógio Flutuante', description: 'Visível em Tela Cheia' }, rtx: { title: 'Modo RTX', description: 'Oculta blur de menus nativos' }, language: { title: 'Idioma', description: 'Interface' } }, clockStyle: { textColor: 'Cor', backgroundColor: 'Fundo', backgroundOpacity: 'Opacidade', fontSize: 'Tamanho (px)', margin: 'Margem (px)', borderRadius: 'Raio (px)' }, buttons: { apply: 'Aplicar', applyAndReload: 'Aplicar e Recarregar' }, reloadNotice: 'Aviso: Alterações podem exigir reload.' },
            menu: { openSettings: '⚙️ Configurações (Enhancer)' }
        },
        en: {
            modal: { title: '⚙️ Settings', closeTitle: 'Close', tabs: { features: '🔧 Features', appearance: '🎨 Clock' }, features: { cpuTamer: { title: 'Smart CPU Reduction', description: 'Optimizes inactive tabs' }, layout: { title: 'Grid Layout', description: 'Adjusts videos per row' }, videosPerRow: 'Videos', videosPerRowHint: 'Amount per row', shorts: { title: 'Remove Shorts', description: 'Hides shorts from UI' }, clock: { title: 'Floating Clock', description: 'Visible in Fullscreen' }, rtx: { title: 'RTX Mode', description: 'Hides native menu blurs' }, language: { title: 'Language', description: 'Interface' } }, clockStyle: { textColor: 'Color', backgroundColor: 'Background', backgroundOpacity: 'Opacity', fontSize: 'Size (px)', margin: 'Margin (px)', borderRadius: 'Radius (px)' }, buttons: { apply: 'Apply', applyAndReload: 'Apply & Reload' }, reloadNotice: 'Notice: Changes might require reload.' },
            menu: { openSettings: '⚙️ Settings (Enhancer)' }
        }
    };

    const t = (key, configLang = 'en') => {
        const resolvedLang = (configLang).toLowerCase();
        const segments = key.split('.');
        const getValue = (dictionary) => segments.reduce((acc, segment) => acc?.[segment], dictionary);
        return getValue(I18N[resolvedLang]) ?? getValue(I18N.en) ?? key;
    };

    const ConfigManager = {
        defaults: {
            version: CONSTANTS.SCRIPT_VERSION, LANGUAGE: 'pt', VIDEOS_PER_ROW: CONSTANTS.LIMITS.videosPerRow.def,
            FEATURES: { CPU_TAMER: true, LAYOUT_ENHANCEMENT: true, SHORTS_REMOVAL: true, FULLSCREEN_CLOCK: true, RTX_VISUAL_MODE: true },
            CLOCK_STYLE: { color: '#ffffff', bgColor: '#191919', bgOpacity: CONSTANTS.LIMITS.bgOpacity.def, fontSize: CONSTANTS.LIMITS.fontSize.def, margin: CONSTANTS.LIMITS.margin.def, borderRadius: CONSTANTS.LIMITS.borderRadius.def, position: 'bottom-right' }
        },
        sanitizeConfig(config) {
            const lim = CONSTANTS.LIMITS;
            const safe = { ...this.defaults, ...(config || {}), FEATURES: { ...this.defaults.FEATURES, ...(config?.FEATURES || {}) }, CLOCK_STYLE: { ...this.defaults.CLOCK_STYLE, ...(config?.CLOCK_STYLE || {}) } };
            safe.LANGUAGE = ['pt', 'en'].includes(safe.LANGUAGE) ? safe.LANGUAGE : this.defaults.LANGUAGE;
            safe.VIDEOS_PER_ROW = Utils.clamp(safe.VIDEOS_PER_ROW, lim.videosPerRow.min, lim.videosPerRow.max, lim.videosPerRow.def);
            safe.CLOCK_STYLE.bgOpacity = Utils.clamp(safe.CLOCK_STYLE.bgOpacity, lim.bgOpacity.min, lim.bgOpacity.max, lim.bgOpacity.def);
            safe.CLOCK_STYLE.fontSize = Utils.clamp(safe.CLOCK_STYLE.fontSize, lim.fontSize.min, lim.fontSize.max, lim.fontSize.def);
            safe.CLOCK_STYLE.margin = Utils.clamp(safe.CLOCK_STYLE.margin, lim.margin.min, lim.margin.max, lim.margin.def);
            safe.CLOCK_STYLE.borderRadius = Utils.clamp(safe.CLOCK_STYLE.borderRadius, lim.borderRadius.min, lim.borderRadius.max, lim.borderRadius.def);
            safe.CLOCK_STYLE.color = Utils.isHexColor(safe.CLOCK_STYLE.color) ? safe.CLOCK_STYLE.color : this.defaults.CLOCK_STYLE.color;
            safe.CLOCK_STYLE.bgColor = Utils.isHexColor(safe.CLOCK_STYLE.bgColor) ? safe.CLOCK_STYLE.bgColor : this.defaults.CLOCK_STYLE.bgColor;
            return safe;
        },
        migrate(saved) {
            if (!saved || typeof saved !== 'object') return this.defaults;
            return this.sanitizeConfig(saved);
        },
        load() {
            try { return this.migrate(GM_getValue(CONSTANTS.STORAGE_KEY)); } catch (e) { return this.defaults; }
        },
        save(config) {
            try {
                const sanitized = this.sanitizeConfig(config);
                sanitized.version = CONSTANTS.SCRIPT_VERSION;
                GM_setValue(CONSTANTS.STORAGE_KEY, sanitized);
                EventBus.emit('configChanged', sanitized);
                return true;
            } catch (e) { return false; }
        }
    };

    // =======================================================
    // GM API WRAPPER / MENU COMMAND
    // =======================================================
    const SettingsLauncher = {
        menuRegistered: false,
        opening: false,
        open(source = 'unknown') {
            if (this.opening) return;
            this.opening = true;
            Promise.resolve(UIManager.openSettings((newConfig) => ConfigManager.save(newConfig)))
                .finally(() => this.opening = false);
        },
        registerMenuCommand() {
            if (typeof GM_registerMenuCommand !== 'function') return;
            const lang = ConfigManager.load().LANGUAGE;
            try { GM_registerMenuCommand(t('menu.openSettings', lang), () => this.open('menu'), { id: 'yt-enhancer-cmd', autoClose: true }); } catch (e) {}
        }
    };

    // =======================================================
    // 2. UI MANAGER (Modal Acessível e Isolado)
    // =======================================================
    const UIManager = {
        cleanupFunctions: [], styleId: 'yt-enhancer-modal-style',
        ensureRootReady() {
            return new Promise((resolve) => {
                if (document.body) return resolve(true);
                const observer = new MutationObserver(() => {
                    if (document.body) { observer.disconnect(); resolve(true); }
                });
                observer.observe(document.documentElement, { childList: true });
                setTimeout(() => { observer.disconnect(); resolve(false); }, 3000);
            });
        },
        async openSettings(onSave) {
            const config = ConfigManager.load();
            if (!(await this.ensureRootReady())) return false;

            this.ensureStyles();
            this.cleanupFunctions.forEach(fn => fn());
            this.cleanupFunctions = [];
            document.getElementById('yt-enhancer-settings-modal')?.remove();
            document.getElementById('yt-enhancer-overlay')?.remove();

            const create = (tag, opts = {}) => {
                const el = document.createElement(tag);
                if (opts.id) el.id = opts.id;
                if (opts.className) el.className = opts.className;
                if (opts.text) el.textContent = opts.text;
                if (opts.type) el.type = opts.type;
                if (opts.value !== undefined) el.value = opts.value;
                if (opts.checked !== undefined) el.checked = !!opts.checked;
                if (opts.forId) el.htmlFor = opts.forId;
                if (opts.aria) Object.entries(opts.aria).forEach(([k, v]) => el.setAttribute(`aria-${k}`, v));
                if (opts.title) el.title = opts.title;
                Object.assign(el.dataset, opts.dataset || {});
                return el;
            };

            const overlay = create('div', { id: 'yt-enhancer-overlay' });
            
            const modal = create('div', { 
                id: 'yt-enhancer-settings-modal', 
                className: 'yt-enhancer-modal',
                aria: { modal: 'true', labelledby: 'yt-enhancer-title' }
            });
            modal.setAttribute('role', 'dialog');
            modal.tabIndex = -1;

            const modalHeader = create('div', { className: 'yt-enhancer-modal-header' });
            modalHeader.append(
                create('h2', { id: 'yt-enhancer-title', text: t('modal.title', config.LANGUAGE) }),
                create('button', { id: 'yt-enhancer-close', className: 'yt-enhancer-close-btn', text: '×', title: t('modal.closeTitle', config.LANGUAGE), aria: { label: t('modal.closeTitle', config.LANGUAGE) } })
            );

            const tabsNav = create('div', { className: 'yt-enhancer-tabs' });
            const tabFeat = create('button', { className: 'yt-enhancer-tab active', text: t('modal.tabs.features', config.LANGUAGE), dataset: { target: 'tab-features' } });
            const tabApp = create('button', { className: 'yt-enhancer-tab', text: t('modal.tabs.appearance', config.LANGUAGE), dataset: { target: 'tab-appearance' } });
            tabsNav.append(tabFeat, tabApp);

            const content = create('div', { className: 'yt-enhancer-content' });
            
            // Pane 1: Features
            const paneFeat = create('div', { id: 'tab-features', className: 'yt-enhancer-pane active' });
            const createToggle = (id, title, desc, checked) => {
                const lbl = create('label', { className: 'yt-enhancer-toggle' });
                const txt = create('div', { className: 'yt-enhancer-toggle-text' });
                txt.append(create('strong', { text: title }), create('span', { text: desc }));
                const sw = create('div', { className: 'yt-enhancer-switch' });
                sw.append(create('input', { id, type: 'checkbox', checked }), create('span', { className: 'yt-enhancer-slider' }));
                lbl.append(txt, sw);
                return lbl;
            };

            const lim = CONSTANTS.LIMITS;
            paneFeat.append(
                createToggle('cfg-cpu-tamer', t('modal.features.cpuTamer.title', config.LANGUAGE), t('modal.features.cpuTamer.description', config.LANGUAGE), config.FEATURES.CPU_TAMER),
                createToggle('cfg-layout', t('modal.features.layout.title', config.LANGUAGE), t('modal.features.layout.description', config.LANGUAGE), config.FEATURES.LAYOUT_ENHANCEMENT)
            );

            const laySet = create('label', { className: 'yt-enhancer-toggle', forId: 'cfg-videos-row' });
            laySet.style.display = config.FEATURES.LAYOUT_ENHANCEMENT ? 'flex' : 'none';
            const layTxt = create('div', { className: 'yt-enhancer-toggle-text' });
            layTxt.append(create('strong', { text: t('modal.features.videosPerRow', config.LANGUAGE) }), create('span', { text: t('modal.features.videosPerRowHint', config.LANGUAGE) }));
            const layInp = create('input', { id: 'cfg-videos-row', type: 'number', className: 'yt-enhancer-input-small', value: config.VIDEOS_PER_ROW });
            layInp.min = lim.videosPerRow.min; layInp.max = lim.videosPerRow.max;
            laySet.append(layTxt, layInp);
            paneFeat.append(laySet);

            paneFeat.append(
                createToggle('cfg-shorts', t('modal.features.shorts.title', config.LANGUAGE), t('modal.features.shorts.description', config.LANGUAGE), config.FEATURES.SHORTS_REMOVAL),
                createToggle('cfg-clock', t('modal.features.clock.title', config.LANGUAGE), t('modal.features.clock.description', config.LANGUAGE), config.FEATURES.FULLSCREEN_CLOCK),
                createToggle('cfg-rtx', t('modal.features.rtx.title', config.LANGUAGE), t('modal.features.rtx.description', config.LANGUAGE), config.FEATURES.RTX_VISUAL_MODE)
            );

            const langSet = create('label', { className: 'yt-enhancer-toggle', forId: 'cfg-lang' });
            const langTxt = create('div', { className: 'yt-enhancer-toggle-text' });
            langTxt.append(create('strong', { text: t('modal.features.language.title', config.LANGUAGE) }), create('span', { text: t('modal.features.language.description', config.LANGUAGE) }));
            const langSel = create('select', { id: 'cfg-lang', className: 'yt-enhancer-select' });
            [{ v: 'en', l: 'English' }, { v: 'pt', l: 'Português' }].forEach(opt => {
                const option = create('option', { value: opt.v, text: opt.l });
                if (config.LANGUAGE === opt.v) option.selected = true;
                langSel.appendChild(option);
            });
            langSet.append(langTxt, langSel);
            paneFeat.append(langSet);

            // Pane 2: Appearance
            const paneApp = create('div', { id: 'tab-appearance', className: 'yt-enhancer-pane' });
            const appGrid = create('div', { className: 'yt-enhancer-grid' });
            const createCtrl = (id, lbl, inp, valSpan = false) => {
                const g = create('div', { className: 'yt-enhancer-ctrl-group' });
                g.append(create('label', { text: lbl }));
                if (valSpan) {
                    const w = create('div', { className: 'yt-enhancer-color-wrap' });
                    w.append(inp, create('span', { className: 'yt-enhancer-color-val', text: inp.value }));
                    g.append(w);
                } else g.append(inp);
                return g;
            };

            const inpCol = create('input', { id: 'sty-col', type: 'color', value: config.CLOCK_STYLE.color });
            const inpBg = create('input', { id: 'sty-bg', type: 'color', value: config.CLOCK_STYLE.bgColor });
            const inpOpa = create('input', { id: 'sty-opa', type: 'number', className: 'yt-enhancer-input', value: config.CLOCK_STYLE.bgOpacity }); inpOpa.min=lim.bgOpacity.min; inpOpa.max=lim.bgOpacity.max; inpOpa.step=0.1;
            const inpFz = create('input', { id: 'sty-fz', type: 'number', className: 'yt-enhancer-input', value: config.CLOCK_STYLE.fontSize }); inpFz.min=lim.fontSize.min; inpFz.max=lim.fontSize.max;
            const inpMar = create('input', { id: 'sty-mar', type: 'number', className: 'yt-enhancer-input', value: config.CLOCK_STYLE.margin }); inpMar.min=lim.margin.min; inpMar.max=lim.margin.max;
            const inpRad = create('input', { id: 'sty-rad', type: 'number', className: 'yt-enhancer-input', value: config.CLOCK_STYLE.borderRadius }); inpRad.min=lim.borderRadius.min; inpRad.max=lim.borderRadius.max;

            appGrid.append(
                createCtrl('sty-col-g', t('modal.clockStyle.textColor', config.LANGUAGE), inpCol, true),
                createCtrl('sty-bg-g', t('modal.clockStyle.backgroundColor', config.LANGUAGE), inpBg, true),
                createCtrl('sty-opa-g', t('modal.clockStyle.backgroundOpacity', config.LANGUAGE), inpOpa),
                createCtrl('sty-fz-g', t('modal.clockStyle.fontSize', config.LANGUAGE), inpFz),
                createCtrl('sty-mar-g', t('modal.clockStyle.margin', config.LANGUAGE), inpMar),
                createCtrl('sty-rad-g', t('modal.clockStyle.borderRadius', config.LANGUAGE), inpRad)
            );
            paneApp.append(appGrid);
            content.append(paneFeat, paneApp);

            // Footer
            const footer = create('div', { className: 'yt-enhancer-footer' });
            const reloadNot = create('p', { className: 'yt-enhancer-reload-note', text: t('modal.reloadNotice', config.LANGUAGE) });
            reloadNot.style.display = 'none';
            const btnApply = create('button', { className: 'yt-enhancer-btn', text: t('modal.buttons.apply', config.LANGUAGE) });
            const btnReload = create('button', { className: 'yt-enhancer-btn yt-enhancer-btn-action', text: t('modal.buttons.applyAndReload', config.LANGUAGE) });
            btnReload.style.display = 'none';
            footer.append(reloadNot, btnApply, btnReload);

            modal.append(modalHeader, tabsNav, content, footer);
            document.body.append(overlay, modal);
            modal.focus(); // Acessibilidade - foco inicial

            let isClosed = false;
            const closeModal = () => { 
                if(isClosed) return; isClosed = true;
                modal.remove(); overlay.remove(); 
                this.cleanupFunctions.forEach(fn => fn());
                this.cleanupFunctions = [];
            };

            this.cleanupFunctions.push(Utils.safeAddEventListener(overlay, 'click', closeModal));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('yt-enhancer-close'), 'click', closeModal));
            this.cleanupFunctions.push(Utils.safeAddEventListener(window, 'keydown', (e) => { if (e.key === 'Escape') closeModal(); }));

            [tabFeat, tabApp].forEach((btn) => {
                this.cleanupFunctions.push(Utils.safeAddEventListener(btn, 'click', () => {
                    [tabFeat, tabApp, paneFeat, paneApp].forEach(el => el.classList.remove('active'));
                    btn.classList.add('active');
                    (btn.dataset.target === 'tab-features' ? paneFeat : paneApp).classList.add('active');
                }));
            });

            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-layout'), 'change', e => { laySet.style.display = e.target.checked ? 'flex' : 'none'; }));
            ['sty-col', 'sty-bg'].forEach(id => {
                this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById(id), 'input', e => { e.target.nextElementSibling.textContent = e.target.value; }));
            });

            const getCfg = () => ({
                LANGUAGE: langSel.value, VIDEOS_PER_ROW: parseInt(layInp.value, 10),
                FEATURES: { CPU_TAMER: document.getElementById('cfg-cpu-tamer').checked, LAYOUT_ENHANCEMENT: document.getElementById('cfg-layout').checked, SHORTS_REMOVAL: document.getElementById('cfg-shorts').checked, FULLSCREEN_CLOCK: document.getElementById('cfg-clock').checked, RTX_VISUAL_MODE: document.getElementById('cfg-rtx').checked },
                CLOCK_STYLE: { color: inpCol.value, bgColor: inpBg.value, bgOpacity: parseFloat(inpOpa.value), fontSize: parseInt(inpFz.value, 10), margin: parseInt(inpMar.value, 10), borderRadius: parseInt(inpRad.value, 10), position: 'bottom-right' }
            });

            const updateUI = () => {
                const nCfg = getCfg();
                const reqRel = nCfg.FEATURES.CPU_TAMER !== config.FEATURES.CPU_TAMER || nCfg.LANGUAGE !== config.LANGUAGE;
                btnApply.style.display = reqRel ? 'none' : 'block';
                btnReload.style.display = reqRel ? 'block' : 'none';
                reloadNot.style.display = reqRel ? 'block' : 'none';
            };

            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-cpu-tamer'), 'change', updateUI));
            this.cleanupFunctions.push(Utils.safeAddEventListener(langSel, 'change', updateUI));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnApply, 'click', () => { onSave(getCfg()); closeModal(); }));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnReload, 'click', () => { onSave(getCfg()); closeModal(); setTimeout(() => window.location.reload(), 150); }));

            return true;
        },
        ensureStyles() {
            // Escopo seguro
            const css = `
                #yt-enhancer-overlay { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.8) !important; z-index: ${CONSTANTS.UI_ZINDEX} !important; }
                .yt-enhancer-modal { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: min(420px, 90vw) !important; max-height: 85vh !important; background: #181818 !important; color: #fff !important; border-radius: 12px !important; display: flex !important; flex-direction: column !important; z-index: ${CONSTANTS.UI_ZINDEX + 1} !important; font-family: Roboto, Arial, sans-serif !important; border: 1px solid #333 !important; }
                .yt-enhancer-modal * { box-sizing: border-box !important; }
                .yt-enhancer-modal-header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
                .yt-enhancer-modal-header h2 { margin: 0; font-size: 16px; font-weight: 500; }
                .yt-enhancer-close-btn { background: none; border: none; color: #aaa; font-size: 24px; cursor: pointer; }
                .yt-enhancer-close-btn:hover { color: #fff; }
                .yt-enhancer-tabs { display: flex; background: #202020; border-bottom: 1px solid #333; }
                .yt-enhancer-tab { flex: 1; padding: 12px; border: none; background: transparent; color: #888; cursor: pointer; border-bottom: 2px solid transparent; font-weight: 500; }
                .yt-enhancer-tab.active { color: #3ea6ff; border-bottom-color: #3ea6ff; background: #181818; }
                .yt-enhancer-content { flex: 1; overflow-y: auto; padding: 20px; }
                .yt-enhancer-pane { display: none; flex-direction: column; gap: 15px; }
                .yt-enhancer-pane.active { display: flex; animation: ytEfFade 0.2s; }
                @keyframes ytEfFade { from { opacity: 0; } to { opacity: 1; } }
                .yt-enhancer-toggle { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #222; border-radius: 8px; cursor: pointer; gap: 10px; }
                .yt-enhancer-toggle-text strong { display: block; font-size: 14px; margin-bottom: 4px; }
                .yt-enhancer-toggle-text span { font-size: 12px; color: #aaa; }
                .yt-enhancer-switch { position: relative; width: 36px; height: 20px; }
                .yt-enhancer-switch input { opacity: 0; width: 0; height: 0; }
                .yt-enhancer-slider { position: absolute; inset: 0; background-color: #555; border-radius: 20px; transition: .3s; }
                .yt-enhancer-slider:before { position: absolute; content: ''; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: #fff; border-radius: 50%; transition: .3s; }
                .yt-enhancer-switch input:checked + .yt-enhancer-slider { background-color: #3ea6ff; }
                .yt-enhancer-switch input:checked + .yt-enhancer-slider:before { transform: translateX(16px); }
                .yt-enhancer-input, .yt-enhancer-select, .yt-enhancer-input-small { background: #111; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 8px; outline: none; }
                .yt-enhancer-input-small { width: 60px; text-align: center; }
                .yt-enhancer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .yt-enhancer-ctrl-group { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
                .yt-enhancer-color-wrap { display: flex; gap: 10px; align-items: center; background: #111; border: 1px solid #444; border-radius: 4px; padding: 5px; }
                .yt-enhancer-color-wrap input[type=color] { border: none; background: none; width: 24px; height: 24px; padding: 0; cursor: pointer; }
                .yt-enhancer-footer { display: flex; padding: 15px 20px; border-top: 1px solid #333; gap: 10px; align-items: center; justify-content: flex-end; }
                .yt-enhancer-reload-note { font-size: 12px; color: #f6cf6a; margin: 0; flex: 1; }
                .yt-enhancer-btn { padding: 8px 16px; border: none; border-radius: 18px; cursor: pointer; background: #333; color: #fff; font-weight: 500; }
                .yt-enhancer-btn-action, .yt-enhancer-btn { background: #3ea6ff; color: #000; }
                .yt-enhancer-btn:hover { opacity: 0.9; }
            `;
            Utils.injectCSS(css, this.styleId);
        }
    };

    // =======================================================
    // 3. STYLE MANAGER
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-styles', initialized: false,
        init() {
            if (this.initialized) return;
            EventBus.on('configChanged', (c) => this.apply(c));
            Utils.safeAddEventListener(document, 'yt-navigate-finish', () => this.apply(ConfigManager.load()));
            this.initialized = true;
        },
        apply(config) {
            let css = '';
            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important; } @media (max-width: 1200px) { ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important; } }`;
            }
            if (config.FEATURES.SHORTS_REMOVAL) {
                // Modo puro CSS como Fallback leve (JS incremental cuida do DOM agressivo)
                css += `ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-guide-entry-renderer:has(a[title="Shorts"]) { display: none !important; }`;
            }
            if (config.FEATURES.RTX_VISUAL_MODE) {
                // Substituído o '*, :before, :after' por alvos precisos do YT
                css += `
                    ytd-masthead, #guide, ytd-mini-guide-renderer, ytd-guide-renderer, tp-yt-app-drawer { background: transparent !important; background-color: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: blur(0px) !important; }
                    tp-yt-paper-dialog, ytd-multi-page-menu-renderer, tp-yt-iron-dropdown, ytd-popup-container tp-yt-paper-dialog, ytd-account-menu { background: var(--yt-spec-base-background, #0f0f0f) !important; }
                    .ytp-settings-menu, .ytp-panel, .ytp-panel-menu, .ytp-popup.ytp-contextmenu { background: rgba(15, 15, 15, 0.95) !important; text-shadow: none !important; backdrop-filter: none !important; filter: blur(0px) !important; }
                `;
            }
            Utils.injectCSS(css, this.styleId);
        }
    };

    // =======================================================
    // 4. SHORTS MANAGER (Seguro e Incremental)
    // =======================================================
    const ShortsManager = {
        observer: null, listenersCleanup: [], hiddenElements: new WeakSet(), enabled: false,
        debouncedPrune: Utils.debounce(function(mutations) { if (this.enabled) this.pruneIncremental(mutations); }, 150),
        
        init(config) {
            this.updateConfig(config);
            EventBus.on('configChanged', (c) => this.updateConfig(c));
        },
        updateConfig(config) {
            const shouldEnable = Boolean(config?.FEATURES?.SHORTS_REMOVAL);
            if (shouldEnable === this.enabled) return;
            this.enabled = shouldEnable;
            if (this.enabled) this.start(); else this.stop();
        },
        start() {
            if (this.observer) return;
            // Valida node e aplica Observer focado nos nós adicionados
            const targetNode = document.querySelector('ytd-app') || document.body || document.documentElement;
            if (targetNode) {
                this.observer = new MutationObserver((mutations) => this.debouncedPrune(mutations));
                this.observer.observe(targetNode, { childList: true, subtree: true });
                // Limpeza Inicial pontual (evita O(N) continuo)
                this.pruneAll();
            }
            if (this.listenersCleanup.length === 0) {
                this.listenersCleanup.push(
                    Utils.safeAddEventListener(document, 'yt-navigate-finish', () => this.pruneAll()),
                    Utils.safeAddEventListener(document, 'yt-page-data-updated', () => this.pruneAll())
                );
            }
        },
        stop() {
            if (this.observer) { this.observer.disconnect(); this.observer = null; }
            this.listenersCleanup.forEach(c => c()); this.listenersCleanup = [];
            // Com WeakSet não re-exibimos, pois os nós são GC'd ou gerados novos pelo SPA.
            // Para segurança total SPA, rely on relayout.
        },
        markHidden(element) {
            if (!element || !(element instanceof HTMLElement) || this.hiddenElements.has(element)) return;
            element.dataset.ytEnhancerPrevDisplay = element.style.display || '';
            element.style.setProperty('display', 'none', 'important');
            this.hiddenElements.add(element);
        },
        isShort(el) {
            if (!el || !el.matches) return false;
            if (el.matches('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]')) return true;
            if (el.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]')) return true;
            if (el.querySelector('a[href^="/shorts"], a[href*="/shorts/"], [aria-label="Shorts"]')) return true;
            return false;
        },
        pruneIncremental(mutations) {
            if (!mutations) return;
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        if (this.isShort(node)) this.markHidden(node.closest('ytd-rich-section-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-guide-entry-renderer') || node);
                        else {
                            const sub = node.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"], a[href^="/shorts"]');
                            sub.forEach(s => this.markHidden(s.closest('ytd-rich-section-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-guide-entry-renderer') || s));
                        }
                    }
                });
            });
        },
        pruneAll() {
            document.querySelectorAll('ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-reel-shelf-renderer, ytd-rich-item-renderer:has(a[href^="/shorts/"]), ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])').forEach(el => this.markHidden(el));
        },
        cleanup() { this.stop(); }
    };

    // =======================================================
    // 5. SMART CPU TAMER (Focado, Restrito e Seguro)
    // =======================================================
    const SmartCpuTamer = {
        initialized: false,
        originals: { setInterval: null, setTimeout: null, clearInterval: null, clearTimeout: null },
        state: { hidden: false, playing: false, visibleVideo: false, throttlingLevel: 0 },
        handlers: { visibility: null, play: null, pause: null, pagehide: null, pageshow: null },
        mainMediaElement: null, mediaStatePoller: null, gracePeriodTimer: null,
        
        init() {
            if (this.initialized) return;
            // Monkey patching contido: apenas timeouts longos. Ignora rAF para evitar quebras JIT.
            this.originals.setInterval = targetWindow.setInterval;
            this.originals.setTimeout = targetWindow.setTimeout;
            this.originals.clearInterval = targetWindow.clearInterval;
            this.originals.clearTimeout = targetWindow.clearTimeout;
            
            this.bindEvents();
            this.overrideTimers();
            this.initialized = true;
            this.updateState();
        },
        
        cleanup() {
            if (!this.initialized) return;
            
            // Restauração precisa garantindo que o YT não bugue
            targetWindow.setInterval = this.originals.setInterval;
            targetWindow.setTimeout = this.originals.setTimeout;
            targetWindow.clearInterval = this.originals.clearInterval;
            targetWindow.clearTimeout = this.originals.clearTimeout;

            Object.entries(this.handlers).forEach(([k, h]) => {
                if (!h) return;
                const ev = k === 'visibility' ? 'visibilitychange' : k;
                if (['visibilitychange', 'play', 'pause'].includes(ev)) document.removeEventListener(ev, h, true);
                else window.removeEventListener(ev, h, true);
            });
            this.handlers = { visibility: null, play: null, pause: null, pagehide: null, pageshow: null };
            
            if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
            if (this.mediaStatePoller) clearInterval(this.mediaStatePoller);
            
            this.gracePeriodTimer = null; this.mediaStatePoller = null; this.mainMediaElement = null;
            this.initialized = false;
        },
        
        resolveMedia() {
            if (this.mainMediaElement?.isConnected) return this.mainMediaElement;
            this.mainMediaElement = Utils.DOMCache.get('video.html5-main-video') || null;
            return this.mainMediaElement;
        },
        
        updateState(force = false) {
            const media = this.resolveMedia();
            this.state.playing = !!(media && !media.paused && !media.ended);
            this.state.visibleVideo = !!(media && media.isConnected && media.getClientRects().length > 0);
            
            const graceActive = this.state.hidden && !force && this.gracePeriodTimer;
            if (!this.state.hidden || graceActive) this.state.throttlingLevel = 0;
            else if (this.state.playing) this.state.throttlingLevel = 1;
            else this.state.throttlingLevel = 2; // Inativo total
        },
        
        bindEvents() {
            this.handlers.visibility = () => {
                this.state.hidden = document.visibilityState === 'hidden';
                if (this.state.hidden) {
                    if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
                    this.gracePeriodTimer = setTimeout(() => { this.gracePeriodTimer = null; this.updateState(true); }, CONSTANTS.GRACE_PERIOD_MS);
                } else {
                    if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
                    this.gracePeriodTimer = null;
                }
                this.updateState();
            };
            this.handlers.play = () => this.updateState();
            this.handlers.pause = () => this.updateState();
            
            document.addEventListener('visibilitychange', this.handlers.visibility, true);
            document.addEventListener('play', this.handlers.play, true);
            document.addEventListener('pause', this.handlers.pause, true);
            
            this.mediaStatePoller = this.originals.setInterval.call(targetWindow, () => this.updateState(), 2000);
            this.state.hidden = document.visibilityState === 'hidden';
        },
        
        overrideTimers() {
            const self = this;
            const isCritical = (cbStr) => {
                const str = cbStr.toLowerCase();
                return str.includes('heartbeat') || str.includes('videostats') || str.includes('metrics');
            };

            targetWindow.setInterval = function(callback, delay, ...args) {
                let d = Number(delay) || 0;
                // Whitelist: se for script critico do YT, não afeta
                if (self.state.throttlingLevel > 0 && typeof callback === 'function' && !isCritical(callback.toString())) {
                    d = self.state.throttlingLevel === 2 ? Math.max(d, 2000) : Math.max(d, 1000);
                }
                return self.originals.setInterval.call(targetWindow, callback, d, ...args);
            };

            targetWindow.setTimeout = function(callback, delay, ...args) {
                let d = Number(delay) || 0;
                if (self.state.throttlingLevel > 0 && typeof callback === 'function' && d >= 50 && !isCritical(callback.toString())) {
                    d = self.state.throttlingLevel === 2 ? Math.max(d, 500) : Math.max(d, 100);
                }
                return self.originals.setTimeout.call(targetWindow, callback, d, ...args);
            };
        }
    };

    // =======================================================
    // 6. CLOCK MANAGER
    // =======================================================
    const ClockManager = {
        clockEl: null, timeInterval: null, config: null, playerEl: null, handlers: {}, initialized: false,
        init(config) {
            this.updateConfig(config);
            if(this.initialized) return;
            EventBus.on('configChanged', (c) => this.updateConfig(c));
            
            this.handlers.fs = () => this.handleFullscreen();
            this.handlers.nav = () => { this.resolvePlayer(); this.handleFullscreen(); };
            
            document.addEventListener('fullscreenchange', this.handlers.fs);
            document.addEventListener('yt-navigate-finish', this.handlers.nav);
            this.initialized = true;
        },
        updateConfig(config) {
            const enable = Boolean(config?.FEATURES?.FULLSCREEN_CLOCK);
            this.config = config;
            if (!enable) this.disable();
            else this.handleFullscreen();
        },
        resolvePlayer() {
            if (this.playerEl?.isConnected) return this.playerEl;
            this.playerEl = document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
            return this.playerEl;
        },
        createClock() {
            if (!this.resolvePlayer()) return;
            if (this.clockEl) this.clockEl.remove();
            
            this.clockEl = document.createElement('div');
            this.clockEl.className = 'yt-enhancer-fs-clock';
            // Injetado direto no player para que o Fullscreen nativo não oculte
            this.playerEl.appendChild(this.clockEl);
            this.applyStyle();
        },
        applyStyle() {
            if (!this.clockEl) return;
            const s = this.config.CLOCK_STYLE;
            this.clockEl.style.cssText = `position: absolute; pointer-events: none; z-index: 1000; display: none; font-family: Roboto, sans-serif; font-weight: 500; text-shadow: 0 1px 3px rgba(0,0,0,0.8); transition: opacity 0.2s; padding: 6px 14px;`;
            this.clockEl.style.backgroundColor = `rgba(${Utils.hexToRgb(s.bgColor)}, ${s.bgOpacity})`;
            this.clockEl.style.color = s.color;
            this.clockEl.style.fontSize = `${s.fontSize}px`;
            this.clockEl.style.borderRadius = `${s.borderRadius}px`;
            this.clockEl.style.right = `${s.margin}px`;
            this.clockEl.style.top = `${s.margin}px`; // Bottom causava conflitos com UI do Player
        },
        updateTime() {
            if (this.clockEl) this.clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
        handleFullscreen() {
            if (!this.config?.FEATURES?.FULLSCREEN_CLOCK || !document.fullscreenElement) {
                if (this.clockEl) this.clockEl.style.display = 'none';
                if (this.timeInterval) { clearInterval(this.timeInterval); this.timeInterval = null; }
                return;
            }
            if (!this.clockEl || !this.clockEl.isConnected) this.createClock();
            if (this.clockEl) {
                this.clockEl.style.display = 'block';
                this.updateTime();
                if (!this.timeInterval) this.timeInterval = setInterval(() => this.updateTime(), 1000);
            }
        },
        disable() {
            if (this.clockEl) { this.clockEl.remove(); this.clockEl = null; }
            if (this.timeInterval) { clearInterval(this.timeInterval); this.timeInterval = null; }
        },
        cleanup() {
            this.disable();
            if (this.handlers.fs) document.removeEventListener('fullscreenchange', this.handlers.fs);
            if (this.handlers.nav) document.removeEventListener('yt-navigate-finish', this.handlers.nav);
            this.initialized = false;
        }
    };

    // =======================================================
    // BOOTSTRAP / CORE INIT
    // =======================================================
    const EnhancerCore = {
        init() {
            try {
                // SPA Cleanup handlers
                Utils.safeAddEventListener(document, 'yt-navigate-start', () => Utils.DOMCache.refresh());
                
                // Hotkey Seguro
                Utils.safeAddEventListener(window, 'keydown', (event) => {
                    if (event.isTrusted && event.altKey && event.shiftKey && (event.code === 'KeyS' || event.key?.toLowerCase() === 's')) {
                        event.preventDefault();
                        SettingsLauncher.open('shortcut');
                    }
                }, { capture: true });

                const config = ConfigManager.load();
                
                // Init Módulos
                if (config.FEATURES.CPU_TAMER) SmartCpuTamer.init();
                StyleManager.init(); StyleManager.apply(config);
                ShortsManager.init(config);
                ClockManager.init(config);
                
                // Listener dinâmico
                EventBus.on('configChanged', (newConfig) => {
                    if (newConfig.FEATURES.CPU_TAMER && !SmartCpuTamer.initialized) SmartCpuTamer.init();
                    else if (!newConfig.FEATURES.CPU_TAMER && SmartCpuTamer.initialized) SmartCpuTamer.cleanup();
                });
                
                // Teardown completo antes de reload
                Utils.safeAddEventListener(window, 'beforeunload', () => {
                    SmartCpuTamer.cleanup(); ClockManager.cleanup(); ShortsManager.cleanup(); EventBus.clear();
                });

                Logger.log(`v${CONSTANTS.SCRIPT_VERSION} Iniciado. Escopo seguro ativado.`);
            } catch (err) {
                Logger.error('Falha Crítica na Inicialização:', err);
            }
        }
    };

    // Apenas instanciar se estiver no contexto top window ou em modo isolado desejado
    const isTopFrame = window === window.top;
    if (isTopFrame && location.hostname === 'www.youtube.com') {
        SettingsLauncher.registerMenuCommand();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => EnhancerCore.init());
        } else {
            EnhancerCore.init();
        }
    }

})();
