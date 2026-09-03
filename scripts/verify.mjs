import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const arquivosJs = ["config.js", "core.js", "roleta-app.js", "admin/admin-app.js", "scripts/serve-ui-fixture.mjs"];

for (const arquivo of arquivosJs) {
  const resultado = spawnSync(process.execPath, ["--check", resolve(raiz, arquivo)], { encoding: "utf8" });
  if (resultado.status !== 0) throw new Error(`Sintaxe inválida em ${arquivo}:\n${resultado.stderr}`);
}

const gas = readFileSync(resolve(raiz, "google-apps-script/Code.gs"), "utf8");
new Function(gas);

for (const arquivo of ["config.json", "google-apps-script/appsscript.json", "package.json"]) {
  JSON.parse(readFileSync(resolve(raiz, arquivo), "utf8"));
}

for (const html of ["index.html", "admin/index.html", "privacidade.html"]) {
  const caminho = resolve(raiz, html);
  const conteudo = readFileSync(caminho, "utf8");
  if (!conteudo.includes("Content-Security-Policy")) throw new Error(`${html} não possui CSP.`);
  const referencias = [...conteudo.matchAll(/(?:src|href)="([^"#]+)"/g)].map((item) => item[1]);
  for (const referencia of referencias) {
    if (/^(https?:|data:|mailto:)/.test(referencia)) continue;
    const local = resolve(dirname(caminho), referencia.split("?")[0]);
    if (!existsSync(local)) throw new Error(`Referência inexistente em ${html}: ${referencia}`);
  }
}

const paginaPublica = readFileSync(resolve(raiz, "index.html"), "utf8");
const botoesGirar = [...paginaPublica.matchAll(/id="btnGirar"/g)];
if (botoesGirar.length !== 1 || !/<button[^>]+id="btnGirar"[^>]*>[\s\S]*?GIRAR[\s\S]*?<\/button>/.test(paginaPublica)) {
  throw new Error("A página pública deve possuir um único botão central de giro.");
}

const codigoCliente = arquivosJs.map((arquivo) => readFileSync(resolve(raiz, arquivo), "utf8")).join("\n");
if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(/.test(codigoCliente)) {
  throw new Error("Foi encontrado um sink de HTML dinâmico inseguro.");
}
if (/registrarGiro|FILA_PENDENTE|tentarReenviarPendentes/.test(codigoCliente)) {
  throw new Error("Foi encontrado código do fluxo legado não idempotente.");
}

console.log("Verificação estática concluída com sucesso.");
