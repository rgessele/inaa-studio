# Sistema de Seleção e Transformação

## Visão Geral

Esta implementação adiciona um sistema completo de seleção e transformação de objetos no editor CAD, permitindo que os usuários:

- **Selecionem** objetos desenhados no canvas
- **Movam** objetos arrastando-os
- **Redimensionem** objetos usando as âncoras do transformador
- **Rotem** objetos usando a âncora de rotação

## Componentes Modificados

### Canvas.tsx

#### Importações Adicionadas

```typescript
import { Transformer } from "react-konva";
```

#### Novos Refs

- `transformerRef`: Referência ao componente Transformer do Konva
- `shapeRefs`: Map que armazena referências a todos os shapes renderizados

#### Novo Efeito

Um `useEffect` foi adicionado para sincronizar o transformer com o shape selecionado:

- Quando um shape é selecionado com a ferramenta "select", o transformer se anexa a ele
- Quando a seleção é removida, o transformer se desanexa

#### Novos Handlers

**handleShapeDragEnd**

- Atualiza a posição (x, y) do shape após o arrasto
- Sincroniza o estado do shape com a nova posição

**handleShapeTransformEnd**

- Lida com redimensionamento e rotação
- Para retângulos: atualiza width e height
- Para círculos: atualiza radius
- Para linhas: escala os pontos
- Para curvas: escala pontos e o ponto de controle
- Reseta a escala para 1 e aplica as mudanças nas dimensões reais

#### Modificações nos Shapes

Todos os shapes (Rectangle, Circle, Line) agora incluem:

- `ref`: Callback que registra o node no `shapeRefs` Map
- `draggable`: Habilitado quando o shape está selecionado e a ferramenta é "select"
- `rotation`: Aplicado do estado do shape
- `onDragEnd`: Handler para atualizar posição após arrasto
- `onTransformEnd`: Handler para atualizar dimensões após transformação

#### Componente Transformer

Adicionado ao final da Layer com as seguintes configurações:

- **boundBoxFunc**: Limita o redimensionamento mínimo a 5px
- **enabledAnchors**: 8 âncoras para redimensionamento (cantos, centros das laterais)
- **rotateEnabled**: true - permite rotação
- **Cores personalizadas**: Usa #673b45 (cor primária) para bordas e âncoras

## Como Usar

1. **Selecionar um Objeto**
   - Clique no botão "Selecionar" na barra de ferramentas (ou pressione V)
   - Clique em qualquer objeto no canvas
   - O transformer aparecerá ao redor do objeto selecionado

2. **Mover um Objeto**
   - Com o objeto selecionado, clique e arraste o objeto
   - Solte para finalizar o movimento

3. **Redimensionar um Objeto**
   - Arraste qualquer uma das 8 âncoras ao redor do objeto
   - Âncoras nos cantos: redimensionam proporcionalmente
   - Âncoras nas laterais: redimensionam em uma direção

4. **Rotar um Objeto**
   - Use a âncora de rotação (acima do objeto)
   - Arraste em círculo para rotar

5. **Desselecionar**
   - Clique no fundo do canvas (área vazia)
   - Ou selecione outra ferramenta

## Comportamento Especial

### Curvas Bézier

- As curvas mantêm seu ponto de controle editável quando selecionadas
- O ponto de controle (círculo roxo) também é escalado durante transformações
- Linhas-guia pontilhadas mostram a relação entre endpoints e ponto de controle

### Linhas

- As linhas são transformadas escalando seus pontos de início e fim
- A rotação funciona ao redor do ponto de origem

### Limitações

- Redimensionamento mínimo de 5px para evitar shapes invisíveis
- Círculos mantêm proporção 1:1 (apenas uma dimensão de raio)

## Detalhes Técnicos

### Performance

- Referências aos shapes são armazenadas em um Map para acesso O(1)
- O transformer é reutilizado para todos os shapes, mudando apenas os nodes anexados
- Transformações resetam a escala interna do Konva e aplicam mudanças às dimensões reais

### Sincronização de Estado

- Drag e Transform eventos atualizam o estado do editor via setShapes
- O histórico de undo/redo captura essas mudanças automaticamente
- A posição do stage (pan/zoom) é independente das transformações dos shapes

## Testando

Para testar a funcionalidade:

1. Inicie o servidor de desenvolvimento: `npm run dev`
2. Navegue até o editor
3. Desenhe alguns objetos (retângulos, círculos, linhas, curvas)
4. Selecione a ferramenta "Selecionar"
5. Clique em um objeto para selecioná-lo
6. Experimente mover, redimensionar e rotar
7. Verifique que as mudanças são preservadas após desselecionar
