/**
 * Tela pública da roleta.
 *
 * Modo normal: escolhe um perfil, pede o nome e inicia o giro.
 * Na Corporate Screen, a mesma URL pública reconhece que está incorporada e
 * acompanha os giros iniciados no notebook.
 */
import {
  Estado, Roleta, Confete,
  obterConfigParaExibir, listarPerfisPublicosRemoto, buscarPerfilPublicoRemoto,
  buscarUltimoGiroRemoto, sortearGiroRemoto, gerarIdSeguro, girarRoleta,
  validarConfiguracao, adicionarHistorico, mostrarToast,
  tocarSom, pararSom, carregarSonsNosElementos, aplicarVisualNaTela,
  normalizarChavePerfil, resolverNomePerfilDisponivel, deveUsarModoTela
} from "./core.js?v=20261022-tv4";

const parametros = new URLSearchParams(location.search);
const FORCAR_MODO_LEGADO = parametros.get("legacy") === "1";
const MODO_TELA = deveUsarModoTela({
  modo: parametros.get("modo") || "",
  incorporado: window.self !== window.top,
  referenciador: document.referrer
});
const PERFIL_DA_URL = String(parametros.get("perfil") || "").trim();
const JANELA_EVENTO_TELA_MS = 2 * 60 * 1000;
const CHAVE_EVENTO_TELA = "korax_rewards_evento_tela_v1";

let trocandoPerfil = false;
let timerSincronizacao = 0;
let ultimoEventoId = "";

function chaveEventoVisto(nomePerfil) {
  return `${CHAVE_EVENTO_TELA}:${normalizarChavePerfil(nomePerfil)}`;
}

function obterEventoVisto(nomePerfil) {
  try { return localStorage.getItem(chaveEventoVisto(nomePerfil)) || ""; }
  catch (ignorado) { return ""; }
}

function marcarEventoVisto(nomePerfil, idGiro) {
  ultimoEventoId = idGiro;
  try { localStorage.setItem(chaveEventoVisto(nomePerfil), idGiro); }
  catch (ignorado) {}
}

function atualizarResumoPerfil() {
  const nome = Estado.nomePerfilAtivo || "Roleta principal";
  const quantidade = Estado.config?.premios?.length || 0;
  document.getElementById("nomePerfilSelecionado").textContent = nome;
  document.getElementById("resumoPerfilSelecionado").textContent = quantidade
    ? `${quantidade} resultados • chance de 1 em ${quantidade} para cada item`
    : "Todos os resultados têm a mesma chance.";
}

function marcarPerfilSelecionado() {
  document.querySelectorAll(".menu-perfis__botao").forEach((botao) => {
    const selecionado = botao.dataset.perfil === Estado.nomePerfilAtivo;
    botao.classList.toggle("ativo", selecionado);
    botao.setAttribute("aria-current", selecionado ? "true" : "false");
  });
  atualizarResumoPerfil();
}

async function selecionarPerfil(nome, { silencioso = false } = {}) {
  if (!nome || Estado.girando || trocandoPerfil) return false;
  if (nome === Estado.nomePerfilAtivo) {
    marcarPerfilSelecionado();
    return true;
  }
  trocandoPerfil = true;
  const botoes = Array.from(document.querySelectorAll(".menu-perfis__botao, .perfil-entrada__botao"));
  botoes.forEach((botao) => { botao.disabled = true; });
  try {
    const perfil = await buscarPerfilPublicoRemoto(nome);
    if (!perfil?.config) throw new Error("Perfil indisponível.");
    validarConfiguracao(perfil.config, { permitirCoresRepetidas: true });
    Estado.config = perfil.config;
    Estado.nomePerfilAtivo = perfil.nome;
    Estado.anguloAtual = 0;
    aplicarVisualNaTela(Estado.config);
    carregarSonsNosElementos(Estado.config);
    Roleta.desenhar(Estado.anguloAtual);
    marcarPerfilSelecionado();
    if (!silencioso) mostrarToast(`Roleta "${perfil.nome}" selecionada.`);
    return true;
  } catch (erro) {
    if (!silencioso) mostrarToast("Não foi possível carregar o perfil: " + erro.message);
    return false;
  } finally {
    trocandoPerfil = false;
    botoes.forEach((botao) => { botao.disabled = false; });
  }
}

function nomesUnicos(nomes) {
  return [...new Set([Estado.nomePerfilAtivo, ...(nomes || [])].filter(Boolean))];
}

function renderizarMenuPerfis(nomes) {
  const lista = document.getElementById("listaPerfisPublicos");
  lista.replaceChildren();
  nomesUnicos(nomes).forEach((nome) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "menu-perfis__botao";
    botao.dataset.perfil = nome;
    botao.textContent = nome;
    botao.addEventListener("click", () => selecionarPerfil(nome));
    lista.appendChild(botao);
  });
  if (!lista.children.length) {
    const vazio = document.createElement("p");
    vazio.className = "menu-perfis__vazio";
    vazio.textContent = "Nenhum perfil disponível.";
    lista.appendChild(vazio);
  }
  marcarPerfilSelecionado();
}

