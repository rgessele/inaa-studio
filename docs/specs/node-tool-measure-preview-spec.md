# Especificação: preview de medida e remoção de nós

## Objetivo

Melhorar a ferramenta de nós para permitir duas ações rápidas e precisas:

- criar um novo nó em uma aresta a partir de uma medida projetada desde um nó existente;
- remover um nó com modificador de teclado, unindo as arestas adjacentes.

## Escopo

Esta especificação se aplica à ferramenta de nós do editor.

Não faz parte desta tarefa alterar outras ferramentas, criar novos tipos de figura ou mudar o sistema geral de medidas. A funcionalidade deve reaproveitar os padrões existentes de preview, entrada numérica, snapping, seleção e help contextual sempre que possível.

## Funcionalidade 1: preview de medida a partir de um nó

### Ativação

1. O usuário seleciona a ferramenta de nós.
2. O usuário clica em um nó existente.
3. Se o clique terminar sem drag, o nó fica selecionado e o modo de preview é ativado.
4. Se houver drag real, o comportamento atual de mover/deformar o nó deve ser preservado e o preview não deve ser ativado.

### Preview visual

Com o modo ativo:

- uma linha pontilhada deve sair do nó selecionado;
- a ponta da linha deve acompanhar o cursor enquanto a medida estiver livre;
- uma etiqueta de medida deve ser exibida em tempo real;
- a medida deve usar a unidade atual do projeto;
- o preview não deve alterar a geometria até que o usuário confirme a criação de um novo nó.

### Medida livre

Enquanto a medida estiver livre:

- a origem do preview é sempre o nó selecionado;
- o comprimento é a distância entre o nó selecionado e a posição atual do cursor;
- a direção e o comprimento mudam conforme o mouse se move;
- a etiqueta de medida atualiza continuamente.

### Travamento por entrada numérica

Durante o preview, o usuário pode digitar um número, de forma semelhante à ferramenta de reta.

Com entrada numérica ativa:

- o valor digitado trava o comprimento do preview;
- mover o mouse altera apenas a direção;
- a ponta do preview permanece à distância exata digitada a partir do nó de origem;
- o valor deve aceitar o padrão decimal já usado pelo editor;
- `Backspace` remove caracteres da entrada;
- `Esc` limpa a entrada numérica ou cancela o preview, conforme o padrão atual das ferramentas;
- `Enter` pode confirmar o valor digitado, mas a criação do nó ainda depende de uma aresta válida.

### Travamento por barra de espaço

Durante o preview, a barra de espaço deve alternar o travamento da medida atual.

Regras:

- pressionar `Space` com a medida livre trava o comprimento atual da linha;
- com a medida travada, mover o mouse altera apenas a direção;
- pressionar `Space` novamente libera a trava;
- ao liberar, o preview volta a seguir livremente o cursor;
- se houver uma entrada numérica ativa, `Space` deve alternar a trava atual de forma consistente com a ferramenta de reta;
- sugestão: `Space` libera qualquer trava ativa, seja a medida capturada no momento ou a medida digitada.

### Detecção de aresta e nó candidato

Quando a ponta do preview estiver sobre ou próxima de uma aresta válida:

- a ponta do preview deve fazer snap visual para a aresta;
- um nó candidato deve aparecer na ponta do preview;
- o nó candidato deve indicar que um clique criará um novo nó naquele ponto;
- o nó candidato só deve aparecer quando a posição for válida.

Com medida livre:

- o ponto candidato pode seguir o cursor/snap da aresta;
- a medida exibida deve refletir a distância real entre o nó selecionado e o ponto candidato.

Com medida travada:

- o ponto candidato deve respeitar a distância travada;
- a posição válida é a interseção entre a projeção/círculo de distância a partir do nó selecionado e a aresta;
- se não houver interseção válida com uma aresta, nenhum nó candidato deve aparecer.

### Criação do novo nó

O novo nó é criado somente com clique do usuário em uma posição candidata válida.

Ao criar:

- a aresta deve ser dividida no ponto selecionado;
- a distância entre o nó de origem e o novo nó deve corresponder à medida exibida/travada;
- o novo nó pode ficar selecionado após a criação;
- o preview deve ser encerrado após a criação;
- a operação deve entrar no histórico de undo/redo.

### Cancelamento

O preview deve ser cancelado quando:

- o usuário pressiona `Esc` em estado de cancelamento;
- o usuário troca de ferramenta;
- o usuário inicia um drag real em um nó;
- a seleção muda para um estado incompatível.

Clicar fora de uma aresta válida deve seguir o padrão atual da ferramenta de nós. Se não houver padrão claro, a sugestão é manter o preview ativo e não criar nada.

## Funcionalidade 2: remoção de nó com modificador

### Modificador

Com a ferramenta de nós ativa, o usuário pode remover um nó usando o modificador principal do sistema:

- macOS: `Command`;
- Windows/Linux: `Ctrl`.

