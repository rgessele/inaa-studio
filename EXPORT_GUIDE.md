# Guia de Exportação - Inaá Studio

## Visão Geral

O Inaá Studio oferece duas opções de exportação para seus projetos de modelagem:

1. **PDF A4 Multipágina** - Para impressão doméstica
2. **SVG Vetorial** - Para plotters profissionais

## Exportação para PDF A4

### Como Funciona

O sistema de exportação em PDF divide automaticamente seu desenho em páginas A4 que podem ser impressas em qualquer impressora doméstica e depois unidas para formar o molde em tamanho real.

### Especificações Técnicas

- **Formato**: A4 (21cm x 29.7cm)
- **Área de impressão**: 19cm x 27.7cm (com margens de 1cm)
- **Escala**: 1:1 (50cm no editor = 50cm impresso)
- **Resolução**: 3x (alta qualidade para impressão)

### Como Usar

1. Desenhe seu molde no editor
2. Clique no botão **Exportar** na barra de ferramentas (ícone de download)
3. Selecione **PDF A4 (Multipágina)**
4. O arquivo PDF será automaticamente gerado e baixado

### Características do PDF

Cada página do PDF inclui:

- **Marcas de Corte**: Cruzes nos cantos de cada página para facilitar o alinhamento
- **Numeração de Páginas**: Mostra "Página X de Y" para ajudar na montagem
- **Escala Real**: Imprime em tamanho 1:1 quando configurado para "escala 100%" na impressora

### Montagem das Páginas

1. Imprima todas as páginas em **escala 100%** (tamanho real)
2. Use as marcas de corte (+) nos cantos para alinhar as páginas
3. Cole ou prenda as páginas adjacentes
4. Verifique o alinhamento usando as marcas de registro

### Exemplo: Linha de 50cm

Uma linha horizontal de 50cm será dividida em aproximadamente 3 páginas:
- Página 1: 0cm - 19cm
- Página 2: 19cm - 38cm  
- Página 3: 38cm - 50cm

## Exportação para SVG

### Como Funciona

O formato SVG é vetorial, ideal para plotters profissionais ou para edição posterior em software como Adobe Illustrator ou Inkscape.

### Especificações Técnicas

- **Formato**: SVG (Scalable Vector Graphics)
- **Tipo**: Vetorial (não pixelado)
- **Compatibilidade**: Adobe Illustrator, Inkscape, CorelDRAW, plotters profissionais

### Como Usar

1. Desenhe seu molde no editor
2. Clique no botão **Exportar** na barra de ferramentas
3. Selecione **SVG (Vetorial)**
4. O arquivo SVG será automaticamente gerado e baixado

### Características do SVG

- **Escalável**: Pode ser redimensionado sem perda de qualidade
- **Editável**: Pode ser modificado em software de edição vetorial
- **Preciso**: Mantém coordenadas exatas de todos os elementos
- **Compatível**: Funciona com a maioria dos plotters profissionais

## Formatos Suportados

### Formas Exportadas

Todos os tipos de formas são suportados:

- ✅ Retângulos
- ✅ Círculos
- ✅ Linhas retas
- ✅ Curvas Bézier

### Propriedades Preservadas

- Posição (x, y)
- Dimensões (largura, altura, raio)
- Cor do traço (stroke)
- Espessura do traço (strokeWidth)
- Preenchimento (fill)
- Opacidade (opacity)

## Resolução de Problemas

### "Não há nada para exportar"

**Causa**: O canvas está vazio
**Solução**: Desenhe pelo menos uma forma antes de exportar

### PDF não imprime em escala correta

**Causa**: Configuração de impressão incorreta
**Solução**: Verifique se a opção de escala está em "100%" ou "Tamanho real" nas configurações da impressora

### Marcas de corte não aparecem

**Causa**: As marcas são temporárias e só aparecem no PDF
**Solução**: Normal - as marcas são adicionadas automaticamente durante a exportação

### SVG não abre no software

**Causa**: Software incompatível
**Solução**: Use software compatível com SVG como Inkscape (gratuito), Adobe Illustrator ou CorelDRAW

## Dicas e Melhores Práticas

### Para Impressão Doméstica (PDF)

1. **Use papel de boa qualidade** para facilitar a colagem
2. **Imprima em modo de alta qualidade** para linhas mais nítidas
3. **Confira a escala** antes de imprimir todas as páginas (imprima página 1 primeiro)
4. **Use fita adesiva transparente** para unir as páginas sem perder visibilidade das linhas

### Para Plotters (SVG)

1. **Verifique a compatibilidade** do seu plotter com SVG
2. **Teste com um desenho simples** primeiro
3. **Configure a escala correta** no software do plotter
4. **Use o formato PLT/HPGL** se seu plotter não suportar SVG (contate o suporte)

## Conversão de Unidades

O editor usa centímetros (cm) como unidade padrão:

- 1cm no editor = 1cm impresso (escala 1:1)
- 1cm = 37.7952755906 pixels (baseado no padrão CSS de 96 DPI)

## Limites e Restrições

- **Tamanho máximo**: Limitado apenas pela memória do navegador
- **Número de formas**: Sem limite técnico (mas PDFs muito grandes podem demorar para gerar)
- **Formatos de saída**: Atualmente PDF e SVG (PLT/HPGL em desenvolvimento)

## Suporte

Se encontrar problemas com a exportação, verifique:

1. ✅ O navegador está atualizado (Chrome, Firefox, Safari, Edge)
2. ✅ JavaScript está habilitado
3. ✅ Há espaço em disco para download
4. ✅ O bloqueador de pop-ups não está impedindo o download
