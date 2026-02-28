// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      2.1.0
// @description  Reduz uso de CPU (Smart Mode), personaliza layout, remove Shorts, elimina blur/translucidez e adiciona relógio customizável.
// @author       John Wiliam & IA
// @match        *://*.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @updateURL    https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js
// @downloadURL  https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Executa apenas no frame principal para evitar menu/GUI sendo aberto em iframes invisíveis.
    if (window.top !== window.self) return;

const SCRIPT_VERSION = '2.1.0';
const FLAG = `__yt_enhancer_v${SCRIPT_VERSION.replace(/\./g, '_')}__`;
    if (window[FLAG]) return;
    window[FLAG] = true;

    // Referência segura para o objeto Window da página
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const log = (msg) => console.log(`[YT Enhancer] ${msg}`);

    
    // =======================================================
    // EVENT BUS SYSTEM
    // =======================================================
    const EventBus = {
        events: new Map(),
        
        on(event, callback) {
            if (!this.events.has(event)) {
                this.events.set(event, []);
            }
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
            const callbacks = [...this.events.get(event)];
            for (const callback of callbacks) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`EventBus error in ${event}:`, error);
                }
            }
        }
    };

    // =======================================================
    // UTILITÁRIOS
    // =======================================================
    const Utils = {
        clamp(value, min, max, fallback = min) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return fallback;
            return Math.min(max, Math.max(min, numeric));
        },

        isHexColor(value) {
            return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
        },

        sanitizeConfig(config, defaults) {
            const safeConfig = {
                ...defaults,
                ...(config || {}),
                FEATURES: { ...defaults.FEATURES, ...(config?.FEATURES || {}) },
                CLOCK_STYLE: { ...defaults.CLOCK_STYLE, ...(config?.CLOCK_STYLE || {}) }
            };

            safeConfig.LANGUAGE = ['pt', 'en'].includes(safeConfig.LANGUAGE) ? safeConfig.LANGUAGE : defaults.LANGUAGE;

            safeConfig.VIDEOS_PER_ROW = this.clamp(safeConfig.VIDEOS_PER_ROW, 3, 8, defaults.VIDEOS_PER_ROW);
            safeConfig.CLOCK_STYLE.bgOpacity = this.clamp(safeConfig.CLOCK_STYLE.bgOpacity, 0, 1, defaults.CLOCK_STYLE.bgOpacity);
            safeConfig.CLOCK_STYLE.fontSize = this.clamp(safeConfig.CLOCK_STYLE.fontSize, 12, 48, defaults.CLOCK_STYLE.fontSize);
            safeConfig.CLOCK_STYLE.margin = this.clamp(safeConfig.CLOCK_STYLE.margin, 0, 120, defaults.CLOCK_STYLE.margin);
            safeConfig.CLOCK_STYLE.borderRadius = this.clamp(safeConfig.CLOCK_STYLE.borderRadius, 0, 50, defaults.CLOCK_STYLE.borderRadius);
            safeConfig.CLOCK_STYLE.color = this.isHexColor(safeConfig.CLOCK_STYLE.color) ? safeConfig.CLOCK_STYLE.color : defaults.CLOCK_STYLE.color;
            safeConfig.CLOCK_STYLE.bgColor = this.isHexColor(safeConfig.CLOCK_STYLE.bgColor) ? safeConfig.CLOCK_STYLE.bgColor : defaults.CLOCK_STYLE.bgColor;

            return safeConfig;
        },

        debounce(func, wait, immediate = false) {
            let timeout;
            return function(...args) {
                const context = this;
                const later = () => {
                    timeout = null;
                    if (!immediate) func.apply(context, args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func.apply(context, args);
            };
        },

        // =======================================================
        // CORREÇÃO: DOMCache Inteligente (Previne Memory Leak)
        // =======================================================
        DOMCache: {
            cache: new Map(),
            observers: new Map(),
            
            get(selector, forceUpdate = false) {
                // 1. Tenta pegar do cache
                if (!forceUpdate && this.cache.has(selector)) {
                    const cachedEl = this.cache.get(selector);
                    // 2. CORREÇÃO CRÍTICA: Verifica se o elemento ainda existe na página (SPA)
                    if (cachedEl && cachedEl.isConnected) {
                        return cachedEl;
                    }
                    // Se não estiver conectado, é lixo. Remove.
                    this.cache.delete(selector);
                }

                // 3. Busca novo elemento se necessário
                const element = document.querySelector(selector);
                if (element) {
                    this.cache.set(selector, element);
                }
                return element;
            },
            
            refresh(selector = null) {
                if (selector) {
                    this.cache.delete(selector);
                } else {
                    this.cache.clear();
                    log('Cache DOM limpo (Navegação SPA detectada)');
                }
            },
            
            disconnect(selector) {
                if (this.observers.has(selector)) {
                    this.observers.get(selector).disconnect();
                    this.observers.delete(selector);
                }
            }
        },

        safeAddEventListener(element, event, handler, options = {}) {
            if (!element) return () => {};
            
            const safeHandler = (e) => {
                try {
                    return handler(e);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                    return null;
                }
            };
            
            element.addEventListener(event, safeHandler, options);
            return () => element.removeEventListener(event, safeHandler, options);
        },

        migrateConfig(savedConfig, currentVersion = '2.1.0') {
            if (!savedConfig || typeof savedConfig !== 'object') {
                return null;
            }
            if (!savedConfig.version) {
                savedConfig.version = '1.0.0';
                if (!savedConfig.CLOCK_STYLE?.borderRadius) {
                    savedConfig.CLOCK_STYLE = { ...savedConfig.CLOCK_STYLE, borderRadius: 12 };
                }
            }
            savedConfig.version = currentVersion;
            return savedConfig;
        }
    };

    // =======================================================
    // 1. I18N + CONFIG MANAGER
    // =======================================================
    const I18N = {
        pt: {
            modal: {
                title: '⚙️ Configurações',
                closeTitle: 'Fechar',
                tabs: {
                    features: '🔧 Funcionalidades',
                    appearance: '🎨 Aparência do relógio'
                },
                features: {
                    cpuTamer: {
                        title: 'Redução Inteligente de CPU',
                        description: 'Otimiza quando oculto (economiza bateria)'
                    },
                    layout: {
                        title: 'Layout Grid',
                        description: 'Ajusta vídeos por linha'
                    },
                    videosPerRow: 'Vídeos por linha',
                    videosPerRowHint: 'Define quantos vídeos aparecem em cada linha',
                    shorts: {
                        title: 'Remover Shorts',
                        description: 'Limpa Shorts da interface'
                    },
                    clock: {
                        title: 'Relógio Flutuante',
                        description: 'Mostra hora sobre o vídeo'
                    },
                    rtx: {
                        title: 'Modo RTX (sem blur/translucidez)',
                        description: 'Remove blur e transforma fundos translúcidos em transparentes'
                    },
                    language: {
                        title: 'Idioma da Interface',
                        description: 'Troca os textos entre português e inglês'
                    }
                },
                clockStyle: {
                    textColor: 'Cor do Texto',
                    backgroundColor: 'Cor do Fundo',
                    backgroundOpacity: 'Opacidade Fundo',
                    fontSize: 'Tamanho Fonte (px)',
                    margin: 'Margem (px)',
                    borderRadius: 'Arredondamento (px)'
                },
                buttons: {
                    apply: 'Aplicar',
                    applyAndReload: 'Aplicar e Recarregar'
                },
                reloadNotice: 'Mudanças de idioma e CPU exigem recarregar a página para aplicar.'
            },
            menu: {
                openSettings: '⚙️ Configurações'
            }
        },
        en: {
            modal: {
                title: '⚙️ Settings',
                closeTitle: 'Close',
                tabs: {
                    features: '🔧 Features',
                    appearance: '🎨 Clock appearance'
                },
                features: {
                    cpuTamer: {
                        title: 'Smart CPU Reduction',
                        description: 'Optimizes when hidden (saves battery)'
                    },
                    layout: {
                        title: 'Grid Layout',
                        description: 'Adjusts videos per row'
                    },
                    videosPerRow: 'Videos per row',
                    videosPerRowHint: 'Defines how many videos appear in each row',
                    shorts: {
                        title: 'Remove Shorts',
                        description: 'Cleans Shorts from the interface'
                    },
                    clock: {
                        title: 'Floating Clock',
                        description: 'Shows time over the video'
                    },
                    rtx: {
                        title: 'RTX Mode (no blur/translucency)',
                        description: 'Removes blur and turns translucent backgrounds transparent'
                    },
                    language: {
                        title: 'Interface Language',
                        description: 'Switch all texts between English and Portuguese'
                    }
                },
                clockStyle: {
                    textColor: 'Text Color',
                    backgroundColor: 'Background Color',
                    backgroundOpacity: 'Background Opacity',
                    fontSize: 'Font Size (px)',
                    margin: 'Margin (px)',
                    borderRadius: 'Roundness (px)'
                },
                buttons: {
                    apply: 'Apply',
                    applyAndReload: 'Apply and Reload'
                },
                reloadNotice: 'Language and CPU changes require reloading the page to apply.'
            },
            menu: {
                openSettings: '⚙️ Settings'
            }
        }
    };

    const t = (key, lang = null) => {
        const resolvedLang = (lang || ConfigManager.load()?.LANGUAGE || 'en').toLowerCase();
        const segments = key.split('.');
        const getValue = (dictionary) => segments.reduce((acc, segment) => acc?.[segment], dictionary);

        return getValue(I18N[resolvedLang]) ?? getValue(I18N.en) ?? getValue(I18N.pt) ?? key;
    };

    const ConfigManager = {
        CONFIG_VERSION: '2.0.0',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        
        defaults: {
            version: '2.0.0',
            LANGUAGE: 'en',
            VIDEOS_PER_ROW: 5,
            FEATURES: {
                CPU_TAMER: true,
                LAYOUT_ENHANCEMENT: true,
                SHORTS_REMOVAL: true,
                FULLSCREEN_CLOCK: true,
                RTX_VISUAL_MODE: true
            },
            CLOCK_STYLE: {
                color: '#ffffff',
                bgColor: '#191919',
                bgOpacity: 0.2,
                fontSize: 22,
                margin: 30,
                borderRadius: 25,
                position: 'bottom-right'
            }
        },

        load: function() {
            try {
                const saved = GM_getValue(this.STORAGE_KEY);
                const migratedConfig = Utils.migrateConfig(saved, this.CONFIG_VERSION);
                
                if (!migratedConfig) {
                    return Utils.sanitizeConfig({}, this.defaults);
                }

                return Utils.sanitizeConfig(migratedConfig, this.defaults);
            } catch (error) {
                log('Erro ao carregar configuração: ' + error);
                return Utils.sanitizeConfig({}, this.defaults);
            }
        },

        save: function(config) {
            try {
                const sanitizedConfig = Utils.sanitizeConfig(config, this.defaults);
                sanitizedConfig.version = this.CONFIG_VERSION;
                GM_setValue(this.STORAGE_KEY, sanitizedConfig);
                EventBus.emit('configChanged', sanitizedConfig);
                return true;
            } catch (error) {
                log('Erro ao salvar configuração: ' + error);
                return false;
            }
        }
    };

    // =======================================================
    // 2. UI MANAGER
    // =======================================================
    const UIManager = {
        cleanupFunctions: [],
        styleId: 'yt-enhancer-modal-style',

        ensureStyles() {
            if (document.getElementById(this.styleId)) return;
            if (!document.head) {
                requestAnimationFrame(() => this.ensureStyles());
                return;
            }

            const style = document.createElement('style');
            style.id = this.styleId;
            style.textContent = `
                .yt-enhancer-modal {
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: min(420px, calc(100vw - 32px)); max-height: 80vh;
                    background: #121212; color: #f1f1f1;
                    border: 1px solid #333; border-radius: 12px;
                    box-shadow: 0 12px 24px rgba(0,0,0,0.5);
                    font-family: 'Roboto', Arial, sans-serif; font-size: 14px;
                    display: flex; flex-direction: column; z-index: 10000;
                }
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
            document.head.appendChild(style);
        },

        createSettingsModal: function(currentConfig, onSave) {
            this.ensureStyles();
            this.cleanupFunctions.forEach(fn => fn());
            this.cleanupFunctions = [];

            document.getElementById('yt-enhancer-settings-modal')?.remove();
            document.getElementById('yt-enhancer-overlay')?.remove();

            const create = (tag, options = {}) => {
                const el = document.createElement(tag);
                if (options.id) el.id = options.id;
                if (options.className) el.className = options.className;
                if (options.text) el.textContent = options.text;
                if (options.title) el.title = options.title;
                if (options.type) el.type = options.type;
                if (options.value !== undefined) el.value = options.value;
                if (options.checked !== undefined) el.checked = !!options.checked;
                if (options.min !== undefined) el.min = String(options.min);
                if (options.max !== undefined) el.max = String(options.max);
                if (options.step !== undefined) el.step = String(options.step);
                if (options.forId) el.htmlFor = options.forId;
                if (options.dataset) Object.assign(el.dataset, options.dataset);
                if (options.style) Object.assign(el.style, options.style);
                return el;
            };

            const overlay = create('div', { id: 'yt-enhancer-overlay' });
            overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9998;';

            const modal = create('div', { id: 'yt-enhancer-settings-modal', className: 'yt-enhancer-modal' });
            const modalHeader = create('div', { className: 'modal-header' });
            modalHeader.append(
                create('h2', { className: 'modal-title', text: t('modal.title', currentConfig.LANGUAGE) }),
                create('button', { id: 'yt-enhancer-close', className: 'close-btn', text: '×', title: t('modal.closeTitle', currentConfig.LANGUAGE) })
            );

            const tabsNav = create('div', { className: 'tabs-nav' });
            const tabFeaturesBtn = create('button', { className: 'tab-btn active', text: t('modal.tabs.features', currentConfig.LANGUAGE), dataset: { target: 'tab-features' } });
            const tabAppearanceBtn = create('button', { className: 'tab-btn', text: t('modal.tabs.appearance', currentConfig.LANGUAGE), dataset: { target: 'tab-appearance' } });
            tabsNav.append(tabFeaturesBtn, tabAppearanceBtn);

            const modalContent = create('div', { className: 'modal-content' });
            const tabFeatures = create('div', { id: 'tab-features', className: 'tab-pane active' });
            const optionsList = create('div', { className: 'options-list' });

            const createToggle = (id, title, description, checked) => {
                const label = create('label', { className: 'feature-toggle' });
                const textWrap = create('div', { className: 'toggle-text' });
                textWrap.append(create('strong', { text: title }), create('span', { text: description }));
                const switchWrap = create('div', { className: 'toggle-switch' });
                const input = create('input', { id, type: 'checkbox', checked });
                switchWrap.append(input, create('span', { className: 'slider' }));
                label.append(textWrap, switchWrap);
                return label;
            };

            optionsList.append(
                createToggle('cfg-cpu-tamer', t('modal.features.cpuTamer.title', currentConfig.LANGUAGE), t('modal.features.cpuTamer.description', currentConfig.LANGUAGE), currentConfig.FEATURES.CPU_TAMER),
                createToggle('cfg-layout', t('modal.features.layout.title', currentConfig.LANGUAGE), t('modal.features.layout.description', currentConfig.LANGUAGE), currentConfig.FEATURES.LAYOUT_ENHANCEMENT)
            );

            const layoutSettings = create('label', { id: 'layout-settings', className: 'feature-toggle feature-card-input', forId: 'cfg-videos-row' });
            if (!currentConfig.FEATURES.LAYOUT_ENHANCEMENT) layoutSettings.style.display = 'none';
            const layoutText = create('div', { className: 'toggle-text' });
            layoutText.append(create('strong', { text: t('modal.features.videosPerRow', currentConfig.LANGUAGE) }), create('span', { text: t('modal.features.videosPerRowHint', currentConfig.LANGUAGE) }));
            layoutSettings.append(layoutText, create('input', { id: 'cfg-videos-row', className: 'styled-input-small', type: 'number', min: 3, max: 8, value: currentConfig.VIDEOS_PER_ROW }));
            optionsList.append(layoutSettings);

            optionsList.append(
                createToggle('cfg-shorts', t('modal.features.shorts.title', currentConfig.LANGUAGE), t('modal.features.shorts.description', currentConfig.LANGUAGE), currentConfig.FEATURES.SHORTS_REMOVAL),
                createToggle('cfg-clock-enable', t('modal.features.clock.title', currentConfig.LANGUAGE), t('modal.features.clock.description', currentConfig.LANGUAGE), currentConfig.FEATURES.FULLSCREEN_CLOCK),
                createToggle('cfg-rtx-visual', t('modal.features.rtx.title', currentConfig.LANGUAGE), t('modal.features.rtx.description', currentConfig.LANGUAGE), currentConfig.FEATURES.RTX_VISUAL_MODE)
            );

            const languageCard = create('label', { className: 'feature-toggle feature-card-select', forId: 'cfg-language' });
            const languageText = create('div', { className: 'toggle-text' });
            languageText.append(create('strong', { text: t('modal.features.language.title', currentConfig.LANGUAGE) }), create('span', { text: t('modal.features.language.description', currentConfig.LANGUAGE) }));
            const languageSelect = create('select', { id: 'cfg-language', className: 'styled-select' });
            [
                { value: 'en', label: 'English' },
                { value: 'pt', label: 'Português' }
            ].forEach(({ value, label }) => {
                const option = create('option', { value, text: label });
                if (currentConfig.LANGUAGE === value) option.selected = true;
                languageSelect.appendChild(option);
            });
            languageCard.append(languageText, languageSelect);
            optionsList.append(languageCard);

            tabFeatures.appendChild(optionsList);

            const tabAppearance = create('div', { id: 'tab-appearance', className: 'tab-pane' });
            const appearanceGrid = create('div', { className: 'appearance-grid' });
            const createControl = (id, labelText, inputEl, valueEl = null) => {
                const group = create('div', { className: 'control-group' });
                group.append(create('label', { text: labelText }), inputEl);
                if (valueEl) {
                    const wrap = create('div', { className: 'color-input-wrapper' });
                    wrap.append(inputEl, valueEl);
                    group.replaceChild(wrap, inputEl);
                }
                inputEl.id = id;
                return group;
            };

            const colorInput = create('input', { type: 'color', value: currentConfig.CLOCK_STYLE.color });
            const colorValue = create('span', { className: 'color-value', text: currentConfig.CLOCK_STYLE.color });
            appearanceGrid.appendChild(createControl('style-color', t('modal.clockStyle.textColor', currentConfig.LANGUAGE), colorInput, colorValue));

            const bgColorInput = create('input', { type: 'color', value: currentConfig.CLOCK_STYLE.bgColor });
            const bgColorValue = create('span', { className: 'color-value', text: currentConfig.CLOCK_STYLE.bgColor });
            appearanceGrid.appendChild(createControl('style-bg-color', t('modal.clockStyle.backgroundColor', currentConfig.LANGUAGE), bgColorInput, bgColorValue));

            appearanceGrid.appendChild(createControl('style-bg-opacity', t('modal.clockStyle.backgroundOpacity', currentConfig.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 1, step: 0.1, value: currentConfig.CLOCK_STYLE.bgOpacity })));
            appearanceGrid.appendChild(createControl('style-font-size', t('modal.clockStyle.fontSize', currentConfig.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 12, max: 100, value: currentConfig.CLOCK_STYLE.fontSize })));
            appearanceGrid.appendChild(createControl('style-margin', t('modal.clockStyle.margin', currentConfig.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 200, value: currentConfig.CLOCK_STYLE.margin })));
            appearanceGrid.appendChild(createControl('style-border-radius', t('modal.clockStyle.borderRadius', currentConfig.LANGUAGE), create('input', { className: 'styled-input', type: 'number', min: 0, max: 50, value: currentConfig.CLOCK_STYLE.borderRadius || 12 })));

            tabAppearance.appendChild(appearanceGrid);
            modalContent.append(tabFeatures, tabAppearance);

            const modalFooter = create('div', { className: 'modal-footer' });
            const reloadNotice = create('p', { id: 'yt-enhancer-reload-note', className: 'reload-note', text: t('modal.reloadNotice', currentConfig.LANGUAGE) });
            reloadNotice.style.display = 'none';
            const modalActions = create('div', { className: 'modal-actions' });
            const btnApply = create('button', { id: 'yt-enhancer-apply', className: 'btn btn-primary', text: t('modal.buttons.apply', currentConfig.LANGUAGE) });
            const btnReload = create('button', { id: 'yt-enhancer-reload', className: 'btn btn-primary', text: t('modal.buttons.applyAndReload', currentConfig.LANGUAGE) });
            btnReload.style.display = 'none';
            modalActions.append(btnApply, btnReload);
            modalFooter.append(reloadNotice, modalActions);

            modal.append(modalHeader, tabsNav, modalContent, modalFooter);
            document.body.append(overlay, modal);

            const closeModal = () => {
                modal.remove();
                overlay.remove();
                this.cleanupFunctions.forEach(fn => fn());
                this.cleanupFunctions = [];
            };

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

            const layoutToggle = document.getElementById('cfg-layout');
            this.cleanupFunctions.push(Utils.safeAddEventListener(layoutToggle, 'change', (e) => {
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

            const initialCpuState = currentConfig.FEATURES.CPU_TAMER;
            const initialLanguageState = currentConfig.LANGUAGE;

            const updateSaveButtons = () => {
                const newConfig = getNewConfig();
                const requiresReload = newConfig.FEATURES.CPU_TAMER !== initialCpuState || newConfig.LANGUAGE !== initialLanguageState;
                btnApply.style.display = requiresReload ? 'none' : 'block';
                btnReload.style.display = requiresReload ? 'block' : 'none';
                reloadNotice.style.display = requiresReload ? 'block' : 'none';
            };

            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-cpu-tamer'), 'change', updateSaveButtons));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('cfg-language'), 'change', updateSaveButtons));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnApply, 'click', () => {
                onSave(getNewConfig());
                closeModal();
            }));
            this.cleanupFunctions.push(Utils.safeAddEventListener(btnReload, 'click', () => {
                onSave(getNewConfig());
                closeModal();
                setTimeout(() => window.location.reload(), 100);
            }));
        }
    };

    // =======================================================
    // 3. STYLE MANAGER
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-styles',
        
        init() {
            EventBus.on('configChanged', (config) => this.apply(config));
        },
        
        apply: function(config) {
            // CORREÇÃO: Garante que document.head existe
            if (!document.head) {
                return requestAnimationFrame(() => this.apply(config));
            }

            const old = document.getElementById(this.styleId);
            if (old) old.remove();

            if (!config.FEATURES.LAYOUT_ENHANCEMENT && !config.FEATURES.SHORTS_REMOVAL && !config.FEATURES.RTX_VISUAL_MODE) return;

            let css = '';
            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `
                    ytd-rich-grid-renderer { 
                        --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important; 
                    }
                    @media (max-width: 1200px) { 
                        ytd-rich-grid-renderer { 
                            --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important; 
                        } 
                    }
                `;
            }
            if (config.FEATURES.SHORTS_REMOVAL) {
                css += `
                    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
                    ytd-reel-shelf-renderer,
                    ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
                    ytd-guide-entry-renderer:has(a[href^="/shorts"]),
                    ytd-guide-entry-renderer:has(a[href*="/shorts/"]),
                    ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
                    ytd-mini-guide-entry-renderer:has(a[href*="/shorts/"]),
                    /* Fallback textual selectors (secondary) */
                    ytd-guide-entry-renderer:has(a[title="Shorts"]),
                    ytd-mini-guide-entry-renderer[aria-label="Shorts"] {
                        display: none !important; 
                    }
                `;
            }
            if (config.FEATURES.RTX_VISUAL_MODE) {
                css += `
                    :root {
                        --yt-spec-general-background-a: transparent !important;
                        --yt-spec-general-background-b: transparent !important;
                        --yt-spec-raised-background: transparent !important;
                        --yt-spec-10-percent-layer: transparent !important;
                        --yt-spec-badge-chip-background: transparent !important;
                        --rtx-player-menu-background: rgba(15, 15, 15, 0.96) !important;
                    }
                    ytd-app *,
                    tp-yt-iron-dropdown,
                    tp-yt-paper-dialog,
                    yt-confirm-dialog-renderer,
                    ytd-popup-container,
                    ytd-multi-page-menu-renderer,
                    ytd-mini-guide-renderer,
                    ytd-guide-renderer,
                    ytd-searchbox,
                    ytd-watch-flexy,
                    ytd-live-chat-frame,
                    .ytp-popup,
                    .ytp-panel,
                    .ytp-tooltip,
                    .ytp-settings-menu,
                    .ytp-menuitem,
                    .iv-drawer,
                    .sbdd_a,
                    [style*="backdrop-filter"],
                    [style*="-webkit-backdrop-filter"] {
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                    }
                    ytd-app [style*="rgba("],
                    ytd-app [style*="rgb("],
                    ytd-app [style*="background:"],
                    ytd-app [style*="background-color:"] {
                        background-image: none !important;
                        box-shadow: none !important;
                    }
                    ytd-masthead,
                    #guide,
                    ytd-mini-guide-renderer,
                    ytd-popup-container tp-yt-paper-dialog,
                    ytd-multi-page-menu-renderer,
                    tp-yt-iron-dropdown,
                    .ytp-popup {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                    .ytp-settings-menu,
                    .ytp-panel,
                    .ytp-panel-menu,
                    .ytp-popup.ytp-contextmenu {
                        background: var(--rtx-player-menu-background) !important;
                        background-color: var(--rtx-player-menu-background) !important;
                    }
                    /* Mantém menus de perfil/notificações legíveis em tema escuro e claro */
                    ytd-popup-container tp-yt-paper-dialog,
                    ytd-multi-page-menu-renderer,
                    ytd-notification-topbar-button-renderer tp-yt-paper-dialog,
                    ytd-account-menu {
                        --yt-spec-general-background-a: var(--yt-spec-base-background) !important;
                        --yt-spec-general-background-b: var(--yt-spec-base-background) !important;
                        --yt-spec-raised-background: var(--yt-spec-base-background) !important;
                        background: var(--yt-spec-base-background) !important;
                        background-color: var(--yt-spec-base-background) !important;
                    }
                `;
            }

            const style = document.createElement('style');
            style.id = this.styleId;
            style.textContent = css;
            document.head.appendChild(style);
        }
    };

    const ShortsManager = {
        observer: null,
        listenersCleanup: [],
        hiddenElements: new Set(),
        enabled: false,

        debouncedPrune: Utils.debounce(function() {
            if (this.enabled) this.prune();
        }, 150),

        init(config) {
            this.updateConfig(config);
            EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
        },

        updateConfig(config) {
            const shouldEnable = Boolean(config?.FEATURES?.SHORTS_REMOVAL);
            if (shouldEnable === this.enabled) return;

            this.enabled = shouldEnable;
            if (this.enabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (!document.documentElement) return;
            this.prune();

            if (!this.observer) {
                this.observer = new MutationObserver(() => this.debouncedPrune());
                this.observer.observe(document.documentElement, { childList: true, subtree: true });
            }

            if (this.listenersCleanup.length === 0) {
                this.listenersCleanup.push(
                    Utils.safeAddEventListener(document, 'yt-navigate-finish', () => this.debouncedPrune()),
                    Utils.safeAddEventListener(document, 'yt-page-data-updated', () => this.debouncedPrune()),
                    Utils.safeAddEventListener(window, 'popstate', () => this.debouncedPrune())
                );
            }
        },

        stop() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            this.listenersCleanup.forEach((cleanup) => cleanup());
            this.listenersCleanup = [];
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
                const previousDisplay = element.dataset.ytEnhancerPrevDisplay || '';
                if (previousDisplay) element.style.display = previousDisplay;
                else element.style.removeProperty('display');
                delete element.dataset.ytEnhancerPrevDisplay;
            }
            this.hiddenElements.clear();
        },

        prune() {
            const elementsToHide = new Set();

            document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]').forEach((node) => {
                elementsToHide.add(node);
                const section = node.closest('ytd-rich-section-renderer');
                if (section) elementsToHide.add(section);
            });

            document.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]').forEach((marker) => {
                const card = marker.closest(
                    'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-item-section-renderer'
                );
                if (card) elementsToHide.add(card);
            });

            document.querySelectorAll('a[href^="/shorts"], a[href*="/shorts/"], a[title="Shorts"], [aria-label="Shorts"]').forEach((link) => {
                const entry = link.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-compact-link-renderer, tp-yt-paper-item');
                if (entry) elementsToHide.add(entry);
            });

            document.querySelectorAll('ytd-reel-item-renderer, ytd-rich-item-renderer:has(a[href^="/shorts/"])').forEach((item) => {
                elementsToHide.add(item);
            });

            elementsToHide.forEach((element) => this.markHidden(element));
        },

        cleanup() {
            this.stop();
        }
    };

    // =======================================================
    // 4. SMART CPU TAMER CORRIGIDO (COM CONTEXTO SAFE & SOFT-THROTTLE)
    // =======================================================
    const SmartCpuTamer = {
        initialized: false,
        originals: {
            setInterval: null,
            setTimeout: null,
            requestAnimationFrame: null,
            cancelAnimationFrame: null
        },
        state: {
            hidden: false,
            playing: false,
            throttlingLevel: 0 
        },
        handlers: {
            visibility: null,
            play: null,
            pause: null,
            ended: null
        },
        mainMediaElement: null,
        mediaStatePoller: null,
        rafFallbackTimers: new Map(),
        rafFallbackId: 0,
        gracePeriodTimer: null,
        GRACE_PERIOD_MS: 30000, 
        
        init() {
            if (this.initialized) return;
            
            this.originals.setInterval = targetWindow.setInterval;
            this.originals.setTimeout = targetWindow.setTimeout;
            this.originals.requestAnimationFrame = targetWindow.requestAnimationFrame;
            this.originals.cancelAnimationFrame = targetWindow.cancelAnimationFrame;

            this.bindEvents();
            this.overrideTimers();
            this.initialized = true;
            log('Smart CPU Tamer v2.2 Ativado (Context Safe + Soft Throttle)');
            this.updateState();
        },

        cleanup() {
            if (!this.initialized) return;
            targetWindow.setInterval = this.originals.setInterval;
            targetWindow.setTimeout = this.originals.setTimeout;
            targetWindow.requestAnimationFrame = this.originals.requestAnimationFrame;
            targetWindow.cancelAnimationFrame = this.originals.cancelAnimationFrame;
            
            if (this.handlers.visibility) document.removeEventListener('visibilitychange', this.handlers.visibility);
            if (this.handlers.play) document.removeEventListener('play', this.handlers.play, true);
            if (this.handlers.pause) document.removeEventListener('pause', this.handlers.pause, true);
            if (this.handlers.ended) document.removeEventListener('ended', this.handlers.ended, true);
            this.handlers = { visibility: null, play: null, pause: null, ended: null };

            if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
            this.gracePeriodTimer = null;

            this.rafFallbackTimers.forEach((timeoutId) => clearTimeout(timeoutId));
            this.rafFallbackTimers.clear();

            if (this.mediaStatePoller) clearInterval(this.mediaStatePoller);
            this.mediaStatePoller = null;
            this.mainMediaElement = null;

            this.initialized = false;
        },

        resolveMainMediaElement(force = false) {
            const currentMainMedia = this.mainMediaElement;
            if (!force && currentMainMedia && currentMainMedia.isConnected) {
                return currentMainMedia;
            }

            const mainMedia = Utils.DOMCache.get('#movie_player video.html5-main-video', true) ||
                              Utils.DOMCache.get('.html5-video-player video.html5-main-video', true) ||
                              Utils.DOMCache.get('#movie_player video', true);

            this.mainMediaElement = mainMedia || null;
            return this.mainMediaElement;
        },

        isMainPlayerMediaEventTarget(target) {
            if (!(target instanceof HTMLMediaElement)) return false;
            if (!target.isConnected) return false;

            const mainMedia = this.resolveMainMediaElement();
            if (!mainMedia) return false;

            return target === mainMedia;
        },

        refreshPlayingFromMainMedia() {
            const mainMedia = this.resolveMainMediaElement(true);
            this.state.playing = !!(mainMedia && !mainMedia.paused && !mainMedia.ended && mainMedia.readyState > 2);
        },

        bindEvents() {
            this.handlers.visibility = () => {
                if (document.visibilityState === 'hidden') {
                    this.state.hidden = true;
                    if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
                    this.gracePeriodTimer = setTimeout(() => {
                        this.gracePeriodTimer = null;
                        log('Grace Period terminou. Ativando otimização.');
                        this.updateState(true); 
                    }, this.GRACE_PERIOD_MS);
                } else {
                    this.state.hidden = false;
                    if (this.gracePeriodTimer) clearTimeout(this.gracePeriodTimer);
                    this.gracePeriodTimer = null;
                    this.updateState();
                }
            };
            document.addEventListener('visibilitychange', this.handlers.visibility);

            this.handlers.play = (event) => {
                if (!this.isMainPlayerMediaEventTarget(event.target)) return;
                this.state.playing = true;
                this.updateState();
            };
            this.handlers.pause = (event) => {
                if (!this.isMainPlayerMediaEventTarget(event.target)) return;
                this.state.playing = false;
                this.updateState();
            };
            this.handlers.ended = (event) => {
                if (!this.isMainPlayerMediaEventTarget(event.target)) return;
                this.state.playing = false;
                this.updateState();
            };
            document.addEventListener('play', this.handlers.play, true);
            document.addEventListener('pause', this.handlers.pause, true);
            document.addEventListener('ended', this.handlers.ended, true);

            this.mediaStatePoller = setInterval(() => {
                const wasPlaying = this.state.playing;
                this.refreshPlayingFromMainMedia();
                if (wasPlaying !== this.state.playing) this.updateState();
            }, 1500);

            this.state.hidden = document.visibilityState === 'hidden';
            this.refreshPlayingFromMainMedia();
        },

        updateState(forceOptimization = false) {
            this.refreshPlayingFromMainMedia();

            const isGracePeriodActive = this.state.hidden && !forceOptimization && this.gracePeriodTimer;

            if (!this.state.hidden || isGracePeriodActive) {
                this.state.throttlingLevel = 0; 
            } else if (this.state.playing) {
                this.state.throttlingLevel = 1; 
            } else {
                this.state.throttlingLevel = 2; 
            }
        },

        overrideTimers() {
            const self = this;
            const normalizeDelay = (delay) => {
                const parsedDelay = Number(delay);
                return Number.isFinite(parsedDelay) ? parsedDelay : 0;
            };

            // CORREÇÃO: Uso de .apply(targetWindow) para manter contexto
            targetWindow.setInterval = function(callback, delay, ...args) {
                const parsedDelay = normalizeDelay(delay);
                let actualDelay = parsedDelay;
                if (self.state.throttlingLevel === 2) actualDelay = Math.max(parsedDelay, 5000); 
                else if (self.state.throttlingLevel === 1) actualDelay = Math.max(parsedDelay, 1000); 
                return self.originals.setInterval.apply(targetWindow, [callback, actualDelay, ...args]);
            };

            targetWindow.setTimeout = function(callback, delay, ...args) {
                const parsedDelay = normalizeDelay(delay);
                let actualDelay = parsedDelay;
                if (self.state.throttlingLevel === 2) actualDelay = Math.max(parsedDelay, 2000);
                else if (self.state.throttlingLevel === 1) actualDelay = Math.max(parsedDelay, 250); 
                return self.originals.setTimeout.apply(targetWindow, [callback, actualDelay, ...args]);
            };

            // CORREÇÃO: Lógica de FPS suave (Soft Throttle) + Timestamp fix
            targetWindow.requestAnimationFrame = function(callback) {
                if (self.state.throttlingLevel > 0) {
                    const fallbackId = ++self.rafFallbackId;
                    
                    // Nível 1 (Música): 30 FPS (33ms) para não travar UI/Legendas
                    // Nível 2 (Hibernação): 1 FPS (1000ms)
                    const throttleDelay = self.state.throttlingLevel === 1 ? 33 : 1000;

                    const timeoutId = self.originals.setTimeout.call(targetWindow, () => {
                        self.rafFallbackTimers.delete(fallbackId);
                        callback(performance.now());
                    }, throttleDelay); 
                    
                    self.rafFallbackTimers.set(fallbackId, timeoutId);
                    return fallbackId;
                }
                return self.originals.requestAnimationFrame.call(targetWindow, callback);
            };

            targetWindow.cancelAnimationFrame = function(id) {
                if (self.rafFallbackTimers.has(id)) {
                    const timeoutId = self.rafFallbackTimers.get(id);
                    self.rafFallbackTimers.delete(id);
                    return clearTimeout(timeoutId);
                }
                if (typeof self.originals.cancelAnimationFrame === 'function') {
                    return self.originals.cancelAnimationFrame.call(targetWindow, id);
                }
                return clearTimeout(id);
            };
        }
    };

    // =======================================================
    // 5. CLOCK MANAGER
    // =======================================================
    const ClockManager = {
        clockElement: null,
        interval: null,
        config: null,
        observer: null,
        playerElement: null,
        fullscreenHandler: null,
        navigationHandler: null,
        
        init(config) {
            this.config = config;
            this.resolvePlayerElement(true);
            this.createClock();
            EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            this.fullscreenHandler = () => this.handleFullscreen();
            this.navigationHandler = () => {
                this.resolvePlayerElement(true);
                this.handleFullscreen();
            };
            document.addEventListener('fullscreenchange', this.fullscreenHandler);
            document.addEventListener('yt-navigate-finish', this.navigationHandler);
            this.interval = setInterval(() => this.handleFullscreen(), 2000);
            log('Clock Manager inicializado');
        },

        resolvePlayerElement(force = false) {
            const currentPlayer = this.playerElement;
            if (!force && currentPlayer && currentPlayer.isConnected) {
                return currentPlayer;
            }

            const resolvedPlayer = Utils.DOMCache.get('#movie_player', true) ||
                                   Utils.DOMCache.get('.html5-video-player', true);

            if (resolvedPlayer !== currentPlayer) {
                if (this.observer) {
                    this.observer.disconnect();
                    this.observer = null;
                }
                this.playerElement = resolvedPlayer || null;
                if (this.playerElement) {
                    this.setupObserver();
                }
            } else if (!resolvedPlayer) {
                this.playerElement = null;
            }

            return this.playerElement;
        },
        
        updateConfig(newConfig) {
            this.config = newConfig;
            this.updateStyle();
            this.adjustPosition();
        },
        
        createClock() {
            if (document.getElementById('yt-enhancer-clock')) return;
            const clock = document.createElement('div');
            clock.id = 'yt-enhancer-clock';
            clock.style.cssText = `
                position: fixed; pointer-events: none; z-index: 2147483647;
                font-family: "Roboto", sans-serif; font-weight: 400; padding: 6px 14px;
                text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: none; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                transition: bottom 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s;
            `;
            document.body.appendChild(clock);
            this.clockElement = clock;
            this.updateStyle();
        },
        
        setupObserver() {
            if (!this.playerElement) return;
            if (this.observer) this.observer.disconnect();
            this.observer = new MutationObserver(
                Utils.debounce(() => this.adjustPosition(), 150)
            );
            this.observer.observe(this.playerElement, { attributes: true, attributeFilter: ['class'] });
        },
        
        adjustPosition() {
            if (!this.clockElement) return;
            if (!this.playerElement || !this.playerElement.isConnected) {
                this.resolvePlayerElement(true);
            }
            if (!this.playerElement) return;
            try {
                const isFullscreen = document.fullscreenElement != null;
                const areControlsVisible = !this.playerElement.classList.contains('ytp-autohide');
                const baseMargin = this.config.CLOCK_STYLE.margin;
                const finalBottom = (isFullscreen && areControlsVisible) ? baseMargin + 110 : baseMargin;
                this.clockElement.style.bottom = `${finalBottom}px`;
            } catch (e) { console.error(e); }
        },
        
        updateStyle() {
            if (!this.clockElement) return;
            const s = this.config.CLOCK_STYLE;
            const hexToRgb = (hex) => {
                const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return res ? `${parseInt(res[1],16)},${parseInt(res[2],16)},${parseInt(res[3],16)}` : '0,0,0';
            };
            this.clockElement.style.backgroundColor = `rgba(${hexToRgb(s.bgColor)}, ${s.bgOpacity})`;
            this.clockElement.style.color = s.color;
            this.clockElement.style.fontSize = `${s.fontSize}px`;
            this.clockElement.style.right = `15px`;
            this.clockElement.style.borderRadius = `${s.borderRadius}px`;
            this.adjustPosition();
        },
        
        updateTime() {
            if (!this.clockElement) return;
            const now = new Date();
            this.clockElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
        
        handleFullscreen() {
            if (!this.config.FEATURES.FULLSCREEN_CLOCK) {
                if (this.clockElement) this.clockElement.style.display = 'none';
                return;
            }

            if (!this.playerElement || !this.playerElement.isConnected) {
                this.resolvePlayerElement(true);
            }

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
            this.observer = null;
            this.playerElement = null;
            this.fullscreenHandler = null;
            this.navigationHandler = null;
        }
    };

    // =======================================================
    // MAIN
    // =======================================================
    function init() {
        try {
            // CORREÇÃO: Limpeza preventiva de cache ao navegar (SPA)
            Utils.safeAddEventListener(document, 'yt-navigate-start', () => {
                Utils.DOMCache.refresh();
            });

            Utils.safeAddEventListener(document, 'yt-page-data-updated', () => {
                Utils.DOMCache.refresh();
            });

            // Configuração inicial para carregar os módulos
            const config = ConfigManager.load();
            if (config.FEATURES.CPU_TAMER) SmartCpuTamer.init();
            
            const isTopFrame = window.top === window.self;
            if (isTopFrame) {
                GM_registerMenuCommand(t('menu.openSettings', config.LANGUAGE), () => {
                    const currentConfig = ConfigManager.load();
                    UIManager.createSettingsModal(currentConfig, (newConfig) => ConfigManager.save(newConfig));
                });
            }
            
            StyleManager.init();
            ShortsManager.init(config);
            ClockManager.init(config);
            StyleManager.apply(config);
            
            EventBus.on('configChanged', (newConfig) => {
                if (newConfig.FEATURES.CPU_TAMER && !SmartCpuTamer.initialized) SmartCpuTamer.init();
                else if (!newConfig.FEATURES.CPU_TAMER && SmartCpuTamer.initialized) SmartCpuTamer.cleanup();
            });
            
            log(`v${ConfigManager.CONFIG_VERSION} Carregado com Smart CPU Tamer v2.2`);
            
            Utils.safeAddEventListener(window, 'beforeunload', () => {
                SmartCpuTamer.cleanup();
                ClockManager.cleanup();
                ShortsManager.cleanup();
                Utils.DOMCache.refresh();
            });
            
        } catch (error) {
            console.error('Falha na inicialização:', error);
        }
    }

    if (document.readyState === 'loading') {
        Utils.safeAddEventListener(document, 'DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

})();
