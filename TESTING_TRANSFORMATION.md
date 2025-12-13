# Teste do Sistema de Transformação

## Checklist de Testes

### 1. Seleção de Objetos
- [ ] Clicar em retângulo seleciona o objeto
- [ ] Clicar em círculo seleciona o objeto
- [ ] Clicar em linha seleciona o objeto
- [ ] Clicar em curva seleciona o objeto
- [ ] Transformer aparece ao redor do objeto selecionado
- [ ] Clicar no fundo deseleciona o objeto
- [ ] Trocar para outra ferramenta remove o transformer

### 2. Movimentação (Drag)
- [ ] Retângulo pode ser arrastado
- [ ] Círculo pode ser arrastado
- [ ] Linha pode ser arrastada
- [ ] Curva pode ser arrastada
- [ ] Posição é preservada após soltar
- [ ] Movimento funciona com zoom aplicado
- [ ] Movimento funciona após pan do canvas

### 3. Redimensionamento
#### Retângulos
- [ ] Âncoras de canto redimensionam width e height
- [ ] Âncoras laterais redimensionam apenas uma dimensão
- [ ] Redimensionamento mínimo de 5px é respeitado
- [ ] Dimensões atualizadas são preservadas após transformação

#### Círculos
- [ ] Círculo pode ser redimensionado
- [ ] Raio é atualizado corretamente
- [ ] Raio mínimo de 2.5px é respeitado

#### Linhas
- [ ] Linha pode ser redimensionada
- [ ] Pontos são escalados proporcionalmente
- [ ] Linha mantém sua forma básica

#### Curvas
- [ ] Curva pode ser redimensionada
- [ ] Pontos e ponto de controle são escalados
- [ ] Forma da curva é mantida

### 4. Rotação
- [ ] Retângulo pode ser rotado
- [ ] Círculo pode ser rotado
- [ ] Linha pode ser rotada
- [ ] Curva pode ser rotada
- [ ] Ângulo de rotação é preservado
- [ ] Rotação funciona corretamente com formas redimensionadas

### 5. Curvas - Ponto de Controle
- [ ] Ponto de controle aparece quando curva está selecionada
- [ ] Linhas guia conectam ponto de controle aos endpoints
- [ ] Ponto de controle pode ser arrastado
- [ ] Curva é atualizada em tempo real durante o arrasto
- [ ] Nova posição do ponto de controle é preservada
- [ ] Ponto de controle se move junto com a curva

### 6. Integração
- [ ] Undo/Redo funcionam com transformações
- [ ] Múltiplas transformações podem ser feitas em sequência
- [ ] Transformar, deselecionar, e reselecionar preserva estado
- [ ] Zoom não interfere com transformações
- [ ] Pan não interfere com transformações

### 7. UI/UX
- [ ] Cursor muda para "default" quando ferramenta select está ativa
- [ ] Transformer usa cor primária (#673b45)
- [ ] Âncoras são visíveis e fáceis de clicar
- [ ] Forma selecionada tem borda destacada
- [ ] Feedback visual claro durante transformações

## Casos de Teste Específicos

### Teste 1: Criar e Transformar Retângulo
1. Selecionar ferramenta "Retângulo"
2. Desenhar um retângulo no canvas
3. Selecionar ferramenta "Selecionar"
4. Clicar no retângulo
5. Verificar que transformer aparece
6. Arrastar retângulo para nova posição
7. Redimensionar usando âncora do canto
8. Rotar usando âncora de rotação
9. Verificar que todas as mudanças são preservadas

### Teste 2: Criar e Transformar Círculo
1. Selecionar ferramenta "Círculo"
2. Desenhar um círculo
3. Selecionar ferramenta "Selecionar"
4. Clicar no círculo
5. Arrastar para mover
6. Redimensionar (raio deve mudar)
7. Rotar (visual não muda, mas rotação é armazenada)

### Teste 3: Criar e Transformar Linha
1. Selecionar ferramenta "Linha"
2. Desenhar uma linha diagonal
3. Selecionar ferramenta "Selecionar"
4. Clicar na linha
5. Mover a linha
6. Redimensionar (linha deve escalar)
7. Rotar a linha

### Teste 4: Criar e Transformar Curva
1. Selecionar ferramenta "Curva"
2. Desenhar uma curva
3. Selecionar ferramenta "Selecionar"
4. Clicar na curva
5. Verificar que ponto de controle aparece
6. Arrastar ponto de controle
7. Mover a curva inteira
8. Redimensionar a curva
9. Rotar a curva

### Teste 5: Transformações Múltiplas
1. Desenhar vários objetos (retângulo, círculo, linha, curva)
2. Selecionar cada um e aplicar transformações diferentes
3. Verificar que cada objeto mantém suas transformações independentemente
4. Testar Undo/Redo com múltiplas transformações

### Teste 6: Limites e Edge Cases
1. Tentar redimensionar objeto até tamanho mínimo
2. Verificar que redimensionamento para
3. Rotar objeto 360 graus
4. Transformar objetos em diferentes níveis de zoom
5. Transformar objetos após pan do canvas

## Problemas Conhecidos ou Limitações

1. **Círculos e Rotação**: Visualmente, rotar um círculo não tem efeito, mas o valor de rotação é armazenado.
2. **Transformação de Grupos**: Atualmente, não há suporte para selecionar múltiplos objetos.
3. **Snap/Grid**: Transformações não "snappam" para a grade.

## Próximos Passos Sugeridos

1. Adicionar seleção múltipla (Ctrl+Click ou arrastar caixa de seleção)
2. Adicionar snap para grade durante transformações
3. Adicionar transformação proporcional (Shift+Drag)
4. Adicionar clonagem (Alt+Drag)
5. Adicionar painel de propriedades mostrando valores numéricos exatos
6. Adicionar entrada manual de valores de transformação
