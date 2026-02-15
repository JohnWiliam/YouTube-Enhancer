# 🚀 YouTube Enhancer

> **Otimize, Personalize e Domine sua experiência no YouTube.**

![Version](https://img.shields.io/badge/Version-1.1.7-blue)
![Language](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=F7DF1E)
![Author](https://img.shields.io/badge/Author-John%20Wiliam%20%26%20IA-orange)
[![Install](https://img.shields.io/badge/Install-Click_Here-green)](https://github.com/JohnWiliam/YouTube-Enhancer/raw/refs/heads/main/YouTube-Enhancer.user/YouTube-Enhancer.user.js)

O **YouTube Enhancer** é um Userscript poderoso projetado para o ambiente **Violentmonkey**. Ele transforma a navegação no YouTube, focando em performance (redução de CPU), limpeza visual (remoção de Shorts) e utilitários inteligentes (relógio em tela cheia), tudo controlado por um painel de configurações moderno e fácil de usar.

---

## ✨ Funcionalidades Principais

### ⚡ 1. Otimização de Performance (Smart CPU Tamer)
O YouTube é conhecido por consumir muitos recursos. Este script implementa um **limitador inteligente**:
* **Background Throttling:** Quando a aba do YouTube não está visível, o script reduz drasticamente a taxa de atualização de scripts em segundo plano.
* **Resultado:** Menos uso de processador, menos aquecimento e maior duração de bateria em laptops.

### 🎨 2. Controle Total do Layout
Diga adeus ao layout padrão confuso.
* **Grid Personalizável:** Defina exatamente quantos vídeos você quer ver por linha na página inicial (de **3 a 8** vídeos).
* **Adaptação Responsiva:** O script ajusta automaticamente o grid para telas menores, garantindo que o visual nunca quebre.

### 🚫 3. Bloqueador de Shorts
Foque no conteúdo que importa. O script remove cirurgicamente todo o "ruído" dos Shorts:
* Remove carrosséis de Shorts ("Reel Shelfs").
* Remove abas e botões de Shorts no menu lateral.
* Esconde vídeos marcados como Shorts nas listagens de busca.

### ⏰ 4. Relógio Flutuante Inteligente (Smart Clock)
Um relógio elegante sobreposto ao vídeo em **Tela Cheia**, para que você não perca a hora durante maratonas.
* **Modo Automático:** Aparece apenas em dias úteis (Seg-Sex) entre **13:00h e 15:00h** (ideal para horários de almoço/trabalho).
* **Modo Forçado:** Pode ser configurado para ficar "Sempre Ligado" ou "Sempre Desligado".
* **Totalmente Estilizável:** Mude cores, opacidade, tamanho da fonte, margem e até o arredondamento das bordas.


### 🧼 5. Modo RTX (Sem Blur/Translucidez)
Para máxima compatibilidade visual e foco em desempenho de vídeo:
* Remove efeitos de **blur/backdrop-filter** da UI do YouTube.
* Substitui superfícies translúcidas por **transparência**.
* Ajuda cenários de processamento de vídeo (ex.: **RTX HDR / RTX VSR**) em que o blur da interface pode atrapalhar a cadeia de captura/renderização.

---

## ⚙️ Painel de Configurações

Não é preciso editar código! O script possui uma interface gráfica nativa e moderna.

1. Abra o menu do seu gerenciador de scripts (Violentmonkey).
2. Clique em **"⚙️ Configurações"**.
3. Um modal exclusivo abrirá com duas abas:

### 🔧 Aba Funcionalidades
| Opção | Descrição |
| :--- | :--- |
| **Redução de CPU** | Ativa/Desativa o limitador de scripts em segundo plano. |
| **Layout Grid** | Ativa o redimensionamento do grid. Inclui seletor numérico (3-8). |
| **Remover Shorts** | Limpa toda a interface de conteúdos do tipo "Shorts". |
| **Relógio Flutuante** | Habilita o relógio sobreposto no player de vídeo. |
| **Modo RTX (sem blur)** | Remove blur/translucidez da interface e força transparência. |

### 🎨 Aba Aparência (Relógio)
Personalize o relógio visualmente em tempo real:
* 🎨 **Cores:** Seletor de cor para Texto e Fundo.
* 👁️ **Opacidade:** Controle a transparência do fundo.
* 📏 **Dimensões:** Ajuste Tamanho da Fonte, Margem e Arredondamento (Border Radius).
* 🔄 **Modo de Ativação:** Automático, Sempre Ligado ou Sempre Desligado.

> **Nota:** As configurações possuem botões para **"Aplicar"** (teste imediato) e **"Salvar e Recarregar"** (para fixar as mudanças).

---

## 📥 Instalação

1. Certifique-se de ter a extensão **Violentmonkey** instalada no seu Firefox.
2. Instale o script através do link direto ou criando um novo script e colando o código fonte.
3. Acesse `www.youtube.com` e aproveite!

---

## 🛠️ Tecnologias
* **JavaScript (ES6+)**
* **GM API** (`GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`)
* **CSS3 Dinâmico** (Injeção de estilos em tempo real)

---

## 📝 Créditos

Desenvolvido por **John Wiliam** com assistência de **IA**.
*Focado para uso em Firefox 64-bit + Violentmonkey.*
