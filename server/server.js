const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
// A senha NÃO fica no código: ela vem da variável de ambiente MYFINANCE_SENHA.
// Para definir (ou trocar) a senha no Windows, rode no terminal:
//     setx MYFINANCE_SENHA "sua-senha"
// e depois abra um terminal NOVO (variáveis só valem para janelas novas).
const SENHA = process.env.MYFINANCE_SENHA;
if (!SENHA) {
  console.error('✗ Nenhuma senha configurada (MYFINANCE_SENHA não definida).');
  console.error('  Rode no terminal:  setx MYFINANCE_SENHA "sua-senha"');
  console.error('  Depois abra um terminal novo e rode:  npm start');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;

const MAX_TENTATIVAS = 10; // tentativas antes do bloqueio
const BLOQUEIO_MS = 5 * 60 * 1000; // bloqueio de 5 minutos
const ATRASO_ERRADA_MS = 1000; // espera após senha errada

const MAX_IMAGEM = 1_500_000; // ~1,5 MB de base64 por foto de perfil
const PADRAO_COR = '#2563eb';

// ---------------------------------------------------------------------------
// Banco de dados (SQLite embutido no Node, sem instalação extra)
// ---------------------------------------------------------------------------
const dbDir = path.join(__dirname, '..', 'db');
fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'finance.db'));

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    cor       TEXT NOT NULL DEFAULT '${PADRAO_COR}',
    imagem    TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competencia   TEXT NOT NULL,
    salary        REAL NOT NULL,
    pct_needs     REAL NOT NULL,
    pct_wants     REAL NOT NULL,
    pct_savings   REAL NOT NULL,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_perfil_mes
    ON budgets (profile_id, competencia);
