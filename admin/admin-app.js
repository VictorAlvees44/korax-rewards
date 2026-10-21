/**
 * admin-app.js
 * Bootstrap do painel administrativo (/admin).
 * Edita um "perfil" em memória (Estado.config) e permite:
 *  - Salvar esse perfil na biblioteca central (backend)
 *  - Publicá-lo como o perfil ativo que a roleta pública exibe
 *  - Carregar/excluir perfis já salvos
 */
import {
  Estado, Roleta,
  buscarConfigAtivoRemoto, listarPerfisRemoto, salvarPerfilRemoto,
  ativarPerfilRemoto, excluirPerfilRemoto,
  autenticarAdminRemoto, configurarCredencialAdmin, validarConfiguracao,
  gerarId, gerarCorAleatoria, corrigirCoresRepetidas, mostrarToast,
  obterUrlBackend
} from "../core.js?v=20261021-tela";

let Perfis = {}; // cache local em memória do que veio do backend: { nome: config }
let painelOcupado = false;
let perfisCarregados = false;
let carregandoPerfis = null;
let painelConfigurado = false;
let painelPronto = false;
const CHAVE_SESSAO_ADMIN = "roletaCorp_admin_secret_v1";

/* ========================================================================
   CONFIGURAÇÃO DE PARTIDA (SEM BACKEND / MODO OFFLINE)
   ======================================================================== */

function configPadraoNova() {
  return structuredClone(window.CONFIG_PADRAO);
}

/* ========================================================================
   PAINEL — ABAS
   ======================================================================== */

function configurarAbas() {
  document.querySelectorAll(".aba").forEach((botao) => {
    botao.addEventListener("click", () => {
      document.querySelectorAll(".aba").forEach((b) => { b.classList.remove("ativa"); b.setAttribute("aria-selected", "false"); });
      botao.classList.add("ativa");
      botao.setAttribute("aria-selected", "true");
      const alvo = botao.dataset.aba;
      document.querySelectorAll(".painel__conteudo").forEach((secao) => {
        secao.classList.toggle("oculto", secao.dataset.conteudo !== alvo);
      });
      if (alvo === "perfis") carregarBibliotecaPerfis().catch((erro) => mostrarToast("Não foi possível carregar os perfis: " + erro.message));
    });
  });
}

/* ========================================================================
   PRÊMIOS — cor sempre sorteada automaticamente, sem "peso"
   ======================================================================== */

function configurarPremios() {
  document.getElementById("btnAdicionarPremio").addEventListener("click", () => {
    if (Estado.girando) return;
    if (Estado.config.premios.length >= 50) { mostrarToast("Cada perfil aceita no máximo 50 prêmios."); return; }
    Estado.config.premios.push({
      id: gerarId(), nome: "Novo prêmio", cor: gerarCorAleatoria(Estado.config.premios.map((p) => p.cor)),
      categoria: "", descricao: "", positivo: true, som: ""
    });
    marcarEdicaoPremios();
    renderizarListaPremios();
    Roleta.desenhar(Estado.anguloAtual);
  });
}

function marcarEdicaoPremios() {
  Estado._ehPerfilPublicadoAgora = false;
  atualizarRotuloPerfilAtual();
  document.getElementById("statusEdicaoPremios").textContent = "Alterações ainda não salvas. Clique em Salvar alterações deste perfil.";
}

