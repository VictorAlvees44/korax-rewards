import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const codigo = readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const uuid = (valor) => `${valor.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

function backend(gerarUuid = () => uuid(0)) {
  const contexto = vm.createContext({ Utilities: { getUuid: gerarUuid } });
  vm.runInContext(codigo, contexto);
  return contexto;
}

test("o servidor rejeita a sobra de 32 bits e mantém chances iguais", () => {
  const valores = [0xffffffff, 0xfffffffe, 7];
  const ctx = backend(() => uuid(valores.shift()));
  assert.equal(ctx.indiceAleatorioSeguro(6), 1);
  assert.equal(valores.length, 0);
});

test("todos os índices podem ser selecionados no servidor, de 2 a 50 prêmios", () => {
  let valor = 0;
  const ctx = backend(() => uuid(valor));
  for (let tamanho = 2; tamanho <= 50; tamanho++) {
    for (valor = 0; valor < tamanho; valor++) assert.equal(ctx.indiceAleatorioSeguro(tamanho), valor);
  }
});

test("o servidor rejeita tamanho inválido ou falha na fonte aleatória", () => {
  const ctx = backend(() => "uuid inválido");
  for (const tamanho of [0, -1, 1.5, 51, NaN]) {
    assert.throws(() => ctx.indiceAleatorioSeguro(tamanho), /Quantidade/);
  }
  assert.throws(() => ctx.indiceAleatorioSeguro(6), /fonte aleatória/);
});

test("o servidor recusa publicar cores iguais, sem ocultar perfis legados", () => {
  const ctx = backend();
  const repetida = structuredClone(config);
  repetida.premios[1].cor = repetida.premios[0].cor.toLowerCase();
  assert.throws(() => ctx.validarENormalizarConfig(repetida), /cores/);
  assert.equal(ctx.validarENormalizarConfig(repetida, true).premios.length, config.premios.length);
});

test("a configuração do servidor descarta pesos legados", () => {
  const ctx = backend();
  const entrada = structuredClone(config);
  entrada.premios[0].peso = 999;
  const normalizada = ctx.validarENormalizarConfig(entrada);
  assert.equal("peso" in normalizada.premios[0], false);
});

test("o prêmio e o perfil enviados pelo visitante não controlam o sorteio oficial", () => {
  const ctx = backend();
  const linhas = [];
  let sorteios = 0;
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  ctx.buscarGiroNoControle = () => null;
  ctx.aplicarLimiteDeGiros = () => {};
  ctx.obterConfigAtivo = () => ({ nome: "Comercial", config });
  ctx.indiceAleatorioSeguro = (quantidade) => { assert.equal(quantidade, config.premios.length); sorteios++; return 2; };
  ctx.Session = { getScriptTimeZone: () => "America/Sao_Paulo" };
  ctx.Utilities.formatDate = (_, __, formato) => formato === "dd/MM/yyyy" ? "03/09/2026" : "12:00:00";
  ctx.obterAbaDoLayoutNoMes = () => ({ appendRow: (linha) => linhas.push(linha), getLastRow: () => 2, getName: () => "Comercial - 09-2026" });
  ctx.garantirCabecalhoAtual = () => {};
  ctx.obterAbaControle = () => ({ appendRow() {} });
  ctx.enviarEmailNotificacao = () => {};
  ctx.atualizarStatusEmail = () => {};

  const resultado = ctx.sortearERegistrarGiro({
    idGiro: "1234567890abcdef", clienteId: "cliente-local", nome: "Teste local",
    premio: "Prêmio inventado", perfil: "Perfil inventado", tipo: "negativo"
  });
  assert.equal(resultado.dados.premio.id, config.premios[2].id);
  assert.equal(resultado.dados.perfil, "Comercial");
  assert.equal(linhas.length, 1);
  assert.equal(sorteios, 1);

  ctx.buscarGiroNoControle = () => resultado.dados;
  ctx.respostaGiroExistente = () => resultado;
  const repetido = ctx.sortearERegistrarGiro({ idGiro: "1234567890abcdef", clienteId: "cliente-local", nome: "Teste local" });
  assert.equal(repetido, resultado);
  assert.equal(linhas.length, 1);
  assert.equal(sorteios, 1);
});
