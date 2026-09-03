# Korax Rewards — Roleta da Sorte

Roleta corporativa para campanhas e eventos, publicada no GitHub Pages e integrada a um backend Google Apps Script. O servidor escolhe e registra cada resultado de forma autoritativa, organiza os giros por perfil e mês no Google Sheets e envia notificações por e-mail.

Produção: <https://victoralvees44.github.io/korax-rewards/>

## Arquitetura

```text
Navegador público ── sorteio/registro ──> Google Apps Script ──> Sheets + e-mail
        │                                      │
        └── cache somente de layout             └── perfis no Google Drive

Painel /admin ── segredo em sessionStorage ──> validação com ADMIN_SECRET
```

- `index.html`: roleta pública.
- `admin/`: painel autenticado de perfis e aparência.
- `core.js`: comunicação, validação, desenho e efeitos compartilhados.
- `roleta-app.js`: fluxo público.
- `google-apps-script/`: backend que deve ser copiado para a planilha.
- `privacidade.html`: aviso de privacidade que deve receber os contatos da empresa responsável.

## Garantias importantes

- O navegador não escolhe nem informa o prêmio: o Apps Script sorteia, grava e devolve o resultado.
- Cada giro possui ID aleatório e uma aba de controle oculta impede registros duplicados.
- Se o backend falhar, nenhum resultado não oficial é exibido. A aplicação requer internet para girar.
- Data e hora registradas vêm do servidor, no fuso `America/Sao_Paulo`.
- Dados gravados no Sheets são neutralizados contra fórmulas maliciosas.
- Alterar, publicar, listar ou excluir perfis exige `ADMIN_SECRET`.
- O segredo administrativo permanece apenas na memória do módulo e no `sessionStorage` da aba; nunca é gravado no repositório ou enviado em URL.
- O backend limita cada identificador de navegador a 20 giros por janela de cinco minutos. Esse limite reduz abuso acidental, mas não substitui CAPTCHA/WAF quando o link for divulgado em larga escala.

## Implantar o Google Apps Script

1. Crie ou abra a planilha de registros e acesse **Extensões → Apps Script**.
2. Substitua `Code.gs` pelo conteúdo de `google-apps-script/Code.gs`.
3. Ative a exibição do manifesto nas configurações do editor e substitua `appsscript.json` pelo arquivo do repositório.
4. Em **Configurações do projeto → Propriedades do script**, crie:

   - `ADMIN_SECRET`: senha aleatória longa, exclusiva deste sistema. Recomendado: no mínimo 32 caracteres.
   - `EMAIL_DESTINATARIO`: um ou mais e-mails separados por vírgula.

5. Em **Implantar → Nova implantação → App da Web**, selecione:

   - Executar como: **Eu**.
   - Quem pode acessar: **Qualquer pessoa**. A roleta pública precisa chamar o sorteio; as ações administrativas continuam protegidas dentro do código.

6. Autorize explicitamente Google Drive, planilha e envio de e-mail.
7. Copie a URL terminada em `/exec` e atualize `webhook.url` em `config.js` e `config.json`.
8. Após qualquer alteração no backend, use **Gerenciar implantações → Editar → Nova versão**. Salvar `Code.gs` sem criar uma nova versão não atualiza a produção.

### Diagnóstico do backend

Abra `SUA_URL/exec?acao=saude`. A resposta esperada é:

```json
{"status":"sucesso","servico":"Roleta da Sorte Corporativa","configurado":true}
```

Em seguida abra `SUA_URL/exec?acao=configAtivo`. Antes do primeiro perfil publicado, `dados` pode ser `null`, mas não deve existir erro de permissão. Se aparecer erro do `DriveApp`, reautorize as permissões e publique uma nova versão.

## Primeiro acesso ao admin

1. Acesse `/admin/`.
2. Digite exatamente o valor definido em `ADMIN_SECRET`.
3. Monte o perfil, salve e clique em **Publicar este layout na roleta pública**.
4. Use **Sair** em computadores compartilhados.

Uploads individuais de imagem ou áudio são limitados a 2 MB. O perfil completo não pode ultrapassar 8 MB. SVG não é aceito, reduzindo risco de conteúdo ativo.

Os sons padrão versionados em `assets/audio/` são: `roleta-girando.mp3` durante o giro, `palmas.mp3` para resultados positivos e `naruto-sad.mp3` para resultados negativos. O áudio de giro é interrompido antes de tocar o som do resultado.

## Uso pelo comercial: prêmios, cores e chances

