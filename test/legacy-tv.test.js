import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const legacy = readFileSync(new URL("../legacy-tv.js", import.meta.url), "utf8");

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
});
