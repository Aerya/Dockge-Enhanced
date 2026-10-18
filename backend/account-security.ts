// Shared by interactive login and security changes. Never hold this reservation
// while sending stack inventories or connecting remote agents.
const changingAccounts = new Set<number>();

export function reserveAccountSecurity(userId: number): () => void {
    if (changingAccounts.has(userId)) {
        throw new Error("twoFactor.restartLogin");
    }
    changingAccounts.add(userId);
    return () => changingAccounts.delete(userId);
}

export async function registerAccountSession<T>(userId: number, validate: () => Promise<T>, register: (user: T) => Promise<void>): Promise<void> {
    const release = reserveAccountSecurity(userId);
    let completion: Promise<void>;
    try {
        const user = await validate();
        // afterLogin assigns socket.userID synchronously before any await. A
        // subsequent security change can therefore find and revoke this socket.
        completion = register(user);
    } finally {
        release();
    }
    await completion;
}
