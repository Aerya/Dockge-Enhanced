import original from "promisify-child-process";
import { wrapBuffered } from "../extra/command-buffer.cjs";

export { exec, execFile } from "../extra/command-buffer.cjs";

export default {
    ...original,
    spawn: wrapBuffered(original.spawn, { mode: "spawn",
        defaultBytes: 200 * 1024 }),
    fork: wrapBuffered(original.fork, { mode: "spawn",
        defaultBytes: 200 * 1024 }),
    exec: wrapBuffered(original.exec, { mode: "exec" }),
    execFile: wrapBuffered(original.execFile, { mode: "execFile" }),
};
