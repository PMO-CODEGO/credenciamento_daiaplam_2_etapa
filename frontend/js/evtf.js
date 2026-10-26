// Anexo V — Estudo de Viabilidade Técnica e Financeira (EVTF, inciso XI do edital): formulário (com PDF
// gerado no servidor) e envio de arquivo próprio. Segue o mesmo modelo das
// telas do Cronograma e do MCE.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  const digitos = (v) => (v || '').replace(/\D/g, '');

  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) {}
  function sair() {
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    window.location.href = 'index.html';
  }
  if (!token) { sair(); return; }

  async function api(caminho, opcoes = {}) {
    const resp = await fetch(`${API}${caminho}`, {
      ...opcoes,
      headers: { Authorization: `Bearer ${token}`, ...(opcoes.json ? { 'Content-Type': 'application/json' } : {}) },
      body: opcoes.json ? JSON.stringify(opcoes.json) : opcoes.body,
    });
    if (resp.status === 401) { sair(); throw new Error('Sessão expirada.'); }
    return resp;
  }
  function mensagemDe(dados, padrao) {
    let msg = dados && dados.detail;
    if (Array.isArray(msg)) msg = msg.map((e) => (e.msg || '').replace(/^Value error, /, '')).join(' ');
    return msg || padrao;
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Campos ----------
  const TEXTOS = [
    'razao_social', 'cnpj', 'endereco', 'cidade', 'uf', 'cep', 'telefone', 'email',
    'conta_corrente', 'banco', 'agencia', 'praca_pagamento',
    'responsavel_nome', 'responsavel_ci_orgao', 'responsavel_cpf', 'responsavel_endereco',
    'responsavel_cidade_uf', 'responsavel_cep', 'responsavel_cargo', 'responsavel_contato', 'responsavel_email',
    'ramo_atividade_cnae', 'ramo_atividade_especificacao',
    'capital_social_data', 'capital_social_ato', 'principais_acionistas',
    'projeto_objetivo', 'distrito_industrial',
    'prazo_implantacao_inicio', 'prazo_implantacao_termino', 'prazo_expansao_inicio', 'prazo_expansao_termino',
    'fluxo_producao_descricao',
    'saneamento_estado_fisico_rejeitos', 'saneamento_tratamento_proprio', 'saneamento_equipamento_controle',
    'responsavel_tecnico_nome', 'responsavel_tecnico_registro',
  ];
  // Números no formato brasileiro (ex.: 12.500 ou 2.500,50).
  const NUMEROS = [
    'capital_recursos_proprios', 'capital_recursos_incentivos', 'capital_recursos_outros', 'capital_recursos_total',
    'composicao_nacional_pct', 'composicao_estrangeiro_pct', 'area_terreno_m2',
    'eng_area_construida_implantacao', 'eng_area_construida_expansao',
    'eng_area_estocagem_implantacao', 'eng_area_estocagem_expansao',
    'eng_estacionamento_implantacao', 'eng_estacionamento_expansao',
    'saneamento_consumo_agua', 'saneamento_geracao_esgoto', 'saneamento_volume_rejeitos',
    'saneamento_consumo_energia', 'saneamento_potencia_instalada', 'mao_obra_local_pct',
  ];
  const INTEIROS = ['empregos_diretos', 'empregos_indiretos'];
  const OBRIGATORIOS = {
    razao_social: 'Informe a razão social.',
    endereco: 'Informe o endereço.',
    cidade: 'Informe a cidade.',
    responsavel_nome: 'Informe o nome do responsável.',
    responsavel_ci_orgao: 'Informe a CI e o órgão expedidor.',
    responsavel_endereco: 'Informe o endereço do responsável.',
    responsavel_cidade_uf: 'Informe a cidade/UF do responsável.',
    responsavel_cargo: 'Informe o cargo ou função.',
    responsavel_contato: 'Informe o telefone de contato.',
    ramo_atividade_cnae: 'Informe o código CNAE.',
    ramo_atividade_especificacao: 'Informe a especificação da atividade.',
    projeto_objetivo: 'Descreva o objetivo do projeto.',
    distrito_industrial: 'Informe o distrito industrial.',
    fluxo_producao_descricao: 'Descreva o fluxo de produção.',
    responsavel_tecnico_nome: 'Informe o nome do responsável técnico.',
    responsavel_tecnico_registro: 'Informe o registro no conselho regional.',
  };

  // ---------- Máscaras ----------
  const mascaraCep = (v) => digitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  const mascaraCpf = (v) => digitos(v).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  const mascaraCnpj = (v) => digitos(v).slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  function mascaraTel(v) {
    const d = digitos(v).slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  function numeroBr(v) {
    const t = (v || '').trim();
    if (!/^(\d{1,3}(\.\d{3})*(,\d+)?|\d+(,\d+)?)$/.test(t)) return NaN;
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  const mascaras = {
    cep: mascaraCep, responsavel_cep: mascaraCep, responsavel_cpf: mascaraCpf,
    telefone: mascaraTel, responsavel_contato: mascaraTel,
  };
  Object.entries(mascaras).forEach(([id, f]) => $(id).addEventListener('input', (e) => (e.target.value = f(e.target.value))));
  NUMEROS.forEach((id) => $(id).addEventListener('input', (e) => (e.target.value = e.target.value.replace(/[^\d.,]/g, ''))));
  INTEIROS.forEach((id) => $(id).addEventListener('input', (e) => (e.target.value = digitos(e.target.value))));

  // O total do capital acompanha a soma dos recursos até a pessoa alterá-lo.
  let totalEditado = false;
  $('capital_recursos_total').addEventListener('input', () => { totalEditado = true; });
  ['capital_recursos_proprios', 'capital_recursos_incentivos', 'capital_recursos_outros'].forEach((id) => {
    $(id).addEventListener('input', () => {
      if (totalEditado) return;
      const partes = ['capital_recursos_proprios', 'capital_recursos_incentivos', 'capital_recursos_outros']
        .map((c) => $(c).value.trim()).filter(Boolean).map(numeroBr);
      $('capital_recursos_total').value = partes.length && partes.every((n) => !Number.isNaN(n))
        ? partes.reduce((a, b) => a + b, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    });
  });

  // ---------- Estado vindo do servidor ----------
  function preencher(dados) {
    [...TEXTOS, ...NUMEROS].forEach((id) => {
      if (dados[id] !== undefined && dados[id] !== null) $(id).value = dados[id];
    });
    INTEIROS.forEach((id) => { if (dados[id] !== undefined && dados[id] !== null) $(id).value = String(dados[id]); });
    $('cnpj').value = mascaraCnpj($('cnpj').value);
    ['cep', 'responsavel_cep'].forEach((id) => ($(id).value = mascaraCep($(id).value)));
    ['telefone', 'responsavel_contato'].forEach((id) => ($(id).value = mascaraTel($(id).value)));
    $('responsavel_cpf').value = mascaraCpf($('responsavel_cpf').value);
    if (!$('uf').value) $('uf').value = 'GO';
  }

  function situacao(estado) {
    const partes = [];
    if (estado.dados) partes.push('EVTF preenchido pelo formulário');
    if (estado.arquivos.length) partes.push(`EVTF assinado enviado (${estado.arquivos.length})`);
    if (estado.arquivos_excel.length) partes.push(`Excel enviado (${estado.arquivos_excel.length})`);
    const el = $('situacao');
    if (estado.concluido) {
      el.textContent = `✔ Situação deste anexo: ${partes.join(' e ')}.`;
    } else if (estado.arquivos.length || estado.arquivos_excel.length) {
      el.textContent = `Situação deste anexo: pendente — falta enviar ${estado.arquivos.length ? 'o EVTF em Excel' : 'o EVTF assinado'}.`;
    } else {
      el.textContent = 'Situação deste anexo: pendente — preencha o formulário ou envie o EVTF assinado e em Excel.';
    }
    el.className = `field__hint field__hint--${estado.concluido ? 'ok' : 'warn'}`;
  }

  // ---------- Escolha entre a Opção 1 (arquivo pronto) e a Opção 2 (formulário) ----------
  // Na primeira vez só aparecem os dois botões; quem já usou uma das opções
  // volta direto para ela. Dá para trocar a qualquer momento.
  const botoesOpcao = document.querySelectorAll('.escolha-opcao__botao');
  function escolherOpcao(id) {
    botoesOpcao.forEach((b) => {
      const ativa = b.dataset.opcao === id;
      b.setAttribute('aria-pressed', String(ativa));
      $(b.dataset.opcao).hidden = !ativa;
    });
  }
  botoesOpcao.forEach((b) => b.addEventListener('click', () => escolherOpcao(b.dataset.opcao)));

  async function carregar() {
    try {
      const estado = await (await api('/api/evtf/minha')).json();
      preencher({ uf: 'GO', ...(estado.sugestao || {}), ...(estado.dados || {}) });
      totalEditado = !!(estado.dados && estado.dados.capital_recursos_total);
      situacao(estado);
      desenharArquivos(estado);
      if (estado.dados) escolherOpcao('opcao-2');
      else if (estado.arquivos.length || estado.arquivos_excel.length) escolherOpcao('opcao-1');
      if (estado.dados) mostrarPdf('EVTF salvo. Você pode alterá-lo e salvar de novo.');
    } catch (e) {
      mostrar('error', esc(e.message || 'Falha de conexão. Recarregue a página.'));
    }
  }

  // ---------- Mensagens, PDF ----------
  function mostrar(tipo, html) {
    const fb = $('feedback');
    fb.className = `feedback feedback--${tipo}`;
    fb.innerHTML = html;
    fb.hidden = false;
  }
  function mostrarPdf(texto) {
    mostrar('success', `<p class="feedback__title">${esc(texto)}</p>
      <div class="feedback__actions"><button type="button" class="feedback__link" id="btn-pdf">Baixar / abrir PDF</button></div>`);
    $('btn-pdf').addEventListener('click', abrirPdf);
  }
  async function abrirPdf() {
    // Abre a aba já no clique (senão o navegador bloqueia como pop-up).
    const aba = window.open('', '_blank');
    const resp = await api('/api/evtf/minha/pdf');
    if (!resp.ok) {
      if (aba) aba.close();
      mostrar('error', esc(mensagemDe(await resp.json().catch(() => null), 'Não foi possível gerar o PDF.')));
      return;
    }
    const url = URL.createObjectURL(await resp.blob());
    if (aba) aba.location.href = url; else window.location.href = url;
  }

  // ---------- Validação e envio ----------
  const form = $('form-evtf');
  CodegoForm.limparAoEditar(form);
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function validar() {
    const E = CodegoForm.erro;
    CodegoForm.limparErros(form);
    let ok = true;
    Object.entries(OBRIGATORIOS).forEach(([id, msg]) => { if (!$(id).value.trim()) { E(id, msg); ok = false; } });
    if (digitos($('cep').value).length !== 8) { E('cep', 'Informe o CEP (8 dígitos).'); ok = false; }
    if (digitos($('responsavel_cep').value).length !== 8) { E('responsavel_cep', 'Informe o CEP (8 dígitos).'); ok = false; }
    if (![10, 11].includes(digitos($('telefone').value).length)) { E('telefone', 'Informe o telefone com DDD.'); ok = false; }
    if (!emailOk($('email').value.trim())) { E('email', 'Informe um e-mail válido.'); ok = false; }
    if (!emailOk($('responsavel_email').value.trim())) { E('responsavel_email', 'Informe um e-mail válido.'); ok = false; }
    if (digitos($('responsavel_cpf').value).length !== 11) { E('responsavel_cpf', 'Informe o CPF do responsável.'); ok = false; }
    const area = numeroBr($('area_terreno_m2').value);
    if (Number.isNaN(area) || area <= 0) { E('area_terreno_m2', 'Informe a área do terreno (ex.: 10.000 ou 2.500,50).'); ok = false; }
    NUMEROS.forEach((id) => {
      const v = $(id).value.trim();
      if (id !== 'area_terreno_m2' && v && Number.isNaN(numeroBr(v))) { E(id, 'Use só números (ex.: 12.500 ou 2.500,50).'); ok = false; }
    });
    ['composicao_nacional_pct', 'composicao_estrangeiro_pct', 'mao_obra_local_pct'].forEach((id) => {
      const n = numeroBr($(id).value);
      if ($(id).value.trim() && !Number.isNaN(n) && n > 100) { E(id, 'O percentual não pode passar de 100.'); ok = false; }
    });
    INTEIROS.forEach((id) => { if (!$(id).value.trim()) { E(id, 'Informe a quantidade (pode ser 0).'); ok = false; } });
    [['prazo_implantacao_inicio', 'prazo_implantacao_termino'], ['prazo_expansao_inicio', 'prazo_expansao_termino']].forEach(([ini, fim]) => {
      if ($(ini).value && $(fim).value && $(fim).value < $(ini).value) { E(fim, 'O término deve ser igual ou posterior ao início.'); ok = false; }
    });
    return ok;
  }

  function corpo() {
    const d = {};
    TEXTOS.forEach((id) => (d[id] = $(id).value.trim()));
    NUMEROS.forEach((id) => (d[id] = $(id).value.trim()));
    INTEIROS.forEach((id) => (d[id] = Number($(id).value)));
    ['cnpj', 'cep', 'telefone', 'responsavel_cpf', 'responsavel_cep'].forEach((id) => (d[id] = digitos(d[id])));
    return d;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('feedback').hidden = true;
    if (!validar()) { CodegoForm.focarPrimeiroErro(form); mostrar('error', 'Corrija os campos destacados e tente novamente.'); return; }
    CodegoForm.ocupado($('btn-salvar'), 'Salvando…');
    try {
      const resp = await api('/api/evtf/minha', { method: 'PUT', json: corpo() });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) { mostrar('error', esc(mensagemDe(dados, 'Não foi possível salvar o EVTF.'))); return; }
      situacao(dados);
      mostrarPdf('EVTF salvo com sucesso.');
    } catch (e) {
      mostrar('error', e instanceof TypeError ? 'Falha de conexão. Tente novamente.' : esc(e.message));
    } finally {
      CodegoForm.livre($('btn-salvar'));
    }
  });

  // ---------- Arquivo próprio (upload) ----------
  const tamanho = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);
  let limites = { max_arquivos: 5, max_mb: 20 };

  // Dois envios na Opção 1: o EVTF assinado (PDF ou imagem) e o mesmo formulário em
  // Excel editável, como pede o modelo do Anexo V.
  const ENVIOS = [
    { tipo: 'evtf', raiz: 'upload-evtf', chave: 'arquivos', aceita: '.pdf,.jpg,.jpeg,.png' },
    { tipo: 'evtf_excel', raiz: 'upload-evtf-excel', chave: 'arquivos_excel', aceita: '.xlsx,.xls' },
  ];

  function desenharArquivos(estado) {
    limites = { max_arquivos: estado.max_arquivos, max_mb: estado.max_mb };
    $('texto-upload').textContent = `Até ${estado.max_mb} MB por arquivo e até ${estado.max_arquivos} arquivos em cada campo. Cada arquivo fica salvo assim que é enviado.`;
    ENVIOS.forEach((envio) => desenharCampo(envio, estado[envio.chave], estado.max_arquivos));
  }

  function desenharCampo(envio, arquivos, maximo) {
    const raiz = $(envio.raiz);
    raiz.innerHTML = '';
    const campo = document.createElement('div');
    campo.className = 'field doc-upload';
    if (arquivos.length) {
      const ul = document.createElement('ul');
      ul.className = 'doc-upload__arquivos';
      arquivos.forEach((a) => {
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
          if (!window.confirm(`Remover "${a.nome_original}"?`)) return;
          const r = await api(`/api/documentos/${a.id}`, { method: 'DELETE' });
          if (r.ok || r.status === 204) recarregarEstado(); else mostrar('error', 'Não foi possível remover o arquivo.');
        });
        li.append(ver, tam, rem);
        ul.appendChild(li);
      });
      campo.appendChild(ul);
    }
    const zona = document.createElement('label');
    zona.className = 'doc-upload__zona';
    zona.hidden = arquivos.length >= maximo;
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.className = 'visualmente-oculto';
    input.accept = envio.aceita;
    const acao = document.createElement('span');
    acao.className = 'doc-upload__acao';
    acao.textContent = arquivos.length ? 'Adicionar outro arquivo' : 'Escolher arquivo';
    zona.append(input, acao);
    input.addEventListener('change', () => enviarArquivos(envio.tipo, Array.from(input.files)));
    campo.appendChild(zona);
    const msg = document.createElement('p');
    msg.className = 'field__error'; msg.id = `erro-upload-${envio.tipo}`; msg.setAttribute('role', 'alert');
    campo.appendChild(msg);
    raiz.appendChild(campo);
  }

  async function recarregarEstado() {
    const estado = await (await api('/api/evtf/minha')).json();
    situacao(estado);
    desenharArquivos(estado);
  }

  async function enviarArquivos(tipo, arquivos) {
    const erros = [];
    for (const arq of arquivos) {
      if (arq.size > limites.max_mb * 1048576) { erros.push(`${arq.name}: maior que ${limites.max_mb} MB.`); continue; }
      const fd = new FormData();
      fd.append('arquivo', arq);
      try {
        const r = await api(`/api/documentos/${tipo}`, { method: 'POST', body: fd });
        if (!r.ok) erros.push(`${arq.name}: ${mensagemDe(await r.json().catch(() => null), 'não foi possível enviar.')}`);
      } catch (e) { erros.push(`${arq.name}: falha de conexão.`); }
    }
    await recarregarEstado();
    if (erros.length) $(`erro-upload-${tipo}`).textContent = erros.join(' ');
  }

  carregar();
})();
