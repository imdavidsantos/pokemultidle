// Quais links podem ser abertos no navegador do usuário (shell.openExternal).
// Só https: e só dos sites que o app já usa. Tudo o mais (file:, ms-msdt:, smb:, javascript:...) é bloqueado,
// porque o Windows entrega esses esquemas a programas locais. Sem dependência do Electron, para dar para testar.

const HOSTS_EXTERNOS = [
  'pokeidle.io',
  'pokeidle-gg.pages.dev',
  'twitch.tv',
  'kick.com',
];

// Aceita o host exato ou um subdomínio dele (www.twitch.tv vale; twitch.tv.outro-site.com não).
function urlExternaPermitida(url, hosts = HOSTS_EXTERNOS) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;   // https://twitch.tv@site-ruim.com
  const host = u.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

module.exports = { HOSTS_EXTERNOS, urlExternaPermitida };
