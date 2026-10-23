# Korax Rewards — Roleta da Sorte

Roleta corporativa para campanhas e eventos, publicada no GitHub Pages e integrada a um backend Google Apps Script. O servidor escolhe cada resultado de forma autoritativa. O registro operacional no Google Sheets e a notificação por e-mail contêm nome da pessoa, data do giro e prêmio sorteado.

Produção: <https://victoralvees44.github.io/korax-rewards/>

## Arquitetura

```text
Navegador público ── sorteio/registro ──> Google Apps Script ──> Sheets + e-mail
        │                                      │
        └── escolha de perfil                    ├── perfis no Google Drive
                                               └── evento temporário do giro

Corporate Screen (modo tela) ── consulta evento ──┘

Painel /admin ── login privado Google Workspace ──> sessão assinada (8 horas)
```

- `index.html`: roleta pública.
- `admin/`: painel autenticado somente para prêmios e perfis.
- `core.js`: comunicação, validação, desenho e efeitos compartilhados.
- `roleta-app.js`: fluxo público.
- `google-apps-script/`: backend que deve ser copiado para a planilha.
- `privacidade.html`: aviso de privacidade que deve receber os contatos da empresa responsável.

## Garantias importantes

- O navegador não escolhe nem informa o prêmio: o Apps Script sorteia, grava e devolve o resultado.
- O menu público lista os perfis salvos. Ao trocar de perfil, o servidor carrega sua configuração e limita o sorteio oficial aos itens desse perfil; o navegador nunca escolhe o resultado.
- Cada giro possui ID aleatório e uma aba de controle técnica, oculta e sem o nome do participante, impede registros duplicados.
- Se o backend falhar, nenhum resultado não oficial é exibido. A aplicação requer internet para girar.
- A data registrada vem do servidor, no fuso `America/Sao_Paulo`.
- Dados gravados no Sheets são neutralizados contra fórmulas maliciosas.
- Alterar, salvar, listar ou excluir perfis exige uma sessão assinada pelo Apps Script depois do login privado com a única conta Workspace autorizada.
- A chave de assinatura nunca sai das propriedades do Apps Script. O navegador recebe apenas um token temporário de oito horas, mantido no `sessionStorage` da aba.
- O backend limita cada identificador de navegador a 20 giros por janela de cinco minutos. Esse limite reduz abuso acidental, mas não substitui CAPTCHA/WAF quando o link for divulgado em larga escala.
- O painel valida a senha em uma chamada curta, carrega só o perfil ativo na entrada e busca a biblioteca completa apenas ao abrir **Perfis**. Lentidão na biblioteca não faz o login parecer inválido.
- A tela remota recebe ID, perfil e prêmio por um evento temporário. O nome do participante não é transmitido para a Corporate Screen.

## Implantar o Google Apps Script

1. Crie ou abra a planilha de registros e acesse **Extensões → Apps Script**.
2. Substitua `Code.gs` pelo conteúdo de `google-apps-script/Code.gs`.
3. Ative a exibição do manifesto nas configurações do editor e substitua `appsscript.json` pelo arquivo do repositório.
4. Em **Configurações do projeto → Propriedades do script**, mantenha:

   - `EMAIL_DESTINATARIO`: um ou mais e-mails separados por vírgula.

5. No editor, selecione e execute uma vez a função `configurarAcessoAdmin`. Ela identifica a conta proprietária `@koraxbrasil.com.br`, salva `ADMIN_EMAIL` e cria internamente `ADMIN_TOKEN_SECRET`. Não compartilhe nem copie essa chave.

6. Crie ou atualize a implantação pública da API em **Implantar → Nova implantação → App da Web**:

   - Executar como: **Eu**.
   - Quem pode acessar: **Qualquer pessoa**. A roleta pública precisa chamar o sorteio; as ações administrativas continuam protegidas dentro do código.

7. Crie uma **segunda implantação** do mesmo projeto, chamada `Login Admin Korax`:

   - Executar como: **Usuário que acessa o app da Web**.
   - Quem pode acessar: **Somente eu**.

