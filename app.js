// Landing Black de Outro Mundo (Fontes Energia).
// Investigação em quatro etapas dentro do cartão: faixa, imóvel, resultado com
// nome e obrigado. Sem servidor: o contato chega à Fontes pelo WhatsApp.

const NUMERO = (document.body.dataset.whatsapp || '').replace(/\D/g, '');
if (!NUMERO) console.warn('[landing] número de WhatsApp da Fontes não configurado (data-whatsapp no <body>)');

const FAIXAS = {
  'ate-300':   { mes: 'até R$ 300',        ano: 'até R$ 3.600' },
  '300-600':   { mes: 'de R$ 300 a 600',   ano: 'entre R$ 3.600 e R$ 7.200' },
  '600-1000':  { mes: 'de R$ 600 a 1.000', ano: 'entre R$ 7.200 e R$ 12.000' },
  '1000-mais': { mes: 'acima de R$ 1.000', ano: 'mais de R$ 12.000' }
};
const IMOVEIS = { casa: 'casa ou apartamento', empresa: 'comércio ou empresa', rural: 'área rural' };

// Fases da campanha: antes do lançamento, durante a Black e depois do fim.
// Textos são proposta: a Fontes aprova antes de publicar.
const NOME_CAMPANHA = '<em>Black de Outro Mundo</em>';
const FASES = {
  antes: {
    titulo: `A ${NOME_CAMPANHA} começa em`,
    contagemSub: 'Reserve sua vaga agora e um agente te chama no WhatsApp quando abrir.',
    botao: 'Reservar minha vaga',
    enviar: 'Reservar pelo WhatsApp',
    obrigado: 'Vaga reservada',
    pedido: 'Quero reservar minha vaga.',
    maleta: 'As condições da Black são passadas pelo agente no WhatsApp quando a campanha abrir.',
    fechamento: 'A Black de Outro Mundo está chegando. Reserve sua vaga antes de abrir.'
  },
  durante: {
    titulo: `As condições especiais da ${NOME_CAMPANHA} vão encerrar em`,
    contagemSub: 'Descubra a sua oferta antes que o tempo acabe.',
    botao: 'Descobrir minha oferta',
    enviar: 'Receber minha oferta no WhatsApp',
    obrigado: 'Investigação aberta',
    pedido: 'Quero descobrir a minha oferta.',
    maleta: 'As condições de novembro são passadas pelo agente no WhatsApp.',
    fechamento: 'As condições da Black de Outro Mundo valem por tempo limitado.'
  },
  depois: {
    titulo: `As condições da ${NOME_CAMPANHA} encerraram`,
    contagemSub: 'Os agentes continuam investigando contas. Deixe seu nome e um agente te chama no WhatsApp.',
    botao: 'Quero ser atendido',
    enviar: 'Receber no WhatsApp',
    obrigado: 'Cadastro feito',
    pedido: 'Quero saber quanto economizo com energia solar.',
    maleta: 'As condições da Black encerraram. O agente passa as condições atuais no WhatsApp.',
    fechamento: 'A Black de Outro Mundo encerrou, mas ainda dá para investigar a sua conta.'
  }
};

const LANCAMENTO = Date.parse(document.body.dataset.lancamento || '');
const ENCERRAMENTO = Date.parse(document.body.dataset.encerramento || '');
// ?agora=2026-11-15T10:00 simula outra data e hora de Brasília (para conferir os cenários)
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

const form = document.getElementById('investigacao');
const etapas = [...form.querySelectorAll('.etapa')];
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

const valor = (nome) => form.querySelector(`input[name="${nome}"]:checked`)?.value;

function linkWhatsApp(texto, numero = NUMERO) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function mensagemLead() {
  const nome = form.nome.value.trim();
  return `Olá! Sou ${nome}. Fiz a investigação da conta na Black de Outro Mundo: ` +
    `minha conta vem ${FAIXAS[valor('faixa')].mes} por mês, em ${IMOVEIS[valor('imovel')]}. ` +
    FASES[fase].pedido;
}

const textos = {
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
  const url = tipo === 'indicar' ? linkWhatsApp(textos.indicar(), '') : linkWhatsApp(textos[tipo]());
  window.open(url, '_blank', 'noopener');
});

