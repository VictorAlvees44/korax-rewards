import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarConfiguracao, sortearPremioAleatorio, calcularAnguloFinal, gerarCorAleatoria, corrigirCoresRepetidas, sortearIndiceUniforme } from "../core.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));

test("a configuração padrão é válida", () => {
  assert.equal(validarConfiguracao(config), true);
});

test("rejeita IDs de prêmio duplicados", () => {
  const invalida = structuredClone(config);
  invalida.premios[1].id = invalida.premios[0].id;
  assert.throws(() => validarConfiguracao(invalida), /IDs/);
});

test("rejeita mídia com protocolo executável", () => {
  const invalida = structuredClone(config);
  invalida.empresa.logoUrl = "javascript:alert(1)";
  assert.throws(() => validarConfiguracao(invalida), /mídia/);
});

test("o sorteio local de prévia sempre retorna um item cadastrado", () => {
  for (let i = 0; i < 500; i++) {
    assert.ok(config.premios.includes(sortearPremioAleatorio(config.premios)));
  }
});

test("o cálculo de ângulo produz valor finito para todos os prêmios", () => {
  for (const premio of config.premios) {
    assert.equal(Number.isFinite(calcularAnguloFinal(config.premios, premio)), true);
  }
});

test("100 perfis completos recebem 50 cores válidas sem repetição", () => {
  for (let perfil = 0; perfil < 100; perfil++) {
    const cores = [];
    for (let i = 0; i < 50; i++) {
      const cor = gerarCorAleatoria(cores);
      assert.match(cor, /^#[A-F0-9]{6}$/);
      assert.ok(!cores.includes(cor));
      cores.push(cor);
    }
    assert.equal(new Set(cores).size, 50);
  }
});

test("colisões repetidas usam uma cor reserva inédita, sem loop infinito", () => {
  const fixa = gerarCorAleatoria([], () => 0);
  let chamadas = 0;
  const nova = gerarCorAleatoria([fixa.toLowerCase()], () => { chamadas++; return 0; });
  assert.notEqual(nova, fixa);
  assert.equal(chamadas, 64 * 3 + 1);
});

test("corrige cores repetidas preservando os prêmios e as cores restantes", () => {
  const premios = structuredClone(config.premios);
  premios[1].cor = premios[0].cor.toLowerCase();
  premios[3].cor = premios[0].cor;
  const antes = structuredClone(premios);
  assert.equal(corrigirCoresRepetidas(premios), 2);
  assert.equal(new Set(premios.map((p) => p.cor)).size, premios.length);
  for (let i = 0; i < premios.length; i++) {
    assert.deepEqual({ ...premios[i], cor: antes[i].cor }, antes[i]);
    if (i !== 1 && i !== 3) assert.equal(premios[i].cor, antes[i].cor.toUpperCase());
  }
  assert.equal(corrigirCoresRepetidas(premios), 0);
});

test("rejeita cores iguais ao salvar, mas permite leitura legada para correção", () => {
  const repetida = structuredClone(config);
  repetida.premios[1].cor = repetida.premios[0].cor.toLowerCase();
  assert.throws(() => validarConfiguracao(repetida), /cores/);
  assert.equal(validarConfiguracao(repetida, { permitirCoresRepetidas: true }), true);
  corrigirCoresRepetidas(repetida.premios);
  assert.equal(validarConfiguracao(repetida), true);
});

test("rejeita a sobra de 32 bits antes de mapear seis resultados", () => {
  const valores = [0xffffffff, 0xfffffffe, 7];
  assert.equal(sortearIndiceUniforme(6, () => valores.shift()), 1);
  assert.equal(valores.length, 0);
});

test("o mapeamento não favorece índices de roletas de 2 a 50 itens", () => {
  for (let tamanho = 2; tamanho <= 50; tamanho++) {
    const contagem = Array(tamanho).fill(0);
    for (let valor = 0; valor < tamanho * 10; valor++) {
      contagem[sortearIndiceUniforme(tamanho, () => valor)]++;
    }
    assert.deepEqual(contagem, Array(tamanho).fill(10));
  }
});

test("não aceita tamanhos ou fontes aleatórias inválidos", () => {
  for (const tamanho of [0, -1, 1.5, NaN, Infinity, 0x100000001]) {
    assert.throws(() => sortearIndiceUniforme(tamanho), /Tamanho/);
  }
  for (const valor of [-1, 1.5, NaN, 0x100000000]) {
    assert.throws(() => sortearIndiceUniforme(6, () => valor), /fonte/);
  }
});

test("cor, nome, tipo e pesos legados não alteram o índice nem impedem repetição", (t) => {
  t.mock.method(globalThis.crypto, "getRandomValues", (array) => { array[0] = 1; return array; });
  const premios = structuredClone(config.premios);
  assert.equal(sortearPremioAleatorio(premios), premios[1]);
  premios[1] = { ...premios[1], nome: "Outro nome", cor: "#FF00AA", positivo: false, peso: 0 };
  assert.equal(sortearPremioAleatorio(premios), premios[1]);
  assert.equal(sortearPremioAleatorio(premios), premios[1]);
});

test("a animação aponta para o prêmio escolhido em todas as fatias", (t) => {
  for (const variacao of [0, 0.5, 1 - Number.EPSILON]) {
    const mock = t.mock.method(Math, "random", () => variacao);
    for (let tamanho = 2; tamanho <= 50; tamanho++) {
      const premios = Array.from({ length: tamanho }, (_, i) => ({ id: `p${i}` }));
      premios.forEach((premio, indice) => {
        const angulo = calcularAnguloFinal(premios, premio) + Math.PI / 2;
        assert.equal(Math.floor(angulo / (2 * Math.PI / tamanho)), indice);
      });
    }
    mock.mock.restore();
  }
});
