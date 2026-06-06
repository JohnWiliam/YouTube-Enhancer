# 🚀 YouTube Enhancer

> **Customize and take control of your YouTube experience.** — **Personalize e domine sua experiência no YouTube.**

![Version](https://img.shields.io/badge/Version-2.3.2-blue)
![Language](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=F7DF1E)
![Author](https://img.shields.io/badge/Author-John%20Wiliam%20%26%20IA-orange)
[![Install](https://img.shields.io/badge/Install-Click_Here-green)](https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js)

**Idioma / Language**

[🇧🇷 Português](#-português) | [🇺🇸 English](#-english)

---

## 🇺🇸 English

YouTube Enhancer is a userscript for **Violentmonkey** that adds layout controls, visual cleanup options, and a customizable fullscreen clock through a modern settings panel.

### ✨ Main Features

1. **🎨 Grid Layout Control**
   - Choose how many videos appear per row (**3 to 8**).
   - Includes responsive behavior for smaller screens.

2. **🚫 Shorts Removal**
   - Removes Shorts shelves, menu entries, and Shorts-style listings.

3. **🧹 Remove “Most Relevant”**
   - Removes the “Most relevant” shelf from the **Subscriptions** page when enabled.
   - Reacts to YouTube's single-page navigation and dynamically loaded content.

4. **⏰ Floating Clock (Fullscreen)**
   - Displays the time over fullscreen video without covering YouTube settings menus, including the resolution selector.
   - Supports custom text color, background color, background opacity, font size, margin, and border radius.
   - The default background is `#000000`, with default opacity `0.3`; both remain adjustable.

5. **🧼 RTX Visual Mode (No Blur/Translucency)**
   - Removes blur and `backdrop-filter` effects from the YouTube interface.
   - Replaces translucent backgrounds with transparency while preserving timeline preview thumbnails.

### ⚙️ Settings Panel

No code editing is required:

1. Open the Violentmonkey script menu.
2. Click **“⚙️ Settings”**.
3. Configure features and clock appearance.
4. Use **Apply** for immediate changes. Changing the interface language offers **Apply and Reload**.

### 📥 Installation

1. Install **Violentmonkey** in your browser.
2. Install the script through the direct link in the badge above, or paste the source manually.
3. Open `www.youtube.com`.

### 🛠️ Technologies

- JavaScript (ES6+)
- GM API (`GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`)
- Dynamic CSS injection
- DOM caching and SPA lifecycle handling

### 📝 Credits

Developed by **John Wiliam** with **AI assistance**.

---

## 🇧🇷 Português

O YouTube Enhancer é um userscript para **Violentmonkey** que adiciona controles de layout, opções de limpeza visual e um relógio personalizável em tela cheia por meio de um painel moderno de configurações.

### ✨ Funcionalidades Principais

1. **🎨 Controle de Layout Grid**
   - Permite escolher quantos vídeos aparecem por linha (**3 a 8**).
   - Inclui comportamento responsivo para telas menores.

2. **🚫 Remoção de Shorts**
   - Remove prateleiras, entradas de menu e listagens do tipo Shorts.

3. **🧹 Remover “Mais Relevantes”**
   - Remove a prateleira “Mais relevantes” da página de **Inscrições** quando a opção está ativa.
   - Funciona com a navegação SPA e com conteúdos carregados dinamicamente pelo YouTube.

4. **⏰ Relógio Flutuante (Tela Cheia)**
   - Exibe a hora sobre o vídeo em tela cheia sem cobrir os menus de configuração do YouTube, incluindo o seletor de resolução.
   - Permite ajustar cor do texto, cor e opacidade do fundo, tamanho da fonte, margem e arredondamento.
   - O fundo padrão é `#000000`, com opacidade padrão `0,3`; ambos continuam ajustáveis.

5. **🧼 Modo RTX (Sem Blur/Translucidez)**
   - Remove efeitos de blur e `backdrop-filter` da interface do YouTube.
   - Substitui fundos translúcidos por transparência e preserva as miniaturas de prévia da timeline.

### ⚙️ Painel de Configurações

Não é necessário editar o código:

1. Abra o menu do script no Violentmonkey.
2. Clique em **“⚙️ Configurações”**.
3. Ajuste as funcionalidades e a aparência do relógio.
4. Use **Aplicar** para mudanças imediatas. Ao trocar o idioma da interface, o painel oferece **Aplicar e Recarregar**.

### 📥 Instalação

1. Instale a extensão **Violentmonkey** no navegador.
2. Instale o script pelo link direto do badge acima ou cole o código-fonte manualmente.
3. Acesse `www.youtube.com`.

### 🛠️ Tecnologias

- JavaScript (ES6+)
- API GM (`GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`)
- Injeção dinâmica de CSS
- Cache de DOM e tratamento do ciclo de vida SPA

### 📝 Créditos

Desenvolvido por **John Wiliam** com assistência de **IA**.
