import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, fsyncSync, openSync, promises as fs, writeFileSync } from "node:fs";
import path from "node:path";
import type { Knex } from "knex";
import { Secret, TOTP } from "otpauth";

interface FactorUser {
    id: number;
    active: number;
    username: string;
    password: string;
    twofa_status: number | boolean;
    twofa_version: number;
    twofa_secret: string | null;
    twofa_secret_encrypted: string | null;
    twofa_recovery_hashes: string | null;
    twofa_last_counter: number;
}
interface PendingFactor {
    userId: number;
    secret: string;
    version: number;
    passwordHash: string;
    expires: number;
}
export interface FactorCredentials {
    passwordHash: string;
    version: number;
}
function requireSameCredentials(user: FactorUser, credentials?: FactorCredentials): void {
    if (credentials && (credentials.passwordHash !== user.password || credentials.version !== user.twofa_version)) {
        throw new Error("twoFactor.restartLogin");
    }
}
export function totpFor(secret: string, username = ""): TOTP {
    return new TOTP({ issuer: "Dockge-Enhanced",
        label: username,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret });
}
export function matchingTotpCounter(secret: string, code: unknown, now = Date.now()): number | null {
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        return null;
    }
    const delta = totpFor(secret).validate({ token: code,
        timestamp: now,
        window: 1 });
    return delta === null ? null : Math.floor(now / 30_000) + delta;
}
function recoveryHash(userId: number, code: unknown): string | null {
    if (typeof code !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/i.test(code)) {
        return null;
    }
    return createHash("sha256").update(`dockge-recovery:${userId}:${code.toLowerCase()}`).digest("hex");
}
function recoveryCodes(userId: number) {
    const codes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex").match(/.{8}/g)!.join("-"));
    return { codes,
        hashes: JSON.stringify(codes.map(code => recoveryHash(userId, code))) };
}
function equal(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}
export function interactiveSessionVersionMatches(decoded: { twoFaVersion?: unknown }, user: { twofa_version?: unknown }): boolean {
    const expected = Number(user.twofa_version ?? 0);
    const supplied = decoded.twoFaVersion ?? 0;
    return Number.isSafeInteger(supplied) && supplied === expected;
}

/** Enrollment state is temporary and bound to the authenticated socket. */
export class TwoFactorAuth {
    private pending = new Map<string, PendingFactor>();

    constructor(private readonly db: Knex, private readonly dataDir: string, private readonly now = () => Date.now()) {}

    private async user(userId: number): Promise<FactorUser> {
        const user = await this.db<FactorUser>("user").where({ id: userId,
            active: 1 }).first();
        if (!user) {
            throw new Error("twoFactor.unavailable");
        }
        return user;
    }