const ModalPerfil = {
  el: null,
  lista: null,
  erro: null,
  iniciar() {
    this.el = document.getElementById("modalPerfil");
    this.lista = document.getElementById("listaPerfisEntrada");
    this.erro = document.getElementById("erroPerfilEntrada");
  },
  renderizar(nomes) {
    this.lista.replaceChildren();
    nomesUnicos(nomes).forEach((nome) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "perfil-entrada__botao";
      const titulo = document.createElement("strong");
      titulo.textContent = nome;
      const legenda = document.createElement("span");
      legenda.textContent = "Entrar nesta roleta";
      botao.append(titulo, legenda);
      botao.addEventListener("click", async () => {
        this.erro.classList.add("oculto");
        const carregou = await selecionarPerfil(nome, { silencioso: true });
        if (carregou) this.fechar();
        else {
          this.erro.textContent = "Não foi possível abrir este perfil. Verifique a conexão e tente novamente.";
          this.erro.classList.remove("oculto");
        }
      });
      this.lista.appendChild(botao);
    });
    if (!this.lista.children.length) {
      const status = document.createElement("span");
      status.className = "lista-perfis-entrada__status";
      status.textContent = "Nenhum perfil foi criado ainda.";
      this.lista.appendChild(status);
    }
  },
  abrir(nomes) {
    this.renderizar(nomes);
    this.el.classList.remove("oculto");
  },
  fechar() { this.el.classList.add("oculto"); }
};

const ModalNome = {
  el: null, input: null, erro: null,
  iniciar() {
    this.el = document.getElementById("modalNome");
    this.input = document.getElementById("inputNomeParticipante");
    this.erro = document.getElementById("erroNome");
    document.getElementById("btnCancelarGiro").addEventListener("click", () => this.fechar());
    document.getElementById("btnConfirmarGiro").addEventListener("click", () => this.confirmar());
    this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.confirmar(); });
  },
  abrir() {
    this.input.value = "";
    this.erro.classList.add("oculto");
    this.el.classList.remove("oculto");
    setTimeout(() => this.input.focus(), 50);
  },
  fechar() { this.el.classList.add("oculto"); },
  confirmar() {
    const nome = this.input.value.trim();
    if (!nome) { this.erro.classList.remove("oculto"); return; }
    Estado.participanteAtual = nome;
    this.fechar();
    iniciarFluxoDeGiro(nome);
  }
};

const ModalResultado = {
  el: null,
  timer: 0,
  iniciar() {
    this.el = document.getElementById("modalResultado");
    document.getElementById("btnFecharResultado").addEventListener("click", () => this.fechar());
  },
  abrir(premio, nome = "") {
    clearTimeout(this.timer);
    const selo = document.getElementById("resultadoSelo");
    selo.className = "resultado-selo " + (premio.positivo ? "positivo" : "negativo");
    selo.textContent = premio.positivo ? "★" : "…";
    const participante = document.getElementById("resultadoNome");
    participante.textContent = nome;
    participante.classList.toggle("oculto", !nome);
    document.getElementById("resultadoPremio").textContent = premio.nome;
    document.getElementById("resultadoStatus").textContent = premio.descricao || "";
    this.el.classList.remove("oculto");
    if (MODO_TELA) this.timer = setTimeout(() => this.fechar(), 12000);
  },
  fechar() {
    clearTimeout(this.timer);
    this.el.classList.add("oculto");
  }
};

async function iniciarFluxoDeGiro(nomeParticipante) {
  if (Estado.girando) return;
  Estado.girando = true;
  document.getElementById("btnGirar").disabled = true;
  mostrarToast("Confirmando e registrando o giro…");
  try {
    const idGiro = gerarIdSeguro();
    let registro;
    try {
      registro = await sortearGiroRemoto(nomeParticipante, idGiro, Estado.nomePerfilAtivo);
    } catch (primeiroErro) {
      registro = await sortearGiroRemoto(nomeParticipante, idGiro, Estado.nomePerfilAtivo);
    }
    prepararRoletaParaResultado(registro);
    tocarSom("audioGiro");
    const duracaoMs = Estado.config.roleta?.duracaoGiroMs || 4800;
    girarRoleta(registro.premio, duracaoMs, () => finalizarGiroLocal(registro));
  } catch (erro) {
    Estado.girando = false;
    document.getElementById("btnGirar").disabled = false;
    mostrarToast("Giro não realizado: " + erro.message);
  }
}

function prepararRoletaParaResultado(registro) {
  const premio = registro.premio;
  if (Array.isArray(registro.premios) && registro.premios.length >= 2) {
    Estado.config.premios = registro.premios;
  } else if (!Estado.config.premios.some((item) => item.id === premio.id)) {
    Estado.config.premios = [premio, ...Estado.config.premios];
  }
  Estado.nomePerfilAtivo = registro.perfil || Estado.nomePerfilAtivo;
  Roleta.desenhar(Estado.anguloAtual);
}

function efeitosDoResultado(premio) {
  pararSom("audioGiro");
  tocarSom("audioParada");
  if (premio.positivo) {
    tocarSom("audioVitoria");
    Confete.fogosDeArtificio();
  } else {
    tocarSom("audioDerrota");
    document.getElementById("canvasRoleta").parentElement.classList.add("tremer");
    setTimeout(() => document.getElementById("canvasRoleta").parentElement.classList.remove("tremer"), 400);
  }
}

