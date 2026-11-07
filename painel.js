// Painel de leads da Fontes Energia: login, funil em kanban, equipe e rodízio.
// Regras de acesso em firestore.rules (papéis admin e vendedor).

const SDK = 'https://www.gstatic.com/firebasejs/12.16.0';
const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot,
  runTransaction, serverTimestamp
} = await import(`${SDK}/firebase-firestore.js`);

const CONFIG = {
  apiKey: 'AIzaSyBA6ucG2zQ5gEFzvQ0n3gwleVb8fbj4FjA',
  authDomain: 'fontes-landing-black.firebaseapp.com',
  projectId: 'fontes-landing-black',
  storageBucket: 'fontes-landing-black.firebasestorage.app',
  messagingSenderId: '15871244062',
  appId: '1:15871244062:web:4698d2c0a7d8036b1efb0f'
};
const ADMIN_INICIAL = 'felipecastiged@gmail.com';

const ETAPAS = ['Novo Lead', 'Tentativa de Contato', 'Proposta Enviada', 'Negociação', 'Visita Técnica', 'Ganho', 'Perdido'];
const ABERTAS = ETAPAS.filter((e) => e !== 'Ganho' && e !== 'Perdido');
const FAIXAS = { 'ate-300': 'Até R$ 300', '300-600': 'R$ 300 a 600', '600-1000': 'R$ 600 a 1.000', '1000-mais': 'Mais de R$ 1.000' };
const IMOVEIS = { casa: 'Casa ou apartamento', empresa: 'Comércio ou empresa', rural: 'Área rural' };
const FASES = { antes: 'Expectativa', durante: 'Black', depois: 'Depois da Black' };
const ESCOLHAS = { agora: 'Quis resolver agora (abriu o WhatsApp)', aguardar: 'Vai aguardar o contato do agente' };
// Espera a escolha do final da landing antes de distribuir (ou 60 s)
const ESPERA_DISTRIBUIR_MS = 60 * 1000;