### Hover de remoção

Quando o usuário passa o mouse sobre um nó removível mantendo o modificador pressionado:

- o nó deve ficar vermelho;
- o estado vermelho indica que o clique irá remover o nó;
- nenhuma remoção deve acontecer apenas por hover;
- ao soltar o modificador, o nó deve voltar ao estado visual normal.

### Clique de remoção

Se o usuário clicar em um nó removível mantendo `Command`/`Ctrl` pressionado:

- o nó deve ser removido;
- as duas arestas adjacentes devem ser unidas em uma única aresta;
- a figura deve permanecer válida;
- a operação deve entrar no histórico de undo/redo.

### Regras geométricas

- Em figuras fechadas, remover um nó deve conectar o nó anterior ao próximo.
- Em figuras abertas, remover um nó intermediário deve conectar o nó anterior ao próximo.
- Em figuras abertas, nós de extremidade não devem ser removidos por esse fluxo, salvo se já houver regra segura existente para isso.
- Se o nó tiver handles de curva, a nova aresta pode ser uma linha simples entre os vizinhos, salvo se o sistema já tiver lógica segura para preservar suavização.
- Se a remoção for inválida, o nó não deve ficar vermelho ou deve exibir um estado bloqueado conforme o padrão visual existente.

## Help contextual de modificadores

As novas teclas devem aparecer no help contextual da ferramenta, exibido no canto inferior direito da tela junto com as demais teclas modificadoras.

Para a ferramenta de nós, incluir:

- `Space`: travar/liberar medida;
- macOS: `⌘ + clique`: remover nó;
- Windows/Linux: `Ctrl + clique`: remover nó.

Regras:

- a dica de `Space` pode aparecer sempre que a ferramenta de nós estiver ativa ou apenas durante o preview, conforme o padrão atual do componente;
- a dica de remoção deve aparecer quando a ferramenta de nós estiver ativa;
- as novas dicas não devem substituir nem ocultar modificadores existentes;
- o texto deve ser curto e seguir o estilo atual do help.

## Estados esperados

### Ferramenta de nós ativa, sem preview

- Hover normal em nós e arestas permanece como hoje.
- `Command`/`Ctrl` + hover sobre nó removível mostra o nó em vermelho.
- `Command`/`Ctrl` + clique remove o nó.

### Preview ativo com medida livre

- Linha pontilhada segue o cursor.
- Medida atualiza em tempo real.
- `Space` trava a medida atual.
- Digitar número trava a medida digitada.
- Hover sobre aresta válida mostra nó candidato.

### Preview ativo com medida travada

- Linha pontilhada mantém comprimento fixo.
- Mouse controla apenas a direção.
- Aresta válida mostra nó candidato apenas se houver ponto compatível com a medida travada.
- `Space` libera a trava.
- Clique em nó candidato cria novo nó.

## Critérios de aceite

- Clique simples em um nó ativa o preview pontilhado.
- Drag em um nó continua movendo/deformando o nó como hoje.
- A medida do preview aparece e atualiza enquanto o mouse se move.
- Digitar um número trava o comprimento do preview.
- `Space` trava a medida atual quando a medida está livre.
- `Space` libera a medida quando ela está travada.
- Com medida travada, mover o mouse muda apenas a direção.
- Ao apontar para uma aresta válida, aparece um nó candidato na ponta do preview.
- Clique no nó candidato cria um novo nó na aresta.
- O novo nó é criado respeitando a distância exibida no preview.
- `Esc` cancela o preview sem alterar a geometria.
- `Command` no macOS ou `Ctrl` no Windows/Linux deixa nó removível vermelho no hover.
- `Command`/`Ctrl` + clique remove o nó.
- Ao remover, as arestas adjacentes são unidas em uma única aresta.
- Nós inválidos para remoção não entram em estado vermelho ou exibem estado bloqueado.
- O help contextual da ferramenta de nós mostra `Space` e `Command`/`Ctrl` conforme a plataforma.
- Undo/redo funciona para criação e remoção de nós.

## Casos de teste sugeridos

- Criar nó em aresta reta com medida livre.
- Criar nó em aresta reta com medida digitada.
- Criar nó em aresta reta com medida travada por `Space`.
- Travar e destravar várias vezes com `Space`.
- Cancelar preview com `Esc`.
- Confirmar que drag em nó não ativa preview.
- Confirmar que clique simples em nó ativa preview.
- Verificar comportamento com zoom alto e baixo.
- Verificar snapping do nó candidato sobre arestas diferentes.
- Verificar ausência de nó candidato quando não há interseção válida com medida travada.
- Remover nó intermediário de figura aberta.
- Remover nó de figura fechada.
- Tentar remover extremidade de figura aberta.
- Usar undo/redo após criar nó.
- Usar undo/redo após remover nó.
- Verificar help contextual no macOS.
- Verificar help contextual no Windows/Linux.
