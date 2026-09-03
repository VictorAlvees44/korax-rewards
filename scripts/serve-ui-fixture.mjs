// Ambiente descartável para QA visual. Não chama Google nem grava dados reais.
// Execute: node scripts/serve-ui-fixture.mjs (segredo fictício: local-test-only).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const raiz = new URL("../", import.meta.url);
const codigo = await readFile(new URL("google-apps-script/Code.gs", raiz), "utf8");
const contexto = vm.createContext({});
vm.runInContext(codigo, contexto);
const inicial = JSON.parse(await readFile(new URL("config.json", raiz), "utf8"));
// Exercita a migração de cores de um perfil legado.
inicial.premios[1].cor = inicial.premios[0].cor.toLowerCase();
const perfis = new Map([["Teste local", inicial]]);
let ativo = { nome: "Teste local", config: structuredClone(inicial) };
const arquivos = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/admin/", ["admin/index.html", "text/html"]],
  ["/admin/index.html", ["admin/index.html", "text/html"]],
  ["/privacidade.html", ["privacidade.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/config.js", ["config.js", "text/javascript"]],
  ["/core.js", ["core.js", "text/javascript"]],
  ["/roleta-app.js", ["roleta-app.js", "text/javascript"]],
  ["/admin/admin-app.js", ["admin/admin-app.js", "text/javascript"]]
]);

const servidor = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const responder = (dados) => {
    res.setHeader("Content-Type", "application/json;charset=utf-8");
    res.end(JSON.stringify(dados));
  };
  try {
    const url = new URL(req.url, "http://127.0.0.1:43119");
    if (url.pathname === "/__test/backend") {
      if (req.method === "GET" && url.searchParams.get("acao") === "configAtivo") {
        responder({ status: "sucesso", dados: ativo });
        return;
      }
      let corpo = "";
      for await (const parte of req) {
        corpo += parte;
        if (corpo.length > 8 * 1024 * 1024) throw new Error("Perfil muito grande.");
      }
      const dados = JSON.parse(corpo);
      if (dados.adminSecret !== "local-test-only") throw new Error("Use o segredo fictício local-test-only.");
      switch (dados.acao) {
        case "autenticarAdmin": responder({ status: "sucesso" }); break;
        case "listarPerfis": responder({ status: "sucesso", perfis: Object.fromEntries(perfis) }); break;
        case "salvarPerfil":
        case "ativarPerfil": {
          const config = contexto.validarENormalizarConfig(dados.config);
          perfis.set(dados.nome, config);
          if (dados.acao === "ativarPerfil") ativo = { nome: dados.nome, config };
          responder({ status: "sucesso" });
          break;
        }
        case "excluirPerfil": perfis.delete(dados.nome); responder({ status: "sucesso" }); break;
        default: throw new Error("Ação indisponível. Giros oficiais não são executados neste teste.");
      }
      return;
    }
    const arquivo = arquivos.get(url.pathname);
    if (!arquivo) { res.writeHead(404); res.end("Não encontrado"); return; }
    let conteudo = await readFile(new URL(arquivo[0], raiz), "utf8");
    if (arquivo[0] === "core.js") {
      const original = "await fetch(url, { ...opcoes, signal: controlador.signal })";
      if (!conteudo.includes(original)) throw new Error("O adaptador de QA precisa acompanhar a implementação do cliente.");
      // Substituição somente na resposta local. O arquivo de produção fica intacto.
      conteudo = conteudo.replace(original, 'await fetch("/__test/backend" + new URL(url).search, { ...opcoes, signal: controlador.signal })');
    }
    if (arquivo[1] === "text/html") {
      conteudo = conteudo.replace("<body>", '<body><p role="note" style="background:#fff;color:#111;padding:12px;text-align:center">TESTE LOCAL — dados fictícios, sem Google ou registros reais</p>');
      conteudo = conteudo.replace("connect-src 'self' https://script.google.com https://script.googleusercontent.com", "connect-src 'self'");
    }
    res.setHeader("Content-Type", arquivo[1] + ";charset=utf-8");
    res.end(conteudo);
  } catch (erro) {
    responder({ status: "erro", mensagem: erro.message });
  }
});

servidor.listen(43119, "127.0.0.1", () => {
  console.log("QA local: http://127.0.0.1:43119/admin/ — segredo fictício: local-test-only");
  console.log("Perfis existem apenas em memória. Ctrl+C encerra e descarta o teste.");
});
