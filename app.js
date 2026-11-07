// Landing Black de Outro Mundo (Fontes Energia).
// Investigação dentro do cartão: faixa (ou régua acima de R$ 1.000), para quem
// é a conta, varredura com o resultado e o nome, contato, escolha entre
// resolver agora (WhatsApp) e aguardar o agente. O contato vai para o
// Firestore (coleção leads, só criação; ver firestore.rules).

// WhatsApp dos agentes: vem de config/contato no Firestore (o admin troca no
// painel). O data-whatsapp do <body> só vale se o banco não responder.
let numeroWhatsApp = (document.body.dataset.whatsapp || '').replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Cálculo da conta (regra do Felipe, 07/11)
// Conta = iluminação pública + energia. Energia ÷ tarifa = kWh.
// Com 100% do consumo compensado pela energia solar, sobra pagar o Fio B
// (a 65%, R$ 0,30 por kWh) mais a iluminação pública.
// Exemplo: R$ 600 com R$ 112 de iluminação → 488 ÷ 1,30 = 375 kWh →
// Fio B 375 × 0,30 = 112,50 → nova conta 112,50 + 112 = R$ 224,50.
const TARIFA_KWH = 1.30;   // R$ por kWh com impostos (Equatorial Pará)
const FIO_B_KWH = 0.30;    // R$ por kWh de Fio B que continua sendo pago

// Iluminação pública de Belém (COSIP, Lei 10.113/2024, cobrada pela Equatorial).
// PROVISÓRIO: o anexo com as faixas não foi encontrado. Até a tabela chegar,
// usa a proporção do exemplo do Felipe (R$ 112 numa conta de R$ 600).
// Para usar a tabela: COSIP_FAIXAS = [{ ateKwh: 30, valor: 0 }, { ateKwh: 100, valor: 9.5 }, ...]
// com a última faixa em ateKwh: Infinity.
const COSIP_FAIXAS = null;
const COSIP_PROPORCAO = 112 / 600;

function iluminacaoPublica(conta) {
  if (!COSIP_FAIXAS) return conta * COSIP_PROPORCAO;
  for (const faixa of COSIP_FAIXAS) {
    const kwh = (conta - faixa.valor) / TARIFA_KWH;
    if (kwh <= faixa.ateKwh) return faixa.valor;
  }
  return COSIP_FAIXAS[COSIP_FAIXAS.length - 1].valor;
}

function contaComSolar(conta) {
  const iluminacao = iluminacaoPublica(conta);
  const kwh = Math.max(0, conta - iluminacao) / TARIFA_KWH;
  return iluminacao + kwh * FIO_B_KWH;
}

const reais = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

// Faixas: limites usados no cálculo e textos da mensagem
const FAIXAS = {
  'ate-300':   { de: null, ate: 300,  mes: 'até R$ 300' },
  '300-600':   { de: 300,  ate: 600,  mes: 'de R$ 300 a 600' },
  '600-1000':  { de: 600,  ate: 1000, mes: 'de R$ 600 a 1.000' }
};
const IMOVEIS = { casa: 'casa ou apartamento', empresa: 'comércio ou empresa', rural: 'área rural' };

// ---------------------------------------------------------------------------
// Fases da campanha: antes do lançamento, durante a Black e depois do fim.
const NOME_CAMPANHA = '<em>Black de Outro Mundo</em>';
const FASES = {
  antes: {
    titulo: `A ${NOME_CAMPANHA} começa em`,
    contagemSub: 'Reserve sua vaga agora e um agente te chama no WhatsApp quando abrir.',
    botao: 'Reservar minha vaga',
    pedido: 'Quero reservar minha vaga.',
    maleta: 'As condições da Black são passadas pelo agente no WhatsApp quando a campanha abrir.',
    fechamento: 'A Black de Outro Mundo está chegando. Reserve sua vaga antes de abrir.'
  },
  durante: {
    titulo: `As condições especiais da ${NOME_CAMPANHA} vão encerrar em`,
    contagemSub: 'Descubra a sua oferta antes que o tempo acabe.',
    botao: 'Descobrir minha oferta',
    pedido: 'Quero descobrir a minha oferta.',
    maleta: 'As condições de novembro são passadas pelo agente no WhatsApp.',
    fechamento: 'As condições da Black de Outro Mundo valem por tempo limitado.'
  },
  depois: {
    titulo: `As condições da ${NOME_CAMPANHA} encerraram`,
    contagemSub: 'Os agentes continuam investigando contas. Deixe seu nome e um agente te chama no WhatsApp.',
    botao: 'Quero ser atendido',
    pedido: 'Quero saber quanto economizo com energia solar.',
    maleta: 'As condições da Black encerraram. O agente passa as condições atuais no WhatsApp.',
    fechamento: 'A Black de Outro Mundo encerrou, mas ainda dá para investigar a sua conta.'
  }
};