const app = initializeApp(CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const estado = {
  usuario: null,
  vinculo: null,
  equipe: new Map(),     // uid -> usuario (só admin lê a equipe toda)
  negocios: new Map(),   // id -> negócio
  pendentes: new Map(),  // id -> lead esperando distribuição
  rodizio: null,
  escutas: [],
  aba: 'funil',
  aberto: null
};

const ehAdmin = () => estado.vinculo?.papel === 'admin';

// ---------------------------------------------------------------------------
// Utilidades
const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const telefoneBonito = (t) => (t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`);
const contaTexto = (n) => (n.conta ? `${reais(n.conta)} por mês` : FAIXAS[n.faixa] || '');
const dataDe = (ts) => (ts?.toDate ? ts.toDate() : null);

function haQuanto(ts) {
  const d = dataDe(ts);
  if (!d) return 'agora';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

const dataHora = (ts) => dataDe(ts)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || '';

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nomeDe(uid) {
  if (uid === estado.usuario?.uid) return estado.vinculo?.nome || 'Você';
  return estado.equipe.get(uid)?.nome || 'Vendedor';
}

let toastTimer = null;
function avisarToast(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

function mostrarAviso(form, texto) {
  const a = $('.aviso', form);
  a.textContent = texto;
  a.hidden = !texto;
}

function trocarTela(id) {
  $$('.tela').forEach((t) => { t.hidden = t.id !== id; });
}

function erroLegivel(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mail ou senha não conferem.';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (c.includes('email-already-in-use')) return 'Já existe uma conta com esse e-mail.';
  if (c.includes('weak-password')) return 'A senha precisa de pelo menos 6 caracteres.';
  if (c.includes('invalid-email')) return 'Confira o e-mail.';
  if (c.includes('permission-denied')) return 'Sem permissão para isso.';
  if (c.includes('network')) return 'Sem conexão. Confira a internet.';
  return 'Não deu certo. Tente de novo.';
}

// Modal de confirmação customizado
function confirmar(titulo, texto, rotuloSim = 'Confirmar') {
  const m = $('#modal-confirmar');
  $('#confirmar-titulo').textContent = titulo;
  $('#confirmar-texto').textContent = texto;
  $('[data-resposta="sim"]', m).textContent = rotuloSim;
  m.hidden = false;
  $('[data-resposta="sim"]', m).focus();
  return new Promise((resolver) => {
    const fim = (r) => { m.hidden = true; m.removeEventListener('click', clique); resolver(r); };
    const clique = (e) => {
      if (e.target.closest('[data-resposta="sim"]')) fim(true);
      else if (e.target.closest('[data-resposta="nao"], [data-fechar]')) fim(false);
    };
    m.addEventListener('click', clique);
  });
}

// ---------------------------------------------------------------------------
// Entrar
const formEntrar = $('#form-entrar');
let modoCriar = false;

formEntrar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = formEntrar.email.value.trim().toLowerCase();
  const senha = formEntrar.senha.value;
  if (!email || senha.length < 6) { mostrarAviso(formEntrar, 'Preencha o e-mail e a senha (mínimo de 6 caracteres).'); return; }
  const botao = $('[type="submit"]', formEntrar);
  botao.disabled = true;
  mostrarAviso(formEntrar, '');
  try {
    if (modoCriar) {
      if (email !== ADMIN_INICIAL) { mostrarAviso(formEntrar, 'O primeiro acesso é só do administrador. Vendedores são cadastrados por ele no painel.'); return; }
      await createUserWithEmailAndPassword(auth, email, senha);
    } else {
      await signInWithEmailAndPassword(auth, email, senha);
    }
  } catch (erro) {
    mostrarAviso(formEntrar, erroLegivel(erro));
  } finally {
    botao.disabled = false;
  }
});

formEntrar.addEventListener('click', async (e) => {
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (acao === 'esqueci') {
    const email = formEntrar.email.value.trim();
    if (!email) { mostrarAviso(formEntrar, 'Escreva seu e-mail acima e toque de novo em "Esqueci a senha".'); return; }
    try {
      await sendPasswordResetEmail(auth, email, { url: location.href.split('?')[0] });
      mostrarAviso(formEntrar, `Se existir uma conta com ${email}, chega um link para criar a nova senha.`);
    } catch (erro) {
      mostrarAviso(formEntrar, erroLegivel(erro));
    }
  } else if (acao === 'primeiro-acesso') {
    modoCriar = !modoCriar;
    $('h1', formEntrar).textContent = modoCriar ? 'Criar acesso do administrador' : 'Painel de leads';
    $('[type="submit"]', formEntrar).textContent = modoCriar ? 'Criar conta' : 'Entrar';
    e.target.textContent = modoCriar ? 'Já tenho conta' : 'Primeiro acesso do administrador';
    formEntrar.senha.autocomplete = modoCriar ? 'new-password' : 'current-password';
    mostrarAviso(formEntrar, '');
  }
});

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-acao="sair"]')) {
    await signOut(auth);
  }
});

// ---------------------------------------------------------------------------
// Sessão
onAuthStateChanged(auth, async (usuario) => {
  pararEscutas();
  estado.usuario = usuario;
  estado.vinculo = null;
  if (!usuario) { trocarTela('tela-entrar'); return; }
  trocarTela('tela-carregando');
  try {
    const snap = await getDoc(doc(db, 'usuarios', usuario.uid));
    if (!snap.exists()) { telaSemVinculo(usuario); return; }
    estado.vinculo = snap.data();
    if (!estado.vinculo.ativo) {
      telaAcesso('Acesso pausado', 'Seu acesso está pausado. Fale com o administrador da Fontes Energia.');
      return;
    }
    iniciarApp();
  } catch (erro) {
    console.error('[painel] erro ao abrir a sessão', erro);
    telaAcesso('Não consegui abrir o painel', erroLegivel(erro));
  }
});

function telaAcesso(titulo, texto, comBootstrap = false) {
  $('.acesso-titulo').textContent = titulo;
  $('.acesso-texto').textContent = texto;
  $('#form-bootstrap').hidden = !comBootstrap;
  trocarTela('tela-acesso');
}

function telaSemVinculo(usuario) {
  if (usuario.email === ADMIN_INICIAL) {
    telaAcesso('Criar seu acesso de administrador', `Conta ${usuario.email} pronta. Falta registrar você como administrador do painel.`, true);
  } else {
    telaAcesso('Acesso ainda não liberado', `A conta ${usuario.email} ainda não foi cadastrada no painel. Fale com o administrador da Fontes Energia.`);
  }
}

$('#form-bootstrap').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const nome = form.nome.value.trim();
  if (nome.length < 2) { mostrarAviso(form, 'Escreva seu nome.'); return; }
  try {
    await setDoc(doc(db, 'usuarios', estado.usuario.uid), {
      nome, email: estado.usuario.email, papel: 'admin', ativo: true, criadoEm: serverTimestamp()
    });
    // Antecipação A9: só abre as escutas depois que o vínculo existe
    const snap = await getDoc(doc(db, 'usuarios', estado.usuario.uid));
    estado.vinculo = snap.data();
    iniciarApp();
  } catch (erro) {
    mostrarAviso(form, erroLegivel(erro));
  }
});

// ---------------------------------------------------------------------------
// Aplicativo
function iniciarApp() {
  trocarTela('tela-app');
  $('.barra-nome').textContent = `${estado.vinculo.nome} · ${ehAdmin() ? 'Administrador' : 'Vendedor'}`;
  $$('[data-so-admin]').forEach((el) => { el.hidden = !ehAdmin(); });
  mostrarAba('funil');

  // Negócios: admin vê todos; vendedor só os seus
  const qNegocios = ehAdmin()
    ? collection(db, 'negocios')
    : query(collection(db, 'negocios'), where('vendedorId', '==', estado.usuario.uid));
  escutar(qNegocios, (snap) => {
    estado.negocios = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    desenharFunil();
    if (estado.aberto) atualizarModalAberto();
  });

  // Leads esperando distribuição (todos da equipe enxergam só estes)
  escutar(query(collection(db, 'leads'), where('distribuido', '==', false)), (snap) => {
    estado.pendentes = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    desenharFunil();
    distribuirPendentes();
  });

  escutar(doc(db, 'config', 'rodizio'), (snap) => {
    estado.rodizio = snap.exists() ? snap.data() : null;
    if (!snap.exists() && ehAdmin()) setDoc(doc(db, 'config', 'rodizio'), { fila: [], proximo: 0 }).catch(() => {});
    desenharFunil();
    desenharEquipe();
    distribuirPendentes();
  });

  if (ehAdmin()) {
    escutar(collection(db, 'usuarios'), (snap) => {
      estado.equipe = new Map(snap.docs.map((d) => [d.id, { uid: d.id, ...d.data() }]));
      preencherVendedores();
      desenharFunil();
      desenharEquipe();
    });
  }
}

function escutar(alvo, aoMudar) {
  const parar = onSnapshot(alvo, aoMudar, (erro) => console.error('[painel] escuta falhou', erro));
  estado.escutas.push(parar);
}

function pararEscutas() {
  estado.escutas.forEach((parar) => parar());
  estado.escutas = [];
  estado.negocios.clear();
  estado.pendentes.clear();
  estado.equipe.clear();
  estado.rodizio = null;
}

// Abas
$('.abas').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-aba]');
  if (aba) mostrarAba(aba.dataset.aba);
});

function mostrarAba(nome) {
  estado.aba = nome;
  $$('.aba').forEach((b) => { if (b.dataset.aba === nome) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#secao-funil').hidden = nome !== 'funil';
  $('#secao-equipe').hidden = nome !== 'equipe';
}

// ---------------------------------------------------------------------------
// Distribuição pelo rodízio
let distribuindo = false;
let reverificar = null;

async function distribuirPendentes() {
  if (distribuindo || !estado.rodizio || !estado.rodizio.fila?.length) return;
  const agora = Date.now();
  const prontos = [...estado.pendentes.values()]
    .filter((l) => l.escolha || (dataDe(l.criadoEm) && agora - dataDe(l.criadoEm).getTime() >= ESPERA_DISTRIBUIR_MS))
    .sort((a, b) => (dataDe(a.criadoEm)?.getTime() || 0) - (dataDe(b.criadoEm)?.getTime() || 0));

  clearTimeout(reverificar);
  if (estado.pendentes.size > prontos.length) reverificar = setTimeout(distribuirPendentes, 15000);
  if (!prontos.length) return;

  distribuindo = true;
  for (const lead of prontos) {
    try {
      await distribuir(lead.id);
    } catch (erro) {
      // Outro painel pode ter distribuído antes: a regra nega e seguimos
      if (erro?.code !== 'permission-denied' && erro?.code !== 'aborted') console.error('[painel] distribuição falhou', erro);
    }
  }
  distribuindo = false;
}

async function distribuir(leadId) {
  const refLead = doc(db, 'leads', leadId);
  const refRodizio = doc(db, 'config', 'rodizio');
  await runTransaction(db, async (tx) => {
    const lead = await tx.get(refLead);
    if (!lead.exists() || lead.data().distribuido !== false) return;
    const rod = await tx.get(refRodizio);
    const { fila = [], proximo = 0 } = rod.data() || {};
    if (!fila.length) return;
    const vendedorId = fila[proximo % fila.length];
    const l = lead.data();
    const negocio = {
      nome: l.nome, telefone: l.telefone, faixa: l.faixa, imovel: l.imovel, fase: l.fase,
      leadCriadoEm: l.criadoEm, vendedorId, etapa: 'Novo Lead',
      criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
    };
    if (l.conta) negocio.conta = l.conta;
    if (l.origem) negocio.origem = l.origem;
    if (l.escolha) negocio.escolha = l.escolha;
    tx.set(doc(db, 'negocios', leadId), negocio);
    tx.update(refLead, { distribuido: true });
    tx.update(refRodizio, { proximo: (proximo + 1) % fila.length });
  });
}

// ---------------------------------------------------------------------------
// Funil
const filtroVendedor = $('#filtro-vendedor');
const filtroBusca = $('#filtro-busca');
filtroVendedor.addEventListener('change', desenharFunil);
filtroBusca.addEventListener('input', desenharFunil);

function preencherVendedores() {
  const atual = filtroVendedor.value;
  const pessoas = [...estado.equipe.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  filtroVendedor.innerHTML = '<option value="">Todos os vendedores</option>' +
    pessoas.map((p) => `<option value="${esc(p.uid)}">${esc(p.nome)}${p.ativo ? '' : ' (pausado)'}</option>`).join('');
  filtroVendedor.value = atual;
}

function negociosFiltrados() {
  const vend = ehAdmin() ? filtroVendedor.value : '';
  const busca = filtroBusca.value.trim().toLowerCase();
  const soDigitos = busca.replace(/\D/g, '');
  return [...estado.negocios.values()].filter((n) => {
    if (vend && n.vendedorId !== vend) return false;
    if (!busca) return true;
    return n.nome.toLowerCase().includes(busca) || (soDigitos && n.telefone.includes(soDigitos));
  });
}

function desenharFunil() {
  if (!estado.vinculo) return;
  const lista = negociosFiltrados();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const abertos = lista.filter((n) => ABERTAS.includes(n.etapa)).length;
  const novosHoje = lista.filter((n) => (dataDe(n.leadCriadoEm) || dataDe(n.criadoEm) || new Date()) >= hoje).length;
  const ganhos = lista.filter((n) => n.etapa === 'Ganho').length;
  const perdidos = lista.filter((n) => n.etapa === 'Perdido').length;
  const fechados = ganhos + perdidos;
  const conversao = fechados ? Math.round((ganhos / fechados) * 100) : null;
  const valorGanho = lista.filter((n) => n.etapa === 'Ganho' && n.valor).reduce((s, n) => s + n.valor, 0);

  const kpis = [
    ['Em andamento', abertos],
    ['Chegaram hoje', novosHoje],
    ['Ganhos', ganhos],
    ['Conversão', conversao === null ? '–' : `${conversao}%`],
    ['Vendido', valorGanho ? reais(valorGanho) : '–']
  ];
  if (ehAdmin()) kpis.push(['Aguardando distribuição', estado.pendentes.size]);
  $('#kpis-funil').innerHTML = kpis.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>`).join('');

  const avisoFila = $('#aviso-fila');
  const semFila = estado.rodizio && !estado.rodizio.fila?.length;
  avisoFila.hidden = !(ehAdmin() && semFila);
  avisoFila.textContent = semFila
    ? `Nenhum vendedor ativo na fila do rodízio. ${estado.pendentes.size ? `${estado.pendentes.size} lead(s) esperando.` : ''} Cadastre ou ative vendedores na aba Equipe.`
    : '';

  const kanban = $('#kanban');
  kanban.innerHTML = ETAPAS.map((etapa) => {
    const daEtapa = lista
      .filter((n) => n.etapa === etapa)
      .sort((a, b) => (dataDe(b.atualizadoEm)?.getTime() || Date.now()) - (dataDe(a.atualizadoEm)?.getTime() || Date.now()));
    return `
      <section class="coluna" data-etapa="${esc(etapa)}" aria-label="${esc(etapa)}">
        <header class="coluna-topo"><h2>${esc(etapa)}</h2><span class="coluna-qtd">${daEtapa.length}</span></header>
        <div class="coluna-cartoes">
          ${daEtapa.map(cartaoNegocio).join('') || '<p class="coluna-vazia">Nada aqui</p>'}
        </div>
      </section>`;
  }).join('');
}

