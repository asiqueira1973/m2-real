# Prompt para o Claude Design: painel do Fechou por Quanto

Cole o texto abaixo no Claude Design.

---

Desenhe as telas do painel web interno do **Fechou por Quanto**, uma base de preço real de apartamentos organizada por prédio e planta, para 10 bairros de São Paulo. O painel serve para **conferir e corrigir** o que um pipeline automático calculou; não é um site público. Há um único perfil: **Admin**. Desktop primeiro (≥ 1280 px); no celular as telas só precisam ser legíveis.

## Direção visual

- Fundo branco, texto quase preto (#1D1D1F), cor primária azul (#0071E3). Tipografia Inter. Hairlines no lugar de bordas pesadas, cantos arredondados suaves, espaçamento generoso.
- **Cores semânticas só para os selos de área** (sempre com o texto do selo, nunca só a cor): Confirmada verde escuro (com a fonte ao lado: "revisão" ou "edital"), Calibrada verde, Indicativa âmbar, Estimada cinza-azulado, Sem dado cinza claro. Nenhum outro elemento usa essas cores.
- Tabelas densas para listas; cards só na Visão geral.
- Números no formato brasileiro: R$ 1.630.000, 94 m², R$ 17.340/m².
- Sem logotipo nem marca de empresa (produto interno).
- **Menu lateral estilo App Store Connect:**
  - grupos com título em **negrito escuro**, em caixa normal (nunca MAIÚSCULAS);
  - itens indentados sob o grupo, sem marcador;
  - traço fino (hairline) entre os grupos;
  - um item ativo por vez, com o texto em azul (#0071E3) e uma pílula azul clara ao fundo;
  - rodapé com o e-mail do usuário, "Sair" e um selo discreto de ambiente (dev/prod).

  Grupos e itens do menu:
  - **Base:** Visão geral, Prédios
  - **Qualidade:** Fila de revisão, Evidências sem vínculo
  - **Operação:** Execuções, Chaves de API

## Fluxo principal

Login → Visão geral (cobertura por bairro) → Prédios (filtra por bairro ou selo) → Ficha do prédio (confere plantas e vendas e, se preciso, confirma a área de uma planta). Caminho paralelo: Fila de revisão → Ficha do prédio, na aba do problema.

## Telas [Admin]

**1. Login**
- E-mail, senha, botão Entrar e link "Esqueci a senha".
- Estado de erro: credenciais inválidas.
- Estado alternativo de usuário sem perfil: "Acesso não autorizado. Fale com o administrador do Fechou por Quanto."

**2. Visão geral**
- Um card por bairro (10 cards):
  - nome do bairro;
  - vendas dos últimos 24 meses;
  - % de cobertura em destaque (vendas com área Calibrada ou Confirmada);
  - barra horizontal empilhada com a distribuição por selo, com legenda.
- Acima dos cards, uma faixa com a data e o status da última execução de cada rotina: ITBI, IPTU, Coleta de anúncios, Coleta de leilões, Calibração.
- Estados: carregando (esqueleto dos cards); vazio ("Nenhuma calibração concluída ainda"); erro.

**3. Prédios**
- Tabela com as colunas: endereço, bairro, ano de construção, nº de unidades, nº de plantas, pior selo das plantas (selo colorido), vendas em 24 meses, ícone de revisão pendente.
- Filtros: bairro, selo, "só com revisão pendente" e busca por endereço.
- A linha abre a Ficha do prédio.
- Estados: carregando, vazio ("Nenhum prédio com esses filtros") e erro.

**4. Ficha do prédio**
- Cabeçalho:
  - endereço e bairro;
  - ano, pavimentos e padrão;
  - "Vagas com cadastro próprio: sim/não";
  - fator do prédio.
- Cinco abas:
  - **Plantas:** tabela com área IPTU, área privativa, fator, selo, vagas inclusas, quartos, nº de unidades e marca "especial". Cada linha tem a ação "Confirmar área", que abre um painel lateral com os campos área privativa, vagas inclusas e observação obrigatória. O botão Confirmar fica desabilitado enquanto a observação estiver vazia. O painel mostra, ao lado do formulário, as evidências: anúncios e editais casados, com área e link. Outra ação da linha: "Marcar como especial".
  - **Vendas:** tabela com data, unidade, valor total, apartamento, vagas, área privativa, selo, m² privativo, m² IPTU e "fora da curva". A ação marca ou desmarca "fora da curva". Filtro de período no topo. Acima da tabela, um resumo: mediana do m² privativo e número de vendas.
  - **Anúncios:** tabela com domínio, finalidade, área, quartos, vagas, andar, preço pedido, status do vínculo e link externo. Ações: trocar a planta vinculada e descartar.
  - **Editais:** tabela de editais de leilão casados (site, unidade, matrícula, área privativa, área total, vagas, valor de avaliação, data do leilão, status do vínculo e link externo). Ações: trocar a unidade vinculada e descartar.
  - **Histórico:** linha do tempo das calibrações (data, área, selo, fonte, autor, observação).
- Estados: carregando, prédio sem vendas ("Nenhuma venda registrada neste prédio no período") e erro.

**5. Fila de revisão**
- Itens pendentes agrupados por motivo: fator incoerente, anúncios divergentes, anúncio ambíguo, planta especial, venda fora da curva, edital divergente.
- Cada item mostra o endereço, o motivo e as evidências resumidas (por exemplo, "planta de 132 m²: anúncios com 94 e 107 m²").
- O botão do item abre a Ficha do prédio na aba certa.
- Filtros: bairro e motivo.
- Estado vazio: "Nada para revisar agora."

**6. Evidências sem vínculo**
- Duas abas:
  - **Anúncios:** os "ambíguos" e "sem prédio", com domínio, endereço extraído, nome do condomínio, área, quartos, vagas e link.
  - **Editais:** os "sem prédio" e os casados só com o prédio, com site, endereço e complemento extraídos, matrícula, área privativa, vagas e link.
- Ações: "Vincular" (abre uma busca de prédio por endereço e depois a escolha da planta, no anúncio, ou da unidade, no edital) e "Descartar".
- Filtros: domínio e status.
- Estado vazio.

**7. Execuções**
- Tabela das últimas 50 execuções (rotinas: ITBI, IPTU, Coleta de anúncios, Coleta de leilões, Calibração): rotina, referência (ano), status (em andamento, concluída, falhou, substituída), linhas lidas, gravadas e descartadas, duração e mensagem de erro (expansível).
- Botão "Executar agora" por rotina, com confirmação.
- Filtros: rotina e status.

**8. Chaves de API**
- Lista de chaves: nome, prefixo, criada em, último uso, ativa.
- Botão "Nova chave", que abre um modal com o campo nome. Ao criar, o modal mostra a chave uma única vez, com botão de copiar e o aviso "Copie a chave agora. Ela não será mostrada de novo."
- Ação "Revogar", com confirmação.
- Estado vazio.

## Permissões

Só existe o perfil Admin, e ele pode tudo o que está descrito acima. Não há tela de cadastro, nem de criação de outros administradores, nem de exclusão de dados. Não desenhe essas telas.
