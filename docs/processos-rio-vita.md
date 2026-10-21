# Processos operacionais — Rio Vita

> Documento gerado a partir do sistema de gestão operacional (o que está implementado e as regras de negócio fixadas no código). Não cobre processos que só existam na rotina da equipe e nunca tenham entrado no sistema — esses pontos ficam listados no final, para complementação.
>
> Escopo: gestão **operacional**. Financeiro, fiscal e contábil continuam no Omie e não fazem parte deste documento.

---

## 1. Visão geral do ciclo

A Rio Vita opera um ciclo contínuo de piscicultura de tilápia, do povoamento dos viveiros até a venda do produto processado:

```
Povoamento → Biometria (acompanhamento) → Arraçoamento (diário)
    → Repicagem (troca de tanque conforme cresce) → Despesca (colheita)
    → Produção (beneficiamento) → Estoque → Expedição → Venda → Recebimento
```

Paralelamente, dois processos de suporte alimentam o ciclo:
- **Ração**: chegada de fornecedores → consumo diário via arraçoamento → controle de estoque e sugestão de compra.
- **Água**: análises periódicas por viveiro, usadas como registro de qualidade.

E dois processos financeiros operacionais (não substituem o Omie, são controle de campo):
- **Despesas** (soltas ou vinculadas a uma expedição) e **Caixa** (conferência do dinheiro do dia/da rota).
- **Recebimentos** (contas a receber de vendas a prazo).

---

## 2. Estrutura de viveiros e lotes

**Viveiro** é o tanque físico. Cada viveiro tem um `código` (ex.: `PE1`, `11.1`, `23`, `DEC`), uma `área (m²)` e um `tipo`:
- `pre_engorda` — recebe peixe jovem (fase pré-engorda).
- `engorda` — recebe peixe maior, fase de engorda até o abate.
- `decantacao` — tanque de decantação; **nunca** recebe povoamento, repicagem ou lote (regra travada no sistema).

Um viveiro pode ser marcado `ativo`/`inativo` — viveiro inativo não entra nas telas de lançamento nem nas projeções de capacidade, mas continua existindo no histórico.

**Lote** é o grupo de peixes que ocupa um viveiro num período. Regras centrais:
- **Um lote ativo por viveiro, sempre.** Não existem dois lotes abertos ao mesmo tempo no mesmo tanque.
- O lote nasce com povoamento ou como destino de uma repicagem, e tem uma `fase` (`pre_engorda` ou `engorda`) que segue o tipo do viveiro em que está.
- O `código` do lote é gerado automaticamente pelo sistema (ex.: `ENG-2026-14`, `PRE-2026-02`) — o operador nunca digita.
- O lote se fecha (`data_fim`) de duas formas:
  - **Automaticamente**, quando despesca ou repicagem zera o saldo de peixe do tanque (colheita total ou transferência total).
  - **Manualmente**, via "Encerrar lote" — usado quando se decide dar o lote por encerrado mesmo com saldo de pé (esse saldo remanescente entra como mortalidade da fase, ver seção 18).
- Um lote fechado libera o viveiro para receber um povoamento novo.

---

## 3. Povoamento

**O que é:** lançamento inicial de um lote num viveiro vazio.

**Dados registrados:** viveiro, data, quantidade inicial de peixes, peso médio inicial (g), observação opcional.

**Regras:**
- Viveiro de decantação não aceita povoamento.
- A fase do lote (pré-engorda/engorda) é definida automaticamente pelo tipo do viveiro escolhido — não é uma escolha manual.
- O código do lote é gerado pelo sistema no padrão `PRE-AAAA-NN` ou `ENG-AAAA-NN` (sequencial por fase/ano).
- Um povoamento pode ser corrigido depois (data, quantidade, peso, observação) — usado, por exemplo, quando um erro em outro lançamento (como uma repicagem errada) deixou o saldo do tanque errado e a única forma de corrigir é ajustando a base.

---

## 4. Biometria (acompanhamento de crescimento)

**O que é:** pesagem periódica de amostra de peixes de um lote, para acompanhar o crescimento real contra o esperado.

**Dados registrados:** lote, data, peso médio (g). Uma biometria por lote/data.

