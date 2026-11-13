// Serveur des parties en ligne d'Élite 27. Lancement : node serveur/elite27-serveur.mjs
// Il n'écoute que sur la machine elle-même (127.0.0.1) : c'est nginx qui lui passe les connexions du site.
// Rien n'est écrit sur le disque : une partie terminée disparaît.
import { createServer } from 'node:http';
import { accepter } from './ws.mjs';
import { Salons } from './salon.mjs';
import { coder } from '../src/net/protocole.js';

const PORT = Number(process.env.ELITE27_PORT ?? 8127);
const salons = new Salons();

const http = createServer((req, res) => {
  // Seule réponse hors WebSocket : un contrôle de bonne santé, sans aucun détail sur les parties.
  res.writeHead(req.url === '/partie/sante' ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(req.url === '/partie/sante' ? 'ok\n' : 'introuvable\n');
});

http.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/partie')) return socket.destroy();
  const conn = accepter(req, socket);
  if (!conn) return;
  // Derrière nginx, l'adresse du visiteur est dans l'en-tête ajouté par nginx.
  const adresse = String(req.headers['x-real-ip'] ?? socket.remoteAddress ?? '');
  let salon = null;
  let siege = -1;
  const erreur = (raison) => conn.send(coder({ t: 'erreur', raison }));
  conn.onmessage = (texte) => {
    let m;
    try {
      m = JSON.parse(texte);
    } catch {
      return conn.close(1003);
    }
    if (!m || typeof m !== 'object') return conn.close(1003);
    const now = Date.now();
    // Un joueur assis commande son équipe ; un spectateur ne peut qu'envoyer une réaction de la liste.
    if (salon) return siege >= 0 ? salon.recevoir(siege, m, now) : m.t === 'reaction' && salon.reagir(conn, m.r, now);
    if (m.t === 'creer') {
      const r = salons.creer(m, now);
      if (r.erreur) return erreur(r.erreur);
      salon = r.salon;
      siege = salon.sieges.indexOf(salon.asseoir(conn, now));
    } else if (m.t === 'rejoindre' || m.t === 'regarder') {
      const r = salons.trouver(m.code, adresse, now);
      if (r.erreur) return erreur(r.erreur);
      if (m.t === 'regarder') {
        if (!r.salon.regarder(conn, now)) return erreur('spectateurs');
        salon = r.salon;
        return;
      }
      const s = (typeof m.jeton === 'string' && r.salon.revenir(conn, m.jeton, now)) || r.salon.asseoir(conn, now);
      if (!s) return erreur('plein');
      salon = r.salon;
      siege = salon.sieges.indexOf(s);
    }
  };
  conn.onclose = () => salon?.partir(conn, Date.now());
});

// Le match avance à 60 pas par seconde, rattrapés si le serveur a pris du retard (sans jamais s'emballer).
let dernier = Date.now();
let reste = 0;
setInterval(() => {
  const now = Date.now();
  reste = Math.min(reste + (now - dernier), 250);
  dernier = now;
  while (reste >= 1000 / 60) {
    salons.avancer(now);
    reste -= 1000 / 60;
  }
}, 8);

http.listen(PORT, '127.0.0.1', () => console.log(`Élite 27 : parties en ligne sur 127.0.0.1:${PORT}`));
