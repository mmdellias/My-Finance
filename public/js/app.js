/* ==========================================================================
   myFinance — lógica do front-end
   Perfis (troca estilo Netflix) · Orçamento por mês · Edição de registros
   ========================================================================== */

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
const formatarMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

const formatarPercentual = (n) =>
  `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')}%`;

function formatarCompetencia(comp) {
  const [ano, mes] = comp.split('-').map(Number);
  return `${MESES_CURTO[mes - 1]}/${ano}`;
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function proximoMesLivre(ocupados) {
  const d = new Date();
  for (let i = 0; i < 24; i++) {
    const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!ocupados.includes(comp)) return comp;
    d.setMonth(d.getMonth() + 1);
  }
  return mesAtual();
}

const CORES = ['#2563eb', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316'];
const CHAVE_PERFIL = 'myFinance_perfil';

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------
const telaPerfis = document.getElementById('tela-perfis');
const telaApp = document.getElementById('tela-app');
const sessao = document.getElementById('sessao');
const gradePerfis = document.getElementById('grade-perfis');

const btnTrocar = document.getElementById('btn-trocar');
const chipAvatar = document.getElementById('chip-avatar');
const chipNome = document.getElementById('chip-nome');

// modal
const modal = document.getElementById('modal-perfil');
const modalTitulo = document.getElementById('modal-titulo');
const modalAvatar = document.getElementById('modal-avatar');
const campoNome = document.getElementById('campo-nome');
const seletorCores = document.getElementById('seletor-cores');
const fotoInput = document.getElementById('foto-input');
const btnRemoverFoto = document.getElementById('btn-remover-foto');
const modalSalvar = document.getElementById('modal-salvar');
const modalCancelar = document.getElementById('modal-cancelar');
const modalExcluir = document.getElementById('modal-excluir');
const modalErro = document.getElementById('modal-erro');

// formulário
const form = document.getElementById('form-orcamento');
const cartaoForm = document.getElementById('cartao-form');
const inputCompetencia = document.getElementById('competencia');
const inputSalario = document.getElementById('salario');
const inputNecessidades = document.getElementById('pct-necessidades');
const inputDesejos = document.getElementById('pct-desejos');
const inputEconomia = document.getElementById('pct-economia');
const pctTotal = document.getElementById('pct-total');
const erroForm = document.getElementById('erro-form');
const msgSucesso = document.getElementById('msg-sucesso');
const btnSalvar = document.getElementById('btn-salvar');
const btnCancelarEdicao = document.getElementById('btn-cancelar-edicao');
const btnLimpar = document.getElementById('btn-limpar');
const seloEdicao = document.getElementById('selo-edicao');
const seloMes = document.getElementById('selo-mes');

// resultados e histórico
const painelResultados = document.getElementById('painel-resultados');
const valorGastar = document.getElementById('valor-gastar');
const valorEconomizar = document.getElementById('valor-economizar');
const listaHistorico = document.getElementById('historico');
const historicoVazio = document.getElementById('historico-vazio');

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let perfis = [];
let perfilAtivo = null;
let orcamentos = []; // meses do perfil ativo
let modoEdicao = null; // id do registro em edição, ou null
let ultimoCalculo = null;

let modoModal = 'criar';
let idModal = null;
let pendenteImagem = null;
let corSelecionada = CORES[0];

// ---------------------------------------------------------------------------
// API — qualquer 401 leva de volta ao login
// ---------------------------------------------------------------------------
async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const opcoes = { method: metodo };
  if (corpo !== undefined) {
    opcoes.headers = { 'Content-Type': 'application/json' };
    opcoes.body = JSON.stringify(corpo);
  }

  const resposta = await fetch(caminho, opcoes);
  if (resposta.status === 401) {
    window.location.href = '/login';
    throw new Error('Sessão expirada.');
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(dados.error || 'Falha na requisição.');
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

// ---------------------------------------------------------------------------
// Avatar (foto ou letra inicial sobre a cor)
// ---------------------------------------------------------------------------
function criarAvatar(perfil, classeExtra = '') {
  const av = document.createElement('span');
  av.className = `avatar ${classeExtra}`.trim();
  av.style.background = perfil.cor || CORES[0];
  if (perfil.imagem) {
    const img = document.createElement('img');
    img.src = perfil.imagem;
    img.alt = perfil.nome || 'Foto do perfil';
    av.appendChild(img);
  } else {
    av.textContent = (perfil.nome || '?').trim().charAt(0).toUpperCase() || '?';
  }
  return av;
}

// ---------------------------------------------------------------------------
// Tela de perfis
// ---------------------------------------------------------------------------
function mostrarTelaPerfis() {
  telaPerfis.hidden = false;
  telaApp.hidden = true;
  sessao.hidden = true;
  montarCards();
}

function montarCards() {
  gradePerfis.innerHTML = '';

  for (const perfil of perfis) {
    const card = document.createElement('div');
    card.className = 'card-perfil';

    const corpo = document.createElement('button');
    corpo.type = 'button';
    corpo.className = 'card-corpo';
    corpo.title = `Entrar no perfil ${perfil.nome}`;
    corpo.appendChild(criarAvatar(perfil, 'avatar-grande'));

    const nome = document.createElement('span');
    nome.className = 'card-nome';
    nome.textContent = perfil.nome;

    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = Number(perfil.meses) === 1 ? '1 mês cadastrado' : `${perfil.meses} meses cadastrados`;

    corpo.append(nome, meta);
    corpo.addEventListener('click', () => entrarNoPerfil(perfil));

    const engrenagem = document.createElement('button');
    engrenagem.type = 'button';
    engrenagem.className = 'card-engrenagem';
    engrenagem.textContent = '⚙';
    engrenagem.title = `Editar o perfil ${perfil.nome}`;
    engrenagem.addEventListener('click', (evento) => {
      evento.stopPropagation();
      abrirModal(perfil);
    });

    card.append(corpo, engrenagem);
    gradePerfis.appendChild(card);
  }

  const novo = document.createElement('button');
  novo.type = 'button';
  novo.className = 'card-perfil card-novo';
  novo.innerHTML = '<span class="sinal-novo">+</span><span class="rotulo-novo">Novo perfil</span>';
  novo.addEventListener('click', () => abrirModal(null));
  gradePerfis.appendChild(novo);
}

function entrarNoPerfil(perfil) {
  perfilAtivo = perfil;
  try {
    localStorage.setItem(CHAVE_PERFIL, String(perfil.id));
  } catch {
    // navegador sem armazenamento local — seguimos sem persistir
  }

  montarChip();
  telaPerfis.hidden = true;
  telaApp.hidden = false;
  sessao.hidden = false;

  inputCompetencia.value = mesAtual();
  resetarFormulario();
  carregarOrcamentos();
}

function montarChip() {
  const avatar = criarAvatar(perfilAtivo, 'avatar-chip');
  chipAvatar.className = avatar.className;
  chipAvatar.style.background = avatar.style.background;
  chipAvatar.innerHTML = avatar.innerHTML;
  chipNome.textContent = perfilAtivo.nome;
}

// Ao voltar pra tela de perfis, atualiza as contagens antes de mostrar
btnTrocar.addEventListener('click', async () => {
  try {
    await recarregarPerfis();
  } catch (erro) {
    console.error('Falha ao atualizar perfis:', erro);
  }
  mostrarTelaPerfis();
});

// ---------------------------------------------------------------------------
// Modal de perfil (criar / editar / excluir)
// ---------------------------------------------------------------------------
function pintarModal() {
  modalAvatar.innerHTML = '';
  modalAvatar.style.background = corSelecionada;
  const inicial = campoNome.value.trim().charAt(0).toUpperCase();
  if (pendenteImagem) {
    const img = document.createElement('img');
    img.src = pendenteImagem;
    img.alt = 'Pré-visualização da foto';
    modalAvatar.appendChild(img);
  } else {
    modalAvatar.textContent = inicial || '?';
  }

  for (const botao of seletorCores.children) {
    botao.classList.toggle('ativa', botao.dataset.cor === corSelecionada);
  }
}

function abrirModal(perfil) {
  modoModal = perfil ? 'editar' : 'criar';
  idModal = perfil ? perfil.id : null;

  modalTitulo.textContent = perfil ? 'Editar perfil' : 'Novo perfil';
  campoNome.value = perfil ? perfil.nome : '';
  pendenteImagem = perfil ? perfil.imagem : null;
  corSelecionada = perfil ? perfil.cor : CORES[0];
  modalExcluir.hidden = !perfil;
  modalErro.hidden = true;
  fotoInput.value = '';

  pintarModal();
  modal.hidden = false;
  campoNome.focus();
}

function fecharModal() {
  modal.hidden = true;
}

function mostrarErroModal(mensagem) {
  modalErro.textContent = mensagem;
  modalErro.hidden = false;
}

async function salvarPerfil() {
  const nome = campoNome.value.trim();
  if (!nome) return mostrarErroModal('Informe um nome para o perfil.');
  if (!CORES.includes(corSelecionada)) return mostrarErroModal('Escolha uma cor.');

  const corpo = { nome, cor: corSelecionada, imagem: pendenteImagem || null };

  modalSalvar.disabled = true;
  try {
    if (modoModal === 'editar') {
      const atualizado = await api(`/api/perfis/${idModal}`, { metodo: 'PUT', corpo });
      if (perfilAtivo && perfilAtivo.id === idModal) {
        perfilAtivo = atualizado;
        montarChip();
      }
    } else {
      await api('/api/perfis', { metodo: 'POST', corpo });
    }

    fecharModal();
    await recarregarPerfis();
  } catch (erro) {
    mostrarErroModal(erro.message);
  } finally {
    modalSalvar.disabled = false;
  }
}

async function excluirPerfil() {
  const perfil = perfis.find((p) => p.id === idModal);
  if (!perfil) return fecharModal();

  const confirmado = window.confirm(
    `Excluir o perfil "${perfil.nome}"?\n\n` +
      `Todos os meses e registros dele serão apagados. Isso não pode ser desfeito.`
  );
  if (!confirmado) return;

  modalExcluir.disabled = true;
  try {
    await api(`/api/perfis/${idModal}`, { metodo: 'DELETE' });
    fecharModal();

    if (perfilAtivo && perfilAtivo.id === idModal) {
      perfilAtivo = null;
      try {
        localStorage.removeItem(CHAVE_PERFIL);
      } catch {
        // sem armazenamento local
      }
      await recarregarPerfis();
      mostrarTelaPerfis();
      return;
    }

    await recarregarPerfis();
  } catch (erro) {
    mostrarErroModal(erro.message);
  } finally {
    modalExcluir.disabled = false;
  }
}

// Corte quadrado centralizado + redução (a foto não ocupa espaço à toa)
function processarImagem(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!permitidos.includes(arquivo.type)) {
      return rejeitar(new Error('Escolha uma imagem em JPG, PNG ou WebP.'));
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      return rejeitar(new Error('A imagem pode ter no máximo 5 MB.'));
    }

    const leitor = new FileReader();
    leitor.onerror = () => rejeitar(new Error('Não consegui ler esse arquivo.'));
    leitor.onload = () => {
      const imagem = new Image();
      imagem.onerror = () => rejeitar(new Error('Arquivo de imagem inválido.'));
      imagem.onload = () => {
        const lado = 512;
        const canvas = document.createElement('canvas');
        canvas.width = lado;
        canvas.height = lado;
        const ctx = canvas.getContext('2d');

        const ladoOriginal = Math.min(imagem.width, imagem.height);
        const sx = (imagem.width - ladoOriginal) / 2;
        const sy = (imagem.height - ladoOriginal) / 2;
        ctx.drawImage(imagem, sx, sy, ladoOriginal, ladoOriginal, 0, 0, lado, lado);

        resolver(canvas.toDataURL('image/jpeg', 0.82));
      };
      imagem.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

// ---------------------------------------------------------------------------
// Perfis — carga e recarga
// ---------------------------------------------------------------------------
async function carregarPerfis() {
  perfis = await api('/api/perfis');

  let salvo = null;
  try {
    salvo = localStorage.getItem(CHAVE_PERFIL);
  } catch {
    // sem armazenamento local
  }

  const ativo = perfis.find((p) => String(p.id) === salvo);
  if (ativo) entrarNoPerfil(ativo);
  else mostrarTelaPerfis();
}

async function recarregarPerfis() {
  perfis = await api('/api/perfis');

  if (perfilAtivo) {
    const atual = perfis.find((p) => p.id === perfilAtivo.id);
    if (atual) {
      perfilAtivo = atual;
      montarChip();
    }
  }

  if (!telaPerfis.hidden) montarCards();
}

// ---------------------------------------------------------------------------
// Orçamentos por mês
// ---------------------------------------------------------------------------
async function carregarOrcamentos() {
  orcamentos = await api(`/api/perfis/${perfilAtivo.id}/budgets`);
  sincronizarModo(); // decide modo de edição e redesenha o histórico
}

function registroDoMes(comp) {
  return orcamentos.find((o) => o.competencia === comp) || null;
}

// Decide entre "criar mês" e "editar mês" conforme o campo de mês
function sincronizarModo() {
  const comp = inputCompetencia.value;
  const registro = comp && RE_COMPETENCIA.test(comp) ? registroDoMes(comp) : null;

  if (registro) {
    const mudouDeRegistro = modoEdicao !== registro.id;
    modoEdicao = registro.id;
    if (mudouDeRegistro) preencherFormulario(registro);

    seloEdicao.hidden = false;
    seloMes.textContent = formatarCompetencia(registro.competencia);
    btnSalvar.textContent = 'Salvar alterações';
    btnCancelarEdicao.hidden = false;
    cartaoForm.classList.add('editando');
  } else {
    modoEdicao = null;
    seloEdicao.hidden = true;
    btnSalvar.textContent = 'Salvar mês';
    btnCancelarEdicao.hidden = true;
    cartaoForm.classList.remove('editando');
  }

  montarHistorico();
}

function sairModoEdicaoSilencioso() {
  modoEdicao = null;
  seloEdicao.hidden = true;
  btnSalvar.textContent = 'Salvar mês';
  btnCancelarEdicao.hidden = true;
  cartaoForm.classList.remove('editando');
}

// Zera o formulário (usado ao entrar num perfil e no botão Limpar)
function resetarFormulario() {
  inputSalario.value = '';
  inputNecessidades.value = 50;
  inputDesejos.value = 30;
  inputEconomia.value = 20;
  limparErro();
  msgSucesso.hidden = true;
  painelResultados.hidden = true;
  ultimoCalculo = null;
  sairModoEdicaoSilencioso();
  atualizarIndicadorTotal();
}

function preencherFormulario(registro) {
  inputSalario.value = registro.salary;
  inputNecessidades.value = registro.pct_needs;
  inputDesejos.value = registro.pct_wants;
  inputEconomia.value = registro.pct_savings;
  atualizarIndicadorTotal();
  limparErro();
  msgSucesso.hidden = true;
  ultimoCalculo = null;
  painelResultados.hidden = true;
}

function montarHistorico() {
  listaHistorico.innerHTML = '';
  const tem = orcamentos.length > 0;
  historicoVazio.hidden = tem;
  listaHistorico.hidden = !tem;

  for (const registro of orcamentos) {
    const salario = registro.salary;
    const valorGastavel = (salario * (registro.pct_needs + registro.pct_wants)) / 100;
    const valorEconomia = (salario * registro.pct_savings) / 100;

    const item = document.createElement('li');
    if (registro.id === modoEdicao) item.classList.add('ativo');

    const info = document.createElement('div');
    info.className = 'hist-info';

    const mes = document.createElement('span');
    mes.className = 'hist-mes';
    mes.textContent = formatarCompetencia(registro.competencia);

    const detalhe = document.createElement('span');
    detalhe.className = 'hist-detalhe';
    detalhe.textContent =
      `${formatarPercentual(registro.pct_needs)} necessidades · ` +
      `${formatarPercentual(registro.pct_wants)} desejos · ` +
      `${formatarPercentual(registro.pct_savings)} economia`;

    info.append(mes, detalhe);

    const valores = document.createElement('div');
    valores.className = 'hist-valores';

    const salarioEl = document.createElement('span');
    salarioEl.className = 'hist-salario';
    salarioEl.textContent = `Salário ${formatarMoeda.format(salario)}`;

    const gastavel = document.createElement('span');
    gastavel.textContent = `Gastar ${formatarMoeda.format(valorGastavel)}`;

    const economia = document.createElement('span');
    economia.className = 'hist-economia';
    economia.textContent = `Economia ${formatarMoeda.format(valorEconomia)}`;

    valores.append(salarioEl, gastavel, economia);

    const acoes = document.createElement('div');
    acoes.className = 'hist-acoes';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'botao-editar';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => editarMes(registro));

    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.className = 'botao-excluir';
    btnExcluir.textContent = 'Excluir';
    btnExcluir.addEventListener('click', () => excluirMes(registro));

    acoes.append(btnEditar, btnExcluir);

    item.append(info, valores, acoes);
    listaHistorico.appendChild(item);
  }
}

function editarMes(registro) {
  inputCompetencia.value = registro.competencia;
  sincronizarModo(); // preenche o formulário com os dados do mês
  cartaoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function excluirMes(registro) {
  const confirmado = window.confirm(
    `Excluir o orçamento de ${formatarCompetencia(registro.competencia)}?\n\nIsso não pode ser desfeito.`
  );
  if (!confirmado) return;

  try {
    await api(`/api/perfis/${perfilAtivo.id}/budgets/${registro.id}`, { metodo: 'DELETE' });
    msgSucesso.hidden = true;
    await carregarOrcamentos();
  } catch (erro) {
    mostrarErro(erro.message);
  }
}

inputCompetencia.addEventListener('change', () => {
  msgSucesso.hidden = true;
  sincronizarModo();
});

btnCancelarEdicao.addEventListener('click', () => {
  inputCompetencia.value = proximoMesLivre(orcamentos.map((o) => o.competencia));
  sincronizarModo();
  msgSucesso.hidden = true;
  inputSalario.focus();
});

// ---------------------------------------------------------------------------
// Cálculo do orçamento
// ---------------------------------------------------------------------------
function lerPercentuais() {
  return {
    necessidades: parseFloat(inputNecessidades.value),
    desejos: parseFloat(inputDesejos.value),
    economia: parseFloat(inputEconomia.value),
  };
}

function somarPercentuais() {
  const { necessidades, desejos, economia } = lerPercentuais();
  const total = [necessidades, desejos, economia].reduce(
    (soma, v) => soma + (Number.isFinite(v) ? v : 0),
    0
  );
  return Math.round(total * 100) / 100;
}

function atualizarIndicadorTotal() {
  const total = somarPercentuais();
  const ok = Math.abs(total - 100) < 0.01;
  pctTotal.classList.toggle('ok', ok);
  pctTotal.classList.toggle('ruim', !ok);
  pctTotal.innerHTML = `Total: <strong>${formatarPercentual(total)}</strong>`;
}

function mostrarErro(mensagem) {
  erroForm.textContent = mensagem;
  erroForm.hidden = false;
  msgSucesso.hidden = true;
}

function limparErro() {
  erroForm.hidden = true;
  erroForm.textContent = '';
}

// Mostra o erro e esconde o resultado antigo (nada de valores desatualizados)
function falhar(mensagem) {
  mostrarErro(mensagem);
  painelResultados.hidden = true;
  return null;
}

function calcular({ silencioso = false } = {}) {
  if (!silencioso) {
    limparErro();
    msgSucesso.hidden = true;
  }

  const salario = parseFloat(inputSalario.value);
  if (!Number.isFinite(salario) || salario < 0) {
    if (silencioso) {
      painelResultados.hidden = true;
      return null;
    }
    return falhar('Informe um salário válido (número maior ou igual a zero).');
  }

  const pcts = lerPercentuais();
  for (const [nome, valor] of [
    ['Necessidades', pcts.necessidades],
    ['Desejos', pcts.desejos],
    ['Economia', pcts.economia],
  ]) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      if (silencioso) {
        painelResultados.hidden = true;
        return null;
      }
      return falhar(`Percentual de ${nome} inválido (use um valor entre 0 e 100).`);
    }
  }

  const total = somarPercentuais();
  if (Math.abs(total - 100) >= 0.01) {
    if (silencioso) {
      painelResultados.hidden = true;
      return null;
    }
    return falhar(`Os percentuais devem somar 100%. Atualmente somam ${formatarPercentual(total)}.`);
  }

  return {
    salary: salario,
    pct_needs: pcts.necessidades,
    pct_wants: pcts.desejos,
    pct_savings: pcts.economia,
    valores: {
      necessidades: (salario * pcts.necessidades) / 100,
      desejos: (salario * pcts.desejos) / 100,
      economia: (salario * pcts.economia) / 100,
    },
  };
}

function exibirResultados(calculo) {
  const { valores, pct_needs, pct_wants, pct_savings } = calculo;
  const totalGastar = valores.necessidades + valores.desejos;

  valorGastar.textContent = formatarMoeda.format(totalGastar);
  valorEconomizar.textContent = formatarMoeda.format(valores.economia);

  document.getElementById('det-necessidades-pct').textContent = formatarPercentual(pct_needs);
  document.getElementById('det-desejos-pct').textContent = formatarPercentual(pct_wants);
  document.getElementById('det-economia-pct').textContent = formatarPercentual(pct_savings);

  document.getElementById('det-necessidades-valor').textContent = formatarMoeda.format(valores.necessidades);
  document.getElementById('det-desejos-valor').textContent = formatarMoeda.format(valores.desejos);
  document.getElementById('det-economia-valor').textContent = formatarMoeda.format(valores.economia);

  document.getElementById('barra-necessidades').style.width = `${pct_needs}%`;
  document.getElementById('barra-desejos').style.width = `${pct_wants}%`;
  document.getElementById('barra-economia').style.width = `${pct_savings}%`;

  painelResultados.hidden = false;
  limparErro();
}

// ---------------------------------------------------------------------------
// Salvar (criar ou atualizar o mês)
// ---------------------------------------------------------------------------
form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!perfilAtivo) return;

  const comp = inputCompetencia.value;
  if (!RE_COMPETENCIA.test(comp)) {
    return falhar('Escolha o mês de referência.');
  }

  const calculo = calcular();
  if (!calculo) return;

  const corpo = {
    competencia: comp,
    salary: calculo.salary,
    pct_needs: calculo.pct_needs,
    pct_wants: calculo.pct_wants,
    pct_savings: calculo.pct_savings,
  };

  const editando = modoEdicao !== null;
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando…';

  try {
    if (editando) {
      await api(`/api/perfis/${perfilAtivo.id}/budgets/${modoEdicao}`, {
        metodo: 'PUT',
        corpo,
      });
    } else {
      await api(`/api/perfis/${perfilAtivo.id}/budgets`, { metodo: 'POST', corpo });
    }

    await carregarOrcamentos(); // recarrega, sincroniza o modo e redesenha o histórico

    ultimoCalculo = calculo;
    exibirResultados(calculo);
    mostrarSucesso(
      editando
        ? `Mês de ${formatarCompetencia(comp)} atualizado!`
        : `Mês de ${formatarCompetencia(comp)} salvo!`
    );
  } catch (erro) {
    mostrarErro(erro.message);
  } finally {
    btnSalvar.disabled = false;
    sincronizarModo(); // garante o rótulo certo do botão
  }
});