**Uso no sistema:**
- Alimenta a **curva de crescimento** (tabela de arraçoamento, ver seção 6): a última biometria de um lote é comparada com a semana equivalente na curva-padrão, projetando o peso esperado dali em diante.
- Alimenta a **programação de abate**: com base no peso mais recente e na curva, o sistema projeta em quantas semanas o lote atinge o peso de abate.
- Editável e excluível (com reversão) como qualquer outro lançamento.

---

## 5. Análise da água

**O que é:** medições de qualidade da água por viveiro.

**Dados registrados:** viveiro, data, oxigênio, temperatura (°C), amônia, pH, nitrito, nitrato.

**Uso no sistema:** série histórica dos últimos 60 dias por viveiro (painel "Análise da água"). Hoje é só registro/consulta — não dispara alerta automático.

---

## 6. Arraçoamento

**O que é:** lançamento da quantidade de ração fornecida a cada tanque, por dia.

**Dados registrados:** lote, data, sacos de ração, tipo de ração (opcional — fornecedor + código, ex.: `32AP`).

**Regras e apoio à decisão:**
- Existe uma **tabela de arraçoamento** (curva-padrão por semana de vida): peso inicial/final esperado, consumo diário e semanal esperado (por 1.000 peixes), sacos esperados, % de proteína, conversão alimentar — é a referência técnica usada para projetar consumo e crescimento.
- O sistema projeta **quanto ração é esperado** por tanque/dia, cruzando a última biometria (ou o peso inicial do povoamento, se ainda não tem biometria) com a curva-padrão e o saldo de peixes vivos.
- Pode ler uma ficha de arraçoamento fotografada (preenchida à mão) e converter em lançamento — o operador confirma os valores lidos antes de gravar.
- Lançamento é sempre **um total por dia por tanque** (não é mais dividido por horário de trato).

---

## 7. Repicagem

**O que é:** transferência de peixes de um ou mais tanques de origem para um tanque de destino — normalmente para reduzir densidade (peixe cresceu, precisa de mais espaço).

**Dados registrados:** um ou mais viveiros de origem (com a quantidade retirada de cada um), viveiro de destino, peso médio, data.

**Regras:**
- Viveiro de decantação não recebe repicagem.
- Se o destino **já tem** lote ativo, a nova leva se soma a ele (mesmo lote, `quantidade_inicial` aumentada) — não cria um segundo lote no mesmo tanque.
- Se o destino **não tem** lote ativo, cria-se um lote novo, com fase seguindo o tipo do viveiro de destino.
- Repicagem **parcial**: se a quantidade retirada for menor que o saldo do tanque de origem, o restante continua ativo lá. Repicagem **total** (quantidade ≥ saldo): fecha automaticamente o lote de origem.
- Cada evento de repicagem entre um par origem→destino é um registro próprio — o mesmo par pode ter mais de uma repicagem em datas diferentes (parcelada).
- Editável e excluível (com reversão). Excluir ou corrigir uma repicagem que tinha esvaziado (fechado) o tanque de origem reabre esse tanque automaticamente, se o saldo voltar a ficar positivo — a menos que o viveiro já tenha outro lote ativo criado nesse meio tempo (nesse caso não reabre, para nunca haver dois lotes ativos no mesmo tanque).
- Há um painel de **sugestão de repicagem** que compara a densidade atual de cada tanque contra o limite (kg/m², configurável por fase) e sugere: repicagem total (se algum conjunto de tanques vazios comporta todos os lotes acima do limite), repicagem parcial (prioriza o tanque mais acima do limite), ou, faltando tanque vazio, sugere despescar tanques já prontos para abrir espaço. Só mistura lotes de origens diferentes no mesmo destino se a diferença de peso entre eles for pequena (até ~2 semanas na curva).
- Há também uma **projeção de capacidade**: simula, tanque a tanque, quando cada lote vai estourar a densidade no futuro, aplicando a mesma prioridade (repicar → despescar → ativar tanque novo), para dar antecedência de preparo.

---

## 8. Despesca

**O que é:** colheita de peixe de um tanque — o peixe sai do viveiro e vira matéria-prima para processamento (ou é vendido inteiro).

**Dados registrados:** lote, data, destino (`filé`, `postas`, `inteira limpa`, `inteira suja`), quantidade de peixes, peso médio (g). O peso total (kg) é calculado.

