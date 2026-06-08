# Estrutura do YouTube e princípios permanentes do userscript

Este arquivo é a referência arquitetural permanente para o desenvolvimento do **YouTube Enhancer**. Toda funcionalidade deve considerar que o YouTube é uma aplicação dinâmica, progressivamente hidratada e com navegação SPA; portanto, o script não deve depender de uma única renderização inicial nem executar varreduras globais repetitivas sem necessidade.

## Tecnologias e comportamentos relevantes do YouTube

- **Streaming SSR** → a página chega em fragmentos; elementos podem existir antes de estarem completos.
- **Progressive Hydration** → componentes tornam-se interativos gradualmente e podem alterar atributos, classes e filhos depois da inserção inicial.
- **Code Splitting + Lazy Loading** → novos componentes aparecem sob demanda, inclusive durante rolagem, abertura de menus e troca de páginas.
- **Service Worker + PWA** → recursos e estados podem vir de cache, sem um carregamento tradicional completo.
- **CDN Edge + ESI** → partes estáticas e dinâmicas podem ser entregues e atualizadas em momentos diferentes.
- **Data Inlining** → o estado inicial pode existir antes do componente visual correspondente.
- **Roteamento isomórfico + History API** → a navegação usa eventos SPA (`yt-navigate-*`, `yt-page-data-updated` e `popstate`) e normalmente não recarrega o documento.
- **Skeleton Screens / UI otimista** → placeholders podem ser substituídos, reciclados ou preenchidos depois.

## Regras arquiteturais permanentes

1. **CSS crítico em `document-start`**
   - Preferir CSS para ajustes determinísticos, como a grade e seletores estruturais de Shorts.
   - Injetar essas regras antes da hidratação para reduzir mudança visual e atraso percebido.
   - Não reinjetar CSS em toda navegação SPA quando a folha existente continua válida.

2. **Processamento incremental do DOM**
   - `MutationObserver` deve processar prioritariamente os nós adicionados ou o componente diretamente alterado.
   - Varreduras completas ficam restritas à ativação da opção e aos marcos de navegação SPA.
   - Alterações urgentes, como ocultar “Mais relevantes”, devem ocorrer no mesmo ciclo de mutação, sem debounce longo.

3. **Agrupamento por frame, sem starvation**
   - Atualizações visuais frequentes devem usar `requestAnimationFrame` como throttle.
   - Evitar debounce em eventos contínuos da interface: mutações sucessivas podem adiar indefinidamente a atualização final.
   - Escritas no DOM devem ser idempotentes, alterando estilos somente quando o valor realmente mudou.

4. **Ciclo de vida explícito por funcionalidade**
   - Cada opção deve possuir `init`, atualização de configuração, início, parada e `cleanup` coerentes.
   - Observadores, listeners, timers e frames pendentes devem ser desconectados ou cancelados ao desativar a opção e ao descarregar a página.
   - Elementos ocultados pelo script devem preservar e restaurar o estilo inline anterior.

5. **Memória e referências**
   - Referências fortes a elementos devem ser removidas quando os elementos deixam o documento.
   - Usar `WeakMap` para metadados associados ao DOM e limpar os conjuntos usados para restauração.
   - Caches devem validar `isConnected` e ser invalidados nos eventos relevantes de navegação.

6. **Tela cheia e controles do player**
   - O relógio deve acompanhar cada mudança das classes de auto-ocultação do player, não apenas a primeira entrada em tela cheia.
   - Enquanto os controles estiverem visíveis, o relógio deve ficar acima da barra; quando sumirem, deve retornar à margem configurada.
   - Mutações causadas pelo próprio relógio devem ser ignoradas para impedir ciclos de observação.
   - Menus de configurações e contexto devem ocultar o relógio enquanto estiverem visíveis.

7. **Robustez diante da SPA**
   - Seletores devem ser estruturais e limitados ao menor escopo possível.
   - Toda opção deve funcionar tanto no carregamento inicial quanto após navegação interna, conteúdo tardio e reciclagem de componentes.
   - Falhas em uma funcionalidade não devem impedir a inicialização das demais.
