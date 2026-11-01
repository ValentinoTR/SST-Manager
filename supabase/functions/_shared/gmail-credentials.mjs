// Server-only AES-GCM envelope. The encryption key remains in Edge Function Secrets.
export const encode64 = bytes => btoa(String.fromCharCode(...bytes));
export const decode64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export const randomToken = () => encode64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function digest(text) {
 return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
}
async function envelopeKey(secret) {
 if(!secret) throw new Error('Falta la clave privada del servidor.');
 return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptCredential(token,secret) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},await envelopeKey(secret),new TextEncoder().encode(token));
 return {iv:encode64(iv),ciphertext:encode64(new Uint8Array(bytes))};
}
export async function decryptCredential(row,secret) {
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(row.iv)},await envelopeKey(secret),decode64(row.ciphertext)));
}
