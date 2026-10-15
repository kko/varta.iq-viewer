import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';

export async function gatewayTlsOptions(host, certificateDirectory) {
  if (isIP(host) !== 4) throw new Error('Gateway muss eine IPv4-Adresse sein.');
  let pem;
  try { pem = await readFile(new URL(`gateway-${host}.pem`, certificateDirectory)); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  const expected = new X509Certificate(pem).fingerprint256;
  return {
    ca: pem,
    allowPartialTrustChain: true,
    rejectUnauthorized: true,
    // The AWS IoT device certificate has no SAN. Explicitly bind the trusted
    // leaf certificate to the IP named in its local file instead of DNS PKI.
    checkServerIdentity(server, certificate) {
      if (server === host && certificate.fingerprint256 === expected) return;
      const error = new Error('Das HTTPS-Gerätezertifikat stimmt nicht mit dem hinterlegten Zertifikat überein.');
      error.code = 'ERR_TLS_CERT_PIN_MISMATCH';
      return error;
    },
  };
}

export async function fetchGateway(url, certificateDirectory, apiKey = '') {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Gateway-Zugriff benötigt HTTPS.');
  const tlsOptions = await gatewayTlsOptions(target.hostname, certificateDirectory);
  return new Promise((resolve, reject) => {
    const request = https.get(target, { ...tlsOptions, headers: apiKey ? { 'X-API-Key': apiKey } : {}, signal: AbortSignal.timeout(8000) }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 1024 * 1024) response.destroy(new Error('Gateway-Antwort ist zu groß.'));
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, json: async () => JSON.parse(body) }));
    });
    request.on('error', reject);
  });
}