function mostrarEtapa(n) {
  etapas.forEach((el) => { el.hidden = el.dataset.etapa !== String(n); });
  const atual = etapas.find((el) => el.dataset.etapa === String(n));
  atual.querySelectorAll('.investigacao-aviso').forEach((a) => { a.hidden = true; });
  const titulo = atual.querySelector('h2:not([hidden])');
  if (titulo && titulo.offsetParent) titulo.focus({ preventScroll: true });
}

function avisar(etapa) {
  const aviso = etapa.querySelector('.investigacao-aviso');
  aviso.hidden = false;
}

function varrer() {
  const etapa = form.querySelector('[data-etapa="3"]');
  const varredura = etapa.querySelector('.varredura');
  const resultado = etapa.querySelector('.resultado');
  resultado.querySelector('.resultado-valor').textContent = `Você paga ${FAIXAS[valor('faixa')].ano} de luz por ano.`;
  varredura.hidden = false;
  resultado.hidden = true;
  mostrarEtapa(3);
  setTimeout(() => {
    varredura.hidden = true;
    resultado.hidden = false;
    resultado.querySelector('h2').focus({ preventScroll: true });
  }, reduzMovimento ? 0 : 1600);
}

form.addEventListener('change', (e) => {
  e.target.closest('.etapa')?.querySelectorAll('.investigacao-aviso').forEach((a) => { a.hidden = true; });
});

form.addEventListener('click', (e) => {
  const avancar = e.target.closest('[data-avancar]');
  const voltar = e.target.closest('[data-voltar]');
  if (voltar) { mostrarEtapa(voltar.dataset.voltar); return; }
  if (!avancar) return;
  const etapa = avancar.closest('.etapa');
  if (etapa.dataset.etapa === '1') {
    if (!valor('faixa')) { avisar(etapa); return; }
    mostrarEtapa(2);
  } else if (etapa.dataset.etapa === '2') {
    if (!valor('imovel')) { avisar(etapa); return; }
    varrer();
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const etapa = form.querySelector('[data-etapa="3"]');
  const nome = form.nome.value.trim();
  if (!nome) { avisar(etapa.querySelector('.resultado')); form.nome.focus(); return; }
  window.open(linkWhatsApp(mensagemLead()), '_blank', 'noopener');
  const primeiro = nome.split(/\s+/)[0];
  form.querySelector('.obrigado-titulo').textContent = `${FASES[fase].obrigado}, ${primeiro}.`;
  mostrarEtapa(4);
});

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

// Contagem: dias, horas e minutos até o lançamento (antes) ou o fim (durante)
const contagem = document.querySelector('.contagem');
const relogio = contagem.querySelector('.contagem-relogio');
const numeros = Object.fromEntries([...relogio.querySelectorAll('[data-unidade]')].map((el) => [el.dataset.unidade, el]));
let ultimaFase = null;
let ultimoMinuto = null;

function aplicarFase() {
  const textos = FASES[fase];
  contagem.dataset.fase = fase;
  contagem.querySelector('.contagem-titulo').innerHTML = textos.titulo;
  document.querySelectorAll('[data-texto-fase]').forEach((el) => {
    el.textContent = textos[el.dataset.textoFase];
  });
}

function atualizarContagem() {
  const agora = relogioAgora();
  fase = faseAgora(agora);
  if (fase !== ultimaFase) { aplicarFase(); ultimaFase = fase; ultimoMinuto = null; }

  const resta = fase === 'depois' ? 0 : (fase === 'antes' ? LANCAMENTO : ENCERRAMENTO) - agora;

  const minutosTotais = Math.max(0, Math.ceil(resta / 60000));
  if (minutosTotais === ultimoMinuto) return;
  ultimoMinuto = minutosTotais;

  const dias = Math.floor(minutosTotais / 1440);
  const horas = Math.floor((minutosTotais % 1440) / 60);
  const minutos = minutosTotais % 60;
  numeros.dias.textContent = String(dias).padStart(2, '0');
  numeros.horas.textContent = String(horas).padStart(2, '0');
  numeros.minutos.textContent = String(minutos).padStart(2, '0');
  relogio.setAttribute('aria-label', fase === 'depois'
    ? 'Encerrada'
    : `Faltam ${dias} dias, ${horas} horas e ${minutos} minutos`);
}

if (Number.isNaN(LANCAMENTO) || Number.isNaN(ENCERRAMENTO)) {
  console.warn('[landing] datas da campanha inválidas (data-lancamento e data-encerramento no <body>)');
}
atualizarContagem();
setInterval(atualizarContagem, 1000);