1. Entre no admin e abra **Prêmios**. Edite o título e escolha o tipo (positivo/negativo). Categoria e mensagem não aparecem no formulário, mantendo o cadastro simples para o comercial.
2. Clique em **Adicionar prêmio** para criar um resultado com uma cor aleatória ainda não usada. Cada perfil aceita de 2 a 50 resultados.
3. Para trocar uma cor, clique em **↻**. A nova cor também exclui todas as cores atuais, inclusive a que está sendo substituída. Não há seletor manual de cores dos prêmios.
4. **Testar giro** apenas anima a prévia, sem criar registros na planilha. A edição fica bloqueada durante a animação para não mudar os prêmios no meio do teste.
5. Clique em **Publicar este layout** para aplicar as alterações. Salvar na biblioteca, sozinho, não muda o perfil publicado.

Durante o salvamento e a publicação, o painel bloqueia novas edições até a resposta do servidor, mantendo a biblioteca e a roleta na mesma versão dos prêmios.

Cada item tem probabilidade `1 / quantidade de itens` em cada giro. Não há pesos, sequência predeterminada ou influência de nome, categoria, cor, tipo ou histórico. Resultados podem se repetir entre giros; somente as cores do mesmo perfil não podem se repetir. Probabilidades iguais não significam quantidades idênticas de resultados em poucas tentativas.

O sorteio oficial acontece no servidor usando o gerador pseudoaleatório de UUID do Google, com rejeição da sobra antes de calcular o índice (evita viés de módulo). A documentação de [`Utilities.getUuid`](https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()) informa equivalência com `java.util.UUID.randomUUID()`. A prévia e as cores usam `crypto.getRandomValues` no navegador. Isso não é uma certificação externa de sorteios.

Perfis antigos ou importados com cores iguais são corrigidos ao abrir no admin: os prêmios são preservados e apenas as cores repetidas são sorteadas novamente. Publique o perfil para persistir a correção. O backend atualizado recusa salvar/publicar configurações com cores duplicadas; leituras legadas continuam permitidas para não perder perfis antigos.

## Planilhas e idempotência

Os giros são gravados em abas no formato `Perfil - MM-AAAA`. A primeira coluna contém o `ID do Giro`. A aba oculta `_Controle_Giros` é o índice de idempotência: repetir a mesma requisição devolve o resultado original sem criar outra linha ou enviar outro e-mail.

Abas antigas são migradas automaticamente com a inclusão da coluna `ID do Giro` na primeira utilização.

## Privacidade e operação

Antes de uma campanha real:

- Edite `privacidade.html` com razão social, contato do controlador e canal para solicitações LGPD.
- Defina formalmente o prazo de retenção e uma rotina de exclusão/anonimização na planilha.
- Restrinja o compartilhamento da planilha e da pasta de perfis no Google Drive.
- Faça backup dos perfis pelo botão **Exportar JSON** e backup periódico da planilha.
- Monitore os registros de execução e as cotas de e-mail do Apps Script.

## Desenvolvimento e verificações

Requer Node.js 20 ou superior, sem dependências externas de runtime.

```bash
npm ci
npm run check
npm test
```

O workflow `.github/workflows/quality.yml` executa validação de sintaxe, JSON, referências locais, CSP, ausência dos fluxos inseguros antigos e testes unitários em cada push ou pull request.

Para testar a interface sem Google, execute `node scripts/serve-ui-fixture.mjs` e abra `http://127.0.0.1:43119/admin/` usando a credencial fictícia `local-test-only`. Esse servidor aceita conexões somente da máquina local, usa perfis descartáveis em memória, exercita a correção de cores legadas e valida salvamento/publicação com o código real do Apps Script. O redirecionamento das chamadas acontece apenas nas respostas HTTP locais: nenhum arquivo de produção é alterado. Ele não realiza giros oficiais, não envia e-mails e não grava na planilha. Encerre com `Ctrl+C`.

## Limitações conhecidas

- O GitHub Pages não permite configurar todos os cabeçalhos HTTP. Uma CSP equivalente é fornecida por `<meta>`. Para cabeçalhos como HSTS e `X-Content-Type-Options`, use um domínio atrás de Cloudflare ou outro host configurável.
- O limite por identificador do navegador é uma barreira operacional, não uma identidade forte. Campanhas públicas de alto valor devem adicionar proteção de borda, CAPTCHA ou emissão de convites individuais.
- O frontend pode continuar exibindo o último layout em cache quando a consulta de perfil falhar, mas giros novos só ocorrem com confirmação do servidor.