**Regras:**
- Pode haver mais de uma despesca do mesmo lote no mesmo dia, com destinos diferentes (parte vira filé, parte é vendida inteira suja, por exemplo) — o sistema separa esses totais por destino ao calcular rendimento.
- Despesca que **zera** o saldo do tanque fecha o lote automaticamente (mesma regra da repicagem). Se a correção de uma despesca já lançada zerar o saldo, o lote também fecha; se uma exclusão/correção fizer o saldo voltar a ficar positivo, o lote reabre (com a mesma trava de "não reabrir se já existe outro lote ativo no tanque").
- Editável e excluível (com reversão e histórico de quem excluiu/quando).

---

## 9. Produção (beneficiamento)

**O que é:** registro do que foi efetivamente produzido a partir de uma despesca — filé, postas ou tilápia limpa embalados.

**Dados registrados:** produto, data, lote e data de despesca de origem, quantidade (em embalagens ou em kg, dependendo do produto), data.

**Regras e cálculo de rendimento:**
- Cada produto tem uma "família" pelo nome: `Filé%`, `Postas%`, `Tilápia limpa%` (tilápia suja não passa por produção — vai direto da despesca para a venda).
- **Rendimento** = peso produzido daquela família ÷ peso despescado (do destino correspondente), no mesmo lote e mesma data de despesca. É a métrica-chave de eficiência do beneficiamento.
- Também pode ler uma ficha de produção fotografada e propor o lançamento, com confirmação do operador.
- Editável e excluível (com reversão).

---

## 10. Estoque de produto acabado

**O que é:** não é lançado diretamente — é **calculado**: `produzido − vendido − em trânsito (em expedição aberta) − ajustes`, por produto, acumulado desde sempre (o filtro de período só limita quais movimentos entram na conta, o saldo em si é sempre "até agora").

**Ajustes de estoque** (esses sim são lançados manualmente) — usados para amostra, descarte ou correção de diferença de estoque:
- **Amostra**: peixe retirado para degustação/qualidade.
- **Descarte**: perda/quebra.
- **Diferença de estoque**: correção quando a contagem física não bate com o sistema — é o único tipo que aceita ajuste "para cima" (reduzir o quanto o sistema mostrava a mais, ou aumentar quando mostrava a menos).
- Todos são editáveis e excluíveis (com reversão).

---

## 11. Ração — fornecedores, chegada e consumo

**Cadastro:** fornecedores de ração, cada um com um ou mais tipos de ração (código, ex.: `30AR`, `32AP`, `36AP`, `40AP`, `45AP`).

**Chegada de ração:** registro de data, fornecedor, e quantidade de sacos por tipo recebido.

**Consumo:** é o que já foi lançado em arraçoamento, somado por tipo.

**Estoque de ração** (calculado): `chegou − consumido`, por tipo. O sistema também projeta:
- Consumo esperado por dia (mesmo cálculo do arraçoamento previsto, atribuído ao último tipo de ração usado por cada lote).
- Dias restantes de estoque por tipo.
- Sugestão de quantos sacos pedir na próxima carga (horizonte de 30 dias).

---

## 12. Expedição

**O que é:** saída de um vendedor/entregador com uma carga de produtos para vender em rota — só se fecha (acerta) quando ele retorna.

**Abertura da expedição:** vendedor, data de saída, itens (produto + quantidade em embalagens ou kg), observação.

**Regra central:** **um vendedor não pode ter duas expedições abertas ao mesmo tempo** — precisa acertar a anterior antes de sair com carga nova.

**Edição:** só é possível **enquanto a expedição está aberta** (sem acerto) — depois de acertada, já gerou vendas e despesas reais e fica travada. Toda edição enquanto aberta fica registrada com "antes/depois" (quem editou, quando).

---

## 13. Acerto de expedição

**O que é:** o fechamento da rota — o vendedor volta e informa o que vendeu, o que retornou (não vendido) e as despesas da rota.

**No acerto, de uma vez:**
- Lança as **vendas** (cliente, produto, quantidade, preço, forma de pagamento, prazo) — a `data` de todas as vendas é a data do acerto.
- Lança os **retornos** (produto que saiu e voltou sem vender).
- Lança as **despesas** da rota (categoria, valor, forma de pagamento).
- Marca a expedição como acertada (`data_acerto`).

