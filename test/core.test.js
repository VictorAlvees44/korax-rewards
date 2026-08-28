import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarConfiguracao, sortearPremioAleatorio, calcularAnguloFinal } from "../core.js";

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