function atualizarResumoPremios() {
  const quantidade = Estado.config.premios.length;
  const chance = (100 / quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  document.getElementById("resumoPremios").textContent = `${quantidade} prêmios • Chance de cada um: 1 em ${quantidade} (aprox. ${chance}%) • Cores exclusivas`;
  document.getElementById("btnAdicionarPremio").disabled = painelOcupado || Estado.girando || quantidade >= 50;
}

function bloquearEdicaoPainel() {
  painelOcupado = true;
  const controles = Array.from(document.querySelectorAll("#painelAdmin input, #painelAdmin select, #painelAdmin button"));
  const estadosAnteriores = controles.map((controle) => controle.disabled);
  controles.forEach((controle) => { controle.disabled = true; });
  return () => {
    controles.forEach((controle, indice) => { controle.disabled = estadosAnteriores[indice]; });
    painelOcupado = false;
    atualizarResumoPremios();
  };
}

function renderizarListaPremios() {
  const lista = document.getElementById("listaPremios");
  lista.replaceChildren();
  Estado.config.premios.forEach((premio, indice) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-premio";

    const criarInput = (tipo, valor, campo, placeholder = "") => {
      const input = document.createElement("input");
      input.type = tipo;
      input.value = valor;
      input.dataset.campo = campo;
      input.placeholder = placeholder;
      input.setAttribute("aria-label", `${placeholder} — prêmio ${indice + 1}`);
      return input;
    };
    const cor = document.createElement("button");
    cor.type = "button";
    cor.className = "cartao-premio__cor";
    cor.textContent = "↻";
    const atualizarCor = () => {
      cor.style.backgroundColor = premio.cor;
      cor.title = `Cor ${premio.cor}. Clique para sortear outra cor exclusiva.`;
      cor.setAttribute("aria-label", `Sortear outra cor — prêmio ${indice + 1}`);
    };
    atualizarCor();
    cor.addEventListener("click", () => {
      if (Estado.girando) return;
      premio.cor = gerarCorAleatoria(Estado.config.premios.map((p) => p.cor));
      atualizarCor();
      marcarEdicaoPremios();
      Roleta.desenhar(Estado.anguloAtual);
    });
    const nome = criarInput("text", premio.nome, "nome", "Nome do prêmio");
    nome.maxLength = 80;
    const positivo = document.createElement("select");
    positivo.dataset.campo = "positivo";
    positivo.setAttribute("aria-label", `Tipo do resultado — prêmio ${indice + 1}`);
    [["true", "Positivo"], ["false", "Negativo"]].forEach(([valor, texto]) => {
      const opcao = document.createElement("option");
      opcao.value = valor;
      opcao.textContent = texto;
      opcao.selected = premio.positivo === (valor === "true");
      positivo.appendChild(opcao);
    });
    const remover = document.createElement("button");
    remover.className = "botao-remover";
    remover.title = `Remover prêmio ${indice + 1}`;
    remover.setAttribute("aria-label", remover.title);
    remover.textContent = "Remover";
    cartao.append(cor, nome, positivo, remover);

    cartao.querySelectorAll("[data-campo]").forEach((campo) => {
      campo.addEventListener("input", () => {
        const chave = campo.dataset.campo;
        let valor = campo.value;
        if (chave === "positivo") valor = valor === "true";
        premio[chave] = valor;
        marcarEdicaoPremios();
        Roleta.desenhar(Estado.anguloAtual);
      });
    });

    remover.addEventListener("click", () => {
      if (Estado.girando) return;
      if (Estado.config.premios.length <= 2) { mostrarToast("A roleta precisa de pelo menos 2 prêmios."); return; }
      Estado.config.premios = Estado.config.premios.filter((p) => p.id !== premio.id);
      marcarEdicaoPremios();
      renderizarListaPremios();
      Roleta.desenhar(Estado.anguloAtual);
    });

    lista.appendChild(cartao);
  });
  atualizarResumoPremios();
}

/* ========================================================================
   PERFIS — biblioteca central (backend) + ativação
   ======================================================================== */

function atualizarRotuloPerfilAtual() {
  const rotulo = document.getElementById("rotuloPerfilAtual");
  const selo = document.getElementById("seloPerfilAtivoTopo");
  rotulo.textContent = Estado.nomePerfilAtivo || "novo perfil (não salvo)";
  selo.classList.toggle("oculto", !Estado._ehPerfilPublicadoAgora);
}

function configurarPerfis() {
  document.getElementById("btnSalvarNovoPerfil").addEventListener("click", async () => {
    if (painelOcupado) return;
    const campoNome = document.getElementById("inputNomeNovoPerfil");
    const nome = campoNome.value.trim() || Estado.nomePerfilAtivo;
    if (!nome) { mostrarToast("Digite um nome para o perfil."); return; }
    if (!obterUrlBackend()) { mostrarToast("O endereço do backend ainda não foi configurado no site."); return; }

    try { await carregarBibliotecaPerfis(); }
    catch (erro) { mostrarToast("Não foi possível conferir os perfis existentes: " + erro.message); return; }

    if (Perfis[nome] && nome !== Estado.nomePerfilAtivo && !confirm(`Já existe um perfil chamado "${nome}". Substituir?`)) return;

    const configSalva = structuredClone(Estado.config);
    const liberar = bloquearEdicaoPainel();
    try {
      await salvarPerfilRemoto(nome, configSalva);
      Perfis[nome] = configSalva;
      Estado.nomePerfilAtivo = nome;
      Estado._ehPerfilPublicadoAgora = false;
      campoNome.value = "";
      atualizarRotuloPerfilAtual();
      renderizarListaPerfis();
      document.getElementById("statusEdicaoPremios").textContent = "Perfil criado e disponível na entrada da roleta.";
      mostrarToast(`Perfil "${nome}" salvo na biblioteca.`);
    } catch (erro) {
      mostrarToast("Não foi possível salvar: " + erro.message);
    } finally {
      liberar();
    }
  });

  document.getElementById("btnAtivarPerfil").addEventListener("click", async () => {
    if (painelOcupado) return;
    if (!obterUrlBackend()) { mostrarToast("O endereço do backend ainda não foi configurado no site."); return; }
    let nome = Estado.nomePerfilAtivo;
    if (!nome) {
      nome = (document.getElementById("inputNomeNovoPerfil").value || "").trim();
      if (!nome) { mostrarToast("Dê um nome ao perfil na aba Perfis antes de salvar."); return; }
    }
    const configPublicada = structuredClone(Estado.config);
    const liberar = bloquearEdicaoPainel();
    try {
      await salvarPerfilRemoto(nome, configPublicada); // mantém a biblioteca sincronizada
      await ativarPerfilRemoto(nome, configPublicada);
      Perfis[nome] = configPublicada;
      Estado.nomePerfilAtivo = nome;
      Estado._ehPerfilPublicadoAgora = true;
      atualizarRotuloPerfilAtual();
      renderizarListaPerfis();
      document.getElementById("statusEdicaoPremios").textContent = "Alterações salvas. Este perfil já está disponível na entrada da roleta.";
      mostrarToast(`Alterações do perfil "${nome}" salvas.`);
    } catch (erro) {
      mostrarToast("Não foi possível salvar: " + erro.message);
    } finally {
      liberar();
    }
  });

}

