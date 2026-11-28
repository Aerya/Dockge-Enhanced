/** Docker-only transport. No listener, Docker socket, host root mount or installation authority. */
import { readReport } from "./report";
import { EMPTY_OPERATIONS, hostOperationStatus, queueHostOperation } from "./operations";
process.env.DOCKGE_HOST_REQUEST_DIR = "/host-requests";
process.env.DOCKGE_HOST_OPERATION_REPORT_DIR = "/host-operations";
async function main() {
    const report = await readReport("/host-reports");
    if (process.argv[2] === "read") {
        return { report,
            operations: await hostOperationStatus(report.hostId).catch(() => ({ ...EMPTY_OPERATIONS })) };
    }
    if (process.argv[2] === "request") {
        const data = JSON.parse(Buffer.from(process.argv[3], "base64").toString());
        if (data.hostId !== report.hostId) {
            throw new Error("wrong host");
        }
        return queueHostOperation(data.request, report.hostId);
    }
    throw new Error("invalid action");
}
main().then(result => process.stdout.write(JSON.stringify(result))).catch(() => {
    process.stderr.write("Host bridge unavailable\n");
    process.exitCode = 1;
});
