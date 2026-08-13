import bcrypt from "bcryptjs";
import crypto from "crypto";
const saltRounds = 10;

/**
 * Hash a password
 * @param {string} password Password to hash
 * @returns {string} Hash
 */
export function generatePasswordHash(password : string) {
    return bcrypt.hashSync(password, saltRounds);
}

/**
 * Verify a password against a hash
 * @param {string} password Password to verify
 * @param {string} hash Hash to verify against
 * @returns {boolean} Does the password match the hash?
 */
export function verifyPassword(password : string, hash : string) {
    return bcrypt.compareSync(password, hash);
}

/**
 * Does the hash need to be rehashed?
 * @param {string} hash Hash to check
 * @returns {boolean} Needs to be rehashed?
 */
export function needRehashPassword(hash : string) : boolean {
    return false;
}

/**
 * Create a keyed fingerprint of the stored bcrypt digest. It is embedded in
 * JWTs only to invalidate them after a password change.
 */
export function passwordVersionFingerprint(passwordHash : string, jwtSecret : string) {
    if (!passwordHash) {
        return "";
    }
    return crypto.createHmac("sha256", jwtSecret)
        .update(passwordHash)
        .digest("hex")
        .slice(0, 32);
}
