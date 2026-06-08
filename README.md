# 🚀 YouTube Enhancer

> **Optimize, customize, and take control of your YouTube experience.**<br>
> **Otimize, personalize e domine sua experiência no YouTube.**

![Version](https://img.shields.io/badge/Version-2.5.0-blue)
![Language](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=F7DF1E)
![Author](https://img.shields.io/badge/Author-John%20Wiliam%20%26%20IA-orange)
[![Install](https://img.shields.io/badge/Install-Click_Here-green)](https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js)

**Idioma/Language:** [🇧🇷 Português](#-português) | [🇺🇸 English](#-english)

---

## 🇺🇸 English

YouTube Enhancer is a userscript for **Violentmonkey** that improves YouTube's layout, visual clarity, and usability through a modern bilingual settings panel.

### ✨ Main Features

1. **🎨 Grid Layout Control**
   - Choose how many videos appear per row (**3 to 8**).
   - Includes responsive behavior for smaller screens.
   - Applies through persistent CSS variables without rebuilding styles on every SPA navigation.

2. **🚫 Shorts Removal**
   - Removes Shorts shelves, menu entries, and Shorts-style listings.

3. **🧹 Remove “Most Relevant”**
   - Removes the “Most relevant” shelf from the **Subscriptions** page when enabled.
   - Reacts immediately to progressively hydrated shelves and restores the shelf when disabled.

4. **⏰ Floating Clock (Fullscreen)**
   - Displays the time over fullscreen video playback.
   - Automatically hides while player settings and context menus are open, so it does not cover quality, speed, or other options.
   - Supports adjustable text color, background color, opacity, size, margin, and border radius.
   - Tracks every player-controls visibility transition in fullscreen, not only the first one.
   - The default background is `#000000` with `0.3` opacity.

### ⚙️ Settings Panel

No code editing is required:

1. Open the Violentmonkey script menu.
2. Click **“⚙️ Settings”**.
3. Configure the features and clock appearance.

> **Note:** changing the interface language requires **Apply and Reload**.

### 📥 Installation

1. Install **Violentmonkey** in your browser.
2. Install the script through the direct link in the badge above, or paste the source manually.
3. Open `www.youtube.com`.

### 🛠️ Technologies

- JavaScript (ES6+)
- GM API (`GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`)
- Dynamic CSS injection
- Mutation observers for YouTube SPA updates
- DOM caching, frame-coalesced updates, scoped observers, and lifecycle cleanup

### 📝 Credits

Developed by **John Wiliam** with **AI assistance**.

---

## 🇧🇷 Português

O YouTube Enhancer é um userscript para **Violentmonkey** que melhora o layout, a limpeza visual e a usabilidade do YouTube por meio de um painel moderno de configurações com suporte a português e inglês.

### ✨ Funcionalidades Principais

1. **🎨 Controle de Layout Grid**
   - Permite escolher quantos vídeos aparecem por linha (**3 a 8**).
   - Inclui comportamento responsivo em telas menores.
   - Aplica-se por variáveis CSS persistentes, sem reconstruir estilos a cada navegação SPA.

2. **🚫 Remoção de Shorts**
   - Remove prateleiras, entradas de menu e listagens do tipo Shorts.

3. **🧹 Remover “Mais relevantes”**
   - Remove a prateleira “Mais relevantes” da página de **Inscrições** quando a opção está ativa.
   - Reage imediatamente às prateleiras hidratadas progressivamente e restaura o conteúdo quando a opção é desativada.

4. **⏰ Relógio Flutuante (Tela Cheia)**
   - Exibe a hora sobre o vídeo em tela cheia.
   - Oculta-se automaticamente enquanto menus de configuração ou de contexto do player estão abertos, sem cobrir resolução, velocidade ou outras opções.
   - Permite ajustar cor do texto, cor do fundo, opacidade, tamanho, margem e arredondamento.
   - Acompanha todas as transições de visibilidade dos controles em tela cheia, não apenas a primeira.
   - O fundo padrão é `#000000`, com opacidade `0,3`.

### ⚙️ Painel de Configurações

Não é necessário editar o código:

1. Abra o menu do Violentmonkey.
2. Clique em **“⚙️ Configurações”**.
3. Ajuste as funcionalidades e a aparência do relógio.

> **Nota:** a alteração do idioma da interface exige **Aplicar e Recarregar**.

### 📥 Instalação

1. Instale a extensão **Violentmonkey** no navegador.
2. Instale o script pelo link direto do badge acima ou cole o código-fonte manualmente.
3. Acesse `www.youtube.com`.

### 🛠️ Tecnologias

- JavaScript (ES6+)
- API GM (`GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`)
- Injeção dinâmica de CSS
- Observadores de mutação para atualizações da SPA do YouTube
- Cache de DOM, atualizações agrupadas por frame, observadores delimitados e limpeza de ciclo de vida

### 📝 Créditos

Desenvolvido por **John Wiliam** com assistência de **IA**.
