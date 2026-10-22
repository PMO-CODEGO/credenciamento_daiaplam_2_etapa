// Inciso XIII — MCE: formulário (PDF gerado), arquivo próprio e ciência da rede de água e esgoto.
// A parte de validação/máscaras vem do formulário do sistema cadastral.
const API_BASE_URL = window.CODEGO_API_BASE_URL; // definido em js/config.js
const CHAVE_TOKEN = 'dianot_token';
let token = null;
try { token = sessionStorage.getItem(CHAVE_TOKEN); } catch (_) { /* sem sessionStorage */ }
function sair() {
  try { sessionStorage.removeItem(CHAVE_TOKEN); } catch (_) { /* ignora */ }
  window.location.href = 'index.html';
}
if (!token) sair();

const form = document.getElementById('form-mce');
const submitButton = document.getElementById('btn-submit');
const feedbackEl = document.getElementById('feedback');

function onlyDigits(value) {
  return value.replace(/\D/g, '');
}

// Confere os dígitos verificadores (mesma regra do servidor).
function cpfValido(digits) {
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(digits[i]) * (tamanho + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(digits[tamanho])) return false;
  }
  return true;
}

function cnpjValido(digits) {
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const tamanho of [12, 13]) {
    const p = tamanho === 12 ? pesos : [6, ...pesos];
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(digits[i]) * p[i];
    const resto = soma % 11;
    if ((resto < 2 ? 0 : 11 - resto) !== Number(digits[tamanho])) return false;
  }
  return true;
}

