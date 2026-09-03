/**
 * roleta-app.js
 * Bootstrap da tela pública da roleta (index.html).
 * Busca o perfil ativo do backend a cada carregamento — é por isso que
 * qualquer navegador/dispositivo mostra o mesmo layout, sem depender de
 * localStorage local.
 */
import {
  Estado, Roleta, Confete,
  obterConfigParaExibir, listarPerfisPublicosRemoto, buscarPerfilPublicoRemoto,
  sortearGiroRemoto, gerarIdSeguro, girarRoleta, validarConfiguracao,
  adicionarHistorico, mostrarToast,
  tocarSom, pararSom, carregarSonsNosElementos, aplicarVisualNaTela
} from "./core.js?v=20260903-layout";

let trocandoPerfil = false;

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

async function selecionarPerfil(nome) {
  if (Estado.girando || trocandoPerfil || nome === Estado.nomePerfilAtivo) return;
  trocandoPerfil = true;
  const botoes = Array.from(document.querySelectorAll(".menu-perfis__botao"));
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
    mostrarToast(`Roleta "${perfil.nome}" selecionada.`);
  } catch (erro) {
    mostrarToast("Não foi possível carregar o perfil: " + erro.message);
  } finally {
    trocandoPerfil = false;
    botoes.forEach((botao) => { botao.disabled = false; });
  }
}

function renderizarMenuPerfis(nomes) {
  const lista = document.getElementById("listaPerfisPublicos");
  lista.replaceChildren();
  const unicos = [...new Set([Estado.nomePerfilAtivo, ...nomes].filter(Boolean))];
  unicos.forEach((nome) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "menu-perfis__botao";
    botao.dataset.perfil = nome;
    botao.textContent = nome;
    botao.addEventListener("click", () => selecionarPerfil(nome));
    lista.appendChild(botao);
  });
  if (!unicos.length) {
    const vazio = document.createElement("p");
    vazio.className = "menu-perfis__vazio";
    vazio.textContent = "Nenhum perfil disponível.";
    lista.appendChild(vazio);
  }
  marcarPerfilSelecionado();
}

async function carregarMenuPerfis() {
  try {
    const dados = await listarPerfisPublicosRemoto();
    renderizarMenuPerfis(dados.perfis);
  } catch (erro) {
    // Compatibilidade temporária com uma implantação antiga do Apps Script:
    // mantém o perfil ativo visível até o backend novo ser publicado.
    renderizarMenuPerfis([]);
  }
}

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
  iniciar() {
    this.el = document.getElementById("modalResultado");
    document.getElementById("btnFecharResultado").addEventListener("click", () => this.fechar());
  },
  abrir(premio, nome) {
    const selo = document.getElementById("resultadoSelo");
    selo.className = "resultado-selo " + (premio.positivo ? "positivo" : "negativo");
    selo.textContent = premio.positivo ? "★" : "…";
    document.getElementById("resultadoNome").textContent = nome;
    document.getElementById("resultadoPremio").textContent = premio.nome;
    document.getElementById("resultadoStatus").textContent = premio.descricao || "";
    this.el.classList.remove("oculto");
  },
  fechar() { this.el.classList.add("oculto"); }
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
      // A mesma chave torna a repetição segura caso o servidor tenha gravado,
      // mas a primeira resposta tenha se perdido.
      registro = await sortearGiroRemoto(nomeParticipante, idGiro, Estado.nomePerfilAtivo);
    }

    const premioEscolhido = registro.premio;
    if (Array.isArray(registro.premios) && registro.premios.length >= 2) {
      Estado.config.premios = registro.premios;
    } else if (!Estado.config.premios.some((p) => p.id === premioEscolhido.id)) {
      Estado.config.premios = [premioEscolhido, ...Estado.config.premios];
    }
    Estado.nomePerfilAtivo = registro.perfil;
    Roleta.desenhar(Estado.anguloAtual);
    tocarSom("audioGiro");
    const duracaoMs = (Estado.config.roleta && Estado.config.roleta.duracaoGiroMs) || 4800;
    girarRoleta(premioEscolhido, duracaoMs, () => finalizarGiro(registro));
  } catch (erro) {
    Estado.girando = false;
    document.getElementById("btnGirar").disabled = false;
    mostrarToast("Giro não realizado: " + erro.message);
  }
}

function finalizarGiro(registroRemoto) {
  const premio = registroRemoto.premio;
  const nomeParticipante = registroRemoto.nome;
  pararSom("audioGiro");
  tocarSom("audioParada");

  const registro = {
    idGiro: registroRemoto.idGiro,
    nome: nomeParticipante,
    premio: premio.nome,
    tipo: premio.positivo ? "positivo" : "negativo",
    perfil: registroRemoto.perfil,
    data: registroRemoto.data,
    hora: registroRemoto.hora
  };

  adicionarHistorico(registro);

  if (premio.positivo) {
    tocarSom("audioVitoria");
    Confete.fogosDeArtificio();
  } else {
    tocarSom("audioDerrota");
    document.getElementById("canvasRoleta").parentElement.classList.add("tremer");
    setTimeout(() => document.getElementById("canvasRoleta").parentElement.classList.remove("tremer"), 400);
  }

  ModalResultado.abrir(premio, nomeParticipante);

  Estado.girando = false;
  document.getElementById("btnGirar").disabled = false;
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
  carregarMenuPerfis();

  document.getElementById("btnGirar").addEventListener("click", () => {
    if (Estado.girando) return;
    tocarSom("audioClique");
    ModalNome.abrir();
  });

}

document.addEventListener("DOMContentLoaded", iniciarAplicacao);