function cartaoNegocio(n) {
  return `
    <article class="card" draggable="true" data-id="${esc(n.id)}" tabindex="0" aria-label="${esc(n.nome)}, ${esc(contaTexto(n))}">
      <h3>${esc(n.nome)}</h3>
      <p class="card-conta">${esc(contaTexto(n))}</p>
      <p class="card-meta">${esc(IMOVEIS[n.imovel] || '')} · ${esc(haQuanto(n.leadCriadoEm || n.criadoEm))}</p>
      ${ehAdmin() ? `<p class="card-vendedor">${esc(nomeDe(n.vendedorId))}</p>` : ''}
      ${n.valor ? `<p class="card-valor">${esc(reais(n.valor))}</p>` : ''}
    </article>`;
}

// Abrir detalhe
$('#kanban').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) abrirNegocio(card.dataset.id);
});
$('#kanban').addEventListener('keydown', (e) => {
  const card = e.target.closest('.card');
  if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirNegocio(card.dataset.id); }
});

// Arrastar entre colunas (computador). No celular, a etapa muda pelo detalhe.
let arrastando = null;
$('#kanban').addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  arrastando = card.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', arrastando);
  card.classList.add('arrastando');
});
$('#kanban').addEventListener('dragend', (e) => {
  e.target.closest('.card')?.classList.remove('arrastando');
  $$('.coluna.alvo').forEach((c) => c.classList.remove('alvo'));
  arrastando = null;
});
$('#kanban').addEventListener('dragover', (e) => {
  const col = e.target.closest('.coluna');
  if (!col || !arrastando) return;
  e.preventDefault();
  $$('.coluna.alvo').forEach((c) => { if (c !== col) c.classList.remove('alvo'); });
  col.classList.add('alvo');
});
$('#kanban').addEventListener('drop', async (e) => {
  const col = e.target.closest('.coluna');
  if (!col || !arrastando) return;
  e.preventDefault();
  const id = arrastando;
  const etapa = col.dataset.etapa;
  const n = estado.negocios.get(id);
  if (!n || n.etapa === etapa) return;
  // Feedback imediato (crença 11); a escuta confirma depois
  const anterior = n.etapa;
  n.etapa = etapa;
  desenharFunil();
  try {
    await updateDoc(doc(db, 'negocios', id), { etapa, atualizadoEm: serverTimestamp() });
    avisarToast(`${n.nome} foi para ${etapa}.`);
    if (etapa === 'Perdido' && !n.motivoPerda) { abrirNegocio(id, true); }
  } catch (erro) {
    n.etapa = anterior;
    desenharFunil();
    avisarToast(erroLegivel(erro));
  }
});

