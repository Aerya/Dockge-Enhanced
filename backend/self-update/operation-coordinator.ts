/**
 * Single process-wide reservation for Docker-mutating update operations.
 *
 * It intentionally covers only mutations (pull/recreate/rollback/self-update),
 * never registry or DNS reads. The persisted self-update state remains the
 * source of truth once its detached sidecar outlives this process.
 */
export type DockerUpdateOperation = "self-update" | "image-update";

interface ActiveReservation {
    owner: DockerUpdateOperation;
    token: symbol;
}

let activeReservation: ActiveReservation | null = null;

export interface DockerUpdateReservation {
    readonly owner: DockerUpdateOperation;
    release(): void;
}

export function tryReserveDockerUpdate(owner: DockerUpdateOperation): DockerUpdateReservation | null {
    if (activeReservation) {
        return null;
    }

    const token = Symbol(owner);
    activeReservation = { owner,
        token };
    let released = false;
    return {
        owner,
        release: () => {
            if (!released && activeReservation?.token === token) {
                activeReservation = null;
            }
            released = true;
        },
    };
}

export function isDockerUpdateReservedBy(owner: DockerUpdateOperation): boolean {
    return activeReservation?.owner === owner;
}

export function activeDockerUpdateOperation(): DockerUpdateOperation | null {
    return activeReservation?.owner ?? null;
}
