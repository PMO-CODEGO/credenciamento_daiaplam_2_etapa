// Cabeçalho das páginas com login: botão "Perfil" (empresa logada) que abre um menu com
// os dados do cadastro e o botão "Sair".
// "Sair" leva à tela de login com ?saiu=1, que apaga a sessão (js/auth.js). Assim, se a
// página avisar de alterações não salvas e a pessoa ficar, ela continua logada.
(function () {
  const cabecalho = document.querySelector('.letterhead');
  // Dentro do painel do formulário (js/config.js) o cabeçalho nem aparece.
  if (!cabecalho || document.documentElement.classList.contains('embutida')) return;

  const caixa = document.createElement('div');
  caixa.className = 'letterhead__sessao perfil';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'perfil__botao';
  botao.setAttribute('aria-haspopup', 'true');
  botao.setAttribute('aria-expanded', 'false');
  botao.setAttribute('aria-controls', 'perfil-menu');
  const nome = document.createElement('span');
  nome.className = 'perfil__nome';
  nome.textContent = 'Perfil';
  const seta = document.createElement('span');
  seta.className = 'perfil__seta';
  seta.setAttribute('aria-hidden', 'true');
  seta.textContent = '▾';
  botao.append(nome, seta);

  const menu = document.createElement('div');
  menu.className = 'perfil__menu';
  menu.id = 'perfil-menu';
  menu.hidden = true;
  const dados = document.createElement('dl');
  dados.className = 'perfil__dados';
  const sair = document.createElement('a');
  sair.className = 'perfil__sair';
  sair.href = 'index.html?saiu=1';
  sair.textContent = 'Sair';
  menu.append(dados, sair);

  caixa.append(botao, menu);
  cabecalho.appendChild(caixa);

  function abrir(sim) {
    menu.hidden = !sim;
    botao.setAttribute('aria-expanded', String(sim));
  }
  botao.addEventListener('click', () => abrir(menu.hidden));
  document.addEventListener('click', (e) => { if (!caixa.contains(e.target)) abrir(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { abrir(false); botao.focus(); }
  });

  const cnpj = (d) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  function linha(rotulo, valor) {
    if (!valor) return;
    const dt = document.createElement('dt');
    dt.textContent = rotulo;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    dados.append(dt, dd);
  }

  let token = null;
  try { token = sessionStorage.getItem('daiaplam_token'); } catch (_) {}
  if (!token) return;
  fetch(`${window.CODEGO_API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((u) => {
      if (!u) return;
      nome.textContent = u.nome_empresarial;
      botao.title = `Perfil: ${u.nome_empresarial}`;
      linha('Empresa', u.nome_empresarial);
      linha('CNPJ (login)', cnpj(u.cnpj));
      linha('Representante legal', [u.representante_nome, u.representante_cargo].filter(Boolean).join(' — '));
      linha('E-mail', u.email);
    })
    .catch(() => {});
})();