function mostrarSucesso(mensagem) {
  limparErro();
  msgSucesso.textContent = mensagem;
  msgSucesso.hidden = false;
}

// ---------------------------------------------------------------------------
// Recálculo ao vivo
// ---------------------------------------------------------------------------
for (const input of [inputNecessidades, inputDesejos, inputEconomia]) {
  input.addEventListener('input', () => {
    atualizarIndicadorTotal();
    if (ultimoCalculo) {
      const calculo = calcular();
      if (calculo) {
        ultimoCalculo = calculo;
        exibirResultados(calculo);
      }
    }
  });
}

inputSalario.addEventListener('input', () => {
  if (ultimoCalculo) {
    const calculo = calcular({ silencioso: true });
    if (calculo) {
      ultimoCalculo = calculo;
      exibirResultados(calculo);
    }
  }
});

btnLimpar.addEventListener('click', () => {
  inputCompetencia.value = proximoMesLivre(orcamentos.map((o) => o.competencia));
  resetarFormulario();
  inputSalario.focus();
});

// ---------------------------------------------------------------------------
// Eventos do modal
// ---------------------------------------------------------------------------
for (const cor of CORES) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'cor';
  botao.dataset.cor = cor;
  botao.style.background = cor;
  botao.setAttribute('aria-label', `Cor ${cor}`);
  botao.addEventListener('click', () => {
    corSelecionada = cor;
    pintarModal();
  });
  seletorCores.appendChild(botao);
}

campoNome.addEventListener('input', pintarModal);

fotoInput.addEventListener('change', async () => {
  const arquivo = fotoInput.files && fotoInput.files[0];
  if (!arquivo) return;
  try {
    pendenteImagem = await processarImagem(arquivo);
    pintarModal();
    modalErro.hidden = true;
  } catch (erro) {
    mostrarErroModal(erro.message);
    fotoInput.value = '';
  }
});

btnRemoverFoto.addEventListener('click', () => {
  pendenteImagem = null;
  fotoInput.value = '';
  pintarModal();
});

modalSalvar.addEventListener('click', salvarPerfil);
modalCancelar.addEventListener('click', fecharModal);
modalExcluir.addEventListener('click', excluirPerfil);

modal.addEventListener('click', (evento) => {
  if (evento.target === modal) fecharModal();
});

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && !modal.hidden) fecharModal();
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
atualizarIndicadorTotal();
carregarPerfis().catch((erro) => {
  console.error('Falha ao carregar perfis:', erro);
});
