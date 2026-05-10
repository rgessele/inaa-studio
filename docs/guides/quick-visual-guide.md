# Guia Visual Rápido - Sistema de Transformação

## Como Usar

### 1️⃣ Selecionar um Objeto

```
1. Clique no botão "Selecionar" (ícone de seta) na barra de ferramentas
   OU pressione a tecla 'V'

2. Clique em qualquer objeto no canvas

3. O Transformer aparece ao redor do objeto:
   ┌─────────────────┐
   │                 │
   │    Retângulo    │
   │                 │
   └─────────────────┘
   ↑ 8 âncoras (quadrados pequenos) + âncora de rotação (circulo no topo)
```

### 2️⃣ Mover um Objeto

```
1. Com o objeto selecionado
2. Clique e arraste dentro do objeto
3. Solte para fixar na nova posição

   [Antes]              [Durante]            [Depois]
   ┌───┐                                     ┌───┐
   │ A │  →  Arrastar  →  ╔═══╗  →          │ A │
   └───┘                   ║ A ║             └───┘
                          ╚═══╝
```

### 3️⃣ Redimensionar um Objeto

```
Âncoras nos Cantos:
┌───────────────┐    Arraste para redimensionar em ambas as direções
│               │    mantendo a proporção do canto
│               │
└───────────────┘

Âncoras nas Laterais:
┌───────┬───────┐    ← Arraste para redimensionar apenas horizontalmente
│       │       │
│       │       │    ou
├───────┼───────┤
│       │       │    Arraste para redimensionar apenas verticalmente ↓
└───────┴───────┘
```

### 4️⃣ Rotar um Objeto

```
              ⭕ ← Âncora de rotação
              │
         ┌────┴────┐
         │         │
         │         │
         └─────────┘

Arraste a âncora de rotação (⭕) em movimento circular
```

### 5️⃣ Editar Curva Bézier

```
Quando uma curva está selecionada:

    ●─────────────●  ← Endpoints da curva
     ╲           ╱
      ╲         ╱    ← Linhas guia (pontilhadas)
       ╲       ╱
         ⬤          ← Ponto de controle (roxo, arrastável)
          ╲
           ╲
         Curva

• Arraste o ponto de controle roxo para ajustar a curvatura
• Linhas guia mostram a influência do ponto de controle
• Curve é atualizada em tempo real
```

## Atalhos de Teclado

| Tecla    | Ação                                              |
| -------- | ------------------------------------------------- |
| `V`      | Ativar ferramenta Selecionar                      |
| `H`      | Ativar ferramenta Pan (mover canvas)              |
| `R`      | Ativar ferramenta Retângulo                       |
| `C`      | Ativar ferramenta Círculo                         |
| `L`      | Ativar ferramenta Linha                           |
| `U`      | Ativar ferramenta Curva                           |
| `Space`  | Temporariamente ativar Pan (enquanto pressionado) |
| `Ctrl+Z` | Desfazer                                          |
| `Ctrl+Y` | Refazer                                           |

## Dicas

### ✨ Desselecionar

Clique no fundo vazio do canvas para desselecionar

### ✨ Pan Temporário

Segure `Space` ou use o botão do meio do mouse para mover o canvas temporariamente, mesmo com objeto selecionado

### ✨ Zoom

Use a roda do mouse para zoom in/out. Transformações funcionam em qualquer nível de zoom

### ✨ Precisão

Para transformações mais precisas:

- Use zoom para ampliar a área
- Faça pequenos ajustes
- Use o grid como referência visual

## Comportamentos Especiais

### Retângulos

- Redimensionamento atualiza `width` e `height`
- Tamanho mínimo: 5px × 5px

### Círculos

- Redimensionamento atualiza `radius`
- Raio mínimo: 2.5px
- Rotação não tem efeito visual (mas é armazenada)

### Linhas

- Redimensionamento escala os pontos de início e fim
- Rotação gira a linha ao redor de seu ponto de origem

### Curvas

- Redimensionamento escala pontos e ponto de controle
- Ponto de controle permanece editável quando selecionado
- Rotação mantém a forma da curva

## Cores e Estilos

| Elemento             | Cor                                 | Descrição                 |
| -------------------- | ----------------------------------- | ------------------------- |
| Borda do Transformer | `#673b45`                           | Cor primária (roxo/vinho) |
| Âncoras              | `#673b45` com borda branca          | Fácil visualização        |
| Objeto selecionado   | Borda mais espessa + cor primária   | Feedback visual claro     |
| Ponto de controle    | `#673b45` com borda branca          | Destaca na curva          |
| Linhas guia          | `#673b45` pontilhada, 50% opacidade | Sutil mas visível         |

## Exemplos de Fluxo de Trabalho

### Desenhar e Ajustar um Retângulo

1. Selecione ferramenta Retângulo (`R`)
2. Clique e arraste para desenhar
3. Selecione ferramenta Selecionar (`V`)
4. Clique no retângulo
5. Arraste para mover, use âncoras para redimensionar, use âncora de rotação para rotar
6. Clique no fundo para desselecionar

### Criar e Ajustar uma Curva

1. Selecione ferramenta Curva (`U`)
2. Clique e arraste para criar a curva
3. A ferramenta automaticamente cria um ponto de controle
4. Selecione ferramenta Selecionar (`V`)
5. Clique na curva
6. Arraste o ponto de controle roxo para ajustar a curvatura
7. Use âncoras para redimensionar ou rotar toda a curva
8. Clique no fundo para desselecionar

### Trabalhar com Múltiplos Objetos

1. Desenhe vários objetos diferentes
2. Selecione ferramenta Selecionar (`V`)
3. Clique em cada objeto individualmente para transformá-lo
4. Use Undo/Redo para reverter transformações
