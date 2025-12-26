// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      1.0.4
// @description  Reduz uso de CPU, personaliza layout, remove Shorts e adiciona relógio customizável com interface refinada.
// @author       John Wiliam & IA
// @match        *://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @updateURL    https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube%20Enhancer.user.js
// @downloadURL  https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube%20Enhancer.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const FLAG = "__yt_enhancer_v1_0_0__";
    if (window[FLAG]) return;
    window[FLAG] = true;

    const log = (msg) => console.log(`[YT Enhancer] ${msg}`);

    // =======================================================
    // 1. CONFIG MANAGER
    // =======================================================
    const ConfigManager = {
        defaults: {
            VIDEOS_PER_ROW: 5,
            FEATURES: {
                CPU_TAMER: true,
                LAYOUT_ENHANCEMENT: true,
                SHORTS_REMOVAL: true,
                FULLSCREEN_CLOCK: true
            },
            CLOCK_MODE: 'automatico',
            CLOCK_STYLE: {
                color: '#ffffff',
                bgColor: '#000000',
                bgOpacity: 0.4,
                fontSize: 22,
                margin: 30,
                borderRadius: 25, // Novo padrão
                position: 'bottom-right'
            }
        },

        load: function() {
            try {
                const saved = GM_getValue('YT_ENHANCER_CONFIG_V1.0', this.defaults);
                const config = { ...this.defaults, ...saved };
                config.FEATURES = { ...this.defaults.FEATURES, ...(saved.FEATURES || {}) };
                config.CLOCK_STYLE = { ...this.defaults.CLOCK_STYLE, ...(saved.CLOCK_STYLE || {}) };
                
                config.VIDEOS_PER_ROW = Math.max(3, Math.min(8, config.VIDEOS_PER_ROW));
                return config;
            } catch (e) {
                log('Erro ao carregar config: ' + e);
                return this.defaults;
            }
        },

        save: function(config) {
            GM_setValue('YT_ENHANCER_CONFIG_V1.0', config);
        }
    };

    // =======================================================
    // 2. UI MANAGER
    // =======================================================
    const UIManager = {
        createSettingsModal: function(currentConfig, onSave) {
            const oldModal = document.getElementById('yt-enhancer-settings-modal');
            if (oldModal) oldModal.remove();

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
                        <button class="tab-btn" data-target="tab-appearance">🎨 Aparência</button>
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

                                <div class="control-group full-width">
                                    <label>Modo de Ativação</label>
                                    <select id="cfg-clock-mode" class="styled-select">
                                        <option value="automatico" ${currentConfig.CLOCK_MODE === 'automatico' ? 'selected' : ''}>Automático (Dias úteis, 13-15h)</option>
                                        <option value="forcado_on" ${currentConfig.CLOCK_MODE === 'forcado_on' ? 'selected' : ''}>Sempre Ligado</option>
                                        <option value="forcado_off" ${currentConfig.CLOCK_MODE === 'forcado_off' ? 'selected' : ''}>Sempre Desligado</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button id="yt-enhancer-apply" class="btn btn-secondary">Aplicar</button>
                        <button id="yt-enhancer-save" class="btn btn-primary">Salvar e Recarregar</button>
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
                    /* Chrome, Safari, Edge, Opera */
                    input::-webkit-outer-spin-button,
                    input::-webkit-inner-spin-button {
                      -webkit-appearance: none;
                      margin: 0;
                    }
                    /* Firefox */
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

            // --- Lógica UI ---
            const closeModal = () => {
                document.getElementById('yt-enhancer-settings-modal').remove();
                overlay.remove();
            };
            overlay.addEventListener('click', closeModal);
            document.getElementById('yt-enhancer-close').addEventListener('click', closeModal);

            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.target).classList.add('active');
                });
            });

            document.getElementById('cfg-layout').addEventListener('change', (e) => {
                document.getElementById('layout-settings').style.display = e.target.checked ? 'flex' : 'none';
            });

            ['style-color', 'style-bg-color'].forEach(id => {
                document.getElementById(id).addEventListener('input', (e) => {
                    e.target.nextElementSibling.textContent = e.target.value;
                });
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
                    CLOCK_MODE: document.getElementById('cfg-clock-mode').value,
                    CLOCK_STYLE: {
                        color: document.getElementById('style-color').value,
                        bgColor: document.getElementById('style-bg-color').value,
                        bgOpacity: parseFloat(document.getElementById('style-bg-opacity').value),
                        fontSize: parseInt(document.getElementById('style-font-size').value),
                        margin: parseInt(document.getElementById('style-margin').value),
                        borderRadius: parseInt(document.getElementById('style-border-radius').value), // Coleta do novo valor
                        position: 'bottom-right'
                    }
                };
            };

            document.getElementById('yt-enhancer-apply').addEventListener('click', () => {
                const cfg = getNewConfig();
                onSave(cfg);
                
                Object.assign(currentConfig, cfg);
                StyleManager.apply(currentConfig);
                if(window.ClockManager) {
                    window.ClockManager.updateConfig(currentConfig);
                    window.ClockManager.handleFullscreen();
                }
                closeModal();
            });

            document.getElementById('yt-enhancer-save').addEventListener('click', () => {
                onSave(getNewConfig());
                closeModal();
                window.location.reload();
            });
        }
    };

    // =======================================================
    // 3. STYLE MANAGER
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-styles',
        apply: function(config) {
            const old = document.getElementById(this.styleId);
            if (old) old.remove();

            if (!config.FEATURES.LAYOUT_ENHANCEMENT && !config.FEATURES.SHORTS_REMOVAL) return;

            let css = '';
            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `
                    ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important; }
                    @media (max-width: 1200px) { ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important; } }
                `;
            }
            if (config.FEATURES.SHORTS_REMOVAL) {
                css += `
                    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
                    ytd-reel-shelf-renderer,
                    ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
                    ytd-guide-entry-renderer:has(a[title="Shorts"]),
                    ytd-mini-guide-entry-renderer[aria-label="Shorts"] { display: none !important; }
                `;
            }

            const style = document.createElement('style');
            style.id = this.styleId;
            style.textContent = css;
            document.head.appendChild(style);
        }
    };

    // =======================================================
    // 4. CPU TAMER
    // =======================================================
    const CpuTamer = {
        init() {
            const originalSetInterval = window.setInterval;
            window.setInterval = (cb, time, ...args) => {
                let delay = time;
                if (document.visibilityState === 'hidden') delay = Math.max(time, 5000);
                return originalSetInterval(cb, delay, ...args);
            };
        }
    };
    // =======================================================
    // 5. CLOCK MANAGER (ATUALIZADO - DINÂMICO)
    // =======================================================
    const ClockManager = {
        clockElement: null,
        interval: null,
        config: null,
        observer: null,
        playerElement: null,

        init(config) {
            this.config = config;
            window.ClockManager = this;
            this.playerElement = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            
            this.createClock();
            this.setupObserver();
            
            document.addEventListener('fullscreenchange', this.handleFullscreen.bind(this));
            // Fallback para verificar mudanças periodicamente (caso o observer falhe em algum edge case)
            setInterval(() => this.handleFullscreen(), 2000);
        },

        updateConfig(newConfig) {
            this.config = newConfig;
            this.updateStyle();
            this.adjustPosition(); // Recalcula posição imediatamente ao mudar config
        },

        createClock() {
            if (document.getElementById('yt-enhancer-clock')) return;
            
            const clock = document.createElement('div');
            clock.id = 'yt-enhancer-clock';
            // Adicionado transition para movimento suave
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
            // Observa mudanças de classe no player para saber se os controles aparecem
            if (!this.playerElement) return;

            this.observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        this.adjustPosition();
                    }
                }
            });

            this.observer.observe(this.playerElement, {
                attributes: true,
                attributeFilter: ['class'] // Só nos importamos com as classes
            });
        },

        adjustPosition() {
            if (!this.clockElement || !this.playerElement) return;

            // 'ytp-autohide' presente = controles ESCONDIDOS
            // 'ytp-autohide' ausente = controles VISÍVEIS
            // Verifica também se estamos em fullscreen, pois fora dele a lógica muda
            const isFullscreen = document.fullscreenElement != null;
            const areControlsVisible = !this.playerElement.classList.contains('ytp-autohide');
            
            const baseMargin = this.config.CLOCK_STYLE.margin;
            let finalBottom = baseMargin;

            // Se estiver em fullscreen E os controles estiverem visíveis, suba o relógio
            // A barra do YouTube tem aprox 48px + padding. 110px é um valor excelente.
            if (isFullscreen && areControlsVisible) {
                finalBottom = baseMargin + 110; 
            }

            this.clockElement.style.bottom = `${finalBottom}px`;
        },

        updateStyle() {
            if (!this.clockElement) return;
            const s = this.config.CLOCK_STYLE;
            const el = this.clockElement;
            
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : '0,0,0';
            };

            el.style.backgroundColor = `rgba(${hexToRgb(s.bgColor)}, ${s.bgOpacity})`;
            el.style.color = s.color;
            el.style.fontSize = `${s.fontSize}px`;
            el.style.right = `${s.margin}px`;
            el.style.borderRadius = `${s.borderRadius}px`;
            
            // A propriedade 'bottom' agora é controlada principalmente pelo adjustPosition
            // mas definimos o inicial aqui
            this.adjustPosition();
        },

        updateTime() {
            if (!this.clockElement) return;
            const now = new Date();
            this.clockElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        shouldShow() {
            const mode = this.config.CLOCK_MODE;
            if (mode === 'forcado_off') return false;
            if (mode === 'forcado_on') return true;
            
            const d = new Date();
            const isWeekDay = d.getDay() >= 1 && d.getDay() <= 5;
            const isTime = d.getHours() >= 13 && d.getHours() < 15;
            return isWeekDay && isTime;
        },

        handleFullscreen() {
            if (!this.config.FEATURES.FULLSCREEN_CLOCK) {
                if (this.clockElement) this.clockElement.style.display = 'none';
                return;
            }

            const isFullscreen = document.fullscreenElement != null;
            
            if (isFullscreen && this.shouldShow()) {
                if (!this.clockElement) this.createClock();
                this.clockElement.style.display = 'block';
                this.updateTime();
                this.adjustPosition(); // Garante posição correta ao entrar em fullscreen
                
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
        }
    };

    // =======================================================
    // MAIN
    // =======================================================
    function init() {
        const config = ConfigManager.load();
        
        if (config.FEATURES.CPU_TAMER) CpuTamer.init();
        
        GM_registerMenuCommand('⚙️ Configurações', () => {
            UIManager.createSettingsModal(config, ConfigManager.save);
        });
        
        StyleManager.apply(config);
        ClockManager.init(config);
        
        log('v1.0.0 Inicializado');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