// ---------------------------------------------------------------------------
// Detalhe do negócio
const modalNegocio = $('#modal-negocio');
const formNegocio = $('#form-negocio');
formNegocio.etapa.innerHTML = ETAPAS.map((e) => `<option>${esc(e)}</option>`).join('');
formNegocio.etapa.addEventListener('change', () => {
  $('.campo-perda', formNegocio).hidden = formNegocio.etapa.value !== 'Perdido';
});

function abrirNegocio(id, editar = false) {
  estado.aberto = id;
  atualizarModalAberto();
  modalNegocio.hidden = false;
  modoEdicao(editar);
  $('.fechar', modalNegocio).focus();
}

function atualizarModalAberto() {
  const n = estado.negocios.get(estado.aberto);
  if (!n) { fecharModal(modalNegocio); return; }
  $('#neg-nome').textContent = n.nome;
  $('#neg-whatsapp').href = `https://wa.me/55${n.telefone}`;
  const linhas = [
    ['WhatsApp', telefoneBonito(n.telefone)],
    ['Conta de luz', contaTexto(n)],
    ['A conta é para', IMOVEIS[n.imovel]],
    ['Chegou', `${dataHora(n.leadCriadoEm)} (${FASES[n.fase] || n.fase})`],
    ['No final da página', ESCOLHAS[n.escolha] || 'Não escolheu'],
    ['Vendedor', nomeDe(n.vendedorId)],
    ['Última mudança', dataHora(n.atualizadoEm)]
  ];
  if (n.origem) linhas.push(['Origem (UTM)', n.origem]);
  $('#neg-dados').innerHTML = linhas.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>`).join('');
  if (formNegocio.etapa.disabled) preencherFormNegocio(n);
}

function preencherFormNegocio(n) {
  formNegocio.etapa.value = n.etapa;
  formNegocio.valor.value = n.valor ?? '';
  formNegocio.notas.value = n.notas ?? '';
  formNegocio.motivoPerda.value = n.motivoPerda ?? '';
  $('.campo-perda', formNegocio).hidden = n.etapa !== 'Perdido';
  if (ehAdmin()) {
    const ativos = [...estado.equipe.values()].filter((p) => p.ativo || p.uid === n.vendedorId);
    formNegocio.vendedorId.innerHTML = ativos
      .map((p) => `<option value="${esc(p.uid)}">${esc(p.nome)}${p.ativo ? '' : ' (pausado)'}</option>`).join('');
    formNegocio.vendedorId.value = n.vendedorId;
  }
}

function modoEdicao(ligado) {
  ['etapa', 'valor', 'notas', 'motivoPerda', 'vendedorId'].forEach((c) => { formNegocio[c].disabled = !ligado; });
  $('[data-acao="editar-negocio"]', formNegocio).hidden = ligado;
  $('[data-acao="cancelar-negocio"]', formNegocio).hidden = !ligado;
  $('[type="submit"]', formNegocio).hidden = !ligado;
  mostrarAviso(formNegocio, '');
  if (!ligado) {
    const n = estado.negocios.get(estado.aberto);
    if (n) preencherFormNegocio(n);
  } else {
    const n = estado.negocios.get(estado.aberto);
    if (n) preencherFormNegocio(n);
    formNegocio.etapa.focus();
  }
}

formNegocio.addEventListener('click', (e) => {
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (acao === 'editar-negocio') modoEdicao(true);
  if (acao === 'cancelar-negocio') modoEdicao(false);
});

formNegocio.addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = estado.negocios.get(estado.aberto);
  if (!n) return;
  const mudancas = { etapa: formNegocio.etapa.value, atualizadoEm: serverTimestamp() };
  const notas = formNegocio.notas.value.trim();
  const valorTxt = formNegocio.valor.value.trim();
  const motivo = formNegocio.motivoPerda.value.trim();
  if (notas !== (n.notas ?? '')) mudancas.notas = notas;
  if (valorTxt !== '' && Number(valorTxt) !== n.valor) {
    const v = Number(valorTxt);
    if (!Number.isFinite(v) || v < 0) { mostrarAviso(formNegocio, 'Confira o valor da proposta.'); return; }
    mudancas.valor = v;
  }
  if (mudancas.etapa === 'Perdido' && motivo !== (n.motivoPerda ?? '')) mudancas.motivoPerda = motivo;
  if (ehAdmin() && formNegocio.vendedorId.value && formNegocio.vendedorId.value !== n.vendedorId) {
    mudancas.vendedorId = formNegocio.vendedorId.value;
  }
  const botao = $('[type="submit"]', formNegocio);
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    await updateDoc(doc(db, 'negocios', n.id), mudancas);
    modoEdicao(false);
    avisarToast('Negócio atualizado.');
  } catch (erro) {
    mostrarAviso(formNegocio, erroLegivel(erro));
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
});

// Fechar modais
function fecharModal(m) {
  m.hidden = true;
  if (m === modalNegocio) { estado.aberto = null; modoEdicao(false); }
}
document.addEventListener('click', (e) => {
  const fechar = e.target.closest('[data-fechar]');
  if (!fechar) return;
  const m = fechar.closest('.modal');
  if (m && m.id !== 'modal-confirmar') fecharModal(m);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const aberto = $$('.modal').reverse().find((m) => !m.hidden && m.id !== 'modal-confirmar');
  if (aberto) fecharModal(aberto);
});

// ---------------------------------------------------------------------------
// Equipe e rodízio (admin)
function desenharEquipe() {
  if (!ehAdmin()) return;
  const fila = estado.rodizio?.fila || [];
  const proximo = estado.rodizio?.proximo || 0;
  const daVez = fila.length ? fila[proximo % fila.length] : null;
  const pessoas = [...estado.equipe.values()].sort((a, b) => {
    const ia = fila.indexOf(a.uid); const ib = fila.indexOf(b.uid);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.nome.localeCompare(b.nome);
  });
  const contar = (uid, f) => [...estado.negocios.values()].filter((n) => n.vendedorId === uid && f(n)).length;

  const vendedoresAtivos = pessoas.filter((p) => p.papel === 'vendedor' && p.ativo).length;
  $('#kpis-equipe').innerHTML = [
    ['Vendedores ativos', vendedoresAtivos],
    ['Na fila do rodízio', fila.length],
    ['Próximo a receber', daVez ? nomeDe(daVez) : '–'],
    ['Pessoas cadastradas', pessoas.length]
  ].map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>`).join('');

  $('#lista-equipe').innerHTML = pessoas.map((p) => {
    const pos = fila.indexOf(p.uid);
    const eu = p.uid === estado.usuario.uid;
    const acoes = [];
    if (pos > 0) acoes.push(`<button type="button" class="link" data-equipe="subir" data-uid="${esc(p.uid)}">Subir</button>`);
    if (pos !== -1 && pos < fila.length - 1) acoes.push(`<button type="button" class="link" data-equipe="descer" data-uid="${esc(p.uid)}">Descer</button>`);
    if (!eu) acoes.push(`<button type="button" class="link" data-equipe="${p.ativo ? 'pausar' : 'ativar'}" data-uid="${esc(p.uid)}">${p.ativo ? 'Pausar' : 'Ativar'}</button>`);
    if (!eu) acoes.push(`<button type="button" class="link" data-equipe="papel" data-uid="${esc(p.uid)}">${p.papel === 'admin' ? 'Tornar vendedor' : 'Tornar admin'}</button>`);
    return `
      <tr>
        <td>${pos === -1 ? '–' : `${pos + 1}º${p.uid === daVez ? ' <span class="selo">a vez</span>' : ''}`}</td>
        <td><strong>${esc(p.nome)}</strong><br><span class="discreto">${esc(p.email)}</span></td>
        <td>${p.papel === 'admin' ? 'Administrador' : 'Vendedor'}</td>
        <td><span class="status ${p.ativo ? 'status-ativo' : ''}">${p.ativo ? 'Ativo' : 'Pausado'}</span></td>
        <td>${contar(p.uid, (n) => ABERTAS.includes(n.etapa))}</td>
        <td>${contar(p.uid, (n) => n.etapa === 'Ganho')}</td>
        <td class="acoes">${acoes.join('')}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="discreto">Ninguém cadastrado ainda.</td></tr>';
}

async function salvarFila(fila, proximo) {
  await setDoc(doc(db, 'config', 'rodizio'), { fila, proximo: fila.length ? ((proximo % fila.length) + fila.length) % fila.length : 0 });
}

$('#lista-equipe').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-equipe]');
  if (!b) return;
  const uid = b.dataset.uid;
  const p = estado.equipe.get(uid);
  const fila = [...(estado.rodizio?.fila || [])];
  let proximo = estado.rodizio?.proximo || 0;
  const daVez = fila.length ? fila[proximo % fila.length] : null;
  try {
    if (b.dataset.equipe === 'subir' || b.dataset.equipe === 'descer') {
      const i = fila.indexOf(uid);
      const j = b.dataset.equipe === 'subir' ? i - 1 : i + 1;
      [fila[i], fila[j]] = [fila[j], fila[i]];
      // a vez continua com a mesma pessoa
      await salvarFila(fila, daVez ? fila.indexOf(daVez) : 0);
    } else if (b.dataset.equipe === 'pausar') {
      const ok = await confirmar(`Pausar ${p.nome}?`, 'A pessoa não entra mais no painel e sai da fila do rodízio. Os negócios dela continuam no funil para você reatribuir.', 'Pausar');
      if (!ok) return;
      await updateDoc(doc(db, 'usuarios', uid), { ativo: false });
      await tirarDaFila(uid, fila, proximo);
      avisarToast(`${p.nome} foi pausado.`);
    } else if (b.dataset.equipe === 'ativar') {
      await updateDoc(doc(db, 'usuarios', uid), { ativo: true });
      if (p.papel === 'vendedor' && !fila.includes(uid)) await salvarFila([...fila, uid], proximo);
      avisarToast(`${p.nome} está ativo.`);
    } else if (b.dataset.equipe === 'papel') {
      const novo = p.papel === 'admin' ? 'vendedor' : 'admin';
      const ok = await confirmar(
        novo === 'admin' ? `Tornar ${p.nome} administrador?` : `Tornar ${p.nome} vendedor?`,
        novo === 'admin' ? 'Administrador vê todos os leads, cadastra a equipe e não recebe leads pelo rodízio.' : 'Vendedor vê só os próprios leads e entra na fila do rodízio.',
        'Confirmar');
      if (!ok) return;
      await updateDoc(doc(db, 'usuarios', uid), { papel: novo });
      if (novo === 'admin') await tirarDaFila(uid, fila, proximo);
      else if (p.ativo && !fila.includes(uid)) await salvarFila([...fila, uid], proximo);
    }
  } catch (erro) {
    avisarToast(erroLegivel(erro));
  }
});

async function tirarDaFila(uid, fila, proximo) {
  const i = fila.indexOf(uid);
  if (i === -1) return;
  const daVez = fila[proximo % fila.length];
  fila.splice(i, 1);
  const novoProximo = daVez === uid ? i : fila.indexOf(daVez);
  await salvarFila(fila, novoProximo === -1 ? 0 : novoProximo);
}

// Cadastrar pessoa: a conta nasce numa segunda instância do Auth, para a
// sessão do admin continuar aberta (padrão de dados-e-seguranca.md)
const modalPessoa = $('#modal-pessoa');
const formPessoa = $('#form-pessoa');
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-acao="cadastrar"]')) {
    formPessoa.reset();
    mostrarAviso(formPessoa, '');
    modalPessoa.hidden = false;
    formPessoa.nome.focus();
  }
});

let appCadastro = null;
formPessoa.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = formPessoa.nome.value.trim();
  const email = formPessoa.email.value.trim().toLowerCase();
  const senha = formPessoa.senha.value;
  const papel = formPessoa.papel.value;
  if (nome.length < 2) { mostrarAviso(formPessoa, 'Escreva o nome.'); return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { mostrarAviso(formPessoa, 'Confira o e-mail.'); return; }
  if (senha.length < 6) { mostrarAviso(formPessoa, 'A senha provisória precisa de pelo menos 6 caracteres.'); return; }
  const botao = $('[type="submit"]', formPessoa);
  botao.disabled = true;
  botao.textContent = 'Cadastrando…';
  try {
    appCadastro ||= initializeApp(CONFIG, 'cadastro');
    const authCadastro = getAuth(appCadastro);
    const cred = await createUserWithEmailAndPassword(authCadastro, email, senha);
    await signOut(authCadastro);
    await setDoc(doc(db, 'usuarios', cred.user.uid), { nome, email, papel, ativo: true, criadoEm: serverTimestamp() });
    if (papel === 'vendedor') {
      await salvarFila([...(estado.rodizio?.fila || []), cred.user.uid], estado.rodizio?.proximo || 0);
    }
    fecharModal(modalPessoa);
    avisarToast(`${nome} cadastrado.`);
  } catch (erro) {
    mostrarAviso(formPessoa, erroLegivel(erro));
  } finally {
    botao.disabled = false;
    botao.textContent = 'Cadastrar';
  }
});

// Atualiza os "há X min" dos cartões
setInterval(() => { if (estado.vinculo && !$('#tela-app').hidden) desenharFunil(); }, 60000);