const LANCAMENTO = Date.parse(document.body.dataset.lancamento || '');
const ENCERRAMENTO = Date.parse(document.body.dataset.encerramento || '');
// ?agora=2026-11-15T10:00 simula outra data e hora de Brasília (para conferir os cenários).
// Só aceita data completa: sem o parâmetro, "null" virava 01/01/2000 em alguns navegadores
const PEDIDA = new URLSearchParams(location.search).get('agora') || '';
const SIMULADA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(PEDIDA) ? Date.parse(`${PEDIDA}:00-03:00`) : NaN;
const DESVIO = Number.isNaN(SIMULADA) ? 0 : SIMULADA - Date.now();
const relogioAgora = () => Date.now() + DESVIO;

function faseAgora(agora = relogioAgora()) {
  if (agora < LANCAMENTO) return 'antes';
  if (agora < ENCERRAMENTO) return 'durante';
  return 'depois';
}

let fase = faseAgora();

// ---------------------------------------------------------------------------
// Firestore (SDK lite, carregado só quando precisa). Config pública por design.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBA6ucG2zQ5gEFzvQ0n3gwleVb8fbj4FjA',
  authDomain: 'fontes-landing-black.firebaseapp.com',
  projectId: 'fontes-landing-black',
  storageBucket: 'fontes-landing-black.firebasestorage.app',
  messagingSenderId: '15871244062',
  appId: '1:15871244062:web:4698d2c0a7d8036b1efb0f'
};
const SDK = 'https://www.gstatic.com/firebasejs/12.16.0';
let firestore = null;