    private async key(create = false): Promise<Buffer> {
        const filename = path.join(this.dataDir, "two-factor.key");
        if (create) {
            // A missing key after a database-only restore must not be silently
            // replaced: that would strand every previously enrolled account.
            const enrolled = await this.db("user").whereNotNull("twofa_secret_encrypted").first("id");
            if (enrolled) {
                return this.key();
            }
            try {
                const handle = openSync(filename, "wx", 0o600);
                try {
                    writeFileSync(handle, randomBytes(32));
                    fsyncSync(handle);
                } finally {
                    closeSync(handle);
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw new Error("twoFactor.keyUnavailable", { cause: error });
                }
            }
        }
        try {
            const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                if (!(await handle.stat()).isFile()) {
                    throw new Error();
                }
                await handle.chmod(0o600);
                const key = await handle.readFile();
                if (key.length !== 32) {
                    throw new Error();
                }
                return key;
            } finally {
                await handle.close();
            }
        } catch {
            throw new Error("twoFactor.keyUnavailable");
        }
    }

    private async encrypt(secret: string, userId: number): Promise<string> {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", await this.key(true), iv);
        cipher.setAAD(Buffer.from(String(userId)));
        const encrypted = Buffer.concat([ cipher.update(secret, "utf8"), cipher.final() ]);
        return [ "v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url") ].join(".");
    }

    private async secret(user: FactorUser): Promise<string> {
        if (!user.twofa_secret_encrypted) {
            if (user.twofa_secret && /^[A-Z2-7]{16,64}$/i.test(user.twofa_secret)) {
                return user.twofa_secret;
            }
            throw new Error("twoFactor.keyUnavailable");
        }
        try {
            const [ version, iv, tag, payload ] = user.twofa_secret_encrypted.split(".");
            if (version !== "v1") {
                throw new Error();
            }
            const decipher = createDecipheriv("aes-256-gcm", await this.key(), Buffer.from(iv, "base64url"));
            decipher.setAAD(Buffer.from(String(user.id)));
            decipher.setAuthTag(Buffer.from(tag, "base64url"));
            return Buffer.concat([ decipher.update(Buffer.from(payload, "base64url")), decipher.final() ]).toString("utf8");
        } catch {
            throw new Error("twoFactor.keyUnavailable");
        }
    }

    forget(session: string): void {
        this.pending.delete(session);
    }

    async status(userId: number) {
        const user = await this.user(userId);
        return { enabled: Boolean(user.twofa_status),
            recoveryRemaining: (JSON.parse(user.twofa_recovery_hashes ?? "[]") as string[]).length };
    }

    async prepare(userId: number, session: string, credentials?: FactorCredentials): Promise<string> {
        const user = await this.user(userId);
        requireSameCredentials(user, credentials);
        if (user.twofa_status) {
            throw new Error("twoFactor.alreadyEnabled");
        }
        const secret = new Secret({ size: 20 }).base32;
        this.pending.set(session, { userId,
            secret,
            version: user.twofa_version,
            passwordHash: user.password,
            expires: this.now() + 600_000 });
        return totpFor(secret, user.username).toString();
    }

    async enable(userId: number, session: string, code: unknown) {
        const user = await this.user(userId);
        const pending = this.pending.get(session);
        if (!pending || pending.userId !== userId || pending.expires < this.now() ||
            pending.version !== user.twofa_version || pending.passwordHash !== user.password || user.twofa_status) {
            this.forget(session);
            throw new Error("twoFactor.setupExpired");
        }
        const counter = matchingTotpCounter(pending.secret, code, this.now());
        if (counter === null) {
            throw new Error("twoFactor.invalidCode");
        }
        const recovery = recoveryCodes(userId);
        const encrypted = await this.encrypt(pending.secret, userId);
        const changed = await this.db("user").where({ id: userId,
            active: 1,
            password: user.password,
            twofa_status: 0,
            twofa_version: user.twofa_version }).update({
            twofa_status: 1,
            twofa_secret: null,
            twofa_secret_encrypted: encrypted,
            twofa_recovery_hashes: recovery.hashes,
            twofa_last_counter: counter,
            twofa_last_token: null,
            twofa_version: user.twofa_version + 1,
        });
        this.forget(session);
        if (changed !== 1) {
            throw new Error("twoFactor.setupExpired");
        }
        return recovery.codes;
    }

    /** SQL compare-and-swap makes replay prevention atomic across concurrent sockets. */
    private async consume(userId: number, code: unknown, changes?: (user: FactorUser) => Record<string, unknown>, credentials?: FactorCredentials): Promise<void> {
        const user = await this.user(userId);
        requireSameCredentials(user, credentials);
        if (!user.twofa_status) {
            throw new Error("twoFactor.invalidCode");
        }
        const query = this.db("user").where({ id: userId,
            active: 1,
            password: user.password,
            twofa_status: 1,
            twofa_version: user.twofa_version });
        let update: Record<string, unknown>;
        const hash = recoveryHash(userId, code);
        if (hash) {
            const hashes = JSON.parse(user.twofa_recovery_hashes ?? "[]") as string[];
            if (!hashes.some(item => equal(item, hash))) {
                throw new Error("twoFactor.invalidCode");
            }
            query.where("twofa_recovery_hashes", user.twofa_recovery_hashes);
            update = { twofa_recovery_hashes: JSON.stringify(hashes.filter(item => !equal(item, hash))) };
        } else {
            const counter = matchingTotpCounter(await this.secret(user), code, this.now());
            if (counter === null) {
                throw new Error("twoFactor.invalidCode");
            }
            query.where("twofa_last_counter", "<", counter);
            update = { twofa_last_counter: counter };
        }
        const changed = await query.update({ ...update,
            ...changes?.(user) });
        if (changed !== 1) {
            throw new Error("twoFactor.invalidCode");
        }
    }

    async verify(userId: number, code: unknown, credentials?: FactorCredentials): Promise<void> {
        await this.consume(userId, code, undefined, credentials);
    }

    async disable(userId: number, code: unknown, credentials?: FactorCredentials): Promise<void> {
        await this.consume(userId, code, user => ({
            twofa_status: 0,
            twofa_secret: null,
            twofa_secret_encrypted: null,
            twofa_recovery_hashes: null,
            twofa_last_counter: -1,
            twofa_last_token: null,
            twofa_version: user.twofa_version + 1,
        }), credentials);
    }

    async regenerate(userId: number, code: unknown, credentials?: FactorCredentials): Promise<string[]> {
        const recovery = recoveryCodes(userId);
        await this.consume(userId, code, user => ({
            twofa_recovery_hashes: recovery.hashes,
            twofa_version: user.twofa_version + 1,
        }), credentials);
        return recovery.codes;
    }
}

export interface LoginChallenge {
    id: string;
    proof: string;
    expires: number;
}
function passwordProof(username: string, password: string, secret: string): string {
    return createHmac("sha256", secret).update(username).update("\0").update(password).digest("hex");
}
export function createLoginChallenge(username: string, password: string, secret: string, now = Date.now()): LoginChallenge {
    return { id: randomBytes(32).toString("base64url"),
        proof: passwordProof(username, password, secret),
        expires: now + 300_000 };
}
export function validLoginChallenge(challenge: LoginChallenge | null, id: unknown, username: unknown, password: unknown, secret: string, now = Date.now()): boolean {
    return !!challenge && typeof id === "string" && typeof username === "string" && typeof password === "string" &&
        challenge.expires >= now && equal(challenge.id, id) && equal(challenge.proof, passwordProof(username, password, secret));
}
