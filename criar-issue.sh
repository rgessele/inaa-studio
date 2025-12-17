# Issue 12
gh issue create --title "feat: #12 Sistema de Edição de Nós (Node Tool)" --body "Esta task é o CORE da modelagem. Devemos abandonar o uso de primitivas rígidas (Konva.Rect, Konva.Circle) em favor de caminhos editáveis.

**Objetivo:** Permitir que o usuário deforme qualquer geometria puxando seus vértices.

**Requisitos Técnicos:**
1. Criar ferramenta 'node-tool'.
2. Ao selecionar uma forma (que deve ser um Konva.Line ou Konva.Path), renderizar 'âncoras' (círculos pequenos) sobre cada coordenada X,Y.
3. Implementar lógica de Drag: Ao mover uma âncora, atualizar apenas o índice correspondente no array de pontos da forma pai.
4. Highlight visual: Destacar o segmento de linha adjacente ao nó selecionado.

**Critério de Aceite:** Desenhar um quadrado e transformar num trapézio arrastando apenas um canto." --label "core"

# Issue 13
gh issue create --title "feat: #13 Ferramentas Retângulo e Elipse Deformáveis" --body "Implementar a criação de formas básicas que nascem prontas para edição de nós (Issue #12).

**Comportamento:**
1. **Retângulo:** Não usar Konva.Rect. Gerar um Konva.Line com 'closed: true' e 4 pontos calculados.
2. **Elipse:** Não usar Konva.Circle. Gerar um Konva.Path com curvas Bézier (4 pontos de ancoragem e controles) ou polígono de alta resolução.
3. **Restrições:** Segurar SHIFT durante a criação deve forçar proporção 1:1 (Quadrado/Círculo perfeito).

**Critério de Aceite:** Criar um círculo, trocar para ferramenta de nós e conseguir 'amassar' o círculo puxando um ponto." --label "feature"

# Issue 14
gh issue create --title "feat: #14 Snapping Inteligente (Imã de Pontos)" --body "Implementar sistema de atração magnética para garantir precisão no fechamento de moldes.

**Lógica:**
1. Detectar proximidade (ex: threshold de 10px) durante o 'DragMove'.
2. **Pontos de Interesse:** Extremidades (End points), Pontos Médios (Midpoints) e Interseções de linhas.
3. **Feedback:** Mostrar um indicador visual (quadrado amarelo) quando o snap ativar.
4. **Ação:** Forçar a coordenada do nó arrastado para ser idêntica (matematicamente) ao ponto de snap alvo.

**Critério de Aceite:** Ao desenhar o contorno de uma blusa, o último ponto fecha exatamente sobre o primeiro." --label "ux"

# Issue 15
gh issue create --title "feat: %15 Ferramenta Fita Métrica (Measure Tool)" --body "Ferramenta de aferição temporária para conferência de medidas.

**Funcionalidade:**
1. Clique Ponto A -> Arraste -> Solta Ponto B.
2. Renderizar uma linha auxiliar pontilhada temporária.
3. Exibir Tooltip/Label flutuante seguindo o mouse com a distância em CM (usar constante de escala PX_TO_CM).
4. (Avançado) Se passar o mouse sobre uma aresta existente, destacar a aresta e mostrar seu comprimento total.

**Critério de Aceite:** Medir uma linha de 10cm desenhada anteriormente e a ferramenta mostrar '10.0 cm'." --label "feature"

# Issue 16
gh issue create --title "feat: #16 Ferramenta de Margem de Costura (Offset)" --body "Gerar contornos paralelos para criação de margens de costura.

**Desafio Técnico:** Offset de polígonos complexos é matematicamente difícil. Sugere-se usar bibliotecas auxiliares (como 'clipper-lib' ou 'paper.js') apenas para o cálculo geométrico.

**Fluxo:**
1. Selecionar um objeto fechado ou cadeia de linhas.
2. Input de valor (ex: '1cm').
3. O sistema gera um novo path expandido externamente.
4. Estilo visual padrão: Linha contínua para corte, linha tracejada para a costura (original).

**Critério de Aceite:** Criar margem de 1cm num quadrado de 10cm -> Resultado: Quadrado de 12cm." --label "advanced"

# Issue 17
gh issue create --title "feat: #17 Ferramenta de Pences (Inserção Geométrica)" --body "Adicionar pences em linhas de contorno.

**Comportamento:**
1. Usuário clica em uma linha (aresta) do molde.
2. Define parâmetros: Profundidade (comprimento) e Abertura (largura na base).
3. O sistema insere 3 novos vértices na linha, formando um triângulo apontando para dentro (ou fora).
4. A geometria da linha original é alterada (split).

**Critério de Aceite:** Inserir uma pence na cintura de uma saia e a linha da cintura se adaptar à nova geometria." --label "modeling"

# Issue 18
gh issue create --title "feat: #18 Espelhamento e Desdobrar Molde" --body "Ferramentas para lidar com peças simétricas (frentes de camisas, costas, etc).

**Funcionalidades:**
1. **Espelhar:** Criar cópia invertida baseada num eixo (vertical/horizontal).
2. **Desdobrar (Unfold):** Selecionar uma peça desenhada pela metade (ex: meia frente) e um eixo central. O sistema deve duplicar, inverter e UNIR (merge) as duas metades numa peça única fechada.

**Critério de Aceite:** Desenhar meia calça, usar 'Desdobrar' e obter o molde da calça inteira pronto para corte." --label "modeling"