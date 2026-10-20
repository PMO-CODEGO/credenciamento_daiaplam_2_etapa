// Documentos do Anexo II (incisos II a X): envio, visualização e remoção.
// Cada arquivo é salvo no servidor assim que é enviado (não depende do
// botão "Salvar solicitação"). A lista de incisos vem da API.
const DianotDocumentos = (function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  const ACEITOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) {}

  let config = { tipos: [], max_arquivos_por_tipo: 5, max_mb: 20 };

  function sessaoExpirada() {
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    window.location.href = 'index.html';
  }

  function mensagemDe(dados, padrao) {
    let msg = dados && dados.detail;
    if (Array.isArray(msg)) msg = msg.map((e) => e.msg || '').join(' ');
    return msg || padrao;
  }

  const tamanhoLegivel = (bytes) =>
    bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

  // ---------- Desenho ----------
  function render() {
    const raiz = $('documentos');
    raiz.innerHTML = '';
    config.tipos.forEach((t) => raiz.appendChild(item(t)));
  }

  function item(t) {
    const campo = document.createElement('div');
    campo.className = 'field doc-upload';
    campo.dataset.tipo = t.tipo;

    const rotulo = document.createElement('p');
    rotulo.className = 'doc-upload__rotulo';
    rotulo.id = `rotulo-doc-${t.tipo}`;
    rotulo.textContent = t.rotulo;
    if (!t.obrigatorio) {
      const opc = document.createElement('span');
      opc.className = 'doc-upload__opcional';
      opc.textContent = 'Opcional';
      rotulo.append(' ', opc);
    }
    campo.appendChild(rotulo);

    if (t.arquivos.length) {
      const lista = document.createElement('ul');
      lista.className = 'doc-upload__arquivos';
      t.arquivos.forEach((a) => lista.appendChild(linhaArquivo(a)));
      campo.appendChild(lista);
    }

    const cheio = t.arquivos.length >= config.max_arquivos_por_tipo;
    const zona = document.createElement('label');
    zona.className = 'doc-upload__zona';
    zona.hidden = cheio;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = `doc-${t.tipo}`;
    input.accept = ACEITOS;
    input.multiple = true;
    input.className = 'visualmente-oculto';
    input.setAttribute('aria-labelledby', `${rotulo.id} acao-doc-${t.tipo}`);
    const acao = document.createElement('span');
    acao.className = 'doc-upload__acao';
    acao.id = `acao-doc-${t.tipo}`;
    acao.textContent = t.arquivos.length ? 'Adicionar outro arquivo' : 'Escolher arquivo';
    const dica = document.createElement('span');
    dica.className = 'doc-upload__dica';
    dica.textContent = 'ou arraste aqui';
    zona.append(input, acao, dica);
    campo.appendChild(zona);

    input.addEventListener('change', () => {
      enviarVarios(t.tipo, [...input.files]);
      input.value = '';
    });
    // Arrastar e soltar
    zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('is-arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('is-arrastando'));
    zona.addEventListener('drop', (ev) => {
      ev.preventDefault();
      zona.classList.remove('is-arrastando');
      enviarVarios(t.tipo, [...ev.dataTransfer.files]);
    });

    const progresso = document.createElement('div');
    progresso.className = 'doc-upload__progresso';
    progresso.hidden = true;
    progresso.innerHTML = '<div class="doc-upload__barra"></div><span class="doc-upload__status"></span>';
    campo.appendChild(progresso);

    if (cheio) {
      const aviso = document.createElement('p');
      aviso.className = 'field__hint';
      aviso.textContent = `Limite de ${config.max_arquivos_por_tipo} arquivos atingido. Remova um para enviar outro.`;
      campo.appendChild(aviso);
    }

    const erro = document.createElement('p');
    erro.className = 'field__error';
    erro.dataset.errorFor = `doc-${t.tipo}`;
    campo.appendChild(erro);
    return campo;
  }

  function linhaArquivo(a) {
    const li = document.createElement('li');
    li.className = 'doc-upload__arquivo';
    const ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'doc-upload__nome';
    ver.textContent = a.nome_original;
    ver.title = 'Abrir o arquivo em outra aba';
    ver.addEventListener('click', () => abrir(a));
    const tam = document.createElement('span');
    tam.className = 'doc-upload__tamanho';
    tam.textContent = tamanhoLegivel(a.tamanho);
    const rem = document.createElement('button');
    rem.type = 'button';
    rem.className = 'doc-upload__remover';
    rem.textContent = 'Remover';
    rem.setAttribute('aria-label', `Remover ${a.nome_original}`);
    rem.addEventListener('click', () => remover(a, rem));
    li.append(ver, tam, rem);
    return li;
  }

  // ---------- Ações ----------
  async function carregar() {
    const resp = await fetch(`${API}/api/documentos`, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 401) return sessaoExpirada();
    if (!resp.ok) throw new Error('Falha ao carregar os documentos.');
    config = await resp.json();
    render();
  }

  function campoDe(tipo) { return document.querySelector(`.doc-upload[data-tipo="${tipo}"]`); }

  function enviarUm(tipo, arquivo, aoProgredir) {
    return new Promise((resolve, reject) => {
      const corpo = new FormData();
      corpo.append('arquivo', arquivo);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}/api/documentos/${tipo}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.addEventListener('progress', (ev) => { if (ev.lengthComputable) aoProgredir(ev.loaded / ev.total); });
      xhr.addEventListener('load', () => {
        let dados = null;
        try { dados = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status === 401) { sessaoExpirada(); return reject(new Error('Sessão expirada.')); }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(dados);
        if (xhr.status === 413) return reject(new Error(`Arquivo maior que ${config.max_mb} MB.`));
        reject(new Error(mensagemDe(dados, 'Não foi possível enviar o arquivo.')));
      });
      xhr.addEventListener('error', () => reject(new Error('Falha de conexão. Tente novamente.')));
      xhr.send(corpo);
    });
  }

  async function enviarVarios(tipo, arquivos) {
    if (!arquivos.length) return;
    const campo = campoDe(tipo);
    CodegoForm.erro(`doc-${tipo}`, '');
    // Confere no navegador o que dá para conferir, antes de gastar o envio.
    const limite = config.max_mb * 1024 * 1024;
    const invalido = arquivos.find((a) => !/\.(pdf|jpe?g|png)$/i.test(a.name) || a.size > limite);
    if (invalido) {
      CodegoForm.erro(`doc-${tipo}`, invalido.size > limite
        ? `"${invalido.name}" tem mais de ${config.max_mb} MB.`
        : `"${invalido.name}": formato não aceito. Envie PDF, JPG ou PNG.`);
      return;
    }
    const progresso = campo.querySelector('.doc-upload__progresso');
    const barra = campo.querySelector('.doc-upload__barra');
    const status = campo.querySelector('.doc-upload__status');
    campo.querySelector('.doc-upload__zona').hidden = true;
    progresso.hidden = false;
    let erroMsg = '';
    for (const [i, arquivo] of arquivos.entries()) {
      const prefixo = arquivos.length > 1 ? `(${i + 1}/${arquivos.length}) ` : '';
      status.textContent = `${prefixo}Enviando ${arquivo.name}…`;
      barra.style.transform = 'scaleX(0)';
      try {
        await enviarUm(tipo, arquivo, (p) => { barra.style.transform = `scaleX(${p})`; });
      } catch (e) {
        erroMsg = `"${arquivo.name}": ${e.message}`;
        break;
      }
    }
    try { await carregar(); } catch (_) {}
    if (erroMsg) CodegoForm.erro(`doc-${tipo}`, erroMsg);
  }

  async function abrir(a) {
    // Abre a aba já no clique (senão o navegador bloqueia como pop-up).
    const aba = window.open('', '_blank');
    try {
      const resp = await fetch(`${API}/api/documentos/${a.id}/arquivo`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.status === 401) { if (aba) aba.close(); return sessaoExpirada(); }
      if (!resp.ok) throw new Error();
      const url = URL.createObjectURL(await resp.blob());
      if (aba) aba.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (_) {
      if (aba) aba.close();
      CodegoForm.erro(`doc-${a.tipo}`, 'Não foi possível abrir o arquivo.');
    }
  }

  async function remover(a, botao) {
    if (!window.confirm(`Remover "${a.nome_original}"?`)) return;
    botao.disabled = true;
    try {
      const resp = await fetch(`${API}/api/documentos/${a.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 401) return sessaoExpirada();
      if (!resp.ok && resp.status !== 404) throw new Error();
      await carregar();
    } catch (_) {
      botao.disabled = false;
      CodegoForm.erro(`doc-${a.tipo}`, 'Não foi possível remover. Tente novamente.');
    }
  }

  // Marca os obrigatórios sem arquivo. Devolve true se está tudo enviado.
  function conferirObrigatorios() {
    let ok = true;
    config.tipos.forEach((t) => {
      if (t.obrigatorio && !t.arquivos.length) {
        CodegoForm.erro(`doc-${t.tipo}`, 'Envie este documento.');
        ok = false;
      }
    });
    return ok;
  }

  if (token) {
    carregar().catch(() => {
      $('documentos').innerHTML = '<p class="field__error">Falha ao carregar os documentos. Recarregue a página.</p>';
    });
  }

  return { conferirObrigatorios };
})();
