// Serveur WebSocket minimal (RFC 6455), sans dépendance : messages texte courts, ping, fermeture.
// Suffisant pour le jeu en ligne : les navigateurs envoient de petits messages JSON non fragmentés.
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_RECU = 16 * 1024; // un message plus long ferme la connexion

/** Trame texte (ou autre code) non masquée, comme doit les envoyer un serveur. */
export function trame(texte, code = 1) {
  const data = Buffer.isBuffer(texte) ? texte : Buffer.from(texte, 'utf8');
  const n = data.length;
  const tete = n < 126 ? Buffer.from([0x80 | code, n]) : n < 65536 ? Buffer.from([0x80 | code, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | code, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([tete, data]);
}

/**
 * Accepte la demande de passage en WebSocket. Renvoie une connexion { send(texte), close(code), alive }
 * avec les rappels onmessage(texte) et onclose(), ou null si la demande n'est pas valable.
 */
export function accepter(req, socket) {
  const cle = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !cle) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accord = createHash('sha1').update(cle + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accord}\r\n\r\n`);
  socket.setNoDelay(true);

  const conn = { alive: true, onmessage: null, onclose: null, send, close };
  let tampon = Buffer.alloc(0);
  function send(texte) {
    if (conn.alive && socket.writable) socket.write(trame(texte));
  }
  function close(code = 1000) {
    if (!conn.alive) return;
    conn.alive = false;
    if (socket.writable) socket.write(trame(Buffer.from([code >> 8, code & 255]), 8));
    socket.end();
    conn.onclose?.();
  }
  socket.on('data', (morceau) => {
    tampon = Buffer.concat([tampon, morceau]);
    // Plusieurs trames peuvent arriver d'un coup, ou une trame en plusieurs morceaux.
    while (conn.alive && tampon.length >= 2) {
      const fin = tampon[0] & 0x80;
      const code = tampon[0] & 0x0f;
      const masque = tampon[1] & 0x80;
      let n = tampon[1] & 0x7f;
      let o = 2;
      if (n === 126) {
        if (tampon.length < 4) return;
        n = tampon.readUInt16BE(2);
        o = 4;
      } else if (n === 127) return close(1009);
      // Un navigateur masque toujours ses trames ; les messages du jeu ne sont jamais fragmentés.
      if (!masque || !fin || n > MAX_RECU) return close(n > MAX_RECU ? 1009 : 1002);
      if (tampon.length < o + 4 + n) return;
      const m = tampon.subarray(o, o + 4);
      const data = Buffer.from(tampon.subarray(o + 4, o + 4 + n));
      for (let i = 0; i < n; i++) data[i] ^= m[i & 3];
      tampon = tampon.subarray(o + 4 + n);
      if (code === 1) conn.onmessage?.(data.toString('utf8'));
      else if (code === 8) return close(1000);
      else if (code === 9) socket.write(trame(data, 10));
      else if (code !== 10) return close(1003);
    }
  });
  const perdu = () => {
    if (!conn.alive) return;
    conn.alive = false;
    conn.onclose?.();
  };
  socket.on('close', perdu);
  socket.on('error', perdu);
  return conn;
}
