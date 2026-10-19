// Inciso XII — Cronograma Físico de Obras: formulário (serviços x meses), PDF e
// envio de arquivo próprio. O estado do cronograma fica em memória; a tabela só
// é redesenhada quando a estrutura muda, para não perder o foco ao digitar.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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

  // ---------- Números e períodos ----------
  function numeroBr(v) {
    const t = (v || '').trim().replace(/\s*m\s*[²2]\s*$/i, '');
    if (!/^(\d{1,3}(\.\d{3})*(,\d+)?|\d+(,\d+)?)$/.test(t)) return NaN;
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  function formatarNumeroBr(v) {
    const [inteiro, ...dec] = v.replace(/[^\d,]/g, '').split(',');
    const milhares = inteiro.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec.length ? `${milhares},${dec.join('').slice(0, 2)}` : milhares;
  }
  const inicioEl = $('inicio_obras');
  const terminoEl = $('termino_obras');
  const cronogramaEl = $('cronograma');
  let MAX_MESES = 24;
  let sugestao = {};
  let servicos = [];

  const hoje = new Date();
  const MES_ATUAL = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  inicioEl.min = MES_ATUAL;

  function meses() {
    if (!inicioEl.value || !terminoEl.value) return 0;
    const [ai, mi] = inicioEl.value.split('-').map(Number);
    const [at, mt] = terminoEl.value.split('-').map(Number);
    const n = (at - ai) * 12 + (mt - mi) + 1;
    return n >= 1 && n <= MAX_MESES ? n : 0;
  }
  const problemaInicio = () =>
    inicioEl.value && inicioEl.value < MES_ATUAL ? 'A previsão de início das obras não pode ser um mês que já passou.' : '';
  function problemaPeriodo() {
    if (!inicioEl.value || !terminoEl.value) return '';
    if (terminoEl.value < inicioEl.value) return 'A previsão de término deve ser igual ou posterior à de início.';
    if (meses() === 0) return `A obra não pode passar de 2 anos (${MAX_MESES} meses, contando o mês de início e o de término).`;
    return '';
  }
  let inicioAnt = '';
  let terminoAnt = '';
  function atualizarPeriodo() {
    inicioAnt = inicioEl.value; terminoAnt = terminoEl.value;
    terminoEl.min = inicioEl.value || MES_ATUAL;
    inicioEl.max = terminoEl.value || '';
    renderizar();
  }
  inicioEl.addEventListener('change', () => {
    if (problemaInicio() || problemaPeriodo()) inicioEl.value = inicioAnt;
    atualizarPeriodo();
  });
  terminoEl.addEventListener('change', () => {
    if (problemaPeriodo()) terminoEl.value = terminoAnt;
    atualizarPeriodo();
  });

  function referenciaMes(i) {
    const [ano, mes] = inicioEl.value.split('-').map(Number);
    const pos = mes - 1 + i;
    return `${MESES_ABREV[pos % 12]}/${String(ano + Math.floor(pos / 12)).slice(2)}`;
  }
  const soma = (s) => s.percentuais.reduce((t, v) => t + (Number(v) || 0), 0);
  function atualizarTotal(i) {
    const cel = cronogramaEl.querySelector(`[data-total="${i}"]`);
    if (!cel) return;
    const s = soma(servicos[i]);
    cel.textContent = `${Number(s.toFixed(2)).toLocaleString('pt-BR')}%`;
    cel.className = `cronograma__total${Math.abs(s - 100) <= 0.01 ? ' cronograma__total--ok' : ''}`;
  }

  function renderizar() {
    const n = meses();
    servicos.forEach((s) => { s.percentuais = Array.from({ length: n }, (_, i) => s.percentuais[i] ?? ''); });
    $('adicionar-servico-wrapper').hidden = n === 0;
    if (n === 0) {
      cronogramaEl.innerHTML = problemaPeriodo()
        ? '<p class="cronograma__vazio">Corrija a previsão de início e de término das obras para montar o cronograma.</p>'
        : '<p class="cronograma__vazio">Informe a previsão de início e de término das obras para montar o cronograma.</p>';
      return;
    }
    let tri = '';
    for (let i = 0; i < n; i += 3) tri += `<th colspan="${Math.min(3, n - i)}">${i / 3 + 1}º Trimestre</th>`;
    let cab = '';
    for (let i = 0; i < n; i += 1) cab += `<th>${i + 1}º mês<small>${referenciaMes(i)}</small></th>`;
    const linhas = servicos.map((s, k) => `
      <tr>
        <td class="cronograma__servico"><input type="text" data-descricao="${k}" maxlength="120" value="${esc(s.descricao)}" placeholder="Descrição do serviço" aria-label="Serviço ${k + 1}"></td>
        ${s.percentuais.map((v, m) => `<td><input type="number" min="0" max="100" step="any" inputmode="decimal" data-servico="${k}" data-mes="${m}" value="${esc(v)}" aria-label="${esc(s.descricao || 'Serviço')} — ${m + 1}º mês (%)"></td>`).join('')}
        <td class="cronograma__total" data-total="${k}"></td>
        <td><button type="button" class="btn-remover" data-remover="${k}" aria-label="Remover serviço" title="Remover serviço">&times;</button></td>
      </tr>`).join('');
    cronogramaEl.innerHTML = `
      <table>
        <thead>
          <tr><th class="cronograma__servico"></th>${tri}<th></th><th></th></tr>
          <tr><th class="cronograma__servico">Serviços / Mês</th>${cab}<th>Total</th><th></th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>`;
    servicos.forEach((_, k) => atualizarTotal(k));
  }

  cronogramaEl.addEventListener('input', (e) => {
    const { servico, mes, descricao } = e.target.dataset;
    if (descricao !== undefined) {
      servicos[Number(descricao)].descricao = e.target.value;
    } else if (servico !== undefined) {
      const linha = servicos[Number(servico)];
      const ant = linha.percentuais[Number(mes)];
      if (e.target.validity.badInput) { e.target.value = ant; return; }
      const novo = Number(e.target.value) || 0;
      // Não aceita valor negativo, acima de 100% ou que faça o serviço passar de 100%.
      if (novo < 0 || novo > 100 || soma(linha) - (Number(ant) || 0) + novo > 100.001) { e.target.value = ant; return; }
      linha.percentuais[Number(mes)] = e.target.value;
      atualizarTotal(Number(servico));
    }
    CodegoForm.erro('servicos', '');
  });
  cronogramaEl.addEventListener('keydown', (e) => {
    if (e.target.dataset.servico !== undefined && ['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
  });
  cronogramaEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remover]');
    if (!b) return;
    servicos.splice(Number(b.dataset.remover), 1);
    renderizar();
  });
  $('btn-adicionar-servico').addEventListener('click', () => {
    servicos.push({ descricao: '', percentuais: [] });
    renderizar();
    const novos = cronogramaEl.querySelectorAll('[data-descricao]');
    if (novos.length) novos[novos.length - 1].focus();
  });

  $('area_empresa').addEventListener('input', (e) => (e.target.value = formatarNumeroBr(e.target.value)));
  $('area_construida').addEventListener('input', (e) => {
    const novo = formatarNumeroBr(e.target.value);
    const limite = numeroBr($('area_empresa').value);
    // não passa da área da empresa (quando ela já está preenchida)
    e.target.value = novo && !Number.isNaN(limite) && numeroBr(novo) > limite ? $('area_construida').dataset.anterior || '' : novo;
    $('area_construida').dataset.anterior = e.target.value;
  });

  // ---------- Estado vindo do servidor ----------
  function preencher(dados) {
    $('nome_empresa').value = dados.nome_empresa || '';
    $('endereco').value = dados.endereco || '';
    $('area_empresa').value = dados.area_empresa || '';
    $('area_construida').value = dados.area_construida || '';
    $('area_construida').dataset.anterior = $('area_construida').value;
    inicioEl.value = dados.inicio_obras || '';
    terminoEl.value = dados.termino_obras || '';
    if (dados.servicos && dados.servicos.length) {
      servicos = dados.servicos.map((s) => ({ descricao: s.descricao, percentuais: s.percentuais.map(String) }));
    }
  }

  function situacao(estado) {
    const partes = [];
    if (estado.dados) partes.push('cronograma preenchido pelo formulário');
    if (estado.arquivos.length) partes.push(`${estado.arquivos.length} arquivo(s) enviado(s)`);
    const el = $('situacao');
    el.textContent = partes.length ? `✔ Situação deste inciso: ${partes.join(' e ')}.` : 'Situação deste inciso: pendente — preencha o formulário ou envie um arquivo.';
    el.className = `field__hint field__hint--${partes.length ? 'ok' : 'warn'}`;
  }

  function dicasDaDeclaracao() {
    if (sugestao.ocupacao_percentual) {
      $('dica-area-construida').textContent = `Pela sua declaração, a ocupação é de ${sugestao.ocupacao_percentual}% da área (sugestão preenchida; ajuste se precisar).`;
    }
    if (sugestao.inicio_obras && (inicioEl.value !== sugestao.inicio_obras || terminoEl.value !== sugestao.termino_obras)) {
      $('dica-periodo').textContent += ' Atenção: o período informado é diferente do que consta na declaração.';
    }
  }

  async function carregar() {
    try {
      const resp = await api('/api/cronograma/minha');
      const estado = await resp.json();
      MAX_MESES = estado.max_meses;
      sugestao = estado.sugestao || {};
      servicos = estado.servicos_sugeridos.map((d) => ({ descricao: d, percentuais: [] }));
      preencher(estado.dados || sugestao);
      atualizarPeriodo();
      dicasDaDeclaracao();
      situacao(estado);
      desenharArquivos(estado);
      if (estado.dados) mostrarPdf('Cronograma salvo. Você pode alterá-lo e salvar de novo.');
    } catch (e) {
      mostrar('error', e.message || 'Falha de conexão. Recarregue a página.');
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
    const resp = await api('/api/cronograma/minha/pdf');
    if (!resp.ok) { mostrar('error', esc(mensagemDe(await resp.json().catch(() => null), 'Não foi possível gerar o PDF.'))); return; }
    window.open(URL.createObjectURL(await resp.blob()), '_blank', 'noopener');
  }

  // ---------- Validação e envio ----------
  const form = $('form-cronograma');
  CodegoForm.limparAoEditar(form);

  function validar() {
    const E = CodegoForm.erro;
    CodegoForm.limparErros(form);
    let ok = true;
    const exige = (id, msg) => { if (!$(id).value.trim()) { E(id, msg); ok = false; } };
    exige('nome_empresa', 'Informe o nome da empresa.');
    exige('endereco', 'Informe o endereço.');
    const ae = numeroBr($('area_empresa').value);
    const ac = numeroBr($('area_construida').value);
    if (Number.isNaN(ae) || ae <= 0) { E('area_empresa', 'Informe a área da empresa (ex.: 10.000 ou 2.500,50).'); ok = false; }
    if (Number.isNaN(ac) || ac <= 0) { E('area_construida', 'Informe a área a ser construída (ex.: 2.500).'); ok = false; }
    else if (!Number.isNaN(ae) && ac > ae) { E('area_construida', 'A área a ser construída não pode ser maior que a área da empresa.'); ok = false; }
    if (!inicioEl.value) { E('inicio_obras', 'Informe a previsão de início das obras.'); ok = false; }
    else if (problemaInicio()) { E('inicio_obras', problemaInicio()); ok = false; }
    if (!terminoEl.value) { E('termino_obras', 'Informe a previsão de término das obras.'); ok = false; }
    else if (problemaPeriodo()) { E('termino_obras', problemaPeriodo()); ok = false; }
    if (meses() > 0) {
      const fora = servicos.find((s) => Math.abs(soma(s) - 100) > 0.01);
      if (!servicos.length) { E('servicos', 'Adicione ao menos um serviço ao cronograma.'); ok = false; }
      else if (servicos.some((s) => !s.descricao.trim())) { E('servicos', 'Informe a descrição de todos os serviços.'); ok = false; }
      else if (fora) { E('servicos', `Os percentuais de "${fora.descricao}" devem somar 100%.`); ok = false; }
    }
    return ok;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('feedback').hidden = true;
    if (!validar()) { CodegoForm.focarPrimeiroErro(form); mostrar('error', 'Corrija os campos destacados e tente novamente.'); return; }
    CodegoForm.ocupado($('btn-salvar'), 'Salvando…');
    try {
      const resp = await api('/api/cronograma/minha', {
        method: 'PUT',
        json: {
          nome_empresa: $('nome_empresa').value.trim(),
          endereco: $('endereco').value.trim(),
          area_empresa: $('area_empresa').value.trim(),
          area_construida: $('area_construida').value.trim(),
          inicio_obras: inicioEl.value,
          termino_obras: terminoEl.value,
          servicos: servicos.map((s) => ({ descricao: s.descricao.trim(), percentuais: s.percentuais.map((v) => Number(v) || 0) })),
        },
      });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) { mostrar('error', esc(mensagemDe(dados, 'Não foi possível salvar o cronograma.'))); return; }
      situacao(dados);
      mostrarPdf('Cronograma salvo com sucesso.');
    } catch (e) {
      mostrar('error', e instanceof TypeError ? 'Falha de conexão. Tente novamente.' : esc(e.message));
    } finally {
      CodegoForm.livre($('btn-salvar'));
    }
  });

  // ---------- Arquivo próprio (upload) ----------
  const tamanho = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);
  let limites = { max_arquivos: 5, max_mb: 10 };

  function desenharArquivos(estado) {
    limites = { max_arquivos: estado.max_arquivos, max_mb: estado.max_mb };
    $('texto-upload').textContent = `PDF, JPG, PNG ou Excel (.xls/.xlsx), até ${estado.max_mb} MB por arquivo e até ${estado.max_arquivos} arquivos. Cada arquivo fica salvo assim que é enviado.`;
    const raiz = $('upload-cronograma');
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
          if (r.ok || r.status === 204) recarregarEstado(); else mostrar('error', 'Não foi possível remover o arquivo.');
        });
        li.append(ver, tam, rem);
        ul.appendChild(li);
      });
      campo.appendChild(ul);
    }
    const cheio = estado.arquivos.length >= estado.max_arquivos;
    const zona = document.createElement('label');
    zona.className = 'doc-upload__zona';
    zona.hidden = cheio;
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
    const estado = await (await api('/api/cronograma/minha')).json();
    situacao(estado);
    desenharArquivos(estado);
  }

  async function enviarArquivos(arquivos) {
    const erros = [];
    for (const arq of arquivos) {
      if (arq.size > limites.max_mb * 1048576) { erros.push(`${arq.name}: maior que ${limites.max_mb} MB.`); continue; }
      const fd = new FormData();
      fd.append('arquivo', arq);
      try {
        const r = await api('/api/documentos/inciso12', { method: 'POST', body: fd });
        if (!r.ok) erros.push(`${arq.name}: ${mensagemDe(await r.json().catch(() => null), 'não foi possível enviar.')}`);
      } catch (e) { erros.push(`${arq.name}: falha de conexão.`); }
    }
    await recarregarEstado();
    if (erros.length) $('erro-upload').textContent = erros.join(' ');
  }

  carregar();
})();
