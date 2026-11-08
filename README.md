# myFinance 💰

Calculadora pessoal de finanças: digite seu salário, defina seus próprios
percentuais e veja quanto você pode **gastar** e quanto **economiza** —
organizado por **perfis** e **por mês**.

## Como executar

Na primeira vez, defina **sua** senha (uma única vez; fica salva no seu
usuário do Windows e não aparece em nenhum arquivo do projeto):

```powershell
setx MYFINANCE_SENHA "sua-senha"
```

Depois feche e abra um terminal **novo** (variáveis só valem em janelas
novas) e rode:

```bash
npm install   # só na primeira vez
npm start
```

Abra **http://localhost:3000** no navegador — ele vai pedir a senha.

## Compartilhar com outra pessoa

O endereço `localhost` só funciona no seu computador. Para alguém de fora
acessar, suba um **link temporário** pela internet:

```bash
# terminal 1
npm start

# terminal 2
npm run tunel
```

O segundo comando mostra algo como:

```
Your quick Tunnel has been created! Visit it at:
https://nome-temporario.trycloudflare.com
```

Mande esse link + a senha por WhatsApp. Enquanto os dois terminais estiverem
abertos, funciona — de qualquer lugar do mundo. Ao fechar, o link morre e, na
próxima vez, sai um link novo (seu histórico nunca fica preso a um endereço fixo).

> Requer o `cloudflared` instalado:
> `winget install --id Cloudflare.cloudflared -e`

## Trocar a senha

A senha **não fica no código nem em nenhum arquivo versionado** — ela é a
variável de ambiente `MYFINANCE_SENHA` do sistema.

**Windows (PowerShell):**

```powershell
setx MYFINANCE_SENHA "sua-nova-senha"
# feche e abra o terminal de novo e inicie o servidor
npm start
```

**Linux/Mac (ou só para a sessão atual):**

```bash
MYFINANCE_SENHA=sua-nova-senha npm start
```

Se a variável não existir, o servidor **nem inicia** e mostra na tela como
definir.

Proteções incluídas: cookie HTTP-only assinado (HMAC), comparação em tempo
constante, 1 segundo de atraso em senha errada e bloqueio de 5 minutos após
10 tentativas.

## O que a página faz

- **Perfis** — tela inicial com cards (estilo Netflix): crie quantos quiser
  (João, Maria, Pessoal...), cada um com **foto própria** (JPG/PNG/WebP, reduzida
  no navegador), **cor** e nome. Clique num card para entrar; o chip no topo
  mostra quem está usando e o botão **"Trocar perfil"** volta à seleção.
- **Orçamento por mês** — escolha o *Mês de referência* e salve um orçamento
  por mês (o mês atual vem preenchido por padrão).
- **Distribuição livre** — percentuais de *Necessidades*, *Desejos* e *Economia*
  com 50/30/20 como padrão; pode mudar para qualquer combinação que soma 100%.
- **Resultado instantâneo** — quanto dá para gastar e quanto você economiza,
  com barra visual da distribuição.
- **Editar e excluir** — se o mês escolhido já existe, o formulário carrega os
  dados salvos e o botão vira **"Salvar alterações"**; no histórico, cada mês tem
  botões **Editar** e **Excluir**.
- **Histórico por mês** — todos os meses do perfil, do mais recente ao mais antigo.

## Estrutura do projeto

```
myFinance/
├── package.json          # scripts (start, tunel) e dependências (express)
├── server/
│   └── server.js         # backend: login + serve o site + API REST + SQLite
├── scripts/
│   └── tunel.js          # sobe o túnel temporário (npm run tunel)
├── db/
│   ├── finance.db        # banco de dados (criado automaticamente)
│   └── .segredo          # segredo do cookie de sessão
├── public/               # o website
│   ├── index.html
│   ├── login.html        # tela de senha (acesso público)
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

## API

| Método | Rota                          | Descrição                              |
|--------|-------------------------------|----------------------------------------|
| GET    | `/login`                      | Tela de senha (pública)                |
| POST   | `/login`                      | Valida a senha, cria sessão            |
| GET    | `/logout`                     | Encerra a sessão                       |
| GET    | `/api/perfis`                 | Lista perfis (com contagem de meses)   |
| POST   | `/api/perfis`                 | Cria perfil `{nome, cor, imagem?}`     |
| PUT    | `/api/perfis/:id`             | Edita nome/cor/foto do perfil          |
| DELETE | `/api/perfis/:id`             | Exclui perfil **e todos os seus meses**|
| GET    | `/api/perfis/:pid/budgets`    | Meses do perfil (mais recente primeiro)|
| POST   | `/api/perfis/:pid/budgets`    | Cria o mês (`409` se o mês já existe)  |
| PUT    | `/api/perfis/:pid/budgets/:id`| **Edita** um mês                       |
| DELETE | `/api/perfis/:pid/budgets/:id`| Exclui um mês                          |

Regras: um orçamento por `(perfil, mês)` — índice único no banco; percentuais
devem somar 100%; a foto é um data URI validado no servidor (JPG/PNG/WebP).

## Tecnologias

- HTML, CSS e JavaScript puros (sem framework)
- Node.js + Express
- SQLite via `node:sqlite` (embutido no Node — nenhuma instalação extra)