`);

// ---------------------------------------------------------------------------
// Segredo do cookie de sessão (criado uma vez e guardado em disco,
// para você não ser deslogado a cada reinício do servidor)
// ---------------------------------------------------------------------------
const arquivoSegredo = path.join(dbDir, '.segredo');

function lerOuCriarSegredo() {
  try {
    const existente = fs.readFileSync(arquivoSegredo, 'utf8').trim();
    if (existente) return existente;
  } catch {
    // arquivo ainda não existe — cria abaixo
  }
  const novo = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(arquivoSegredo, novo);
  return novo;
}

const SEGREDO = lerOuCriarSegredo();

function tokenEsperado() {
  return crypto.createHmac('sha256', SEGREDO).update(SENHA).digest('hex');
}

// ---------------------------------------------------------------------------
// Utilidades de autenticação
// ---------------------------------------------------------------------------
function senhaCorreta(informada) {
  const a = crypto.createHash('sha256').update(String(informada ?? '')).digest();
  const b = crypto.createHash('sha256').update(SENHA).digest();
  return crypto.timingSafeEqual(a, b);
}

function lerCookie(headerCookie, nome) {
  if (!headerCookie) return null;
  for (const pedaco of headerCookie.split(';')) {
    const partes = pedaco.trim().split('=');
    const chave = partes.shift();
    if (chave === nome) return decodeURIComponent(partes.join('='));
  }
  return null;
}

function autenticado(req) {
  const token = lerCookie(req.headers.cookie, 'token');
  if (!token) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(tokenEsperado(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

let falhasSeguidas = 0;
let bloqueadoAte = 0;

// ---------------------------------------------------------------------------
// Validações de negócio
// ---------------------------------------------------------------------------
function formatNumber(n) {
  return String(Math.round(n * 100) / 100);
}

const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_COR = /^#[0-9a-fA-F]{6}$/;
const RE_IMAGEM = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function validarPerfil(body) {
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
  if (!nome) return { error: 'Informe um nome para o perfil.' };
  if (nome.length > 40) return { error: 'O nome do perfil pode ter no máximo 40 caracteres.' };

  const cor = body?.cor === undefined ? PADRAO_COR : body.cor;
  if (typeof cor !== 'string' || !RE_COR.test(cor)) {
    return { error: 'Cor inválida.' };
  }

  // imagem pode ser nula (sem foto) ou um data URI validado
  const imagem = body?.imagem ?? null;
  if (imagem !== null) {
    if (typeof imagem !== 'string' || !RE_IMAGEM.test(imagem)) {
      return { error: 'Imagem inválida. Envie uma foto em JPG, PNG ou WebP.' };
    }
    if (imagem.length > MAX_IMAGEM) {
      return { error: 'A imagem é muito grande. Escolha uma foto de até 5 MB.' };
    }
  }

  return { nome, cor, imagem };
}

function validarOrcamento(body) {
  const competencia = typeof body?.competencia === 'string' ? body.competencia.trim() : '';
  if (!RE_COMPETENCIA.test(competencia)) {
    return { error: 'Mês de referência inválido. Use o formato AAAA-MM.' };
  }

  const salary = Number(body?.salary);
  const pctNeeds = Number(body?.pct_needs);
  const pctWants = Number(body?.pct_wants);
  const pctSavings = Number(body?.pct_savings);

  if (!Number.isFinite(salary) || salary < 0) {
    return { error: 'Informe um salário válido (número maior ou igual a zero).' };
  }

  const pcts = [
    ['Necessidades', pctNeeds],
    ['Desejos', pctWants],
    ['Economia', pctSavings],
  ];

  for (const [nome, valor] of pcts) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      return { error: `Percentual de ${nome} inválido (use um valor entre 0 e 100).` };
    }
  }

  const total = pctNeeds + pctWants + pctSavings;
  if (Math.abs(total - 100) > 0.01) {
    return {
      error: `Os percentuais devem somar 100%. Atualmente somam ${formatNumber(total)}%.`,
    };
  }

  return { competencia, salary, pctNeeds, pctWants, pctSavings };
}

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json({ limit: '2mb' })); // margem para a foto de perfil em base64

// ------------------------------ Login (público) ------------------------------
app.get('/login', (req, res) => {
  if (autenticado(req)) return res.redirect('/');
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.post('/login', async (req, res) => {
  const agora = Date.now();

  if (agora < bloqueadoAte) {
    const minutos = Math.ceil((bloqueadoAte - agora) / 60000);
    return res.status(429).json({
      error: `Muitas tentativas erradas. Tente novamente em ${minutos} min.`,
    });
  }

  const { senha } = req.body || {};

  if (!senhaCorreta(senha)) {
    falhasSeguidas += 1;
    await esperar(ATRASO_ERRADA_MS);

    if (falhasSeguidas >= MAX_TENTATIVAS) {
      falhasSeguidas = 0;
      bloqueadoAte = Date.now() + BLOQUEIO_MS;
      return res.status(429).json({
        error: 'Bloqueado por 5 minutos após várias tentativas erradas.',
      });
    }

    return res.status(401).json({ error: 'Senha incorreta.' });
  }

  falhasSeguidas = 0;
  bloqueadoAte = 0;

  res.cookie('token', tokenEsperado(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
  });

  res.json({ ok: true });
});

app.get('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.redirect('/login');
});

// ---------------------------------------------------------------------------
// Tudo a partir daqui exige login
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (autenticado(req)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  return res.redirect('/login');
});

app.use(express.static(publicDir));

// ---------------------------------------------------------------------------
// API: perfis
// ---------------------------------------------------------------------------
app.get('/api/perfis', (req, res) => {
  const linhas = db
    .prepare(
      `SELECT p.id, p.nome, p.cor, p.imagem, p.criado_em,
              (SELECT COUNT(*) FROM budgets b WHERE b.profile_id = p.id) AS meses
       FROM profiles p
       ORDER BY p.id`
    )
    .all();
  res.json(linhas);
});

app.post('/api/perfis', (req, res) => {
  const dados = validarPerfil(req.body);
  if (dados.error) return res.status(400).json({ error: dados.error });

  const info = db
    .prepare('INSERT INTO profiles (nome, cor, imagem) VALUES (?, ?, ?)')
    .run(dados.nome, dados.cor, dados.imagem);

  const linha = db.prepare('SELECT * FROM profiles WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...linha, meses: 0 });
});

app.put('/api/perfis/:id', (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido.' });

  const existente = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ error: 'Perfil não encontrado.' });

  const dados = validarPerfil(req.body);
  if (dados.error) return res.status(400).json({ error: dados.error });

  db.prepare('UPDATE profiles SET nome = ?, cor = ?, imagem = ? WHERE id = ?').run(
    dados.nome,
    dados.cor,
    dados.imagem,
    id
  );

  const meses = db
    .prepare('SELECT COUNT(*) AS n FROM budgets WHERE profile_id = ?')
    .get(id).n;

  res.json({ ...db.prepare('SELECT * FROM profiles WHERE id = ?').get(id), meses });
});

app.delete('/api/perfis/:id', (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido.' });

  const existente = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ error: 'Perfil não encontrado.' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM budgets WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: orçamentos por perfil (um por mês)
// ---------------------------------------------------------------------------
function perfilOu404(req, res) {
  const pid = idValido(req.params.pid);
  if (!pid) {
    res.status(400).json({ error: 'ID de perfil inválido.' });
    return null;
  }
  const perfil = db.prepare('SELECT * FROM profiles WHERE id = ?').get(pid);
  if (!perfil) {
    res.status(404).json({ error: 'Perfil não encontrado.' });
    return null;
  }
  return perfil;
}

app.get('/api/perfis/:pid/budgets', (req, res) => {
  const perfil = perfilOu404(req, res);
  if (!perfil) return;

  const linhas = db
    .prepare('SELECT * FROM budgets WHERE profile_id = ? ORDER BY competencia DESC, id DESC')
    .all(perfil.id);
  res.json(linhas);
});

app.post('/api/perfis/:pid/budgets', (req, res) => {
  const perfil = perfilOu404(req, res);
  if (!perfil) return;

  const dados = validarOrcamento(req.body);
  if (dados.error) return res.status(400).json({ error: dados.error });

  const existe = db
    .prepare('SELECT id FROM budgets WHERE profile_id = ? AND competencia = ?')
    .get(perfil.id, dados.competencia);
  if (existe) {
    return res.status(409).json({
      error: 'Já existe um orçamento para este mês. Use "Editar" no histórico para alterá-lo.',
    });
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO budgets (profile_id, competencia, salary, pct_needs, pct_wants, pct_savings)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        perfil.id,
        dados.competencia,
        dados.salary,
        dados.pctNeeds,
        dados.pctWants,
        dados.pctSavings
      );

    const linha = db.prepare('SELECT * FROM budgets WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(linha);
  } catch (erro) {
    if (String(erro.message).includes('UNIQUE')) {
      return res.status(409).json({
        error: 'Já existe um orçamento para este mês. Use "Editar" no histórico para alterá-lo.',
      });
    }
    throw erro;
  }
});

app.put('/api/perfis/:pid/budgets/:id', (req, res) => {
  const perfil = perfilOu404(req, res);
  if (!perfil) return;

  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido.' });

  const existente = db
    .prepare('SELECT * FROM budgets WHERE id = ? AND profile_id = ?')
    .get(id, perfil.id);
  if (!existente) return res.status(404).json({ error: 'Registro não encontrado.' });

  const dados = validarOrcamento(req.body);
  if (dados.error) return res.status(400).json({ error: dados.error });

  // se mudou a competência, garante que o destino não esteja ocupado
  const conflito = db
    .prepare('SELECT id FROM budgets WHERE profile_id = ? AND competencia = ? AND id <> ?')
    .get(perfil.id, dados.competencia, id);
  if (conflito) {
    return res.status(409).json({
      error: 'Já existe um orçamento para este mês.',
    });
  }

  db.prepare(
    `UPDATE budgets
     SET competencia = ?, salary = ?, pct_needs = ?, pct_wants = ?, pct_savings = ?,
         atualizado_em = datetime('now', 'localtime')
     WHERE id = ? AND profile_id = ?`
  ).run(
    dados.competencia,
    dados.salary,
    dados.pctNeeds,
    dados.pctWants,
    dados.pctSavings,
    id,
    perfil.id
  );

  res.json(db.prepare('SELECT * FROM budgets WHERE id = ?').get(id));
});

app.delete('/api/perfis/:pid/budgets/:id', (req, res) => {
  const perfil = perfilOu404(req, res);
  if (!perfil) return;

  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido.' });

  const info = db
    .prepare('DELETE FROM budgets WHERE id = ? AND profile_id = ?')
    .run(id, perfil.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Registro não encontrado.' });
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Sobe o servidor
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`myFinance rodando em http://localhost:${PORT}`);
  console.log(`Senha de acesso: ${'*'.repeat(SENHA.length)}`);
});
