/**
 * roleta-app.js
 * Bootstrap da tela pública da roleta (index.html).
 * Busca o perfil ativo do backend a cada carregamento — é por isso que
 * qualquer navegador/dispositivo mostra o mesmo layout, sem depender de
 * localStorage local.
 */
import {
  Estado, Roleta, Confete,
  obterConfigParaExibir, registrarGiroRemoto, tentarReenviarPendentes,
  sortearPremioAleatorio, girarRoleta,
  adicionarHistorico, formatarDataHora, mostrarToast,
  tocarSom, pararSom, carregarSonsNosElementos, aplicarVisualNaTela
} from "./core.js";

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
  tocarSom("audioGiro");

  const premioEscolhido = sortearPremioAleatorio(Estado.config.premios);
  const duracaoMs = (Estado.config.roleta && Estado.config.roleta.duracaoGiroMs) || 4800;

  girarRoleta(premioEscolhido, duracaoMs, () => {
    finalizarGiro(premioEscolhido, nomeParticipante);
  });
}

async function finalizarGiro(premio, nomeParticipante) {
  pararSom("audioGiro");
  tocarSom("audioParada");

  const agora = new Date();
  const { data, hora } = formatarDataHora(agora);

  const registro = {
    nome: nomeParticipante,
    premio: premio.nome,
    tipo: premio.positivo ? "positivo" : "negativo",
    perfil: Estado.nomePerfilAtivo || "Padrão",
    data, hora
  };

  const resultadoEnvio = await registrarGiroRemoto(registro);
  if (!resultadoEnvio.ok) {
    mostrarToast("Giro registrado localmente. Reenviaremos à planilha automaticamente.");
  }

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

  Roleta.iniciar("canvasRoleta");
  Confete.iniciar();
  ModalNome.iniciar();
  ModalResultado.iniciar();
  configurarTelaCheia();

  document.getElementById("btnGirar").addEventListener("click", () => {
    if (Estado.girando) return;
    tocarSom("audioClique");
    ModalNome.abrir();
  });

  tentarReenviarPendentes();
  window.addEventListener("online", tentarReenviarPendentes);
}

document.addEventListener("DOMContentLoaded", iniciarAplicacao);