function maskCnpj(digits) {
  return digits
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function maskCpf(digits) {
  return digits
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskTelefone(digits) {
  const d = digits.slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

document.getElementById('cnpj').addEventListener('input', (e) => {
  e.target.value = maskCnpj(onlyDigits(e.target.value));
});
document.getElementById('telefone').addEventListener('input', (e) => {
  e.target.value = maskTelefone(onlyDigits(e.target.value));
});

function maskCep(digits) {
  return digits.slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

function configurarBuscaCep(cepInputId, statusId, enderecoInputId, campoErro) {
  const cepInput = document.getElementById(cepInputId);
  const statusEl = document.getElementById(statusId);
  const enderecoInput = document.getElementById(enderecoInputId);

  cepInput.addEventListener('input', (e) => {
    e.target.value = maskCep(onlyDigits(e.target.value));
    statusEl.textContent = '';
    statusEl.className = 'field__hint';
  });

  cepInput.addEventListener('blur', async () => {
    const cepDigits = onlyDigits(cepInput.value);
    if (cepDigits.length !== 8) {
      return;
    }

    statusEl.textContent = 'Buscando endereço...';
    statusEl.className = 'field__hint';

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const dados = await response.json();

      if (dados.erro) {
        statusEl.textContent = 'CEP não encontrado. Preencha o endereço manualmente.';
        statusEl.className = 'field__hint field__hint--warn';
        return;
      }

      const partes = [dados.logradouro, dados.bairro, `${dados.localidade}-${dados.uf}`]
        .filter((parte) => parte && parte.trim());
      const enderecoEncontrado = partes.join(', ');

      if (!enderecoInput.value.trim()) {
        enderecoInput.value = enderecoEncontrado;
      }

      statusEl.textContent = `Endereço encontrado: ${enderecoEncontrado}. Complete com número/complemento, se necessário.`;
      statusEl.className = 'field__hint field__hint--ok';
      clearError(campoErro);
    } catch (error) {
      statusEl.textContent = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
      statusEl.className = 'field__hint field__hint--warn';
    }
  });
}

configurarBuscaCep('cep', 'cep-status', 'endereco', 'endereco');

// Campos que só se aplicam quando a resposta Sim/Não correspondente é "Sim"
// (ex.: previsão de funcionamento, data da última revisão do PCA).
function atualizarCamposCondicionais() {
  document.querySelectorAll('[data-mostrar-se]').forEach((wrapper) => {
    const controle = document.getElementById(wrapper.dataset.mostrarSe);
    const mostrar = controle.value === 'Sim';
    wrapper.hidden = !mostrar;
    if (!mostrar) {
      wrapper.querySelectorAll('input, textarea').forEach((el) => { el.value = ''; });
    }
  });
}

document.querySelectorAll('select[data-tipo="simnao"]').forEach((select) => {
  select.addEventListener('change', atualizarCamposCondicionais);
});

// Total da mão de obra = soma dos setores (o backend recalcula ao gerar o PDF).
const camposMaoDeObra = Array.from(document.querySelectorAll('input[data-tipo="int"]'));
function atualizarTotalMaoDeObra() {
  const total = camposMaoDeObra.reduce((soma, el) => soma + (parseInt(el.value, 10) || 0), 0);
  document.getElementById('mao_obra_total').value = total;
}
camposMaoDeObra.forEach((el) => el.addEventListener('input', atualizarTotalMaoDeObra));

// Número no formato brasileiro ("12.500", "2.500,75", "12500 m²") -> número, ou NaN.
function numeroBr(value) {
  const texto = value.trim().replace(/\s*m\s*[²2]\s*$/i, '');
  if (!/^(\d{1,3}(\.\d{3})*(,\d+)?|\d+(,\d+)?)$/.test(texto)) return NaN;
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

// Datas de hoje para limitar os calendários (previsão no futuro; datas já ocorridas no passado).
const hoje = new Date();
const doisDigitos = (n) => String(n).padStart(2, '0');
const MES_ATUAL = `${hoje.getFullYear()}-${doisDigitos(hoje.getMonth() + 1)}`;
const DATA_HOJE = `${MES_ATUAL}-${doisDigitos(hoje.getDate())}`;
document.getElementById('previsao_funcionamento').min = MES_ATUAL;
document.getElementById('data_inicio_operacoes').max = DATA_HOJE;
document.getElementById('pca_data_revisao').max = DATA_HOJE;

// Situação: "Em implantação" ou "Já implantado" (uma só). Preenche as duas
// perguntas do modelo de forma coerente.
const situacaoSelect = document.getElementById('situacao_implantacao');
function atualizarSituacao() {
  const valor = situacaoSelect.value;
  document.getElementById('em_implantacao').value = valor ? (valor === 'em_implantacao' ? 'Sim' : 'Não') : '';
  document.getElementById('ja_implantado').value = valor ? (valor === 'ja_implantado' ? 'Sim' : 'Não') : '';
  atualizarCamposCondicionais();
}
situacaoSelect.addEventListener('change', () => {
  atualizarSituacao();
  clearError('situacao_implantacao');
});

// Percentual de área verde calculado a partir da área verde e da área total.
const areaTotalInput = document.getElementById('area_total_terreno');
const areaVerdeInput = document.getElementById('area_verde');
const percentualInput = document.getElementById('percentual_area_verde');
const percentualAviso = document.getElementById('percentual_area_verde-aviso');
function atualizarPercentualAreaVerde() {
  const total = numeroBr(areaTotalInput.value);
  const verde = numeroBr(areaVerdeInput.value);
  if (!(total > 0) || Number.isNaN(verde) || verde > total) {
    percentualInput.value = '';
    percentualAviso.textContent = 'Mínimo de 20% da área total.';
    percentualAviso.className = 'field__hint';
    return;
  }
  const percentual = (verde / total) * 100;
  percentualInput.value = `${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (percentual < 20) {
    percentualAviso.textContent = 'Abaixo do mínimo de 20% exigido. Será preciso apresentar documentos ou projeto que comprovem a destinação para áreas verdes.';
    percentualAviso.className = 'field__hint field__hint--warn';
  } else {
    percentualAviso.textContent = 'Atende ao mínimo de 20% da área total.';
    percentualAviso.className = 'field__hint field__hint--ok';
  }
}
[areaTotalInput, areaVerdeInput].forEach((el) => el.addEventListener('input', atualizarPercentualAreaVerde));

// IRR dos resíduos sólidos: quantidade recuperada ÷ quantidade gerada × 100, em % (o backend recalcula).
const rsGeradaInput = document.getElementById('rs_quantidade_diaria');
const rsRecuperadaInput = document.getElementById('rs_quantidade_recuperada');
const rsIrrInput = document.getElementById('rs_irr');
const rsIrrAviso = document.getElementById('rs_irr-aviso');
function atualizarIrr() {
  const gerada = numeroBr(rsGeradaInput.value);
  const recuperada = numeroBr(rsRecuperadaInput.value);
  rsIrrAviso.className = 'field__hint';
  rsIrrAviso.textContent = 'Quantidade recuperada ÷ quantidade gerada × 100.';
  rsIrrInput.value = '';
  if (!rsRecuperadaInput.value.trim()) return;
  if (Number.isNaN(gerada) || Number.isNaN(recuperada)) {
    rsIrrAviso.textContent = 'Informe as duas quantidades só com números (ex.: 120 ou 85,5).';
    rsIrrAviso.className = 'field__hint field__hint--warn';
  } else if (recuperada > gerada) {
    rsIrrAviso.textContent = 'A quantidade recuperada não pode ser maior que a gerada.';
    rsIrrAviso.className = 'field__hint field__hint--warn';
  } else if (gerada === 0) {
    rsIrrInput.value = 'Não se aplica (nenhum resíduo gerado)';
  } else {
    rsIrrInput.value = `${((recuperada / gerada) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
}
[rsGeradaInput, rsRecuperadaInput].forEach((el) => el.addEventListener('input', atualizarIrr));

function setError(fieldName, message) {
  const errorEl = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (!errorEl) return;
  const field = document.getElementById(fieldName);
  if (field) field.closest('.field')?.classList.add('field--invalid');
  errorEl.textContent = message;
}

function clearError(fieldName) {
  const errorEl = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (!errorEl) return;
  const field = document.getElementById(fieldName);
  if (field) field.closest('.field')?.classList.remove('field--invalid');
  errorEl.textContent = '';
}

// ---------------------------------------------------------------------------
// Restrições de digitação: o campo não aceita o que não pode (letra em campo
// de número, valor acima do limite etc.). O que não dá para barrar enquanto a
// pessoa digita (campo vazio ou incompleto) é avisado ao clicar em "Gerar
// documento PDF", rolando a página até o campo.
// ---------------------------------------------------------------------------

// Aplica "formatar" a cada alteração e só aceita o novo valor se "permitido"
// concordar; senão o campo volta ao valor anterior.
function restringirCampo(el, formatar, permitido = () => true) {
  if (!el) return;
  let anterior = el.value;
  el.addEventListener('focus', () => { anterior = el.value; });
  el.addEventListener('input', () => {
    const novo = formatar ? formatar(el.value) : el.value;
    if (!permitido(novo)) {
      el.value = anterior;
      return;
    }
    el.value = novo;
    anterior = novo;
  });
}

// Rola até o primeiro campo com erro e coloca o cursor nele.
function irParaPrimeiroErro() {
  const erro = document.querySelector('.field__error:not(:empty)');
  if (!erro) return;
  const campo = document.getElementById(erro.dataset.errorFor);
  (campo || erro).scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (campo && typeof campo.focus === 'function') campo.focus({ preventScroll: true });
}

// Quando a pessoa começa a corrigir um campo, o aviso dele some.
form.addEventListener('input', (e) => { if (e.target.id) clearError(e.target.id); });
form.addEventListener('change', (e) => { if (e.target.id) clearError(e.target.id); });

// Nome de pessoa: só letras, espaço, apóstrofo, ponto e hífen.
const formatarNomePessoa = (v) => v.replace(/[^\p{L}\s'.-]/gu, '').replace(/\s{2,}/g, ' ');

// Número no formato brasileiro, formatado enquanto digita: "12500" -> "12.500",
// com vírgula para decimais (até 2 casas).
function formatarNumeroBr(v) {
  const [inteiro, ...decimais] = v.replace(/[^\d,]/g, '').split(',');
  const milhares = inteiro.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimais.length ? `${milhares},${decimais.join('').slice(0, 2)}` : milhares;
}

// CNAE: só números, formatado como 1091-1/01.
const formatarCnae = (v) => onlyDigits(v).slice(0, 7)
  .replace(/^(\d{4})(\d)/, '$1-$2')
  .replace(/^(\d{4}-\d)(\d{1,2})/, '$1/$2');

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const CAMPOS_TEXTO_OBRIGATORIOS = [
  ['razao_social', 'Informe o campo "Razão Social".'],
  ['inscricao_estadual', 'Informe o campo "Inscrição Estadual".'],
  ['endereco', 'Informe o campo "Endereço Completo".'],
  ['responsavel_nome', 'Informe o campo "Nome do Responsável".'],
  ['responsavel_cargo', 'Informe o campo "Cargo do Responsável".'],
  ['cnae_principal', 'Informe o campo "CNAE Principal".'],
  ['atividade_principal', 'Informe o campo "Descrição da Atividade Principal".'],
  ['area_total_terreno', 'Informe o campo "Área Total do Terreno (m²)".'],
  ['local_cidade_uf', 'Informe o campo "Local (Cidade e Estado)".'],
];

function validateForm() {
  let valid = true;

  for (const [id, mensagem] of CAMPOS_TEXTO_OBRIGATORIOS) {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      setError(id, mensagem);
      valid = false;
    } else {
      clearError(id);
    }
  }

  const cnpjDigits = onlyDigits(document.getElementById('cnpj').value);
  if (cnpjDigits.length !== 14) {
    setError('cnpj', 'CNPJ deve ter 14 dígitos.');
    valid = false;
  } else if (!cnpjValido(cnpjDigits)) {
    setError('cnpj', 'CNPJ inválido. Confira os números digitados.');
    valid = false;
  } else {
    clearError('cnpj');
  }

  const emailValue = document.getElementById('email').value.trim();
  if (!validateEmail(emailValue)) {
    setError('email', 'Informe um e-mail válido.');
    valid = false;
  } else {
    clearError('email');
  }

  const cepDigits = onlyDigits(document.getElementById('cep').value);
  if (cepDigits.length !== 8) {
    setError('cep', 'CEP deve ter 8 dígitos.');
    valid = false;
  } else {
    clearError('cep');
  }

  const telDigits = onlyDigits(document.getElementById('telefone').value);
  if (telDigits.length < 10 || telDigits.length > 11) {
    setError('telefone', 'Informe um telefone válido, com DDD.');
    valid = false;
  } else {
    clearError('telefone');
  }

  document.querySelectorAll('select[data-tipo="simnao"]').forEach((select) => {
    if (!select.value) {
      setError(select.id, 'Selecione Sim ou Não.');
      valid = false;
    } else {
      clearError(select.id);
    }
  });

  camposMaoDeObra.forEach((el) => {
    if (el.value !== '' && (!/^\d+$/.test(el.value))) {
      setError(el.id, 'Informe um número inteiro (0 ou mais).');
      valid = false;
    } else {
      clearError(el.id);
    }
  });

  const ruido = document.getElementById('monitoramento_ruido').value;
  const ruidoDescricao = document.getElementById('monitoramento_ruido_descricao').value.trim();
  if (ruido === 'Sim' && !ruidoDescricao) {
    setError('monitoramento_ruido_descricao', 'Enumere os equipamentos, horários de operação e estratégias de controle de ruído.');
    valid = false;
  } else {
    clearError('monitoramento_ruido_descricao');
  }


  if (!situacaoSelect.value) {
    setError('situacao_implantacao', 'Informe se o empreendimento está em implantação ou já implantado.');
    valid = false;
  }

  // Áreas: só números; construída e verde não passam da área total.
  const areaTotal = numeroBr(areaTotalInput.value);
  document.querySelectorAll('input[data-tipo="area"]').forEach((el) => {
    if (el.value.trim() && Number.isNaN(numeroBr(el.value))) {
      setError(el.id, 'Informe apenas números (ex.: 12.500 ou 2.500,50).');
      valid = false;
    } else if (el !== areaTotalInput && el.value.trim() && areaTotal > 0 && numeroBr(el.value) > areaTotal) {
      setError(el.id, 'Não pode ser maior que a área total do terreno.');
      valid = false;
    } else if (el.value.trim()) {
      clearError(el.id);
    }
  });

  // Datas: previsão a partir do mês atual; datas já ocorridas até hoje.
  const previsao = document.getElementById('previsao_funcionamento').value;
  if (previsao && previsao < MES_ATUAL) {
    setError('previsao_funcionamento', 'A previsão não pode ser um mês que já passou.');
    valid = false;
  } else {
    clearError('previsao_funcionamento');
  }
  [['data_inicio_operacoes', 'O início das operações não pode ser no futuro.'],
   ['pca_data_revisao', 'A data da última revisão não pode ser no futuro.']].forEach(([id, mensagem]) => {
    const valor = document.getElementById(id).value;
    if (valor && valor > DATA_HOJE) {
      setError(id, mensagem);
      valid = false;
    } else {
      clearError(id);
    }
  });

  return valid;
}


// ---------------------------------------------------------------------------
// Comunicação com a API (sempre com o token da sessão)
// ---------------------------------------------------------------------------
async function api(caminho, opcoes = {}) {
  const resp = await fetch(`${API_BASE_URL}${caminho}`, {
    method: opcoes.method,
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.json ? { 'Content-Type': 'application/json' } : {}) },
    body: opcoes.json ? JSON.stringify(opcoes.json) : opcoes.body,
  });
  if (resp.status === 401) { sair(); throw new Error('Sessão expirada.'); }
  return resp;
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function extrairMensagemErro(payload, padrao = 'Não foi possível processar a solicitação. Tente novamente.') {
  if (!payload) return padrao;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((erro) => (erro.msg || 'Campo inválido.').replace(/^Value error, /, '')).join(' ');
  }
  return padrao;
}

function showFeedback(html, type) {
  feedbackEl.innerHTML = html;
  feedbackEl.className = `feedback feedback--${type}`;
  feedbackEl.hidden = false;
  feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideFeedback() {
  feedbackEl.hidden = true;
  feedbackEl.innerHTML = '';
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? 'Salvando…' : 'Salvar e gerar PDF';
}

function mostrarPdf(texto) {
  showFeedback(
    `<p class="feedback__title">${esc(texto)}</p>
     <div class="feedback__actions"><button type="button" class="feedback__link" id="btn-pdf">Baixar / abrir PDF</button></div>`,
    'success'
  );
  document.getElementById('btn-pdf').addEventListener('click', async () => {
    const resp = await api('/api/mce/minha/pdf');
    if (!resp.ok) {
      showFeedback(`<p class="feedback__title">${esc(extrairMensagemErro(await resp.json().catch(() => null), 'Não foi possível gerar o PDF.'))}</p>`, 'error');
      return;
    }
    window.open(URL.createObjectURL(await resp.blob()), '_blank', 'noopener');
  });
}

// ---------------------------------------------------------------------------
// Preenchimento a partir do que já foi salvo (ou da solicitação)
// ---------------------------------------------------------------------------
function preencherFormulario(dados) {
  const mascaras = {
    cnpj: (v) => maskCnpj(onlyDigits(v)),
    telefone: (v) => maskTelefone(onlyDigits(v)),
    cep: (v) => maskCep(onlyDigits(v)),
  };
  Array.from(form.elements).forEach((el) => {
    if (!el.name || dados[el.name] === undefined || dados[el.name] === null) return;
    const valor = String(dados[el.name]);
    el.value = mascaras[el.name] ? mascaras[el.name](valor) : valor;
  });
  if (dados.em_implantacao === 'Sim') situacaoSelect.value = 'em_implantacao';
  else if (dados.ja_implantado === 'Sim') situacaoSelect.value = 'ja_implantado';
  atualizarSituacao();
  atualizarCamposCondicionais();
  atualizarPercentualAreaVerde();
  atualizarIrr();
  atualizarTotalMaoDeObra();
}

// ---------------------------------------------------------------------------
// Situação do inciso, ciência e arquivo próprio
// ---------------------------------------------------------------------------
let limites = { max_arquivos: 5, max_mb: 20 };
const tamanho = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);

function mostrarSituacao(estado) {
  const partes = [];
  if (estado.dados) partes.push('memorial preenchido pelo formulário');
  if (estado.arquivos.length) partes.push(`${estado.arquivos.length} arquivo(s) enviado(s)`);
  const pendencias = [];
  if (!partes.length) pendencias.push('preencha o formulário ou envie um arquivo');
  if (estado.ciencia === 'recuso') pendencias.push('a ciência da rede de água e esgoto está como "Recuso"');
  else if (!estado.ciencia) pendencias.push('responda a ciência da rede de água e esgoto');
  const el = document.getElementById('situacao');
  const ok = estado.concluido;
  el.textContent = ok
    ? `✔ Situação deste inciso: ${partes.join(' e ')}; ciência aceita.`
    : `Situação deste inciso: pendente — ${pendencias.join('; ')}.${partes.length ? ` (já há: ${partes.join(' e ')}.)` : ''}`;
  el.className = `field__hint field__hint--${ok ? 'ok' : 'warn'}`;

  const radio = document.querySelector(`input[name="ciencia_rede"][value="${estado.ciencia}"]`);
  if (radio) radio.checked = true;
  const status = document.getElementById('ciencia-status');
  if (estado.ciencia && estado.ciencia_em) {
    status.textContent = `Resposta registrada em ${new Date(estado.ciencia_em).toLocaleString('pt-BR')}. Você pode alterá-la.`;
  } else {
    status.textContent = '';
  }
}

document.querySelectorAll('input[name="ciencia_rede"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    document.getElementById('erro-ciencia').textContent = '';
    try {
      const resp = await api('/api/mce/minha/ciencia', { method: 'PUT', json: { resposta: radio.value } });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) { document.getElementById('erro-ciencia').textContent = extrairMensagemErro(dados); return; }
      mostrarSituacao(dados);
    } catch (e) {
      document.getElementById('erro-ciencia').textContent = 'Falha de conexão. Tente novamente.';
    }
  });
});

function desenharArquivos(estado) {
  limites = { max_arquivos: estado.max_arquivos, max_mb: estado.max_mb };
  document.getElementById('texto-upload').textContent =
    `PDF, JPG, PNG ou Excel (.xls/.xlsx), até ${estado.max_mb} MB por arquivo e até ${estado.max_arquivos} arquivos. Cada arquivo fica salvo assim que é enviado.`;
  const raiz = document.getElementById('upload-mce');
  raiz.innerHTML = '';
  const campo = document.createElement('div');
  campo.className = 'field doc-upload';
  if (estado.arquivos.length) {
    const ul = document.createElement('ul');
    ul.className = 'doc-upload__arquivos';
    estado.arquivos.forEach((a) => {
      const li = document.createElement('li');
      li.className = 'doc-upload__arquivo';
      const ver = document.createElement('button');
      ver.type = 'button'; ver.className = 'doc-upload__nome'; ver.textContent = a.nome_original;
      ver.addEventListener('click', async () => {
        const r = await api(`/api/documentos/${a.id}/arquivo`);
        if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank', 'noopener');
      });
      const tam = document.createElement('span');
      tam.className = 'doc-upload__tamanho'; tam.textContent = tamanho(a.tamanho);
      const rem = document.createElement('button');
      rem.type = 'button'; rem.className = 'doc-upload__remover'; rem.textContent = 'Remover';
      rem.setAttribute('aria-label', `Remover ${a.nome_original}`);
      rem.addEventListener('click', async () => {
        const r = await api(`/api/documentos/${a.id}`, { method: 'DELETE' });
        if (r.ok || r.status === 204) recarregarEstado();
        else document.getElementById('erro-upload').textContent = 'Não foi possível remover o arquivo.';
      });
      li.append(ver, tam, rem);
      ul.appendChild(li);
    });
    campo.appendChild(ul);
  }
  const zona = document.createElement('label');
  zona.className = 'doc-upload__zona';
  zona.hidden = estado.arquivos.length >= estado.max_arquivos;
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.className = 'visualmente-oculto';
  input.accept = '.pdf,.jpg,.jpeg,.png,.xls,.xlsx';
  const acao = document.createElement('span');
  acao.className = 'doc-upload__acao';
  acao.textContent = estado.arquivos.length ? 'Adicionar outro arquivo' : 'Escolher arquivo';
  zona.append(input, acao);
  input.addEventListener('change', () => enviarArquivos(Array.from(input.files)));
  campo.appendChild(zona);
  const msg = document.createElement('p');
  msg.className = 'field__error'; msg.id = 'erro-upload'; msg.setAttribute('role', 'alert');
  campo.appendChild(msg);
  raiz.appendChild(campo);
}

async function recarregarEstado() {
  const estado = await (await api('/api/mce/minha')).json();
  mostrarSituacao(estado);
  desenharArquivos(estado);
}

async function enviarArquivos(arquivos) {
  const erros = [];
  for (const arq of arquivos) {
    if (arq.size > limites.max_mb * 1048576) { erros.push(`${arq.name}: maior que ${limites.max_mb} MB.`); continue; }
    const fd = new FormData();
    fd.append('arquivo', arq);
    try {
      const r = await api('/api/documentos/inciso13', { method: 'POST', body: fd });
      if (!r.ok) erros.push(`${arq.name}: ${extrairMensagemErro(await r.json().catch(() => null), 'não foi possível enviar.')}`);
    } catch (e) { erros.push(`${arq.name}: falha de conexão.`); }
  }
  await recarregarEstado();
  if (erros.length) document.getElementById('erro-upload').textContent = erros.join(' ');
}

// ---------------------------------------------------------------------------
// Salvar o formulário
// ---------------------------------------------------------------------------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideFeedback();

  if (!validateForm()) {
    irParaPrimeiroErro();
    return;
  }

  // Todos os campos com "name" vão no payload; os de mão de obra como número.
  const payload = {};
  Array.from(form.elements).forEach((el) => {
    if (!el.name) return;
    payload[el.name] = el.dataset.tipo === 'int' ? parseInt(el.value, 10) || 0 : el.value.trim();
  });

  setLoading(true);
  try {
    const response = await api('/api/mce/minha', { method: 'PUT', json: payload });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      showFeedback(`<p class="feedback__title">Não foi possível salvar o memorial</p><p>${esc(extrairMensagemErro(data))}</p>`, 'error');
      return;
    }
    mostrarSituacao(data);
    mostrarPdf('Memorial salvo com sucesso. Você pode alterá-lo e salvar de novo.');
  } catch (error) {
    if (error instanceof TypeError) {
      showFeedback('<p class="feedback__title">Falha de conexão</p><p>Não foi possível falar com o servidor. Tente novamente.</p>', 'error');
    }
  } finally {
    setLoading(false);
  }
});

