import test from "node:test";
import assert from "node:assert/strict";
import {
    activeDockerUpdateOperation,
    isDockerUpdateReservedBy,
    tryReserveDockerUpdate,
} from "./operation-coordinator";

test("une mutation ImageWatcher réservée empêche un self-update jusqu'à sa libération", async () => {
    let releaseBarrier: () => void;
    const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
    });
    let acquired = false;

    const imageMutation = (async () => {
        const reservation = tryReserveDockerUpdate("image-update");
        assert.ok(reservation);
        acquired = true;
        try {
            await barrier;
        } finally {
            reservation.release();
        }
    })();

    await Promise.resolve();
    assert.equal(acquired, true);
    assert.equal(activeDockerUpdateOperation(), "image-update");
    assert.equal(tryReserveDockerUpdate("self-update"), null);

    releaseBarrier!();
    await imageMutation;
    const selfUpdate = tryReserveDockerUpdate("self-update");
    assert.ok(selfUpdate);
    selfUpdate.release();
});

test("une préparation self-update réservée reporte une mutation ImageWatcher concurrente", () => {
    const selfUpdate = tryReserveDockerUpdate("self-update");
    assert.ok(selfUpdate);
    assert.equal(isDockerUpdateReservedBy("self-update"), true);
    assert.equal(tryReserveDockerUpdate("image-update"), null);
    selfUpdate.release();
});

test("deux démarrages presque simultanés ne peuvent réserver qu'une mutation", async () => {
    const contenders = await Promise.all([
        Promise.resolve().then(() => tryReserveDockerUpdate("image-update")),
        Promise.resolve().then(() => tryReserveDockerUpdate("self-update")),
    ]);
    const winner = contenders.filter((reservation) => reservation !== null);
    assert.equal(winner.length, 1);
    winner[0]!.release();
    assert.equal(activeDockerUpdateOperation(), null);
});

test("une erreur libère toujours la réservation pour l'opération suivante", async () => {
    await assert.rejects(async () => {
        const reservation = tryReserveDockerUpdate("image-update");
        assert.ok(reservation);
        try {
            throw new Error("fixture failure");
        } finally {
            reservation.release();
        }
    }, /fixture failure/);

    const next = tryReserveDockerUpdate("self-update");
    assert.ok(next);
    next.release();
});
