// Endereço em campos separados (CEP, logradouro, número, complemento, bairro, cidade e UF),
// com busca pelo CEP (ViaCEP). O sistema continua guardando UM texto por endereço, no campo
// escondido de mesmo id (endereco_correspondencia, sede_endereco), no formato:
//   "Rua X, 123, Sala 4, Bairro, Cidade/UF, CEP 00000-000"   (sem complemento, essa parte some)
// Atribuir um texto a esse campo (value = ...) preenche os campos separados; digitar nos
// campos separados atualiza o texto e avisa o formulário (evento "input") para salvar.
(function () {
  const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE',
    'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  const limpar = (s) => String(s || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const digitos = (s) => String(s || '').replace(/\D/g, '');
  const mascaraCep = (s) => { const d = digitos(s).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

  function interpretar(texto) {
    const r = { cep: '', log: '', num: '', comp: '', bairro: '', cidade: '', uf: '' };
    const v = String(texto || '').trim();
    if (!v) return r;
    const m = v.match(/^(.*), CEP (\d{5}-?\d{3})$/);
    const i = m ? m[1].lastIndexOf(', ') : -1;
    const k = i >= 0 ? m[1].slice(i + 2).lastIndexOf('/') : -1;
    if (!m || i < 0 || k < 0) { r.log = v; return r; } // endereço antigo, em texto livre
    const partes = m[1].slice(0, i).split(', ');
    if (partes.length !== 3 && partes.length !== 4) { r.log = v; return r; }
    const cidadeUf = m[1].slice(i + 2);
    r.cep = mascaraCep(m[2]);
    r.cidade = cidadeUf.slice(0, k);
    r.uf = cidadeUf.slice(k + 1);
    r.log = partes[0]; r.num = partes[1]; r.bairro = partes[partes.length - 1];
    if (partes.length === 4) r.comp = partes[2];
    return r;
  }

  function montar(r) {
    const obrigatorios = [r.log, r.num, r.bairro, r.cidade, r.uf, digitos(r.cep).length === 8 ? 'x' : ''];
    if (obrigatorios.some((x) => !x)) return ''; // incompleto: o sistema trata como "ainda falta"
    const meio = [r.log, r.num, ...(r.comp ? [r.comp] : []), r.bairro].join(', ');
    return `${meio}, ${r.cidade}/${r.uf}, CEP ${mascaraCep(r.cep)}`;
  }

  const descritor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  function iniciar(caixa) {
    const oculto = caixa.querySelector('input[type="hidden"]');
    const id = oculto.id;
    const grade = document.createElement('div');
    grade.className = 'endereco__grade';
    const campos = {};

    function campo(chave, rotulo, { classe = '', max = 60, tipo = 'input', auto = 'off', dica = '' } = {}) {
      const div = document.createElement('div');
      div.className = `endereco__campo ${classe}`;
      const lab = document.createElement('label');
      lab.htmlFor = `${id}_${chave}`;
      lab.textContent = rotulo;
      let el;
      if (tipo === 'select') {
        el = document.createElement('select');
        el.add(new Option('UF', ''));
        UFS.forEach((u) => el.add(new Option(u, u)));
      } else {
        el = document.createElement('input');
        el.type = 'text';
        el.maxLength = max;
      }
      el.id = `${id}_${chave}`;
      el.autocomplete = auto;
      div.append(lab, el);
      if (dica) { const p = document.createElement('p'); p.className = 'field__hint'; p.id = `${id}_${chave}_msg`; p.setAttribute('aria-live', 'polite'); div.appendChild(p); el.setAttribute('aria-describedby', p.id); }
      grade.appendChild(div);
      campos[chave] = el;
      return el;
    }
    campo('cep', 'CEP', { classe: 'endereco__cep', max: 9, auto: 'postal-code', dica: true });
    campo('log', 'Logradouro (rua, avenida, quadra...)', { classe: 'endereco__log', max: 150, auto: 'address-line1' });
    campo('num', 'Número', { classe: 'endereco__num', max: 10 });
    campo('comp', 'Complemento (opcional)', { classe: 'endereco__comp', max: 80, auto: 'address-line2' });
    campo('bairro', 'Bairro', { classe: 'endereco__bairro', max: 80 });
    campo('cidade', 'Cidade', { classe: 'endereco__cidade', max: 80, auto: 'address-level2' });
    campo('uf', 'UF', { classe: 'endereco__uf', tipo: 'select', auto: 'address-level1' });
    oculto.after(grade);

    const msg = document.getElementById(`${id}_cep_msg`);
    const ler = () => ({
      cep: campos.cep.value, log: limpar(campos.log.value), num: limpar(campos.num.value).toUpperCase(),
      comp: limpar(campos.comp.value), bairro: limpar(campos.bairro.value), cidade: limpar(campos.cidade.value),
      uf: campos.uf.value,
    });
    function preencher(r) {
      campos.cep.value = r.cep; campos.log.value = r.log; campos.num.value = r.num; campos.comp.value = r.comp;
      campos.bairro.value = r.bairro; campos.cidade.value = r.cidade;
      campos.uf.value = UFS.includes(r.uf) ? r.uf : '';
    }
    function atualizar() {
      descritor.set.call(oculto, montar(ler()));
      oculto.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Texto atribuído por código (carregar solicitação, sede acompanhando a correspondência).
    Object.defineProperty(oculto, 'value', {
      get() { return descritor.get.call(oculto); },
      set(v) { descritor.set.call(oculto, v); preencher(interpretar(v)); },
    });

    Object.values(campos).forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', atualizar));
    campos.num.addEventListener('input', () => { campos.num.value = campos.num.value.toUpperCase(); });

    let consulta = 0;
    async function buscarCep() {
      const cep = digitos(campos.cep.value);
      if (cep.length !== 8) return;
      const minha = ++consulta;
      msg.textContent = 'Buscando o CEP…';
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await resp.json();
        if (minha !== consulta) return;
        if (!resp.ok || d.erro) { msg.textContent = 'CEP não encontrado. Preencha os campos abaixo.'; return; }
        if (d.logradouro) campos.log.value = limpar(d.logradouro);
        if (d.bairro) campos.bairro.value = limpar(d.bairro);
        campos.cidade.value = limpar(d.localidade);
        campos.uf.value = UFS.includes(d.uf) ? d.uf : '';
        msg.textContent = 'Endereço preenchido pelo CEP. Confira e informe o número.';
        atualizar();
        campos.num.focus();
      } catch (_) {
        if (minha === consulta) msg.textContent = 'Não foi possível buscar o CEP agora. Preencha os campos abaixo.';
      }
    }
    campos.cep.addEventListener('input', () => {
      campos.cep.value = mascaraCep(campos.cep.value);
      if (digitos(campos.cep.value).length === 8) buscarCep(); else msg.textContent = '';
    });
    preencher(interpretar(oculto.value));
  }

  document.querySelectorAll('[data-endereco]').forEach(iniciar);
})();
