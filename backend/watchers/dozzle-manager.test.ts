import test from "node:test";
import assert from "node:assert/strict";
import * as yaml from "js-yaml";
import { buildDozzleCompose, isLegacyManagedDozzle, isManagedComposeContainer } from "./dozzle-manager";

interface DozzleComposeModel {
    name: string;
    services: {
        dozzle: {
            container_name: string;
            restart: string;
            ports: string[];
            volumes: string[];
        };
    };
    volumes: { dozzle_dockge_data: { name: string } };
}

function legacyContainer(port = 8080) {
    return {
        Config: { Image: "amir20/dozzle:latest",
            Labels: {} as Record<string, string> },
        HostConfig: {
            PortBindings: { "8080/tcp": [{ HostPort: String(port) }] },
            RestartPolicy: { Name: "unless-stopped" },
        },
        Mounts: [
            { Type: "bind",
                Source: "/var/run/docker.sock",
                Destination: "/var/run/docker.sock",
                RW: false },
            { Type: "volume",
                Name: "dozzle_dockge_data",
                Destination: "/data",
                RW: true },
        ],
    };
}

test("génère une stack Compose Dozzle complète", () => {
    const compose = yaml.load(buildDozzleCompose(6945)) as DozzleComposeModel;
    assert.equal(compose.name, "dozzle-dockge-enhanced");
    assert.equal(compose.services.dozzle.container_name, "dozzle-dockge-enhanced");
    assert.equal(compose.services.dozzle.restart, "unless-stopped");
    assert.deepEqual(compose.services.dozzle.ports, [ "6945:8080" ]);
    assert.deepEqual(compose.services.dozzle.volumes, [
        "/var/run/docker.sock:/var/run/docker.sock:ro",
        "dozzle_dockge_data:/data",
    ]);
    assert.equal(compose.volumes.dozzle_dockge_data.name, "dozzle_dockge_data");
});

test("reconnaît uniquement l’ancien Dozzle créé par Enhanced", () => {
    assert.equal(isLegacyManagedDozzle(legacyContainer(), 8080), true);
    assert.equal(isLegacyManagedDozzle(legacyContainer(6945), 8080), false);
    const foreign = legacyContainer();
    foreign.Config.Image = "custom/dozzle:latest";
    assert.equal(isLegacyManagedDozzle(foreign, 8080), false);
});

test("reconnaît le projet Compose Dozzle attendu", () => {
    const container = legacyContainer();
    container.Config.Labels = {
        "com.docker.compose.project": "dozzle-dockge-enhanced",
        "com.docker.compose.service": "dozzle",
    };
    assert.equal(isManagedComposeContainer(container), true);
    assert.equal(isLegacyManagedDozzle(container, 8080), false);
});
