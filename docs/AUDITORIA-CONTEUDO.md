# Auditoria de conteúdo e poda, o Agente Auditor da Redação HG

Especificação de uma funcionalidade da aplicação. Analisa todo o conteúdo antigo do hugogil.pt, separa o que tem potencial do que é peso morto, e produz um relatório de triagem para o Hugo decidir. Nada é apagado sem aprovação humana.

## Porque isto existe

O site tem cerca de 4,55 mil páginas indexadas e 12,2 mil não indexadas. O maior motivo, 9.894 páginas, é "Rastreada, atualmente não indexada", ou seja, o Google leu essas páginas e decidiu que não vale a pena indexá-las. É um sinal de baixa qualidade em escala, e é a mesma raiz que tirou o site do Discover. A doutrina trata do futuro, escrever menos e melhor. Esta auditoria trata do passado, cortar o peso morto para a média de qualidade do site subir e o Google voltar a confiar.

## Onde vive

Módulo de auditoria na Redação HG, apps/web, com um Agente Auditor. Corre a pedido no painel, ou agendado de tempos a tempos. Reutiliza o cliente de WordPress que já existe, a base de dados, e a ligação ao Google Search Console prevista na Fase 8.

## Dados de entrada e de onde vêm

- Lista e conteúdo dos artigos. Do WordPress, pela API REST que a app já usa, ou pela base de dados. Percorrer todos os posts publicados.
- Tráfego por página. Do Google Search Console, API Search Analytics, cliques e impressões por URL nos últimos 16 meses. Usar as credenciais GSC previstas no .env. Em alternativa, se a API não estiver ligada, importar o ficheiro de exportação do relatório Páginas do Search Console.
- Estado de indexação. Idealmente pela API URL Inspection do Search Console, com a ressalva de que tem quota diária limitada, por isso é para usar só em casos de dúvida. Na prática, uma página com zero impressões em 16 meses já se comporta como não indexada, e esse é o sinal principal a usar em escala.

## Critério de avaliação, a régua da equipa

Cada artigo é pontuado por cinco fatores.

1. Tráfego real. Cliques e impressões nos últimos 16 meses. Zero e zero há meses é forte candidato a corte.
2. Estado de indexação. Indexada, ou rastreada e não indexada.
3. Qualidade à luz da doutrina. Resumo fininho sem ângulo, ou clickbait de indignação antigo, contra peça com valor próprio. Ver ESTILO-EDITORIAL-HG.md.
4. Atualidade. Efémero desatualizado, uma notícia de um jogo de há três anos, contra evergreen que continua útil.
5. Canibalização. Vários artigos sobre o mesmo lance ou tema a competir entre si.

## Estratégia para não gastar uma fortuna em IA

Não faz sentido correr um modelo de IA sobre dez mil artigos às cegas. A auditoria faz em duas camadas.

- Camada 1, por dados, barata e automática. Filtra por tráfego, idade e indexação. Um artigo com zero impressões em 16 meses, antigo e não indexado, é marcado logo como forte candidato a corte, sem gastar IA.
- Camada 2, por IA, só nos casos de dúvida. O Agente Auditor lê o conteúdo apenas dos artigos que ficam na zona cinzenta, para decidir se têm potencial de recuperação ou se são mesmo peso morto. Assim gasta-se IA em centenas, não em dez mil.

## Decisões possíveis por artigo

Para cada artigo, a equipa sugere uma de quatro decisões.

- Apagar. Peso morto sem tráfego nem valor. No WordPress, passar para rascunho ou lixo e devolver 410, ou redirecionar com 301 para um artigo melhor ou para a categoria. Nunca apagar em definitivo sem cópia de segurança.
- Juntar. Vários artigos fracos sobre o mesmo tema, consolidar num só bom e redirecionar os outros com 301.
- Melhorar. Tema com potencial mas peça fraca, reescrever com a doutrina e os três níveis.
- Manter. Já está bom ou tem tráfego, não mexer.

## O relatório de triagem

O que o Hugo recebe para decidir.

- Tabela com uma linha por artigo, ordenada por prioridade de corte.
- Colunas, URL, título, data, cliques 16 meses, impressões 16 meses, indexada sim ou não, decisão sugerida, motivo em uma linha.
- Totais no topo, quantos a apagar, a juntar, a melhorar, a manter, e a percentagem de peso morto.
- Disponível no painel e exportável em CSV.

## Aprovação humana, obrigatória

Isto respeita a regra do CLAUDE.md, apagar conteúdos exige aprovação humana. O relatório é só uma proposta. O Hugo revê, marca o que aceita e o que recusa, e só depois a app executa. E executa por lotes, com registo do que foi apagado ou redirecionado, para se poder reverter.

## Salvaguardas

- Nunca apagar em definitivo, primeiro para lixo ou rascunho, com período de segurança.
- Guardar sempre o URL antigo, o destino do redirecionamento e a data, num registo de auditoria.
- Começar por um lote pequeno de teste, cem artigos, confirmar que a triagem está sensata, e só depois escalar.
- Redirecionamentos 301 para não perder o pouco valor de SEO que exista.
- Atualizar o sitemap depois da poda.

## Como executar

Trabalho no BullMQ, a pedido a partir do painel, ou agendado. Corre por lotes para respeitar as quotas do WordPress e do Search Console. Regista o progresso e o custo de IA nos logs, como as outras funcionalidades.

## Instrução para o Claude Code construir

> Constrói um módulo de auditoria de conteúdo na Redação HG, apps/web, com um Agente Auditor. Passo 1, puxa todos os posts publicados do WordPress. Passo 2, para cada um, obtém cliques e impressões dos últimos 16 meses do Google Search Console, pela API Search Analytics, com as credenciais GSC do .env, ou por importação do CSV do relatório Páginas se a API não estiver ligada. Passo 3, camada por dados, marca como candidato a corte os artigos com zero impressões há meses, antigos e não indexados, sem gastar IA. Passo 4, camada por IA, só nos casos de dúvida, o Agente Auditor lê o conteúdo e avalia contra a doutrina ESTILO-EDITORIAL-HG.md, decidindo apagar, juntar, melhorar ou manter. Passo 5, gera um relatório de triagem no painel e em CSV, ordenado por prioridade de corte, com totais. Nada é apagado automaticamente, o Hugo aprova no painel, e só então a app executa por lotes, com 410 ou 301, registo de auditoria e possibilidade de reverter. Começa por um lote de teste de cem artigos. Regista custo e progresso nos logs. Mostra o plano antes de escrever código.

## Nota honesta sobre volume e quotas

A API URL Inspection do Search Console tem quota diária baixa, por isso o estado de indexação exato não se obtém para dez mil páginas de uma vez. A solução é usar o tráfego como sinal principal, zero impressões em 16 meses é sinal suficiente de página morta, e reservar a URL Inspection para desempates. A auditoria completa das dez mil páginas é um trabalho de dias, feito por lotes, não de minutos.
