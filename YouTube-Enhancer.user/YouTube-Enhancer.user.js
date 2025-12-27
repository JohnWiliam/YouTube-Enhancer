// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      1.0.2
// @description  Reduz uso de CPU, personaliza layout, remove Shorts e adiciona relógio customizável com interface refinada.
// @author       John Wiliam & IA
// @licence      MIT
// @match        *://www.youtube.com/*
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

    const FLAG = "__yt_enhancer_v1_0_2__";
    if (window[FLAG]) return;
    window[FLAG] = true;

    const log = (msg) => console.log(`[YT Enhancer] ${msg}`);

    // =======================================================
    // EVENT BUS SYSTEM - ALTA PRIORIDADE 1
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
        // DEBOUNCE - ALTA PRIORIDADE 2
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

        // CACHE DE DOM - ALTA PRIORIDADE 3
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
            
            getAll(selector, forceUpdate = false) {
                if (forceUpdate || !this.cache.has(`all:${selector}`)) {
                    const elements = document.querySelectorAll(selector);
                    this.cache.set(`all:${selector}`, elements);
                    return elements;
                }
                return this.cache.get(`all:${selector}`);
            },
            
            refresh(selector = null) {
                if (selector) {
                    this.cache.delete(selector);
                    this.cache.delete(`all:${selector}`);
                } else {
                    this.cache.clear();
                }
            },
            
            observe(selector, callback, options = {}) {
                const observer = new MutationObserver(
                    Utils.debounce(callback, 100)
                );
                const element = this.get(selector);
                if (element) {
                    observer.observe(element, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        ...options
                    });
                    this.observers.set(selector, observer);
                }
                return observer;
            },
            
            disconnect(selector) {
                if (this.observers.has(selector)) {
                    this.observers.get(selector).disconnect();
                    this.observers.delete(selector);
                }
            }
        },

        // TRATAMENTO SEGURO DE EVENT LISTENERS - CRÍTICO 2
        safeAddEventListener(element, event, handler, options = {}) {
            if (!element) {
                log(`Element not found for event: ${event}`);
                return () => {};
            }
            
            const safeHandler = (e) => {
                try {
                    return handler(e);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                    return null;
                }
            };
            
            element.addEventListener(event, safeHandler, options);
            
            // Retorna função de cleanup
            return () => element.removeEventListener(event, safeHandler, options);
        },

        // MIGRAÇÃO DE CONFIGURAÇÕES - CRÍTICO 3
        migrateConfig(savedConfig, currentVersion = '1.0.2') {
            if (!savedConfig || typeof savedConfig !== 'object') {
                return null;
            }

            // Se não tem versão, é da versão inicial
            if (!savedConfig.version) {
                savedConfig.version = '1.0.0';
                // Adicionar propriedades que podem estar faltando
                if (!savedConfig.CLOCK_STYLE?.borderRadius) {
                    savedConfig.CLOCK_STYLE = {
                        ...savedConfig.CLOCK_STYLE,
                        borderRadius: 12
                    };
                }
            }

            // Aqui podemos adicionar mais lógicas de migração
            // Exemplo: se savedConfig.version === '1.0.0' e currentVersion === '1.0.1'
            // if (savedConfig.version === '1.0.0') {
            //     // Migrar de 1.0.0 para 1.0.1
            //     savedConfig.newProperty = 'default';
            //     savedConfig.version = '1.0.1';
            // }


            return savedConfig;
        }
    };

    // =======================================================
    // 1. CONFIG MANAGER (COM MIGRAÇÃO)
    // =======================================================
    const ConfigManager = {
        CONFIG_VERSION: '1.0.2',
        STORAGE_KEY: 'YT_ENHANCER_CONFIG',
        
        defaults: {
            version: '1.0.2',
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
                
                // Aplicar migração se necessário
                const migratedConfig = Utils.migrateConfig(saved, this.CONFIG_VERSION);
                
                if (!migratedConfig) {
                    log('Usando configurações padrão');
                    return { ...this.defaults };
                }
                
                // Mesclar com defaults garantindo novas propriedades
                const config = { ...this.defaults, ...migratedConfig };
                config.FEATURES = { ...this.defaults.FEATURES, ...(migratedConfig.FEATURES || {}) };
                config.CLOCK_STYLE = { 
                    ...this.defaults.CLOCK_STYLE, 
                    ...(migratedConfig.CLOCK_STYLE || {}) 
                };
                
                // Validações
                config.VIDEOS_PER_ROW = Math.max(3, Math.min(8, config.VIDEOS_PER_ROW));
                config.CLOCK_STYLE.bgOpacity = Math.max(0, Math.min(1, config.CLOCK_STYLE.bgOpacity));
                config.CLOCK_STYLE.fontSize = Math.max(12, Math.min(100, config.CLOCK_STYLE.fontSize));
                config.CLOCK_STYLE.margin = Math.max(0, Math.min(200, config.CLOCK_STYLE.margin));
                config.CLOCK_STYLE.borderRadius = Math.max(0, Math.min(50, config.CLOCK_STYLE.borderRadius));
                
                return config;
            } catch (error) {
                log('Erro ao carregar configuração: ' + error);
                return { ...this.defaults };
            }
        },

        save: function(config) {
            try {
                // Garantir que tem a versão atual
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
    // 2. UI MANAGER (COM EVENT BUS)
    // =======================================================
    const UIManager = {
        cleanupFunctions: [],
        
        createSettingsModal: function(currentConfig, onSave) {
            // Limpar listeners anteriores
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
                                        <strong>Redução de CPU (V1.0)</strong>
                                        <span>Limita scripts em segundo plano</span>
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
                    /* Reset Geral */
                    .yt-enhancer-modal {
                        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        width: 420px; max-height: 80vh;
                        background: #121212; color: #f1f1f1;
                        border: 1px solid #333; border-radius: 12px;
                        box-shadow: 0 12px 24px rgba(0,0,0,0.5);
                        font-family: 'Roboto', Arial, sans-serif; font-size: 14px;
                        display: flex; flex-direction: column;
                        z-index: 10000;
                    }

                    /* REMOVE SPINNERS (SETAS) DOS INPUTS */
                    input::-webkit-outer-spin-button,
                    input::-webkit-inner-spin-button {
                      -webkit-appearance: none;
                      margin: 0;
                    }
                    input[type=number] {
                      -moz-appearance: textfield;
                    }

                    /* Header */
                    .modal-header {
                        position: relative; height: 50px; border-bottom: 1px solid #333;
                        display: flex; align-items: center; justify-content: flex-end;
                        padding: 0 15px;
                    }
                    .modal-title {
                        position: absolute; left: 50%; transform: translateX(-50%);
                        margin: 0; font-size: 16px; font-weight: 500; color: #fff;
                        white-space: nowrap; pointer-events: none;
                    }
                    .close-btn {
                        background: none; border: none; color: #aaa; font-size: 24px;
                        cursor: pointer; padding: 0 5px; line-height: 1; transition: color 0.2s;
                    }
                    .close-btn:hover { color: #fff; }

                    /* Tabs */
                    .tabs-nav { display: flex; background: #1a1a1a; border-bottom: 1px solid #333; }
                    .tab-btn {
                        flex: 1; padding: 12px; background: transparent; border: none;
                        color: #888; cursor: pointer; font-weight: 500; border-bottom: 2px solid transparent;
                        transition: all 0.2s;
                    }
                    .tab-btn:hover { color: #ccc; background: #222; }
                    .tab-btn.active { color: #3ea6ff; border-bottom-color: #3ea6ff; background: #1a1a1a; }

                    /* Content */
                    .modal-content { padding: 20px; overflow-y: auto; flex: 1; }
                    .tab-pane { display: none; }
                    .tab-pane.active { display: block; animation: fadeEffect 0.2s; }
                    @keyframes fadeEffect { from {opacity: 0;} to {opacity: 1;} }

                    /* List Styles */
                    .options-list { display: flex; flex-direction: column; gap: 15px; }
                    .feature-toggle {
                        display: flex; justify-content: space-between; align-items: center;
                        padding: 10px; background: #1e1e1e; border-radius: 8px; cursor: pointer;
                        border: 1px solid transparent; transition: background 0.2s;
                    }
                    .feature-toggle:hover { background: #252525; }
                    .toggle-text strong { display: block; font-size: 14px; margin-bottom: 2px; }
                    .toggle-text span { font-size: 12px; color: #aaa; }
                    
                    /* Switch */
                    .toggle-switch { position: relative; width: 40px; height: 22px; }
                    .toggle-switch input { opacity: 0; width: 0; height: 0; }
                    .slider {
                        position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                        background-color: #555; border-radius: 22px; transition: .3s;
                    }
                    .slider:before {
                        position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px;
                        background-color: white; border-radius: 50%; transition: .3s;
                    }
                    input:checked + .slider { background-color: #3ea6ff; }
                    input:checked + .slider:before { transform: translateX(18px); }

                    .sub-option {
                        margin: -5px 0 10px 10px; padding: 10px; border-left: 2px solid #333;
                        display: flex; align-items: center; gap: 10px; color: #ccc;
                    }

                    /* Grid Styles */
                    .appearance-grid {
                        display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
                    }
                    .control-group { display: flex; flex-direction: column; gap: 8px; }
                    .control-group.full-width { grid-column: span 2; }
                    .control-group label { font-size: 12px; color: #aaa; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }

                    .styled-input, .styled-select {
                        background: #1a1a1a; border: 1px solid #333; color: white;
                        padding: 10px; border-radius: 6px; width: 100%; box-sizing: border-box;
                        font-family: inherit; font-size: 14px;
                    }
                    .styled-input-small { width: 60px; padding: 5px; background: #222; border: 1px solid #444; color: white; border-radius: 4px; text-align: center; }
                    
                    .color-input-wrapper {
                        display: flex; align-items: center; gap: 10px;
                        background: #1a1a1a; padding: 5px; border: 1px solid #333; border-radius: 6px;
                    }
                    input[type="color"] {
                        border: none; width: 30px; height: 30px; padding: 0; background: none; cursor: pointer;
                    }
                    .color-value { font-size: 12px; font-family: monospace; color: #888; }

                    /* Footer */
                    .modal-footer {
                        padding: 15px 20px; border-top: 1px solid #333;
                        display: flex; justify-content: flex-end; gap: 10px;
                    }
                    .btn {
                        padding: 8px 20px; border: none; border-radius: 18px;
                        cursor: pointer; font-weight: 500; transition: opacity 0.2s;
                    }
                    .btn-secondary { background: transparent; color: #aaa; }
                    .btn-secondary:hover { color: #fff; background: rgba(255,255,255,0.05); }
                    .btn-primary { background: #3ea6ff; color: #000; }
                    .btn-primary:hover { opacity: 0.9; }

                    input:focus, select:focus { outline: none; border-color: #3ea6ff; }
                </style>
            `;

            document.body.appendChild(overlay);
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // --- Lógica UI com tratamento seguro ---
            const closeModal = () => {
                const modal = document.getElementById('yt-enhancer-settings-modal');
                const overlay = document.getElementById('yt-enhancer-overlay');
                if (modal) modal.remove();
                if (overlay) overlay.remove();
                this.cleanupFunctions.forEach(fn => fn());
                this.cleanupFunctions = [];
            };

            // Adicionar listeners com tratamento seguro
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(overlay, 'click', closeModal)
            );
            
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(
                    document.getElementById('yt-enhancer-close'),
                    'click',
                    closeModal
                )
            );

            // Tabs
            document.querySelectorAll('.tab-btn').forEach(btn => {
                this.cleanupFunctions.push(
                    Utils.safeAddEventListener(btn, 'click', () => {
                        try {
                            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                            btn.classList.add('active');
                            document.getElementById(btn.dataset.target).classList.add('active');
                        } catch (error) {
                            console.error('Tab switch error:', error);
                        }
                    })
                );
            });

            // Layout toggle
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(
                    document.getElementById('cfg-layout'),
                    'change',
                    (e) => {
                        try {
                            const display = e.target.checked ? 'flex' : 'none';
                            document.getElementById('layout-settings').style.display = display;
                        } catch (error) {
                            console.error('Layout toggle error:', error);
                        }
                    }
                )
            );

            // Color inputs
            ['style-color', 'style-bg-color'].forEach(id => {
                this.cleanupFunctions.push(
                    Utils.safeAddEventListener(
                        document.getElementById(id),
                        'input',
                        (e) => {
                            try {
                                e.target.nextElementSibling.textContent = e.target.value;
                            } catch (error) {
                                console.error('Color input error:', error);
                            }
                        }
                    )
                );
            });

            const getNewConfig = () => {
                try {
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
                } catch (error) {
                    console.error('Error getting new config:', error);
                    return currentConfig;
                }
            };

            // LÓGICA INTELIGENTE DOS BOTÕES (Novo em v1.0.2)
            const initialCpuTamerState = currentConfig.FEATURES.CPU_TAMER;
            const cpuToggle = document.getElementById('cfg-cpu-tamer');
            const btnApply = document.getElementById('yt-enhancer-apply');
            const btnReload = document.getElementById('yt-enhancer-reload');

            const updateButtonState = () => {
                try {
                    // Se o estado do CPU Tamer for diferente do inicial, exige reload
                    const isCpuChanged = cpuToggle.checked !== initialCpuTamerState;
                    
                    if (isCpuChanged) {
                        btnApply.style.display = 'none';
                        btnReload.style.display = 'block';
                    } else {
                        btnApply.style.display = 'block';
                        btnReload.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Button update error:', error);
                }
            };

            // Listener para detectar mudança na opção crítica
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(cpuToggle, 'change', updateButtonState)
            );

            // Apply button (Sem reload)
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(
                    btnApply,
                    'click',
                    () => {
                        try {
                            const cfg = getNewConfig();
                            onSave(cfg);
                            closeModal();
                        } catch (error) {
                            console.error('Apply button error:', error);
                        }
                    }
                )
            );

            // Reload button (Com reload)
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(
                    btnReload,
                    'click',
                    () => {
                        try {
                            const cfg = getNewConfig();
                            onSave(cfg);
                            closeModal();
                            setTimeout(() => window.location.reload(), 100);
                        } catch (error) {
                            console.error('Reload button error:', error);
                        }
                    }
                )
            );
        }
    };

    // =======================================================
    // 3. STYLE MANAGER (COM EVENT BUS)
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-styles',
        currentConfig: null,
        
        init() {
            EventBus.on('configChanged', (config) => this.apply(config));
        },
        
        apply: function(config) {
            this.currentConfig = config;
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
    // 4. CPU TAMER SEGURO - CRÍTICO 1
    // =======================================================
    const CpuTamer = {
        originalTimers: {
            setInterval: null,
            setTimeout: null
        },
        
        isInitialized: false,
        criticalTimers: new Set(),
        
        init() {
            if (this.isInitialized) return;
            
            // Guardar originais
            this.originalTimers.setInterval = window.setInterval;
            this.originalTimers.setTimeout = window.setTimeout;
            
            // Wrapper seguro para setInterval
            window.setInterval = (callback, delay, ...args) => {
                const isCritical = this.criticalTimers.has(callback);
                let actualDelay = delay;
                
                if (!isCritical && document.visibilityState === 'hidden') {
                    actualDelay = Math.max(delay, 2000); // Mínimo 2s em background
                }
                
                return this.originalTimers.setInterval(callback, actualDelay, ...args);
            };
            
            // Wrapper para setTimeout também
            window.setTimeout = (callback, delay, ...args) => {
                const isCritical = this.criticalTimers.has(callback);
                let actualDelay = delay;
                
                if (!isCritical && document.visibilityState === 'hidden') {
                    actualDelay = Math.max(delay, 1000);
                }
                
                return this.originalTimers.setTimeout(callback, actualDelay, ...args);
            };
            
            this.isInitialized = true;
            log('CPU Tamer inicializado (modo seguro)');
        },
        
        markCritical(callback) {
            if (typeof callback === 'function') {
                this.criticalTimers.add(callback);
            }
        },
        
        unmarkCritical(callback) {
            this.criticalTimers.delete(callback);
        },
        
        cleanup() {
            if (this.isInitialized) {
                window.setInterval = this.originalTimers.setInterval;
                window.setTimeout = this.originalTimers.setTimeout;
                this.isInitialized = false;
                this.criticalTimers.clear();
            }
        }
    };

    // =======================================================
    // 5. CLOCK MANAGER (COM DEBOUNCE E CACHE)
    // =======================================================
    const ClockManager = {
        clockElement: null,
        interval: null,
        config: null,
        observer: null,
        playerElement: null,
        cleanupFunctions: [],
        
        init(config) {
            this.config = config;
            window.ClockManager = this;
            
            // Usar cache de DOM
            this.playerElement = Utils.DOMCache.get('#movie_player') || 
                                Utils.DOMCache.get('.html5-video-player');
            
            this.createClock();
            this.setupObserver();
            
            // Usar Event Bus
            EventBus.on('configChanged', (newConfig) => this.updateConfig(newConfig));
            
            // Listeners com tratamento seguro
            this.cleanupFunctions.push(
                Utils.safeAddEventListener(
                    document,
                    'fullscreenchange',
                    Utils.debounce(() => this.handleFullscreen(), 100)
                )
            );
            
            // Fallback com intervalo seguro
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
                font-family: "Roboto", sans-serif; font-weight: 400;
                padding: 6px 14px;
                text-shadow: 0 1px 3px rgba(0,0,0,0.8);
                display: none; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                transition: bottom 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s;
            `;
            document.body.appendChild(clock);
            this.clockElement = clock;
            this.updateStyle();
        },
        
        setupObserver() {
            // Observar mudanças no player com debounce
            if (!this.playerElement) return;

            this.observer = new MutationObserver(
                Utils.debounce(() => {
                    try {
                        this.adjustPosition();
                    } catch (error) {
                        console.error('Observer error:', error);
                    }
                }, 150)
            );

            this.observer.observe(this.playerElement, {
                attributes: true,
                attributeFilter: ['class'],
                childList: false,
                subtree: false
            });
        },
        
        adjustPosition() {
            if (!this.clockElement || !this.playerElement) return;

            try {
                const isFullscreen = document.fullscreenElement != null;
                const areControlsVisible = !this.playerElement.classList.contains('ytp-autohide');
                const baseMargin = this.config.CLOCK_STYLE.margin;
                let finalBottom = baseMargin;

                if (isFullscreen && areControlsVisible) {
                    finalBottom = baseMargin + 110;
                }

                this.clockElement.style.bottom = `${finalBottom}px`;
            } catch (error) {
                console.error('Adjust position error:', error);
            }
        },
        
        updateStyle() {
            if (!this.clockElement) return;
            
            try {
                const s = this.config.CLOCK_STYLE;
                const el = this.clockElement;
                
                const hexToRgb = (hex) => {
                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                    return result ? 
                        `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : 
                        '0,0,0';
                };

                el.style.backgroundColor = `rgba(${hexToRgb(s.bgColor)}, ${s.bgOpacity})`;
                el.style.color = s.color;
                el.style.fontSize = `${s.fontSize}px`;
                el.style.right = `${s.margin}px`;
                el.style.borderRadius = `${s.borderRadius}px`;
                
                this.adjustPosition();
            } catch (error) {
                console.error('Update style error:', error);
            }
        },
        
        updateTime() {
            if (!this.clockElement) return;
            
            try {
                const now = new Date();
                this.clockElement.textContent = now.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            } catch (error) {
                console.error('Update time error:', error);
            }
        },
        
        shouldShow() {
            return true;
        },
        
        handleFullscreen() {
            if (!this.config.FEATURES.FULLSCREEN_CLOCK) {
                if (this.clockElement) this.clockElement.style.display = 'none';
                return;
            }

            try {
                const isFullscreen = document.fullscreenElement != null;
                
                if (isFullscreen && this.shouldShow()) {
                    if (!this.clockElement) this.createClock();
                    this.clockElement.style.display = 'block';
                    this.updateTime();
                    this.adjustPosition();
                    
                    if (!this.interval) {
                        this.interval = setInterval(() => this.updateTime(), 1000);
                    }
                } else {
                    if (this.clockElement) this.clockElement.style.display = 'none';
                    if (this.interval) {
                        clearInterval(this.interval);
                        this.interval = null;
                    }
                }
            } catch (error) {
                console.error('Handle fullscreen error:', error);
            }
        },
        
        cleanup() {
            if (this.observer) this.observer.disconnect();
            if (this.interval) clearInterval(this.interval);
            this.cleanupFunctions.forEach(fn => fn());
            this.cleanupFunctions = [];
        }
    };

    // =======================================================
    // MAIN (COM EVENT BUS)
    // =======================================================
    function init() {
        try {
            const config = ConfigManager.load();
            
            // Inicializar módulos
            if (config.FEATURES.CPU_TAMER) {
                CpuTamer.init();
            }
            
            // Registrar comando de menu
            GM_registerMenuCommand('⚙️ Configurações', () => {
                UIManager.createSettingsModal(config, (newConfig) => {
                    ConfigManager.save(newConfig);
                });
            });
            
            // Inicializar managers que usam Event Bus
            StyleManager.init();
            ClockManager.init(config);
            
            // Aplicar configuração inicial
            StyleManager.apply(config);
            
            // Configurar listeners para alterações dinâmicas
            EventBus.on('configChanged', (newConfig) => {
                try {
                    if (newConfig.FEATURES.CPU_TAMER && !CpuTamer.isInitialized) {
                        CpuTamer.init();
                    } else if (!newConfig.FEATURES.CPU_TAMER && CpuTamer.isInitialized) {
                        CpuTamer.cleanup();
                    }
                } catch (error) {
                    console.error('Config change error:', error);
                }
            });
            
            log(`v${ConfigManager.CONFIG_VERSION} Inicializado com Event Bus`);
            
            // Cleanup quando a página descarregar
            Utils.safeAddEventListener(window, 'beforeunload', () => {
                CpuTamer.cleanup();
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
