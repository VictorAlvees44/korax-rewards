import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const legacy = readFileSync(new URL("../legacy-tv.js", import.meta.url), "utf8");
const moderno = readFileSync(new URL("../roleta-app.js", import.meta.url), "utf8");
const estilos = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const estilosLegados = readFileSync(new URL("../legacy-tv.css", import.meta.url), "utf8");

function executarDeteccao({ userAgent = "Mozilla/5.0 Chrome/120", incorporado = false, referenciador = "", suportaModulos = true } = {}) {
  const listeners = [];
  const janela = {
    location: { search: "" },
    navigator: { userAgent }
  };
  janela.self = janela;
  janela.top = incorporado ? {} : janela;
  const documento = {
    referrer: referenciador,
    readyState: "loading",
    createElement: () => suportaModulos ? { noModule: true } : {},
    addEventListener: (nome) => listeners.push(nome)
  };
  vm.runInNewContext(legacy, { window: janela, document: documento });
  return { ativo: janela.KORAX_MODO_LEGADO_ATIVO === true, listeners };
}

test("o receptor legado reconhece automaticamente a TV usando o mesmo link", () => {
  assert.match(index, /https:\/\/victoralvees44\.github\.io\/korax-rewards\/legacy-tv\.js[^\"]*" defer/);
  assert.match(legacy, /POLL_INTERVAL_MS = 900/);
  assert.match(legacy, /request\("ultimoGiro"/);
  assert.match(legacy, /BACKEND_PUBLICO = "https:\/\/script\.google\.com\/macros\/s\//);
  assert.equal(executarDeteccao().ativo, false);
  assert.equal(executarDeteccao({ incorporado: true }).ativo, true);
  assert.equal(executarDeteccao({ referenciador: "https://telas.telacorporativa.com.br/player/123" }).ativo, true);
  assert.equal(executarDeteccao({ userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5)" }).ativo, true);
  assert.equal(executarDeteccao({ suportaModulos: false }).ativo, true);
});

test("o receptor legado evita sintaxe JavaScript moderna incompativel com as TVs", () => {
  assert.doesNotMatch(legacy, /\b(?:const|let|class|async|await)\s+[A-Za-z_$]/);
  assert.doesNotMatch(legacy, /=>|\?\.|`/);
});

test("o receptor legado usa SVG e audios absolutos para o proxy da TV", () => {
  assert.match(legacy, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", name\)/);
  assert.match(legacy, /roletaLegadaSvg/);
  assert.match(legacy, /byId\("roletaLegadaSvg"\) \|\| byId\("canvasRoleta"\)/);
  assert.match(legacy, /context\.moveTo\(0, 0\)/);
  assert.match(legacy, /https:\/\/victoralvees44\.github\.io\/korax-rewards\//);
  assert.match(legacy, /assets\/audio\/roleta-girando\.mp3/);
  assert.match(legacy, /assets\/audio\/palmas\.mp3/);
  assert.match(legacy, /assets\/audio\/naruto-sad\.mp3/);
  assert.match(legacy, /playAudio\(selected\.positivo === false \? "audioDerrota" : "audioVitoria"\)/);
  assert.match(legacy, /viewportHeight - 112/);
  assert.match(legacy, /viewportWidth \* 0\.94/);
  assert.match(legacy, /root\.requestFullscreen \|\| root\.webkitRequestFullscreen/);
  assert.match(legacy, /window\.setTimeout\(enterFullscreen, 350\)/);
  assert.match(legacy, /button\.innerHTML = "&#x26F6; TELA CHEIA"/);
  assert.match(legacy, /function synchronizedDelay\(event\)/);
  assert.match(legacy, /event\.idEvento \|\| event\.idGiro/);
  assert.match(legacy, /event\.servidorAgora = Number\(payload\.servidorAgora\)/);
  assert.match(legacy, /serverReceivedAt - sentAt/);
  assert.doesNotMatch(legacy, /SCREEN_RECEPTION_MARGIN_MS/);
  assert.match(legacy, /CORPORATE_SCREEN_ROULETTE_WAKE/);
  assert.match(legacy, /window\.addEventListener\("message", receiveCorporateScreenWake/);
});

test("o resultado diferencia visualmente premios positivos e negativos nas TVs", () => {
  assert.match(index, /id="resultadoKicker"/);
  assert.match(index, /id="resultadoIcone"/);
  assert.match(moderno, /resultado-positivo/);
  assert.match(moderno, /resultado-negativo/);
  assert.match(moderno, /PRÊMIO CONQUISTADO/);
  assert.match(moderno, /NÃO FOI DESSA VEZ/);
  assert.match(estilos, /\.resultado-positivo \.resultado-kicker/);
  assert.match(estilos, /\.resultado-negativo \.resultado-premio/);
  assert.match(legacy, /resultado-legado--positivo/);
  assert.match(legacy, /resultado-legado--negativo/);
  assert.match(legacy, /PR&Ecirc;MIO CONQUISTADO/);
  assert.match(estilosLegados, /\.resultado-legado--negativo \.resultado-legado__selo/);
});

test("o giro avisa o Corporate Screen e mantém o polling como contingência", () => {
  assert.match(index, /connect-src[^>]+https:\/\/telas\.telacorporativa\.com\.br/);
  assert.match(moderno, /https:\/\/telas\.telacorporativa\.com\.br\/api\/roulette\/wake/);
  assert.match(moderno, /avisarCorporateScreen\(registro\)/);
  assert.match(moderno, /addEventListener\("message", receberAvisoCorporateScreen\)/);
  assert.match(moderno, /setTimeout\(consultar, 900\)/);
});

test("a TV preserva a descrição do resultado mesmo quando a lista de fatias é compacta", () => {
  const trecho = legacy.slice(legacy.indexOf("  function runEvent(event) {"), legacy.indexOf("  function rememberEvent(id) {"));
  let resultado;
  const contexto = {
    managedRelay: false,
    state: { profile: "Comercial", config: { premios: [], roleta: {} }, angle: 0, spinning: false, spinGeneration: 0 },
    drawWheel() {}, synchronizedDelay: () => 0, synchronizedStartAt: () => Date.now(),
    window: { setTimeout: (callback) => callback(), clearTimeout() {} }, stopAudio() {}, playAudio() {}, byId: () => null,
    animateSpin: (premio, done) => { resultado = premio; done(); }, showResult() {}, notifyPlayback() {}
  };
  vm.runInNewContext(trecho + ';runEvent({perfil:"Comercial",premio:{id:"a",nome:"Chocolate",descricao:"Retirar no comercial"},premios:[{id:"a",nome:"Chocolate"},{id:"b",nome:"Café"}]});', contexto);
  assert.equal(resultado.descricao, "Retirar no comercial");
});

test("o receptor automático fica pronto antes de buscar o visual, sem girar sozinho", () => {
  const notificacoes = [];
  let configurou = false;
  let ouviu = false;
  const inicio = legacy.slice(legacy.lastIndexOf("  function start() {"), legacy.indexOf('  if (document.readyState === "loading")'));
  const avisar = legacy.slice(legacy.indexOf("  function notifyReady() {"), legacy.indexOf("  function flushPendingWake() {"));
  const estado = { config: null };
  vm.runInNewContext(avisar + inicio + ';start();', {
    managedRelay: true, state: estado, PARENT_ORIGIN: "https://telas.telacorporativa.com.br",
    window: { CONFIG_PADRAO: { premios: [{ id: "a" }, { id: "b" }] },
      addEventListener: () => { ouviu = true; }, parent: { postMessage: (...args) => notificacoes.push(args) } },
    prepareLayout() {}, prepareAudio() {}, receiveCorporateScreenWake() {}, setStatus() {},
    request: (action) => { assert.equal(action, "configAtivo"); assert.equal(notificacoes.length, 1); },
    prepareFullscreen: () => { throw new Error("Tela cheia não deve ser solicitada em segundo plano"); },
    loadInitialConfig: () => { throw new Error("Não deve consultar o backend no modo relay"); },
    applyConfig: (_, config) => { estado.config = config; configurou = true; }
  });
  assert.equal(configurou, true);
  assert.equal(ouviu, true);
  assert.equal(notificacoes[0][0].type, "CORPORATE_SCREEN_ROULETTE_READY");
  assert.equal(notificacoes[0][1], "https://telas.telacorporativa.com.br");
});

test("a TV antiga conta os 15 segundos a partir do primeiro quadro", () => {
  const trecho = legacy.slice(legacy.indexOf("  function animateSpin("), legacy.indexOf("  function showResult("));
  let now = 50000;
  let quadro;
  let terminou = false;
  let iniciou = 0;
  const estado = { angle: 0, spinGeneration: 1, config: { roleta: { duracaoGiroMs: 15000 } } };
  class Clock extends Date { constructor() { super(now); } }
  vm.runInNewContext(trecho + ';animateSpin({}, function () { done(); }, function () { started(); });', {
    state: estado, Date: Clock, byId: () => ({}), calculateFinalAngle: () => 60,
    setRotation() {}, normalizeAngle: (angle) => angle % (2 * Math.PI),
    window: { requestAnimationFrame: (callback) => { quadro = callback; } },
    done: () => { terminou = true; }, started: () => { iniciou++; }
  });
  // Simula um primeiro quadro atrasado; o timestamp do RAF não é epoch nas TVs.
  now += 3000; quadro(100);
  assert.equal(estado.angle, 0);
  assert.equal(iniciou, 1);
  now += 14999; quadro(15099);
  assert.equal(terminou, false);
  now += 1; quadro(15100);
  assert.equal(terminou, true);
  assert.equal(iniciou, 1);
});
