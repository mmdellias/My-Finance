// Sobe um túnel temporário do Cloudflare apontando para o servidor local.
// Uso: npm run tunel   (com o servidor já rodando em outro terminal: npm start)
const { spawn, spawnSync } = require('node:child_process');

const URL_LOCAL = 'http://localhost:3000';

// Onde o cloudflared pode estar, nesta ordem de prioridade:
const candidatos = [
  'cloudflared', // está no PATH (terminal aberto depois da instalação)
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', // instalação MSI padrão
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
];

function encontrarCloudflared() {
  for (const comando of candidatos) {
    try {
      const teste = spawnSync(comando, ['--version'], { encoding: 'utf8' });
      if (teste.status === 0) return comando;
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

function servidorRodando() {
  return fetch(URL_LOCAL, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok || r.status === 401 || r.status === 302)
    .catch(() => false);
}

(async () => {
  const comando = encontrarCloudflared();

  if (!comando) {
    console.error('✗ Não encontrei o cloudflared.');
    console.error('  Instale com: winget install --id Cloudflare.cloudflared -e');
    process.exit(1);
  }

  if (!(await servidorRodando())) {
    console.warn('⚠ O servidor não está respondendo em ' + URL_LOCAL);
    console.warn('  Abra outro terminal e rode: npm start');
    console.warn('  Mesmo assim vou seguir... se não carregar, é só subir o servidor.\n');
  }

  console.log('Sobando túnel temporário do Cloudflare...\n');

  const filho = spawn(comando, ['tunnel', '--url', URL_LOCAL], {
    stdio: 'inherit',
  });

  const encerrar = () => {
    filho.kill();
    process.exit(0);
  };

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  filho.on('exit', (codigo) => process.exit(codigo ?? 0));
})();