function finalizarGiroLocal(registro) {
  efeitosDoResultado(registro.premio);
  adicionarHistorico({ nome: registro.nome, data: registro.data });
  ModalResultado.abrir(registro.premio, registro.nome);
  Estado.girando = false;
  document.getElementById("btnGirar").disabled = false;
}

async function executarGiroNaTela(evento) {
  if (Estado.girando || !evento?.premio || !evento?.perfil) return;
  if (evento.perfil !== Estado.nomePerfilAtivo) {
    const carregou = await selecionarPerfil(evento.perfil, { silencioso: true });
    if (!carregou) return;
  }
  Estado.girando = true;
  prepararRoletaParaResultado({ premio: evento.premio, premios: evento.premios, perfil: evento.perfil });
  tocarSom("audioGiro");
  const duracaoMs = Estado.config.roleta?.duracaoGiroMs || 4800;
  girarRoleta(evento.premio, duracaoMs, () => {
    efeitosDoResultado(evento.premio);
    ModalResultado.abrir(evento.premio);
    Estado.girando = false;
  });
}

function atualizarStatusTela(texto, conectado) {
  const status = document.getElementById("statusTela");
  status.textContent = texto;
  status.classList.remove("oculto");
  status.classList.toggle("status-tela--conectado", conectado);
}

function iniciarSincronizacaoTela() {
  clearTimeout(timerSincronizacao);
  const perfilFixo = Boolean(PERFIL_DA_URL);
  const canal = perfilFixo ? Estado.nomePerfilAtivo : "todos-os-perfis";
  ultimoEventoId = obterEventoVisto(canal);
  const consultar = async () => {
    try {
      const evento = await buscarUltimoGiroRemoto(perfilFixo ? Estado.nomePerfilAtivo : "");
      atualizarStatusTela(`Tela conectada • ${Estado.nomePerfilAtivo}`, true);
      if (evento?.idGiro && evento.idGiro !== ultimoEventoId) {
        const criadoEm = Date.parse(evento.criadoEm || "");
        const idade = Date.now() - criadoEm;
        const eventoRecente = Number.isFinite(criadoEm) && idade >= -30000 && idade <= JANELA_EVENTO_TELA_MS;
        marcarEventoVisto(canal, evento.idGiro);
        if (eventoRecente) await executarGiroNaTela(evento);
      }
    } catch (erro) {
      atualizarStatusTela("Reconectando à roleta…", false);
    } finally {
      timerSincronizacao = setTimeout(consultar, 900);
    }
  };
  consultar();
}

function configurarTelaCheia() {
  document.getElementById("btnTelaCheia").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => mostrarToast("Não foi possível entrar em tela cheia."));
    } else {
      document.exitFullscreen();
    }
  });
}

async function iniciarAplicacao() {
  if (MODO_TELA) document.body.classList.add("modo-tela");
  ModalPerfil.iniciar();
  if (MODO_TELA) ModalPerfil.fechar();
  const promessaPerfis = listarPerfisPublicosRemoto().catch(() => null);
  const { nome, config } = await obterConfigParaExibir();
  Estado.config = config;
  Estado.nomePerfilAtivo = nome;
  aplicarVisualNaTela(Estado.config);
  carregarSonsNosElementos(Estado.config);
  atualizarResumoPerfil();

  Roleta.iniciar("canvasRoleta");
  Confete.iniciar();
  ModalNome.iniciar();
  ModalResultado.iniciar();
  configurarTelaCheia();

  const dadosPerfis = await promessaPerfis;
  const perfis = dadosPerfis?.perfis || [];
  renderizarMenuPerfis(perfis);
  document.fonts?.ready.then(() => {
    if (!Estado.girando) Roleta.desenhar(Estado.anguloAtual);
  });

  if (MODO_TELA) {
    const perfilTela = resolverNomePerfilDisponivel(
      PERFIL_DA_URL,
      perfis,
      dadosPerfis?.ativo || Estado.nomePerfilAtivo
    );
    const carregou = await selecionarPerfil(perfilTela, { silencioso: true });
    document.getElementById("btnGirar").disabled = true;
    document.getElementById("textoCentral").textContent = "AGUARDANDO";
    if (!carregou || !Estado.nomePerfilAtivo) {
      atualizarStatusTela("Perfil não encontrado. Confira a URL da tela.", false);
      return;
    }
    iniciarSincronizacaoTela();
    return;
  }

  ModalPerfil.abrir(perfis);
  document.getElementById("btnGirar").addEventListener("click", () => {
    if (Estado.girando) return;
    tocarSom("audioClique");
    ModalNome.abrir();
  });
}

// TVs corporativas antigas usam o receptor ES5 dedicado. O modulo ainda pode
// ser baixado por navegadores intermediarios, mas nao disputa o mesmo DOM.
if (!FORCAR_MODO_LEGADO) document.addEventListener("DOMContentLoaded", iniciarAplicacao);