function carregarFirestore() {
  if (!firestore) {
    firestore = Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore-lite.js`)
    ]).then(([app, fs]) => ({ fs, db: fs.getFirestore(app.initializeApp(FIREBASE_CONFIG)) }));
    firestore.catch(() => { firestore = null; });
  }
  return firestore;
}

let leadId = null;

// Código do lead = telefone-nome. Mesmo telefone com o mesmo nome cai no mesmo
// documento; as regras negam a segunda criação, e isso conta como "já registrado".
function codigoLead(telefone, nome) {
  const nomeLimpo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sem-nome';
  return `${telefone}-${nomeLimpo}`;
}

async function salvarLead(dados) {
  const { fs, db } = await carregarFirestore();
  const id = codigoLead(dados.telefone, dados.nome);
  try {
    await fs.setDoc(fs.doc(db, 'leads', id), { ...dados, criadoEm: fs.serverTimestamp() });
  } catch (erro) {
    if (erro?.code !== 'permission-denied') throw erro;
    console.info('[landing] contato já registrado com este telefone e nome');
  }
  return id;
}

// Busca o número dos agentes logo que a página abre, para o clique abrir na hora
setTimeout(() => {
  carregarFirestore()
    .then(({ fs, db }) => fs.getDoc(fs.doc(db, 'config', 'contato')))
    .then((snap) => { if (snap.exists() && snap.data().whatsapp) numeroWhatsApp = snap.data().whatsapp; })
    .catch((erro) => console.warn('[landing] número dos agentes não carregou; usando o da página', erro?.code));
}, 0);

async function salvarEscolha(escolha) {
  if (!leadId) return;
  const { fs, db } = await carregarFirestore();
  await fs.updateDoc(fs.doc(db, 'leads', leadId), { escolha, escolhidoEm: fs.serverTimestamp() });
}

// ---------------------------------------------------------------------------
const form = document.getElementById('investigacao');
const etapas = [...form.querySelectorAll('.etapa')];
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const regua = form.querySelector('.regua');
const reguaValor = form.querySelector('.regua-valor');

const valor = (nome) => form.querySelector(`input[name="${nome}"]:checked`)?.value;
const contaRegua = () => Number(form.conta.value);
const digitos = (v) => v.replace(/\D/g, '');

function linkWhatsApp(texto, numero = numeroWhatsApp) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function contaPorMes() {
  const faixa = valor('faixa');
  return faixa === '1000-mais' ? reais(contaRegua()) : FAIXAS[faixa].mes;
}

function mensagemLead() {
  const nome = form.nome.value.trim();
  return `Olá! Sou ${nome}. Fiz a investigação da conta na Black de Outro Mundo: ` +
    `minha conta vem ${contaPorMes()} por mês, em ${IMOVEIS[valor('imovel')]}. ` +
    FASES[fase].pedido;
}

const textosWhatsApp = {
  agente: () => 'Olá! Vim pela Black de Outro Mundo e quero falar com um agente sobre energia solar.',
  lead: mensagemLead,
  indicar: () => `Olhe isso: a Fontes Energia investiga sua conta de luz de graça e mostra quanto dá para economizar com energia solar. ${location.origin}${location.pathname}`
};

// Links de WhatsApp montados na hora do clique, com o texto do momento
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-wa]');
  if (!link) return;
  e.preventDefault();
  const tipo = link.dataset.wa;
  const url = tipo === 'indicar' ? linkWhatsApp(textosWhatsApp.indicar(), '') : linkWhatsApp(textosWhatsApp[tipo]());
  window.open(url, '_blank', 'noopener');
});

function mostrarEtapa(n) {
  etapas.forEach((el) => { el.hidden = el.dataset.etapa !== String(n); });
  const atual = etapas.find((el) => el.dataset.etapa === String(n));
  atual.querySelectorAll('.investigacao-aviso').forEach((a) => { a.hidden = true; });
  const titulo = atual.querySelector('h2');
  if (titulo && titulo.offsetParent) titulo.focus({ preventScroll: true });
}

function avisar(etapa, texto) {
  const aviso = etapa.querySelector('.investigacao-aviso');
  if (texto) aviso.textContent = texto;
  aviso.hidden = false;
}

// Régua: aparece só em "Mais de R$ 1.000"
function atualizarRegua() {
  regua.hidden = valor('faixa') !== '1000-mais';
  reguaValor.textContent = reais(contaRegua());
  const pct = ((contaRegua() - 1000) / 4000) * 100;
  form.conta.style.setProperty('--preenchido', `${pct}%`);
}

function textoResultado() {
  const faixa = valor('faixa');
  if (faixa === '1000-mais') {
    const conta = contaRegua();
    return [`Você paga ${reais(conta)} por mês.`, `Poderia estar pagando ${reais(contaComSolar(conta))}.`];
  }
  const { de, ate } = FAIXAS[faixa];
  if (de === null) {
    return [`Você paga até ${reais(ate)} por mês.`, `Poderia estar pagando até ${reais(contaComSolar(ate))}.`];
  }
  return [
    `Você paga entre ${reais(de)} e ${reais(ate)} por mês.`,
    `Poderia estar pagando entre ${reais(contaComSolar(de))} e ${reais(contaComSolar(ate))}.`
  ];
}

function varrer() {
  const etapa = form.querySelector('[data-etapa="3"]');
  const varredura = etapa.querySelector('.varredura');
  const resultado = etapa.querySelector('.resultado');
  const [paga, pode] = textoResultado();
  resultado.querySelector('.resultado-paga').textContent = paga;
  resultado.querySelector('.resultado-pode').textContent = pode;
  varredura.hidden = false;
  resultado.hidden = true;
  mostrarEtapa(3);
  carregarFirestore().catch(() => {});
  setTimeout(() => {
    varredura.hidden = true;
    resultado.hidden = false;
    resultado.querySelector('h2').focus({ preventScroll: true });
  }, reduzMovimento ? 0 : 1600);
}

// Telefone com máscara (91) 99999-9999
form.telefone.addEventListener('input', () => {
  const d = digitos(form.telefone.value).slice(0, 11);
  let v = d;
  if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  form.telefone.value = v;
});

form.addEventListener('input', (e) => {
  if (e.target === form.conta) atualizarRegua();
  if (e.isTrusted) e.target.closest('.etapa')?.querySelectorAll('.investigacao-aviso').forEach((a) => { a.hidden = true; });
});

form.addEventListener('change', (e) => {
  if (e.target.name === 'faixa') atualizarRegua();
  e.target.closest('.etapa')?.querySelectorAll('.investigacao-aviso').forEach((a) => { a.hidden = true; });
});

form.addEventListener('click', (e) => {
  const avancar = e.target.closest('[data-avancar]');
  const voltar = e.target.closest('[data-voltar]');
  const escolha = e.target.closest('[data-escolha]');
  if (voltar) { mostrarEtapa(voltar.dataset.voltar); return; }
  if (escolha) { escolher(escolha.dataset.escolha); return; }
  if (!avancar) return;
  const etapa = avancar.closest('.etapa');
  if (etapa.dataset.etapa === '1') {
    if (!valor('faixa')) { avisar(etapa); return; }
    mostrarEtapa(2);
  } else if (etapa.dataset.etapa === '2') {
    if (!valor('imovel')) { avisar(etapa); return; }
    varrer();
  } else if (etapa.dataset.etapa === '3') {
    if (form.nome.value.trim().length < 2) { avisar(etapa); form.nome.focus(); return; }
    mostrarEtapa(4);
  }
});

form.nome.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); form.querySelector('[data-avancar="4"]').click(); }
});

let enviando = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const etapa = form.querySelector('[data-etapa="4"]');
  const telefone = digitos(form.telefone.value);
  if (telefone.length < 10 || telefone.length > 11) { avisar(etapa, 'Confira o número: precisa do DDD e de 8 ou 9 dígitos.'); form.telefone.focus(); return; }
  if (enviando) return;

  const nome = form.nome.value.trim();
  const primeiro = nome.split(/\s+/)[0];
  form.querySelector('.registrado-titulo').textContent = `Investigação registrada, ${primeiro}.`;

  // Robô preencheu o campo isca: finge que deu certo e não grava nada
  if (form.site.value) { mostrarEtapa(5); return; }

  const dados = {
    nome: nome.slice(0, 60),
    telefone,
    faixa: valor('faixa'),
    imovel: valor('imovel'),
    fase,
    distribuido: false
  };
  if (dados.faixa === '1000-mais') dados.conta = contaRegua();
  if (location.search) dados.origem = location.search.slice(0, 300);

  const botao = etapa.querySelector('[type="submit"]');
  enviando = true;
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  try {
    leadId = await salvarLead(dados);
    mostrarEtapa(5);
  } catch (erro) {
    console.error('[landing] falha ao gravar o contato', erro);
    avisar(etapa, 'Não consegui enviar agora. Confira a internet e tente de novo.');
  } finally {
    enviando = false;
    botao.disabled = false;
    botao.textContent = 'Enviar aos agentes';
  }
});

function escolher(escolha) {
  if (escolha === 'agora') {
    window.open(linkWhatsApp(mensagemLead()), '_blank', 'noopener');
    mostrarEtapa(6);
  } else {
    mostrarEtapa(7);
  }
  salvarEscolha(escolha).catch((erro) => console.error('[landing] falha ao gravar a escolha', erro));
}

// Botões que levam de volta à investigação: rola até o cartão e foca a etapa
document.querySelectorAll('[data-ir-investigacao]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    form.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'center' });
    const atual = etapas.find((el) => !el.hidden);
    atual?.querySelector('h2')?.focus({ preventScroll: true });
  });
});

// Botão flutuante: aparece quando o cartão da investigação sai da tela
const flutuante = document.querySelector('.flutuante');
new IntersectionObserver(([entrada]) => {
  flutuante.hidden = entrada.isIntersecting;
}, { threshold: 0 }).observe(form);

// ---------------------------------------------------------------------------
// Contagem: dias, horas, minutos e segundos até o lançamento (antes) ou o fim (durante)
const contagem = document.querySelector('.contagem');
const relogio = contagem.querySelector('.contagem-relogio');
const numeros = Object.fromEntries([...relogio.querySelectorAll('[data-unidade]')].map((el) => [el.dataset.unidade, el]));
let ultimaFase = null;
let ultimoSegundo = null;
let ultimoRotulo = null;

function aplicarFase() {
  const textos = FASES[fase];
  contagem.dataset.fase = fase;
  contagem.querySelector('.contagem-titulo').innerHTML = textos.titulo;
  document.querySelectorAll('[data-texto-fase]').forEach((el) => {
    el.textContent = textos[el.dataset.textoFase];
  });
}

const doisDigitos = (n) => String(n).padStart(2, '0');

function atualizarContagem() {
  const agora = relogioAgora();
  fase = faseAgora(agora);
  if (fase !== ultimaFase) { aplicarFase(); ultimaFase = fase; ultimoSegundo = null; }

  const resta = fase === 'depois' ? 0 : (fase === 'antes' ? LANCAMENTO : ENCERRAMENTO) - agora;

  const segundosTotais = Math.max(0, Math.ceil(resta / 1000));
  if (segundosTotais === ultimoSegundo) return;
  ultimoSegundo = segundosTotais;

  const dias = Math.floor(segundosTotais / 86400);
  const horas = Math.floor((segundosTotais % 86400) / 3600);
  const minutos = Math.floor((segundosTotais % 3600) / 60);
  const segundos = segundosTotais % 60;
  numeros.dias.textContent = doisDigitos(dias);
  numeros.horas.textContent = doisDigitos(horas);
  numeros.minutos.textContent = doisDigitos(minutos);
  numeros.segundos.textContent = doisDigitos(segundos);

  // O rótulo para leitor de tela muda só a cada minuto, para não falar sem parar
  const rotulo = fase === 'depois'
    ? 'Encerrada'
    : `Faltam ${dias} dias, ${horas} horas e ${minutos} minutos`;
  if (rotulo !== ultimoRotulo) { relogio.setAttribute('aria-label', rotulo); ultimoRotulo = rotulo; }
}

if (Number.isNaN(LANCAMENTO) || Number.isNaN(ENCERRAMENTO)) {
  console.warn('[landing] datas da campanha inválidas (data-lancamento e data-encerramento no <body>)');
}
atualizarRegua();
atualizarContagem();
setInterval(atualizarContagem, 250);