**Conferência automática:** o relatório do acerto mostra, por produto: quanto saiu (expedido), quanto foi vendido, quanto retornou, e a **diferença** (expedido − vendido − retornado) — o que sobra de diferença é o que não bateu (sobra/falta a explicar).

**Cancelar acerto:** desfaz um acerto já fechado — cancela (exclusão reversível, como o "Excluir" de Recebimentos) as vendas geradas, remove despesas e retornos lançados no acerto (esses não têm histórico — se precisar consultar algum valor antes de cancelar, é preciso ver no relatório de acertos antes) e reabre a expedição para ser acertada de novo do zero.

**Correção depois de acertada:** despesas e retornos do acerto continuam editáveis; a venda gerada também pode ser editada/excluída como qualquer venda (ver seção 15).

---

## 14. Venda

Toda venda nasce de um acerto de expedição (não existe lançamento de venda solto fora desse fluxo, hoje). Cada venda tem: data, cliente (ou "consumidor final"), vendedor, produto, quantidade, preço/kg, valor total, forma de pagamento, situação (`Em aberto`/`Pago`), data prevista de recebimento (para venda a prazo) e data de pagamento (quando paga).

**Cadastro de cliente:** nome, CNPJ, contato, cidade, prazo de pagamento padrão (dias), se emite NF, se emite boleto, e uma tabela de preço por produto (preço combinado por cliente).

---

## 15. Recebimentos

**O que é:** controle de quais vendas a prazo já foram pagas.

**Funcionalidades:**
- Lista vendas por período, situação (`Em aberto`/`Pago`/todas), cliente, vendedor, produto, forma de pagamento.
- "Marcar como pago" — um clique, registra a data de hoje e a forma de pagamento.
- Edição completa de qualquer campo do lançamento (data, cliente, produto, quantidade, preço, forma, prazo, situação, data de pagamento) — útil para corrigir erro de digitação ou reverter uma baixa marcada por engano.
- Exclusão reversível (some da lista normal, mas fica disponível em "Ver excluídas" para restaurar).
- Uma venda é considerada **vencida** quando passou da data prevista de recebimento e ainda não foi paga.

---

## 16. Despesas

Duas origens possíveis:
- **Vinculada a uma expedição** — lançada no momento do acerto (seção 13), some junto se o acerto for cancelado.
- **Solta** — sem vínculo com expedição, lançamento direto (categoria: Abastecimento, Alimentação, Manutenção, Material de escritório, Outro; forma: Dinheiro, Pix, Cartão).

Ambas são editáveis; despesa solta também é excluível/restaurável (a de expedição some junto do cancelamento do acerto, não tem exclusão própria).

---

## 17. Caixa

**O que é:** conferência operacional do dinheiro — não é fluxo de caixa completo (isso é papel do Omie), é só o que já está registrado no sistema como venda ou despesa em **dinheiro** (forma de pagamento = Dinheiro), por dia, comparado (vendas − despesas = saldo).

Também lista as **expedições em aberto** (ainda não acertadas) e há quantos dias cada uma está fora.

---

## 18. Regras transversais (valem para todos os processos)

**Fechamento e reabertura de lote:** um lote fecha quando o saldo de peixe zera (despesca ou repicagem total) ou manualmente (Encerrar lote). Excluir ou corrigir um lançamento que tinha causado o fechamento reabre o lote automaticamente se o saldo voltar a ficar positivo — protegido para nunca deixar dois lotes ativos no mesmo tanque.

**Mortalidade:** não é lançada diretamente. Quando um lote fecha, a mortalidade da fase é calculada como: `quantidade inicial − (o que saiu por despesca) − (o que saiu por repicagem)`. O que sobra é peixe que nunca foi contabilizado numa saída — presume-se morte. Por isso um lote **precisa estar fechado** para entrar na conta de mortalidade (lote aberto não conta).

**Rendimento:** peso produzido (por família de produto) ÷ peso despescado (do destino correspondente), sempre por lote + data de despesca — nunca uma média simples entre lançamentos, para não distorcer quando há mais de um produto do mesmo lote/dia.