async function carregarPerfilNaTela(nome, ativarNoTopo) {
  Estado.config = structuredClone(Perfis[nome]);
  Estado.nomePerfilAtivo = nome;
  Estado._ehPerfilPublicadoAgora = !!ativarNoTopo;
  preencherCampos();
  atualizarRotuloPerfilAtual();
  Roleta.desenhar(Estado.anguloAtual);
}

function renderizarListaPerfis() {
  const lista = document.getElementById("listaPerfis");
  const nomes = Object.keys(Perfis);
  lista.replaceChildren();
  if (nomes.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "painel__dica";
    vazio.textContent = "Nenhum perfil salvo ainda. Monte o layout nas outras abas e salve aqui com um nome.";
    lista.appendChild(vazio);
    return;
  }
  nomes.forEach((nome) => {
    const ehAtivo = nome === Estado.nomePerfilAtivo && Estado._ehPerfilPublicadoAgora;
    const cartao = document.createElement("div");
    cartao.className = "cartao-perfil" + (ehAtivo ? " ativo" : "");
    const rotulo = document.createElement("span");
    rotulo.className = "cartao-perfil__nome";
    rotulo.textContent = nome;
    if (ehAtivo) {
      const selo = document.createElement("span");
      selo.className = "cartao-perfil__selo";
      selo.textContent = "ATIVO";
      rotulo.appendChild(selo);
    }
    const acoes = document.createElement("div");
    acoes.className = "cartao-perfil__acoes";
    const carregar = document.createElement("button");
    carregar.className = "botao-secundario";
    carregar.textContent = "Carregar para editar";
    const excluir = document.createElement("button");
    excluir.className = "botao-remover";
    excluir.textContent = "Excluir";
    acoes.append(carregar, excluir);
    cartao.append(rotulo, acoes);

    carregar.addEventListener("click", async () => {
      let dados;
      try { dados = await buscarConfigAtivoRemoto(); } catch (e) { dados = null; }
      const publicadoAgora = !!(dados && dados.nome === nome);
      carregarPerfilNaTela(nome, publicadoAgora);
      mostrarToast(`Perfil "${nome}" carregado para edição.`);
    });
    excluir.addEventListener("click", async () => {
      if (!confirm(`Excluir o perfil "${nome}"? Essa ação não pode ser desfeita.`)) return;
      try {
        await excluirPerfilRemoto(nome);
        delete Perfis[nome];
        if (Estado.nomePerfilAtivo === nome) { Estado.nomePerfilAtivo = ""; atualizarRotuloPerfilAtual(); }
        renderizarListaPerfis();
        mostrarToast(`Perfil "${nome}" excluído.`);
      } catch (erro) {
        mostrarToast("Não foi possível excluir: " + erro.message);
      }
    });
    lista.appendChild(cartao);
  });
}

async function carregarBibliotecaPerfis() {
  if (perfisCarregados) { renderizarListaPerfis(); return; }
  if (carregandoPerfis) return carregandoPerfis;
  const lista = document.getElementById("listaPerfis");
  lista.textContent = "Carregando perfis salvos…";
  carregandoPerfis = listarPerfisRemoto()
    .then((perfis) => {
      Perfis = { ...perfis, ...Perfis };
      perfisCarregados = true;
      renderizarListaPerfis();
    })
    .catch((erro) => {
      lista.textContent = "Não foi possível carregar os perfis. Abra esta aba novamente para tentar outra vez.";
      throw erro;
    })
    .finally(() => { carregandoPerfis = null; });
  return carregandoPerfis;
}

