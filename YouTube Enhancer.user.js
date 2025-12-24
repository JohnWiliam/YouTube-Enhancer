// ==UserScript==
// @name         YouTube Enhancer
// @namespace    Violentmonkey Scripts
// @version      2.0.0
// @description  Reduz uso de CPU, personaliza layout, remove Shorts e adiciona um relógio flutuante em tela cheia.
// @author       John Wiliam & IA
// @match        *://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- Prevenção de Múltiplas Execuções ---
    const FLAG = "__yt_enhancer_2_running__";
    if (window[FLAG]) return;
    window[FLAG] = true;

    // =======================================================
    // MÓDULO DE LOGGING
    // =======================================================
    const log = (message) => console.log(`[YT Enhancer 2] ${message}`);

    // =======================================================
    // MÓDULO DE CONFIGURAÇÃO (ConfigManager)
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
            CLOCK_MODE: 'automatico' // 'automatico', 'forcado_on', 'forcado_off'
        },

        load: function() {
            try {
                const savedConfig = GM_getValue('YT_ENHANCER_2_CONFIG', this.defaults);
                const config = { ...this.defaults, ...savedConfig };
                config.FEATURES = { ...this.defaults.FEATURES, ...(savedConfig.FEATURES || {}) };

                if (config.VIDEOS_PER_ROW < 3 || config.VIDEOS_PER_ROW > 8) {
                    config.VIDEOS_PER_ROW = this.defaults.VIDEOS_PER_ROW;
                }

                return config;
            } catch (error) {
                log('Erro ao carregar configurações, usando padrões: ' + error);
                return this.defaults;
            }
        },

        save: function(config) {
            try {
                if (config.VIDEOS_PER_ROW < 3) config.VIDEOS_PER_ROW = 3;
                if (config.VIDEOS_PER_ROW > 8) config.VIDEOS_PER_ROW = 8;

                GM_setValue('YT_ENHANCER_2_CONFIG', config);
                log('Configurações salvas.');
            } catch (error) {
                log('Erro ao salvar configurações: ' + error);
            }
        }
    };

    // =======================================================
    // MÓDULO DE INTERFACE DO USUÁRIO MODERNA (UIManager)
    // =======================================================
    const UIManager = {
        createSettingsModal: function(currentConfig, onSave) {
            const oldModal = document.getElementById('yt-enhancer-settings-modal');
            if (oldModal) oldModal.remove();

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 9998;
                backdrop-filter: blur(5px);
            `;

            // O modalHTML com a estrutura correta (toggle-sliders) e as
            // modificações de título e botões que você pediu.
            const modalHTML = `
                <div id="yt-enhancer-settings-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #0f0f0f; color: white; padding: 20px; border-radius: 16px; z-index: 9999; border: 1px solid #272727; box-shadow: 0 10px 40px rgba(0,0,0,0.8); min-width: 420px; font-family: 'YouTube Sans', 'Roboto', sans-serif; font-size: 120%;">

                    <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #272727; position: relative;">
                        <h2 style="margin: 0; font-size: 1.4em; font-weight: 500; color: #fff; position: absolute; left: 50%; transform: translateX(-50%); width: 100%; text-align: center; pointer-events: none;">⚙️ Configurações </h2>
                        <button id="yt-enhancer-close" style="background: none; border: none; color: #aaa; font-size: 1.5em; cursor: pointer; padding: 5px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; z-index: 1;">×</button>
                    </div>

                    <div style="max-height: 60vh; overflow-y: auto; padding-right: 8px;">
                        <div style="margin-bottom: 20px;">
                            <h3 style="margin: 0 0 12px 0; font-size: 1.2em; color: #fff; font-weight: 600;">🔧 Funcionalidades</h3>
                            <div style="display: flex; flex-direction: column; gap: 10px;">

                                <label class="feature-toggle">
                                    <input type="checkbox" id="cfg-cpu-tamer" ${currentConfig.FEATURES.CPU_TAMER ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                    <div>
                                        <strong>Redução de Uso de CPU (v2)</strong>
                                        <div style="font-size: 0.9em; color: #aaa; margin-top: 2px;">Limita timers em abas inativas (Requer recarregar)</div>
                                    </div>
                                </label>

                                <label class="feature-toggle">
                                    <input type="checkbox" id="cfg-layout" ${currentConfig.FEATURES.LAYOUT_ENHANCEMENT ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                    <div>
                                        <strong>Layout Personalizado</strong>
                                        <div style="font-size: 0.9em; color: #aaa; margin-top: 2px;">Controla número de vídeos por linha</div>
                                    </div>
                                </label>

                                <label class="feature-toggle">
                                    <input type="checkbox" id="cfg-shorts" ${currentConfig.FEATURES.SHORTS_REMOVAL ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                    <div>
                                        <strong>Remoção de Shorts</strong>
                                        <div style="font-size: 0.9em; color: #aaa; margin-top: 2px;">Remove Shorts da interface</div>
                                    </div>
                                </label>

                                <label class="feature-toggle">
                                    <input type="checkbox" id="cfg-clock-enable" ${currentConfig.FEATURES.FULLSCREEN_CLOCK ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                    <div>
                                        <strong>Relógio em Tela Cheia</strong>
                                        <div style="font-size: 0.9em; color: #aaa; margin-top: 2px;">Mostra um relógio ao assistir (Requer recarregar)</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div id="layout-settings" style="margin-bottom: 20px; ${!currentConfig.FEATURES.LAYOUT_ENHANCEMENT ? 'display: none;' : ''}">
                            <h3 style="margin: 0 0 12px 0; font-size: 1.2em; color: #fff; font-weight: 600;">📐 Layout</h3>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <label for="cfg-videos-row" style="font-weight: 500;">Vídeos por linha:</label>
                                <input type="number" id="cfg-videos-row" min="3" max="8" value="${currentConfig.VIDEOS_PER_ROW}" style="width: 60px; padding: 6px 8px; background: #1a1a1a; color: white; border: 1px solid #272727; border-radius: 6px; font-size: 0.95em; text-align: center;" class="no-spinner">
                            </div>
                        </div>

                        <div id="clock-settings" style="margin-bottom: 20px; ${!currentConfig.FEATURES.FULLSCREEN_CLOCK ? 'display: none;' : ''}">
                            <h3 style="margin: 0 0 12px 0; font-size: 1.2em; color: #fff; font-weight: 600;">🕰️ Relógio</h3>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <label for="cfg-clock-mode" style="font-weight: 500;">Modo de exibição:</label>
                                <select id="cfg-clock-mode" style="width: 200px; padding: 6px 8px; background: #1a1a1a; color: white; border: 1px solid #272727; border-radius: 6px; font-size: 0.95em; -webkit-appearance: none; appearance: none; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23AAA%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 10px center; background-size: 10px; padding-right: 30px;">
                                    <option value="automatico" ${currentConfig.CLOCK_MODE === 'automatico' ? 'selected' : ''}>Automático (Dias úteis, 13-15h)</option>
                                    <option value="forcado_on" ${currentConfig.CLOCK_MODE === 'forcado_on' ? 'selected' : ''}>Sempre Ligado</option>
                                    <option value="forcado_off" ${currentConfig.CLOCK_MODE === 'forcado_off' ? 'selected' : ''}>Sempre Desligado</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; padding-top: 15px; border-top: 1px solid #272727;">
                        <button id="yt-enhancer-apply" style="background: #272727; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background 0.2s;">Aplicar</button>
                        <button id="yt-enhancer-save" style="background: #3ea6ff; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background 0.2s;">Aplicar e Recarregar</button>
                    </div>
                </div>

                <style>
                    .feature-toggle { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border-radius: 8px; background: #1a1a1a; cursor: pointer; transition: background 0.2s; }
                    .feature-toggle:hover { background: #252525; }
                    .feature-toggle input[type="checkbox"] { display: none; }
                    .toggle-slider { position: relative; width: 40px; height: 22px; background: #717171; border-radius: 11px; transition: background 0.2s; flex-shrink: 0; margin-top: 2px; }
                    .toggle-slider:after { content: ''; position: absolute; width: 16px; height: 16px; background: white; border-radius: 50%; top: 3px; left: 3px; transition: transform 0.2s; }
                    input[type="checkbox"]:checked + .toggle-slider { background: #3ea6ff; }
                    input[type="checkbox"]:checked + .toggle-slider:after { transform: translateX(18px); }
                    #yt-enhancer-settings-modal button:hover { opacity: 0.9; }
                    #yt-enhancer-settings-modal button:active { transform: scale(0.98); }
                    #cfg-videos-row:focus, #cfg-clock-mode:focus { outline: none; border-color: #3ea6ff !important; }
                    .no-spinner::-webkit-outer-spin-button,
                    .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                    .no-spinner { -moz-appearance: textfield; }
                </style>
            `;

            document.body.appendChild(overlay);
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // --- Lógica (Event Listeners) ---

            document.getElementById('cfg-layout').addEventListener('change', function() {
                document.getElementById('layout-settings').style.display = this.checked ? 'block' : 'none';
            });

            document.getElementById('cfg-clock-enable').addEventListener('change', function() {
                document.getElementById('clock-settings').style.display = this.checked ? 'block' : 'none';
            });

            const closeModal = () => {
                document.getElementById('yt-enhancer-settings-modal').remove();
                overlay.remove();
            };

            overlay.addEventListener('click', closeModal);
            document.getElementById('yt-enhancer-close').addEventListener('click', closeModal);

            document.getElementById('yt-enhancer-settings-modal').addEventListener('click', (e) => {
                e.stopPropagation();
            });

            document.getElementById('cfg-videos-row').addEventListener('change', function() {
                let value = parseInt(this.value);
                if (value < 3) value = 3;
                if (value > 8) value = 8;
                this.value = value;
            });

            const getNewConfigFromModal = () => {
                const videosInput = document.getElementById('cfg-videos-row');
                let videosValue = parseInt(videosInput.value, 10);
                if (videosValue < 3) videosValue = 3;
                if (videosValue > 8) videosValue = 8;

                return {
                    VIDEOS_PER_ROW: videosValue,
                    FEATURES: {
                        CPU_TAMER: document.getElementById('cfg-cpu-tamer').checked,
                        LAYOUT_ENHANCEMENT: document.getElementById('cfg-layout').checked,
                        SHORTS_REMOVAL: document.getElementById('cfg-shorts').checked,
                        FULLSCREEN_CLOCK: document.getElementById('cfg-clock-enable').checked
                    },
                    CLOCK_MODE: document.getElementById('cfg-clock-mode').value
                };
            };

            // MODIFICAÇÃO: Lógica do botão "Aplicar e Recarregar"
            document.getElementById('yt-enhancer-save').addEventListener('click', () => {
                const newConfig = getNewConfigFromModal();
                onSave(newConfig);
                closeModal();
                this.showNotification('Configurações salvas! Recarregando...');
                setTimeout(() => window.location.reload(), 1000);
            });

            // MODIFICAÇÃO: Lógica do botão "Aplicar"
            document.getElementById('yt-enhancer-apply').addEventListener('click', () => {
                const newConfig = getNewConfigFromModal();
                onSave(newConfig);

                const cpuToggled = newConfig.FEATURES.CPU_TAMER !== currentConfig.FEATURES.CPU_TAMER;
                const clockToggled = newConfig.FEATURES.FULLSCREEN_CLOCK !== currentConfig.FEATURES.FULLSCREEN_CLOCK;
                const needsReload = cpuToggled || clockToggled;

                // Atualiza o objeto 'config' em execução
                Object.assign(currentConfig, newConfig);
                currentConfig.FEATURES = newConfig.FEATURES; // Garante a atualização profunda

                if (window.ClockManager) {
                    window.ClockManager.currentConfig = currentConfig;
                }

                // Aplica estilos "ao vivo"
                StyleManager.apply(currentConfig);

                closeModal();
                if (needsReload) {
                    this.showNotification('Alteração salva! Recarregamento necessário...');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    this.showNotification('Configurações aplicadas!');
                }
            });
        },

        showNotification: function(message) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #0f0f0f;
                color: white;
                padding: 10px 16px;
                border-radius: 8px;
                border: 1px solid #272727;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                z-index: 10000;
                font-family: 'YouTube Sans', 'Roboto', sans-serif;
                border-left: 4px solid #3ea6ff;
                font-size: 1.1em;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    };

    // =======================================================
    // MÓDULO DE ESTILOS (StyleManager)
    // =======================================================
    const StyleManager = {
        styleId: 'yt-enhancer-2-global-styles',
        apply: function(config) {
            const oldStyle = document.getElementById(this.styleId);
            if (oldStyle) oldStyle.remove();

            if (!config.FEATURES.LAYOUT_ENHANCEMENT && !config.FEATURES.SHORTS_REMOVAL) {
                log('Nenhuma funcionalidade de estilo ativa. CSS não aplicado.');
                return;
            }

            let css = '';

            if (config.FEATURES.LAYOUT_ENHANCEMENT) {
                css += `
                    ytd-rich-grid-renderer {
                        --ytd-rich-grid-items-per-row: ${config.VIDEOS_PER_ROW} !important;
                    }
                    @media (max-width: 1300px) {
                        ytd-rich-grid-renderer {
                            --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 4)} !important;
                        }
                    }
                    @media (max-width: 800px) {
                        ytd-rich-grid-renderer {
                            --ytd-rich-grid-items-per-row: ${Math.min(config.VIDEOS_PER_ROW, 2)} !important;
                        }
                    }
                `;
                log(`Layout aplicado: ${config.VIDEOS_PER_ROW} vídeos por linha.`);
            }

            if (config.FEATURES.SHORTS_REMOVAL) {
                css += `
                    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
                    ytd-reel-shelf-renderer,
                    ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
                    ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
                    ytd-guide-entry-renderer:has(a[title="Shorts"]),
                    ytd-mini-guide-entry-renderer[aria-label="Shorts"]
                    {
                        display: none !important;
                    }
                `;
                log('Regras de remoção de Shorts aplicadas.');
            }

            const style = document.createElement('style');
            style.id = this.styleId;
            style.textContent = css;
            document.head.appendChild(style);
        }
    };

    // =======================================================
    // MÓDULO CPU TAMER OTIMIZADO (v2.0 - Mais Robusto)
    // =======================================================
    const CpuTamer = {
        isActive: false,
        originalSetInterval: null,

        init() {
            if (this.isActive) return;

            this.originalSetInterval = window.setInterval;

            window.setInterval = (callback, delay, ...args) => {
                let newDelay = delay;

                if (document.visibilityState === 'hidden') {
                    newDelay = Math.max(delay, 5000);
                }

                return this.originalSetInterval.call(window, callback, newDelay, ...args);
            };

            this.isActive = true;
            this.setupVisibilityHandler();
            log("CPU Tamer (v2.0) inicializado. Função setInterval agora é gerenciada.");
        },

        setupVisibilityHandler() {
            const logVisibility = () => {
                if (document.visibilityState === 'hidden') {
                    log('CPU Tamer ativado (aba em segundo plano). Intervalos serão limitados a >= 5s.');
                } else {
                    log('CPU Tamer desativado (aba ativa). Intervalos em velocidade normal.');
                }
            };

            logVisibility();
            document.addEventListener("visibilitychange", logVisibility);
        }
    };

    // =======================================================
    // MÓDULO RELÓGIO EM TELA CHEIA (ClockManager)
    // =======================================================
    const ClockManager = {
        clockElement: null,
        clockInterval: null,
        currentConfig: null,

        init(config) {
            log("Clock Manager inicializado");
            this.currentConfig = config;
            window.ClockManager = this; // Expor para o UIManager

            this.createClockElement();

            const events = [
                'fullscreenchange',
                'webkitfullscreenchange',
                'mozfullscreenchange',
                'msfullscreenchange',
            ];

            events.forEach(event => {
                document.addEventListener(event, this.handleFullscreen.bind(this));
            });

            setInterval(this.handleFullscreen.bind(this), 3000);
            setTimeout(this.handleFullscreen.bind(this), 1000);
        },

        styleConfig: {
            corTexto: '#ffffff',
            corFundo: 'rgba(50, 50, 50, 0.75)',
            tamanhoFonte: '24px',
            fonte: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            margem: '22px',
            borderRadius: '18px',
            padding: '5px 12px',
            zIndex: '99999'
        },

        createClockElement() {
            if (this.clockElement || !document.body) {
                return;
            }

            const clock = document.createElement('div');
            Object.assign(clock.style, {
                position: 'fixed',
                bottom: this.styleConfig.margem,
                right: this.styleConfig.margem,
                color: this.styleConfig.corTexto,
                backgroundColor: this.styleConfig.corFundo,
                fontSize: this.styleConfig.tamanhoFonte,
                fontFamily: this.styleConfig.fonte,
                padding: this.styleConfig.padding,
                borderRadius: this.styleConfig.borderRadius,
                zIndex: this.styleConfig.zIndex,
                display: 'none',
                transition: 'opacity 0.4s ease',
                fontWeight: '500',
                letterSpacing: '0.5px',
                textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                alignItems: 'center',
                justifyContent: 'center',
            });
            clock.id = 'floatingClock';
            document.body.appendChild(clock);
            this.clockElement = clock;
        },

        updateClock() {
            if (!this.clockElement) return;
            const now = new Date();
            this.clockElement.textContent = now.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        },

        isHorarioAtivo() {
            const agora = new Date();
            const hora = agora.getHours();
            const diaSemana = agora.getDay();
            const ehDiaUtil = diaSemana >= 1 && diaSemana <= 5;
            const ehHorario = hora >= 13 && hora < 15;
            return ehDiaUtil && ehHorario;
        },

        checkFullscreen() {
            const fsElement = document.fullscreenElement ||
                              document.webkitFullscreenElement ||
                              document.mozFullScreenElement ||
                              document.msFullscreenElement;

            if (!fsElement) return false;
            if (fsElement.tagName === 'VIDEO') return true;
            if (fsElement.tagName === 'IFRAME') return true;
            if (fsElement.querySelector('video')) return true;
            if (fsElement.shadowRoot && fsElement.shadowRoot.querySelector('video')) return true;

            return false;
        },

        handleFullscreen() {
            if (!this.clockElement) {
                this.createClockElement();
                if (!this.clockElement) return;
            }

            const currentMode = this.currentConfig.CLOCK_MODE;

            if (currentMode === 'forcado_off') {
                this.clockElement.style.display = 'none';
                if (this.clockInterval) {
                    clearInterval(this.clockInterval);
                    this.clockInterval = null;
                }
                return;
            }

            const isFullscreen = this.checkFullscreen();

            let deveAtivar = false;
            if (currentMode === 'forcado_on') {
                deveAtivar = true;
            } else {
                deveAtivar = this.isHorarioAtivo();
            }

            if (isFullscreen && deveAtivar) {
                this.clockElement.style.display = 'flex';
                this.updateClock();
                if (!this.clockInterval) {
                    this.clockInterval = CpuTamer.originalSetInterval.call(window, this.updateClock.bind(this), 1000);
                }
            } else {
                this.clockElement.style.display = 'none';
                if (this.clockInterval) {
                    clearInterval(this.clockInterval);
                    this.clockInterval = null;
                }
            }
        }
    };


    // =======================================================
    // INICIALIZAÇÃO PRINCIPAL
    // =======================================================
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        try {
            // 1. Carrega as configurações
            const config = ConfigManager.load();
            log('Configurações carregadas.');

            // 2. IMPORTANTE: Inicializa o CPU Tamer PRIMEIRO
            if (config.FEATURES.CPU_TAMER) {
                CpuTamer.init();
            }

            // 3. Registra o menu de configurações
            GM_registerMenuCommand('⚙️ Configurações', () => {
                UIManager.createSettingsModal(config, ConfigManager.save);
            });

            // 4. Aplica os estilos
            StyleManager.apply(config);

            // 5. Inicializa o Relógio se estiver ativo
            if (config.FEATURES.FULLSCREEN_CLOCK) {
                ClockManager.init(config);
            }

            // 6. Observador para reaplicar estilos em SPAs
            const observer = new MutationObserver(() => {
                if (!document.getElementById(StyleManager.styleId)) {
                    log('Estilos foram removidos. Reaplicando...');
                    StyleManager.apply(config);
                }
            });
            observer.observe(document.head, { childList: true, subtree: true });

            log("YouTube Enhancer 2 v2.0.0 (CPU Tamer v2) inicializado com sucesso.");
        } catch (error) {
            log('Erro durante a inicialização: ' + error);
        }
    }

    // Inicia o script
    init();

})();
