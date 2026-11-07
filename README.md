# Black de Outro Mundo · Fontes Energia

Landing page da campanha Black de Outro Mundo da Fontes Energia (mentorada da Jornada do Milhão).
HTML, CSS e JavaScript puros, sem build.

## Como funciona

- **Investigação da conta**: a pessoa escolhe a faixa da conta e o tipo de imóvel, vê quanto paga de luz por ano e manda o nome. Abre o WhatsApp da Fontes com a mensagem pronta. Não há servidor nem banco de dados.
- **Contador em três fases**, pela data de Brasília:
  - de 10/11 a 26/11: expectativa, com contagem até o início da Black ("Reservar minha vaga");
  - de 27/11 a 29/11 (até 23h59): Black, com contagem até o fim ("Descobrir minha oferta");
  - depois: encerrada, com o contador zerado e o cadastro ainda aberto ("Quero ser atendido").

## Painel de leads (`painel.html`)

Para a equipe da Fontes: login por e-mail e senha, funil em kanban
(Novo Lead, Tentativa de Contato, Proposta Enviada, Negociação, Visita
Técnica, Ganho, Perdido), cadastro de vendedores e rodízio.

- O contato da landing entra em `leads` (só criação) e o painel de quem
  estiver aberto entrega ao próximo vendedor ativo da fila, em ordem fixa.
  As regras conferem que é mesmo a vez daquele vendedor.
- Vendedor vê e move só os próprios leads. Administrador vê tudo, reatribui,
  cadastra pessoas, pausa e muda a ordem da fila.
- Primeiro acesso: só o e-mail do dono nasce administrador
  ("Primeiro acesso do administrador" na tela de entrada).
- Banco: Firebase `fontes-landing-black` (Firestore em São Paulo).
  Regras em `firestore.rules`, publicadas pelo console.

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