8. Autorize explicitamente o e-mail da conta, Google Drive, planilha e envio de e-mail.
9. Copie a URL pública terminada em `/exec` para `webhook.url` e a URL privada do login para `admin.authUrl` em `config.js`.
10. Após alterar o backend, crie uma **Nova versão nas duas implantações**. Salvar `Code.gs` sem implantar uma nova versão não atualiza a produção.

**Importante para esta versão:** o GitHub Pages publica sozinho as mudanças da interface, mas não atualiza o Google Apps Script. Até substituir `Code.gs` e publicar uma nova versão da implantação, a planilha e os e-mails continuarão usando o formato antigo de registro.

### Diagnóstico do backend

Abra `SUA_URL/exec?acao=saude`. A resposta esperada é:

```json
{"status":"sucesso","servico":"Roleta da Sorte Corporativa","configurado":true}
```

Em seguida abra `SUA_URL/exec?acao=configAtivo`. Antes do primeiro perfil publicado, `dados` pode ser `null`, mas não deve existir erro de permissão. Se aparecer erro do `DriveApp`, reautorize as permissões e publique uma nova versão.

## Primeiro acesso ao admin

1. Acesse `/admin/` e clique em **Entrar com Google Workspace**.
2. O Google abrirá a implantação privada. Somente a conta configurada por `configurarAcessoAdmin()` terá acesso; confirme e clique em **Continuar para o painel**.
3. Edite os prêmios, abra **Perfis** e crie `Comercial` e `Feira` (ou os nomes desejados).
4. Use **Salvar alterações deste perfil** depois de editar uma roleta existente.
5. Use **Sair** em computadores compartilhados.

Os sons são definitivos e não aparecem no painel: `roleta-girando.mp3` durante o giro, `palmas.mp3` para resultados positivos e `naruto-sad.mp3` para resultados negativos. O backend também substitui sons antigos por esses arquivos ao salvar um perfil.

## Uso pelo comercial: prêmios, cores e chances

1. Entre no admin e abra **Prêmios**. Edite o título e escolha o tipo (positivo/negativo). Categoria e mensagem não aparecem no formulário, mantendo o cadastro simples para o comercial.
2. Clique em **Adicionar prêmio** para criar um resultado com uma cor aleatória ainda não usada. Cada perfil aceita de 2 a 50 resultados.
3. Para trocar uma cor, clique em **↻**. A nova cor também exclui todas as cores atuais, inclusive a que está sendo substituída. Não há seletor manual de cores dos prêmios.
4. Clique em **Salvar alterações deste perfil**. Para criar outro conjunto de prêmios, abra **Perfis**, informe o novo nome e use **Criar novo perfil com estes prêmios**.

Ao entrar na página pública, o usuário escolhe o perfil antes de ver a roleta. Os perfis continuam disponíveis no menu lateral para troca; o prêmio é exibido na tela e também fica registrado junto ao nome e à data.

Durante o salvamento, o painel bloqueia novas edições até a resposta do servidor, mantendo a biblioteca e a roleta na mesma versão dos prêmios.

Cada item tem probabilidade `1 / quantidade de itens` em cada giro. Não há pesos, sequência predeterminada ou influência de nome, categoria, cor, tipo ou histórico. Resultados podem se repetir entre giros; somente as cores do mesmo perfil não podem se repetir. Probabilidades iguais não significam quantidades idênticas de resultados em poucas tentativas.

O sorteio oficial acontece no servidor usando o gerador pseudoaleatório de UUID do Google, com rejeição da sobra antes de calcular o índice (evita viés de módulo). A documentação de [`Utilities.getUuid`](https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()) informa equivalência com `java.util.UUID.randomUUID()`. A prévia e as cores usam `crypto.getRandomValues` no navegador. Isso não é uma certificação externa de sorteios.

Perfis antigos com cores iguais são corrigidos ao abrir no admin: os prêmios são preservados e apenas as cores repetidas são sorteadas novamente. Salve o perfil para persistir a correção. O backend atualizado recusa salvar configurações com cores duplicadas; leituras legadas continuam permitidas para não perder perfis antigos.

## Corporate Screen / Tela Corporativa

