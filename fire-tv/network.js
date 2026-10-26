// Native-side request handler. Never log playlist URLs or credentials.
function createNetworkHandler(send, fetcher = fetch) {
  const pending = new Map();
  return {
    async receive(raw) {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (message.type !== 'get' || !Number.isSafeInteger(message.id) || pending.has(message.id)) return;
      const { id, url } = message;
      if (typeof url !== 'string' || !/^https?:\/\/[^\s]+$/i.test(url)) {
        send({ id, error: 'Adresse HTTP ou HTTPS requise' });
        return;
      }
      if (pending.size >= 8) { send({ id, error: 'Trop de requêtes simultanées' }); return; }
      const controller = new AbortController();
      pending.set(id, controller);
      const timer = setTimeout(() => controller.abort(), 90000);
      try {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Erreur HTTP ' + response.status);
        if (Number(response.headers.get('content-length')) > 16 * 1024 * 1024) throw new Error('Playlist ou guide trop volumineux (16 Mo maximum)');
        const body = await response.text();
        if (body.length > 8 * 1024 * 1024) throw new Error('Réponse trop volumineuse (8 millions de caractères maximum)');
        send({ id, status: response.status, body });
      } catch (error) {
        send({ id, error: error.name === 'AbortError' ? 'Délai dépassé' : 'Chargement impossible. Vérifie l’adresse, le certificat et ta connexion.' });
      } finally {
        clearTimeout(timer);
        pending.delete(id);
      }
    },
    dispose() { for (const controller of pending.values()) controller.abort(); }
  };
}
module.exports = {createNetworkHandler};
