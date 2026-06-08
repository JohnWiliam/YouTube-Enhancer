## Resumo das tecnologias empregadas no YouTube, para referência:

- **Streaming SSR** → quebra a renderização do lado do servidor em fluxo.
- **Progressive Hydration** → torna os componentes interativos aos poucos, priorizando o essencial.
- **Code Splitting + Lazy Loading** → divide o JS pesado em pedaços sob demanda.
- **Service Worker + PWA** → entrega offline, cache inteligente e sincronização em segundo plano.
- **CDN Edge + ESI** → cache de fragmentos em borda, combinando estático e dinâmico.
- **Data Inlining** → injeta estado inicial no HTML para eliminar requisições na primeira renderização.
- **Roteamento isomórfico + History API** → unifica lógica de navegação servidor/cliente.
- **Skeleton Screens / UI otimista** → melhoram a percepção de velocidade enquanto os dados carregam.

## Princípios permanentes para o userscript

A implementação deve acompanhar o ciclo assíncrono e incremental do YouTube sem competir com ele:

- **Inicialização e navegação:** tratar o YouTube como SPA e usar os eventos `yt-navigate-*`/`yt-page-data-updated` apenas como sinais de ciclo de vida, sem reinjetar recursos que já estejam válidos.
- **Layout Grid:** preferir CSS persistente e variáveis nativas do renderer. Alterar o DOM item por item somente quando não existir alternativa declarativa.
- **Remoção de Shorts:** combinar CSS para os casos estáveis com observação incremental apenas dos nós adicionados, evitando varreduras completas a cada mutação.
- **Remoção de “Mais relevantes”:** considerar Progressive Hydration; observar inserções e mudanças de texto e processar somente a prateleira afetada, antes do próximo frame sempre que possível.
- **Relógio em tela cheia:** reagir ao estado real do player (`ytp-autohide`), medir os controles atuais e ignorar mutações produzidas pelo próprio relógio para impedir ciclos de realimentação.
- **Desempenho:** agrupar atualizações visuais com `requestAnimationFrame`, manter seletores delimitados, evitar timers periódicos desnecessários e não refazer trabalho quando a configuração aplicada não mudou.
- **Memória e restauração:** todo observer, listener, timer, frame pendente, referência de DOM e estilo injetado deve possuir caminho explícito de cancelamento/limpeza. Opções reversíveis devem restaurar apenas propriedades que o userscript realmente alterou.