**Exclusão reversível com histórico:** despesca, repicagem, arraçoamento, produção, venda, biometria, despesa (solta) e ajuste de estoque podem ser corrigidos ou excluídos — a exclusão nunca apaga a linha, só marca como excluída (com quem excluiu e quando), e pode ser restaurada. Toda tela de conferência tem um alternador "Ver excluídas".

**Lançamento em campo / offline:** os lançamentos operacionais (despesca, produção, povoamento, repicagem, biometria, arraçoamento, análise de água, venda, expedição, acerto, despesa, chegada de ração) são gravados primeiro no aparelho e sincronizados quando a conexão volta — o operador não perde o lançamento por estar sem sinal no viveiro. Cada lançamento tem um identificador próprio gerado no aparelho, para nunca duplicar mesmo que a sincronização seja tentada mais de uma vez. Lançamentos pendentes de sincronizar (e o motivo, se falharem) ficam visíveis numa tela de pendências.

**Curva de crescimento (tabela de arraçoamento):** é a referência técnica usada em quatro lugares — projeção de peso por idade, arraçoamento previsto, programação de abate, e sugestão de repicagem/projeção de capacidade. Uma mesma fonte de verdade para todo o planejamento.

---

## 19. Painéis gerenciais (consulta, sem lançamento)

Todos somente leitura, derivados dos dados acima — não introduzem lançamento novo, só outra forma de ver o mesmo dado:

- **Dashboard** — visão geral do período: produção, vendas, rendimento, mortalidade, alertas de densidade (foco em Filé, por ser o produto de maior valor).
- **Painel do viveiro** — saldo, densidade, biometria e água por tanque, lado a lado.
- **Programação de abate** — previsão de quando cada lote atinge o peso de abate, a partir da última biometria e da curva.
- **Produção e rendimento** — peso sujo e rendimento ponderados por período, com detalhe por lançamento.
- **Despesca / Repicagem / Arraçoamento / Biometria** — telas de conferência com opção de corrigir cada lançamento.
- **Estoque** / **Estoque de ração** — saldo calculado e histórico de ajustes/chegadas.
- **Mortalidade por fase** — só lotes já encerrados, separado por pré-engorda/engorda.
- **Comercial** — vendas por período, funil por cliente e por produto.
- **Análise da água** — série dos últimos 60 dias por viveiro.
- **Caixa** — conferência do dinheiro, por dia e por expedição em aberto.
- **Acertos de expedição** — acertos já fechados, com opção de corrigir despesas/retornos ou cancelar o acerto inteiro.
- **Despesas** (soltas) — conferência e correção.
- **Sugestão de repicagem** / **Projeção de capacidade** — apoio à decisão de manejo (quando e para onde repicar).

---

## 20. Fora do escopo do sistema

Financeiro completo, fiscal, contábil e compras continuam no **Omie** — o sistema não reimplementa nenhuma dessas funções. O que existe aqui (Despesas, Caixa, Recebimentos) é controle operacional de campo, não substitui a contabilidade.

---

## 21. Pontos a confirmar com você

Isto documenta o que está modelado no sistema. Ficam em aberto, porque não tenho como saber pelo código:

1. **Papéis e responsabilidades** — quem faz o quê no dia a dia (ex.: quem faz biometria, quem faz o acerto de expedição, quem aprova ajuste de estoque) — o sistema só registra o nome de quem lançou, não define papéis.
2. **Critérios de decisão que ainda são "de cabeça"** — por exemplo, quando exatamente se decide encerrar um lote manualmente com saldo de pé, ou quando um ajuste de estoque é aceito sem mais conferência.
3. **Processos comerciais fora da expedição** — se existe venda direta (balcão, sem vendedor em rota) que hoje não passa pelo sistema.
4. **Relação com o Omie** — como e quando os dados daqui viram lançamento lá (é manual? tem alguma conciliação?).
5. **Alertas e limites** — os limites de densidade e o horizonte de sugestão de compra de ração são parametrizáveis no sistema; se há outros limites/alçadas que a operação usa e que ainda não estão parametrizados, vale registrar.

Se quiser, posso ajustar este documento conforme as respostas, ou aprofundar alguma seção específica.
