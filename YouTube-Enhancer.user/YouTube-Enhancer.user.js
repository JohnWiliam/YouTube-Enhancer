// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      1.1.0
// @description  Reduz uso de CPU (Smart Mode), personaliza layout, remove Shorts e adiciona relógio customizável.
// @author       John Wiliam & IA
// @match        *://www.youtube.com/*
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

    const FLAG = "__yt_enhancer_v1_1_0__";
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

        DOMCache: {
            cache: new Map(),
            observers: new Map(),
            
            get(selector, forceUpdate = false) {
                if (forceUpdate || !this.cache.has(selector)) {
                    const element = document.querySelector(selector);
                    this.cache.set(selector, element);
                    return element;
                }
                return this.cache.get(selector);
            },
            
            refresh(selector = null) {
                if (selector) {
                    this.cache.delete(selector);
                } else {
                    this.cache.clear();
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

        migrateConfig(savedConfig, currentVersion = '1.1.0') {
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
    // 1. CONFIG MANAGER
    // =======================================================
    const ConfigManager = {
        CONFIG_VERSION: '1.1.0',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        
        defaults: {
            version: '1.1.0',
            VIDEOS_PER_ROW: 5,
            FEATURES: {
                CPU_TAMER: true,
                LAYOUT_ENHANCEMENT: true,
                SHORTS_REMOVAL: true,
                FULLSCREEN_CLOCK: true
            },
            CLOCK_STYLE: {
                color: '#ffffff',
                bgColor: '#000000',
                bgOpacity: 0.4,
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
                    return { ...this.defaults };
                }
                
                const config = { ...this.defaults, ...migratedConfig };
                config.FEATURES = { ...this.defaults.FEATURES, ...(migratedConfig.FEATURES || {}) };
                config.CLOCK_STYLE = { ...this.defaults.CLOCK_STYLE, ...(migratedConfig.CLOCK_STYLE || {}) };
                config.VIDEOS_PER_ROW = Math.max(3, Math.min(8, config.VIDEOS_PER_ROW));
                
                return config;
            } catch (error) {
                log('Erro ao carregar configuração: ' + error);
                return { ...this.defaults };
            }
        },

        save: function(config) {
            try {
                config.version = this.CONFIG_VERSION;
                GM_setValue(this.STORAGE_KEY, config);
                EventBus.emit('configChanged', config);
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
        
        createSettingsModal: function(currentConfig, onSave) {
            this.cleanupFunctions.forEach(fn => fn());
            this.cleanupFunctions = [];
            
            const oldModal = document.getElementById('yt-enhancer-settings-modal');
            const oldOverlay = document.getElementById('yt-enhancer-overlay');
            if (oldModal) oldModal.remove();
            if (oldOverlay) oldOverlay.remove();

            const overlay = document.createElement('div');
            overlay.id = 'yt-enhancer-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); z-index: 9998; backdrop-filter: blur(4px);
            `;

            const modalHTML = `
                <div id="yt-enhancer-settings-modal" class="yt-enhancer-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">⚙️ Configurações</h2>
                        <button id="yt-enhancer-close" class="close-btn" title="Fechar">×</button>
                    </div>

                    <div class="tabs-nav">
                        <button class="tab-btn active" data-target="tab-features">🔧 Funcionalidades</button>
                        <button class="tab-btn" data-target="tab-appearance">🎨 Aparência do relógio</button>
                    </div>

                    <div class="modal-content">
                        <div id="tab-features" class="tab-pane active">
                            <div class="options-list">
                                <label class="feature-toggle">
                                    <div class="toggle-text">
                                        <strong>Redução Inteligente de CPU</strong>
                                        <span>Otimiza quando oculto (economiza bateria)</span>
                                    </div>
                                    <div class="toggle-switch">
                                        <input type="checkbox" id="cfg-cpu-tamer" ${currentConfig.FEATURES.CPU_TAMER ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </div>
                                </label>

                                <label class="feature-toggle">
                                    <div class="toggle-text">
                                        <strong>Layout Grid</strong>
                                        <span>Ajusta vídeos por linha</span>
                                    </div>
                                    <div class="toggle-switch">
                                        <input type="checkbox" id="cfg-layout" ${currentConfig.FEATURES.LAYOUT_ENHANCEMENT ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </div>
                                </label>

                                <div id="layout-settings" class="sub-option" style="${!currentConfig.FEATURES.LAYOUT_ENHANCEMENT ? 'display:none' : ''}">
                                    <label>Vídeos por linha:</label>
                                    <input type="number" id="cfg-videos-row" min="3" max="8" value="${currentConfig.VIDEOS_PER_ROW}" class="styled-input-small">
                                </div>

                                <label class="feature-toggle">
                                    <div class="toggle-text">
                                        <strong>Remover Shorts</strong>
                                        <span>Limpa Shorts da interface</span>
                                    </div>
                                    <div class="toggle-switch">
                                        <input type="checkbox" id="cfg-shorts" ${currentConfig.FEATURES.SHORTS_REMOVAL ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </div>
                                </label>

                                <label class="feature-toggle">
                                    <div class="toggle-text">
                                        <strong>Relógio Flutuante</strong>
                                        <span>Mostra hora sobre o vídeo</span>
                                    </div>
                                    <div class="toggle-switch">
                                        <input type="checkbox" id="cfg-clock-enable" ${currentConfig.FEATURES.FULLSCREEN_CLOCK ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div id="tab-appearance" class="tab-pane">
                            <div class="appearance-grid">
                                <div class="control-group">
                                    <label>Cor do Texto</label>
                                    <div class="color-input-wrapper">
                                        <input type="color" id="style-color" value="${currentConfig.CLOCK_STYLE.color}">
                                        <span class="color-value">${currentConfig.CLOCK_STYLE.color}</span>
                                    </div>
                                </div>
                                <div class="control-group">
                                    <label>Cor do Fundo</label>
                                    <div class="color-input-wrapper">
                                        <input type="color" id="style-bg-color" value="${currentConfig.CLOCK_STYLE.bgColor}">
                                        <span class="color-value">${currentConfig.CLOCK_STYLE.bgColor}</span>
                                    </div>
                                </div>
                                <div class="control-group">
                                    <label>Opacidade Fundo</label>
                                    <input type="number" id="style-bg-opacity" min="0" max="1" step="0.1" value="${currentConfig.CLOCK_STYLE.bgOpacity}" class="styled-input">
                                </div>
                                <div class="control-group">
                                    <label>Tamanho Fonte (px)</label>
                                    <input type="number" id="style-font-size" min="12" max="100" value="${currentConfig.CLOCK_STYLE.fontSize}" class="styled-input">
                                </div>
                                <div class="control-group">
                                    <label>Margem (px)</label>
                                    <input type="number" id="style-margin" min="0" max="200" value="${currentConfig.CLOCK_STYLE.margin}" class="styled-input">
                                </div>
                                <div class="control-group">
                                    <label>Arredondamento (px)</label>
                                    <input type="number" id="style-border-radius" min="0" max="50" value="${currentConfig.CLOCK_STYLE.borderRadius || 12}" class="styled-input">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button id="yt-enhancer-apply" class="btn btn-primary">Aplicar</button>
                        <button id="yt-enhancer-reload" class="btn btn-primary" style="display: none;">Aplicar e Recarregar</button>
                    </div>
                </div>

                <style>
                    .yt-enhancer-modal {
                        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        width: 420px; max-height: 80vh;
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
                    .toggle-text strong { display: block; font-size: 14px; margin-bottom: 2px; }
                    .toggle-text span { font-size: 12px; color: #aaa; }
                    .toggle-switch { position: relative; width: 40px; height: 22px; }
                    .toggle-switch input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #555; border-radius: 22px; transition: .3s; }
                    .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: .3s; }
                    input:checked + .slider { background-color: #3ea6ff; }
                    input:checked + .slider:before { transform: translateX(18px); }
                    .sub-option { margin: -5px 0 10px 10px; padding: 10px; border-left: 2px solid #333; display: flex; align-items: center; gap: 10px; color: #ccc; }
                    .appearance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .control-group { display: flex; flex-direction: column; gap: 8px; }
                    .styled-input, .styled-select { background: #1a1a1a; border: 1px solid #333; color: white; padding: 10px; border-radius: 6px; width: 100%; box-sizing: border-box; }
                    .styled-input-small { width: 60px; padding: 5px; background: #222; border: 1px solid #444; color: white; border-radius: 4px; text-align: center; }
                    .color-input-wrapper { display: flex; align-items: center; gap: 10px; background: #1a1a1a; padding: 5px; border: 1px solid #333; border-radius: 6px; }
                    input[type="color"] { border: none; width: 30px; height: 30px; padding: 0; background: none; cursor: pointer; }
                    .modal-footer { padding: 15px 20px; border-top: 1px solid #333; display: flex; justify-content: flex-end; gap: 10px; }
                    .btn { padding: 8px 20px; border: none; border-radius: 18px; cursor: pointer; font-weight: 500; }
                    .btn-primary { background: #3ea6ff; color: #000; }
                    .btn-primary:hover { opacity: 0.9; }
                </style>
            `;

            document.body.appendChild(overlay);
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            const closeModal = () => {
                const modal = document.getElementById('yt-enhancer-settings-modal');
                const overlay = document.getElementById('yt-enhancer-overlay');
                if (modal) modal.remove();
                if (overlay) overlay.remove();
                this.cleanupFunctions.forEach(fn => fn());
                this.cleanupFunctions = [];
            };

            this.cleanupFunctions.push(Utils.safeAddEventListener(overlay, 'click', closeModal));
            this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById('yt-enhancer-close'), 'click', closeModal));

            // Logic for tabs and inputs remains mostly the same, ensuring UI works
            document.querySelectorAll('.tab-btn').forEach(btn => {
                this.cleanupFunctions.push(Utils.safeAddEventListener(btn, 'click', () => {
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.target).classList.add('active');
                }));
            });

            const layoutToggle = document.getElementById('cfg-layout');
            this.cleanupFunctions.push(Utils.safeAddEventListener(layoutToggle, 'change', (e) => {
                document.getElementById('layout-settings').style.display = e.target.checked ? 'flex' : 'none';
            }));

            ['style-color', 'style-bg-color'].forEach(id => {
                this.cleanupFunctions.push(Utils.safeAddEventListener(document.getElementById(id), 'input', (e) => {
                    e.target.nextElementSibling.textContent = e.target.value;
                }));
            });

            const getNewConfig = () => {
                return {
                    VIDEOS_PER_ROW: parseInt(document.getElementById('cfg-videos-row').value) || 5,
                    FEATURES: {
                        CPU_TAMER: document.getElementById('cfg-cpu-tamer').checked,
                        LAYOUT_ENHANCEMENT: document.getElementById('cfg-layout').checked,
                        SHORTS_REMOVAL: document.getElementById('cfg-shorts').checked,
                        FULLSCREEN_CLOCK: document.getElementById('cfg-clock-enable').checked
                    },
                    CLOCK_STYLE: {
                        color: document.getElementById('style-color').value,
                        bgColor: document.getElementById('style-bg-color').value,
                        bgOpacity: parseFloat(document.getElementById('style-bg-opacity').value),
                        fontSize: parseInt(document.getElementById('style-font-size').value),
                        margin: parseInt(document.getElementById('style-margin').value),
                        borderRadius: parseInt(document.getElementById('style-border-radius').value),
                        position: 'bottom-right'
                    }
                };
            };

            const btnApply = document.getElementById('yt-enhancer-apply');
            const btnReload = document.getElementById('yt-enhancer-reload');
            const cpuToggle = document.getElementById('cfg-cpu-tamer');
            const initialCpuState = currentConfig.FEATURES.CPU_TAMER;

            this.cleanupFunctions.push(Utils.safeAddEventListener(cpuToggle, 'change', () => {
                const changed = cpuToggle.checked !== initialCpuState;
                btnApply.style.display = changed ? 'none' : 'block';
                btnReload.style.display = changed ? 'block' : 'none';
            }));

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
            const old = document.getElementById(this.styleId);
            if (old) old.remove();

            if (!config.FEATURES.LAYOUT_ENHANCEMENT && !config.FEATURES.SHORTS_REMOVAL) return;

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
                    ytd-guide-entry-renderer:has(a[title="Shorts"]),
                    ytd-mini-guide-entry-renderer[aria-label="Shorts"] { 
                        display: none !important; 
                    }
                `;
            }

            const style = document.createElement('style');
            style.id = this.styleId;
            style.textContent = css;
            document.head.appendChild(style);
        }
    };

    // =======================================================
    // 4. SMART CPU TAMER (REDUÇÃO INTELIGENTE DE CPU V2.0)
    // =======================================================
    const SmartCpuTamer = {
        initialized: false,
        originals: {
            setInterval: null,
            setTimeout: null,
            requestAnimationFrame: null
        },
        state: {
            hidden: false,
            playing: false,
            throttlingLevel: 0 // 0: None, 1: Lite (Play), 2: Heavy (Idle)
        },
        
        init() {
            if (this.initialized) return;
            
            this.originals.setInterval = targetWindow.setInterval;
            this.originals.setTimeout = targetWindow.setTimeout;
            this.originals.requestAnimationFrame = targetWindow.requestAnimationFrame;

            this.bindEvents();
            this.overrideTimers();
            this.initialized = true;
            log('Smart CPU Tamer v2.0 ativado (Estado + rAF Control)');
            this.updateState();
        },

        cleanup() {
            if (!this.initialized) return;
            // Restaura funções originais
            targetWindow.setInterval = this.originals.setInterval;
            targetWindow.setTimeout = this.originals.setTimeout;
            targetWindow.requestAnimationFrame = this.originals.requestAnimationFrame;
            
            // Limpa listeners
            document.removeEventListener('visibilitychange', this.handleVisibility);
            this.initialized = false;
        },

        bindEvents() {
            this.handleVisibility = () => this.updateState();
            document.addEventListener('visibilitychange', this.handleVisibility);

            // Detecta Play/Pause globalmente (Capturing phase)
            document.addEventListener('play', () => { this.state.playing = true; this.updateState(); }, true);
            document.addEventListener('pause', () => { this.state.playing = false; this.updateState(); }, true);
            document.addEventListener('ended', () => { this.state.playing = false; this.updateState(); }, true);
        },

        updateState() {
            this.state.hidden = document.visibilityState === 'hidden';
            
            // Lógica da Máquina de Estados
            if (!this.state.hidden) {
                this.state.throttlingLevel = 0; // Focado: Performance Máxima
            } else if (this.state.playing) {
                this.state.throttlingLevel = 1; // Fundo + Áudio: Redução Segura (Bloqueia visual, mantém áudio)
            } else {
                this.state.throttlingLevel = 2; // Fundo + Ocioso: Redução Agressiva (Hibernação)
            }

            // Debug para verificar transição de estado (opcional)
            // log(`Estado CPU: Nível ${this.state.throttlingLevel} (Hidden: ${this.state.hidden}, Playing: ${this.state.playing})`);
        },

        overrideTimers() {
            const self = this;

            // 1. Hook setInterval
            targetWindow.setInterval = function(callback, delay, ...args) {
                let actualDelay = delay;
                
                if (self.state.throttlingLevel === 2) {
                    // Nível 2 (Hibernação): Força mínimo de 10 segundos
                    actualDelay = Math.max(delay, 10000); 
                } else if (self.state.throttlingLevel === 1) {
                    // Nível 1 (Background Play): Força mínimo de 1 segundo (evita micro-updates de UI, mas ok para chunks de rede lentos)
                    actualDelay = Math.max(delay, 1000); 
                }
                
                return self.originals.setInterval.call(this, callback, actualDelay, ...args);
            };

            // 2. Hook setTimeout
            targetWindow.setTimeout = function(callback, delay, ...args) {
                let actualDelay = delay;
                
                if (self.state.throttlingLevel === 2) {
                    actualDelay = Math.max(delay, 10000);
                } else if (self.state.throttlingLevel === 1) {
                    // Mais suave no setTimeout para não quebrar carregamento de buffer
                    actualDelay = Math.max(delay, 250); 
                }

                return self.originals.setTimeout.call(this, callback, actualDelay, ...args);
            };

            // 3. Hook requestAnimationFrame (O Grande Vilão de CPU do YouTube)
            targetWindow.requestAnimationFrame = function(callback) {
                // Se estiver oculto (Nível 1 ou 2), simplesmente não executa o callback visual.
                // Isso economiza MUITA GPU e CPU pois o YouTube tenta renderizar a barra de progresso mesmo oculto.
                if (self.state.throttlingLevel > 0) {
                    // Retorna um ID falso, mas não agenda a execução.
                    // Nota: Algumas apps podem depender do callback para lógica.
                    // Para segurança, executamos em baixa frequência (1fps) em vez de matar totalmente.
                    return self.originals.setTimeout.call(this, () => {
                        // Opcional: callback(performance.now());
                        // Mas para economia máxima, dropamos o frame.
                    }, 1000); 
                }

                return self.originals.requestAnimationFrame.call(this, callback);
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
        
        init(config) {
            this.config = config;
            this.playerElement = Utils.DOMCache.get('#movie_player') || 
                                Utils.DOMCache.get('.html5-video-player');
            
            this.createClock();
            this.setupObserver();
            EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            
            // Usamos listeners nativos para não depender do loop principal se ele for throttled
            document.addEventListener('fullscreenchange', () => this.handleFullscreen());
            
            // Verifica estado periodicamente
            // Usamos setInterval do window "seguro" (não o throttled) se possível, 
            // mas como rodamos no sandbox do script, o setInterval aqui é nativo do browser para o script.
            this.interval = setInterval(() => this.handleFullscreen(), 2000);
            
            log('Clock Manager inicializado');
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
            this.observer = new MutationObserver(
                Utils.debounce(() => this.adjustPosition(), 150)
            );
            this.observer.observe(this.playerElement, { attributes: true, attributeFilter: ['class'] });
        },
        
        adjustPosition() {
            if (!this.clockElement || !this.playerElement) return;
            try {
                const isFullscreen = document.fullscreenElement != null;
                const areControlsVisible = !this.playerElement.classList.contains('ytp-autohide');
                const baseMargin = this.config.CLOCK_STYLE.margin;
                // Ajusta se os controles estiverem visíveis para não sobrepor
                const finalBottom = (isFullscreen && areControlsVisible) ? baseMargin + 100 : baseMargin;
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
            this.clockElement.style.right = `${s.margin}px`;
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
        }
    };

    // =======================================================
    // MAIN
    // =======================================================
    function init() {
        try {
            const config = ConfigManager.load();
            
            // Inicializa módulos baseado na config
            if (config.FEATURES.CPU_TAMER) {
                SmartCpuTamer.init();
            }
            
            GM_registerMenuCommand('⚙️ Configurações', () => {
                UIManager.createSettingsModal(config, (newConfig) => {
                    ConfigManager.save(newConfig);
                });
            });
            
            StyleManager.init();
            ClockManager.init(config);
            StyleManager.apply(config);
            
            // Reage a mudanças de configuração em tempo real
            EventBus.on('configChanged', (newConfig) => {
                if (newConfig.FEATURES.CPU_TAMER && !SmartCpuTamer.initialized) {
                    SmartCpuTamer.init();
                } else if (!newConfig.FEATURES.CPU_TAMER && SmartCpuTamer.initialized) {
                    SmartCpuTamer.cleanup();
                }
            });
            
            log(`v${ConfigManager.CONFIG_VERSION} Carregado com Smart CPU Tamer`);
            
            Utils.safeAddEventListener(window, 'beforeunload', () => {
                SmartCpuTamer.cleanup();
                ClockManager.cleanup();
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