Na playlist da TV, cadastre uma página web com exatamente o mesmo link usado no notebook:

`https://victoralvees44.github.io/korax-rewards/`

Quando a Corporate Screen incorpora esse link na playlist, a página reconhece automaticamente o contexto de TV e aguarda os giros de qualquer perfil. No notebook, o mesmo endereço continua exibindo a escolha de perfil e o botão de giro. O perfil e o resultado sorteados no notebook são reproduzidos na TV sem registrar novamente o participante.

O mesmo endereço também reconhece automaticamente navegadores antigos de TVs Samsung/LG e carrega um receptor ES5 leve. Não é necessário cadastrar um link diferente nem acrescentar parâmetros na playlist.

A tela da playlist deve permanecer carregada antes do giro. O player guarda localmente o último evento exibido e aceita eventos recentes depois de um recarregamento, evitando perder o giro durante a atualização de conteúdo da TV. As URLs antigas com `?modo=tela` continuam compatíveis.

## Planilhas e idempotência

Os novos giros são gravados em abas no formato `Registros - MM-AAAA`, com três colunas: `Nome`, `Data` e `Prêmio`. As abas existentes recebem automaticamente a coluna `Prêmio`; os registros antigos permanecem intactos e podem ficar com essa coluna vazia. A aba técnica oculta `_Controle_Giros_v2` guarda ID aleatório, prêmio, perfil e instante do giro, mas **não guarda o nome**. Ela permite devolver o mesmo resultado se uma solicitação for repetida, sem criar outra linha ou enviar outro e-mail.

As abas antigas não são apagadas nem modificadas automaticamente. Elas podem conter as colunas anteriores; revise sua retenção e arquivamento separadamente.

No navegador, o histórico local antigo é convertido para `Nome` e `Data` na primeira abertura após a atualização; o armazenamento antigo, que continha campos extras, é removido depois da conversão.

## Privacidade e operação

Antes de uma campanha real:

- Edite `privacidade.html` com razão social, contato do controlador e canal para solicitações LGPD.
- Defina formalmente o prazo de retenção e uma rotina de exclusão/anonimização na planilha.
- Restrinja o compartilhamento da planilha e da pasta de perfis no Google Drive.
- Faça backup periódico da planilha e da pasta de perfis no Google Drive.
- Monitore os registros de execução e as cotas de e-mail do Apps Script.

## Desenvolvimento e verificações

Requer Node.js 20 ou superior, sem dependências externas de runtime.

```bash
npm ci
npm run check
npm test
```

O workflow `.github/workflows/quality.yml` executa validação de sintaxe, JSON, referências locais, CSP, ausência dos fluxos inseguros antigos e testes unitários em cada push ou pull request.

Para testar a interface sem Google, execute `node scripts/serve-ui-fixture.mjs`, abra `http://127.0.0.1:43119/admin/` e use o botão de Workspace simulado. Esse servidor aceita conexões somente da máquina local, usa perfis descartáveis em memória, exercita a correção de cores legadas e valida salvamento/publicação com o código real do Apps Script. O redirecionamento das chamadas acontece apenas nas respostas HTTP locais: nenhum arquivo de produção é alterado. Os giros simulados não são oficiais, não enviam e-mails e não gravam na planilha. Encerre com `Ctrl+C`.

## Limitações conhecidas

- O GitHub Pages não permite configurar todos os cabeçalhos HTTP. Uma CSP equivalente é fornecida por `<meta>`. Para cabeçalhos como HSTS e `X-Content-Type-Options`, use um domínio atrás de Cloudflare ou outro host configurável.
- O limite por identificador do navegador é uma barreira operacional, não uma identidade forte. Campanhas públicas de alto valor devem adicionar proteção de borda, CAPTCHA ou emissão de convites individuais.
- O frontend pode continuar exibindo o último layout em cache quando a consulta de perfil falhar, mas giros novos só ocorrem com confirmação do servidor.
- O player da Corporate Screen precisa conseguir abrir páginas HTTPS externas e manter acesso à internet. Alguns players bloqueiam reprodução automática de áudio; nesse caso, o som continua sendo reproduzido no notebook que iniciou o giro.
