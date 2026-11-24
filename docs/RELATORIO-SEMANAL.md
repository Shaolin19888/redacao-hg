# Relatório semanal da Redação HG, para o Telegram

Especificação de uma funcionalidade da aplicação. Todas as segundas de manhã, a Redação HG envia para o Telegram um resumo da semana anterior, quantas notícias foram recusadas, quantas aprovadas e quanto custou o produto final.

## Porque é uma funcionalidade da app e não uma tarefa externa

Os dados vivem na base de dados Postgres da Redação HG. As aprovações e recusas são feitas no fluxo, incluindo por Telegram, e ficam registadas nos estados editoriais. O custo vem dos registos de uso dos modelos de IA. Uma tarefa agendada fora da aplicação não teria acesso a esta base de dados. Por isso o relatório é um trabalho agendado dentro da app, com o BullMQ e o Redis que já existem, e envia pelo bot de Telegram que já está previsto no .env.

## Pré-requisito, já resolvido no teu código

Confirmado por leitura do esquema. A app já regista, no modelo AgentDecision, o modelo usado, os tokensIn e os tokensOut de cada passo dos agentes, tanto do OpenAI como do Claude. Ou seja, os tokens já estão guardados. Só falta uma coisa, a tabela de preços por modelo para converter tokens em euros, porque o custo em si não está gravado.

O custo calcula-se com uma tabela de preços por milhão de tokens, guardada em configuração e não no código, para se poder atualizar sem mexer no programa. Fórmula por geração.

```
custo = (tokens_entrada / 1_000_000) * preco_entrada_do_modelo
      + (tokens_saida  / 1_000_000) * preco_saida_do_modelo
```

Guardar os preços por modelo num ficheiro de configuração, em euros, e rever de tempos a tempos, porque os preços das APIs mudam.

## Onde ver os preços atuais

Consultar sempre as páginas oficiais, que são a fonte fiável, porque os preços mudam com frequência. Os valores vêm por milhão de tokens e em dólares, converter para euros no cálculo.

- OpenAI, para o gpt-4o e o gpt-4o-mini. Página oficial, https://developers.openai.com/api/docs/pricing. Alternativa, https://openai.com/api/pricing/
- Anthropic, para o claude-sonnet. Página oficial, https://platform.claude.com/docs/en/about-claude/pricing. Alternativa, https://www.anthropic.com/pricing

Nota, os preços são publicados em dólares por milhão de tokens, com valores diferentes para entrada e para saída. O ficheiro de configuração deve guardar os dois por modelo, e o cálculo aplica a conversão para euro em vigor.

## O que o relatório mostra

Referente à semana anterior, de segunda a domingo.

- Notícias recusadas, número
- Notícias aprovadas, número
- Taxa de aprovação, aprovadas a dividir pelo total decidido
- Notícias publicadas no WordPress, número
- Custo total da semana, em euros
- Custo médio por notícia aprovada, em euros
- Custo por modelo, quanto foi do gpt-4o, do gpt-4o-mini e do claude-sonnet
- Opcional, número de voltas do ciclo de revisão em média, para medir a qualidade à primeira

## De onde vêm os números, mapa exato para o teu esquema

Confirmado no código, apps/web/prisma/schema.prisma.

- Aprovadas e recusadas, do modelo ApprovalRequest, campo decision, filtrado por decidedAt na semana. Aprovadas, decision igual a APPROVE_ALL. Recusadas, decision igual a REJECT_ALL ou CANCEL. As decisões parciais, APPROVE_TEXT_REJECT_IMAGE e REJECT_TEXT_APPROVE_IMAGE, são reciclagem e não decisão final, contar à parte ou ignorar na taxa.
- Publicadas, PipelineRun no estado PUBLISHED na semana, ou AgentDecision com toState igual a PUBLISHED.
- Custo, soma de tokensIn e tokensOut do modelo AgentDecision na semana, agrupado por model, aplicando a tabela de preços. A repartição por modelo sai deste mesmo agrupamento.
- Voltas do ciclo de revisão, contagem de AgentDecision do agente REVISER por run, média na semana.

## Agendamento

Trabalho repetível no BullMQ, à segunda de manhã, hora de Lisboa.

```
cron: "0 9 * * 1"
timezone: "Europe/Lisbon"
```

## Envio para o Telegram

Usar o Telegram Bot API, com o TELEGRAM_BOT_TOKEN já previsto. Enviar para o chat do relatório. Pode ser o mesmo TELEGRAM_CHAT_ID das aprovações, ou um canal dedicado. Se for dedicado, acrescentar ao .env.

```
TELEGRAM_REPORT_CHAT_ID=
```

Endpoint. `https://api.telegram.org/bot<TOKEN>/sendMessage`, com parse_mode HTML.

## Exemplo da mensagem de segunda

```
Relatório semanal da Redação HG
Semana de 7 a 13 de julho

Notícias decididas: 84
Aprovadas: 61
Recusadas: 23
Taxa de aprovação: 73%
Publicadas no site: 58

Custo da semana: 6,40 euros
Custo médio por notícia aprovada: 0,10 euros
Por modelo:
- gpt-4o: 4,10 euros
- gpt-4o-mini: 0,70 euros
- claude-sonnet: 1,60 euros

Qualidade: 1,4 voltas de revisão em média por peça
```

Os números acima são um exemplo, para se ver o formato. Os reais saem da base de dados.

## Nota sobre correr no PC com ngrok

Enquanto a app correr no teu PC e não numa VPS, o trabalho de segunda só dispara se o PC estiver ligado e o worker a correr às 9 da manhã de segunda. Se o PC estiver desligado a essa hora, o BullMQ não recupera sozinho a execução perdida. Solução simples, no arranque do worker, verificar se o relatório da semana anterior já foi enviado e, se não foi, enviar nesse momento. Assim, basta ligares o PC em algum momento de segunda para receberes o resumo. Quando passares para VPS, o problema desaparece, porque está sempre ligado.

## Instrução para o Claude Code construir

> Constrói uma funcionalidade de relatório semanal na Redação HG, apps/web. Os tokens já são registados no modelo AgentDecision, campos model, tokensIn e tokensOut. Cria uma tabela de preços por modelo em configuração, em euros, para gpt-4o, gpt-4o-mini e claude-sonnet. Cria um trabalho repetível no BullMQ, à segunda às 9 da manhã de Lisboa, com recuperação no arranque do worker caso a execução de segunda tenha sido perdida. O trabalho consulta a semana anterior e calcula, aprovadas e recusadas a partir de ApprovalRequest.decision por decidedAt, publicadas a partir de PipelineRun em PUBLISHED, e custo a partir da soma de tokensIn e tokensOut de AgentDecision agrupada por model vezes a tabela de preços. Envia um resumo em português europeu para o Telegram, usando o TELEGRAM_BOT_TOKEN, para o chat de relatório. Segue o formato do exemplo neste ficheiro. Regista no log cada envio. Não publiques nem envies nada além deste relatório sem aprovação humana.

## Nota de segurança

O bot só envia o relatório, não decide nada. As credenciais do Telegram ficam apenas no .env, nunca no código. O relatório não deve incluir dados sensíveis, apenas números agregados.
