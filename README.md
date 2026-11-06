# Black de Outro Mundo · Fontes Energia

Landing page da campanha Black de Outro Mundo da Fontes Energia (mentorada da Jornada do Milhão).
HTML, CSS e JavaScript puros, sem build.

## Como funciona

- **Investigação da conta**: a pessoa escolhe a faixa da conta e o tipo de imóvel, vê quanto paga de luz por ano e manda o nome. Abre o WhatsApp da Fontes com a mensagem pronta. Não há servidor nem banco de dados.
- **Contador em três fases**, pela data de Brasília:
  - de 10/11 a 26/11: expectativa, com contagem até o início da Black ("Reservar minha vaga");
  - de 27/11 a 29/11 (até 23h59): Black, com contagem até o fim ("Descobrir minha oferta");
  - depois: encerrada, com o contador zerado e o cadastro ainda aberto ("Quero ser atendido").

## Configurar

No `<body>` do `index.html`:

- `data-whatsapp`: número da Fontes, só dígitos, com 55 e DDD (ainda vazio);
- `data-lancamento` e `data-encerramento`: datas da campanha.

Para ver outro momento sem esperar a data: `index.html?agora=2026-11-27T09:00`.

## Testar no computador

Dê dois cliques em `TESTAR - index.html.bat` (precisa de Python). A página abre em `http://localhost:8781`.

## Pastas

- `assets/`: logo da campanha e imagem de fundo usadas na página.
- `imagens/`: imagens geradas no Gemini, com prompts e metadados.
- `prints/`: prints de conferência.
