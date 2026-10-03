import assert from "node:assert/strict";
import test from "node:test";
import { Stack } from "./stack";
import { DockgeServer } from "./dockge-server";

const server = { stacksDir: "/tmp/dockge-preview-stacks" } as DockgeServer;

test("previews the same Compose commands used by managed stack actions", () => {
    const stack = new Stack(server, "demo", "services:\n  app:\n    image: nginx:latest\n", "", true);
    const preview = stack.getActionCommandPreview();

    assert.equal(preview.cwd, "/tmp/dockge-preview-stacks/demo");
    assert.deepEqual(preview.commands.update, [
        "docker compose pull",
        "docker compose up -d --force-recreate --remove-orphans",
    ]);
    assert.deepEqual(preview.commands.down, [ "docker compose down" ]);
    assert.deepEqual(preview.commands.build, []);
});

test("external stack preview preserves the project, files, env and working directory", () => {
    const stack = new Stack(
        server,
        "external-demo",
        "services:\n  app:\n    build: .\n",
        "",
        true,
        "",
        "/srv/my stack",
        "my-project",
        [ "/srv/my stack/compose.yaml" ],
        [ "/srv/my stack/.env" ],
    );
    const preview = stack.getActionCommandPreview();

    assert.equal(preview.cwd, "/srv/my stack");
    assert.equal(preview.commands.start[0], "docker compose --project-directory '/srv/my stack' --project-name my-project --env-file '/srv/my stack/.env' -f '/srv/my stack/compose.yaml' up -d --remove-orphans");
    assert.equal(preview.commands.build[0], "docker compose --project-directory '/srv/my stack' --project-name my-project --env-file '/srv/my stack/.env' -f '/srv/my stack/compose.yaml' build --pull app");
});