/* ========================================================================
   PREENCHIMENTO DE CAMPOS / INICIALIZAÇÃO
   ======================================================================== */

function preencherCampos() {
  const c = Estado.config;
  validarConfiguracao(c, { permitirCoresRepetidas: true });
  const coresCorrigidas = corrigirCoresRepetidas(c.premios);
  if (coresCorrigidas) {
    marcarEdicaoPremios();
    document.getElementById("statusEdicaoPremios").textContent = `${coresCorrigidas} cor(es) repetida(s) receberam novas cores aleatórias. Salve para aplicar.`;
  } else {
    document.getElementById("statusEdicaoPremios").textContent = "Edite os prêmios e salve as alterações deste perfil.";
  }
  renderizarListaPremios();
}

async function iniciarPainel(promessaAtivo) {
  if (painelPronto) return;
  if (!painelConfigurado) {
    configurarAbas();
    configurarPremios();
    configurarPerfis();
    painelConfigurado = true;
  }

  // Não abrir um perfil de fábrica para edição se a leitura remota falhar:
  // isso poderia fazer alguém salvar por engano sobre a campanha ativa.
  const leituraAtivo = await promessaAtivo;
  if (leituraAtivo.erro) throw leituraAtivo.erro;
  const ativo = leituraAtivo.ativo;

  if (ativo && ativo.config) {
    Estado.config = ativo.config;
    Estado.nomePerfilAtivo = ativo.nome;
    Estado._ehPerfilPublicadoAgora = true;
  } else {
    const primeiroNome = Object.keys(Perfis)[0];
    if (primeiroNome) {
      Estado.config = structuredClone(Perfis[primeiroNome]);
      Estado.nomePerfilAtivo = primeiroNome;
    } else {
      Estado.config = configPadraoNova();
      Estado.nomePerfilAtivo = "";
    }
    Estado._ehPerfilPublicadoAgora = false;
  }

  preencherCampos();
  atualizarRotuloPerfilAtual();
  Roleta.iniciar("canvasRoleta");
  painelPronto = true;
}

function configurarLoginAdmin() {
  const tela = document.getElementById("telaLoginAdmin");
  const formulario = document.getElementById("formLoginAdmin");
  const input = document.getElementById("inputSegredoAdmin");
  const erro = document.getElementById("erroLoginAdmin");
  const botao = document.getElementById("btnEntrarAdmin");

  const entrar = async (segredo) => {
    botao.disabled = true;
    botao.textContent = "Verificando acesso…";
    erro.classList.add("oculto");
    // O perfil ativo já é público; podemos buscá-lo enquanto o servidor
    // valida a credencial, sem antecipar qualquer operação administrativa.
    const promessaAtivo = buscarConfigAtivoRemoto().then(
      (ativo) => ({ ativo }),
      (falha) => ({ erro: falha })
    );
    try {
      await autenticarAdminRemoto(segredo);
    } catch (falha) {
      configurarCredencialAdmin("");
      sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
      erro.textContent = /demorou demais/.test(falha.message)
        ? "O Apps Script levou mais de 30 segundos para validar o acesso. Verifique a conexão e tente novamente."
        : falha.message;
      erro.classList.remove("oculto");
      tela.classList.remove("oculto");
      const painel = document.getElementById("painelAdmin");
      painel.setAttribute("inert", "");
      painel.setAttribute("aria-hidden", "true");
      input.focus();
      botao.textContent = "Entrar";
      botao.disabled = false;
      return;
    }

    sessionStorage.setItem(CHAVE_SESSAO_ADMIN, segredo);
    botao.textContent = "Carregando roleta…";
    try {
      await iniciarPainel(promessaAtivo);
      tela.classList.add("oculto");
      const painel = document.getElementById("painelAdmin");
      painel.removeAttribute("inert");
      painel.setAttribute("aria-hidden", "false");
      input.value = "";
    } catch (falha) {
      erro.textContent = "Acesso autorizado, mas a roleta ativa não carregou: " + falha.message + " Tente entrar novamente.";
      erro.classList.remove("oculto");
      // O segredo validado continua na sessão; isto não é falha de login.
    } finally {
      botao.textContent = "Entrar";
      botao.disabled = false;
    }
  };

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    entrar(input.value);
  });

  document.getElementById("btnSairAdmin").addEventListener("click", () => {
    configurarCredencialAdmin("");
    sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
    location.reload();
  });

  const salvo = sessionStorage.getItem(CHAVE_SESSAO_ADMIN);
  if (salvo) {
    input.value = salvo;
    entrar(salvo);
  } else {
    tela.classList.remove("oculto");
    input.focus();
  }
}

document.addEventListener("DOMContentLoaded", configurarLoginAdmin);
