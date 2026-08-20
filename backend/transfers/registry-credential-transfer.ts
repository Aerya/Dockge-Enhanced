import {
    constants,
    createCipheriv,
    createDecipheriv,
    generateKeyPairSync,
    privateDecrypt,
    publicEncrypt,
    randomBytes,
    randomUUID,
} from "node:crypto";
import { ImageWatcher, RegistryCredential } from "../watchers/image-watcher";
import { normalizeRegistryHost } from "../registry-auth";
import { ValidationError } from "../util-server";

const KEY_TTL_MS = 5 * 60_000;
const pendingKeys = new Map<string, { privateKey: string; expiresAt: number }>();

export interface RegistryCredentialTransferKey {
    id: string;
    publicKey: string;
    expiresAt: string;
}

export interface RegistryCredentialEnvelope {
    keyId: string;
    registry: string;
    encryptedKey: string;
    iv: string;
    authTag: string;
    ciphertext: string;
}

function cleanupExpiredKeys(): void {
    const now = Date.now();
    for (const [ id, key ] of pendingKeys) {
        if (key.expiresAt <= now) {
            pendingKeys.delete(id);
        }
    }
}

export function createRegistryCredentialTransferKey(): RegistryCredentialTransferKey {
    cleanupExpiredKeys();
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki",
            format: "pem" },
        privateKeyEncoding: { type: "pkcs8",
            format: "pem" },
    });
    const id = randomUUID();
    const expiresAt = Date.now() + KEY_TTL_MS;
    pendingKeys.set(id, { privateKey,
        expiresAt });
    return { id,
        publicKey,
        expiresAt: new Date(expiresAt).toISOString() };
}

export function exportRegistryCredentialEnvelope(registry: string, key: RegistryCredentialTransferKey): RegistryCredentialEnvelope {
    const normalized = normalizeRegistryHost(registry);
    const credential = ImageWatcher.getInstance().getRegistryCredential(normalized);
    if (!credential) {
        throw new ValidationError(`No credential is configured for ${normalized}`);
    }
    if (!key.id || !key.publicKey || new Date(key.expiresAt).getTime() <= Date.now()) {
        throw new ValidationError("Registry credential transfer key is invalid or expired");
    }
    const symmetricKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", symmetricKey, iv);
    const ciphertext = Buffer.concat([ cipher.update(JSON.stringify(credential), "utf8"), cipher.final() ]);
    return {
        keyId: key.id,
        registry: normalized,
        encryptedKey: publicEncrypt({ key: key.publicKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256" }, symmetricKey).toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
    };
}

export async function importRegistryCredentialEnvelope(envelope: RegistryCredentialEnvelope): Promise<string> {
    cleanupExpiredKeys();
    const pending = pendingKeys.get(envelope.keyId);
    pendingKeys.delete(envelope.keyId);
    if (!pending || pending.expiresAt <= Date.now()) {
        throw new ValidationError("Registry credential transfer key is invalid or expired");
    }
    try {
        const symmetricKey = privateDecrypt({ key: pending.privateKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256" }, Buffer.from(envelope.encryptedKey, "base64"));
        const decipher = createDecipheriv("aes-256-gcm", symmetricKey, Buffer.from(envelope.iv, "base64"));
        decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
        const plaintext = Buffer.concat([ decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final() ]).toString("utf8");
        const credential = JSON.parse(plaintext) as RegistryCredential;
        const registry = normalizeRegistryHost(envelope.registry);
        if (normalizeRegistryHost(credential.registry) !== registry) {
            throw new Error("Registry mismatch");
        }
        await ImageWatcher.getInstance().importRegistryCredential(credential);
        return registry;
    } catch {
        throw new ValidationError("Registry credential transfer could not be decrypted");
    }
}