async function iniciar() {
  try {
    const estado = await (await api('/api/mce/minha')).json();
    preencherFormulario(estado.dados || estado.sugestao || {});
    mostrarSituacao(estado);
    desenharArquivos(estado);
    if (estado.dados) mostrarPdf('Memorial salvo. Você pode alterá-lo e salvar de novo.');
  } catch (e) {
    showFeedback('<p class="feedback__title">Falha de conexão</p><p>Recarregue a página.</p>', 'error');
  }
}

// Restrições deste formulário
restringirCampo(document.getElementById('responsavel_nome'), formatarNomePessoa);
restringirCampo(document.getElementById('area_total_terreno'), formatarNumeroBr);
restringirCampo(document.getElementById('area_construida'), formatarNumeroBr, (v) => {
  // não pode passar da área de referência (quando ela já estiver preenchida)
  const limite = numeroBr(document.getElementById('area_total_terreno').value);
  return !v || Number.isNaN(limite) || numeroBr(v) <= limite;
});
restringirCampo(document.getElementById('area_verde'), formatarNumeroBr, (v) => {
  // não pode passar da área de referência (quando ela já estiver preenchida)
  const limite = numeroBr(document.getElementById('area_total_terreno').value);
  return !v || Number.isNaN(limite) || numeroBr(v) <= limite;
});
restringirCampo(document.getElementById('cnae_principal'), formatarCnae);
restringirCampo(document.getElementById('inscricao_estadual'), (v) => v.replace(/[^\d./-]/g, ''), (v) => onlyDigits(v).length <= 14);
// Quantidade de funcionários: só números inteiros.
document.querySelectorAll('input[data-tipo="int"]').forEach((el) => {
  restringirCampo(el, (v) => onlyDigits(v).slice(0, 6));
});
// Datas: fora do limite do calendário, o campo volta ao valor anterior.
['previsao_funcionamento', 'data_inicio_operacoes', 'pca_data_revisao'].forEach((id) => {
  const el = document.getElementById(id);
  let anterior = el.value;
  el.addEventListener('focus', () => { anterior = el.value; });
  el.addEventListener('change', () => {
    const foraDoLimite = el.value && ((el.min && el.value < el.min) || (el.max && el.value > el.max));
    if (foraDoLimite) {
      el.value = anterior;
    } else {
      anterior = el.value;
    }
  });
});
// Os cálculos automáticos rodam de novo depois das restrições acima, para usar
// o valor que ficou no campo (e não o que foi recusado). A função vai embrulhada
// porque o navegador ignora registrar duas vezes a mesma função no mesmo campo.
[areaTotalInput, areaVerdeInput].forEach((el) => el.addEventListener('input', () => atualizarPercentualAreaVerde()));
camposMaoDeObra.forEach((el) => el.addEventListener('input', () => atualizarTotalMaoDeObra()));

iniciar();
