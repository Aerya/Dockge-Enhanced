import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { User } from "./user";

function userFixture(overrides: Partial<User> = {}) {
    return Object.assign({
        id: 42,
        username: "operator",
        password: "$2a$10$initial-hash",
    }, overrides) as unknown as User;
}

test("interactive JWTs remain tied to the username and password hash", () => {
    const token = User.createJWT(userFixture(), "test-secret");
    const decoded = jwt.verify(token, "test-secret") as Record<string, unknown>;

    assert.equal(decoded.username, "operator");
    assert.equal(typeof decoded.h, "string");
    assert.equal(decoded.scope, undefined);
});

test("federation JWTs use the stable user ID without a password fingerprint", () => {
    const token = User.createFederationJWT(userFixture(), "test-secret");
    const decoded = jwt.verify(token, "test-secret") as Record<string, unknown>;

    assert.equal(decoded.userId, 42);
    assert.equal(decoded.scope, "federation");
    assert.equal(decoded.h, undefined);
});

test("federation JWT identity survives a username and password hash change", () => {
    const token = User.createFederationJWT(userFixture(), "test-secret");
    const changedUser = userFixture({ username: "renamed",
        password: "$2a$10$rehash" });
    const decoded = jwt.verify(token, "test-secret") as Record<string, unknown>;

    assert.equal(decoded.userId, changedUser.id);
});
