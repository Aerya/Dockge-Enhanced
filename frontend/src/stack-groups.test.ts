import assert from "node:assert/strict";
import test from "node:test";
import { assignStackGroup, groupVisibleStacks, parseStackGroups, stackGroupStorageKey, stackIdentity, canReparentStackGroup, stackGroupPath, type StackGroup } from "./stack-groups";

const local = { name: "website",
    endpoint: "" };
const remote = { name: "website",
    endpoint: "https://remote.example" };
const third = { name: "media",
    endpoint: "https://other.example" };
const group: StackGroup = { id: "web",
    name: "Websites",
    collapsed: true,
    members: [ stackIdentity(local), stackIdentity(remote) ] };

test("nested groups reveal ancestors and descendant counts without exposing filtered stacks", () => {
    const groups = [{ ...group,
        id: "root",
        members: [] }, { ...group,
        parentId: "root" }];
    assert.deepEqual(groupVisibleStacks([ remote, local ], groups).map(row => row.id), [ "root" ]);
    const searched = groupVisibleStacks([ remote ], groups, true);
    assert.deepEqual(searched.map(row => [ row.id, row.depth, row.descendantStacks.length ]), [[ "root", 0, 1 ], [ "web", 1, 1 ]]);
    assert.deepEqual(searched[1].stacks, [ remote ]);
    assert.deepEqual(groupVisibleStacks([], groups), []);
    assert.equal(stackGroupPath(groups, "web"), "Websites / Websites");
    assert.equal(groups[0].collapsed, true);
});

test("cycles, missing parents and excessive depth are refused without rewriting valid flat preferences", () => {
    const chain: StackGroup[] = Array.from({ length: 5 }, (_, i) => ({ ...group,
        id: String(i),
        members: [],
        ...(i ? { parentId: String(i - 1) } : {}) }));
    assert.deepEqual(parseStackGroups(JSON.stringify({ enabled: true,
        groups: chain })).groups, chain);
    assert.equal(canReparentStackGroup(chain, "0", "4"), false);
    assert.equal(canReparentStackGroup(chain, "1", "1"), false);
    assert.equal(canReparentStackGroup(chain, "0", "missing"), false);
    assert.equal(canReparentStackGroup(chain, "4", ""), true);
    assert.equal(canReparentStackGroup([ ...chain, { ...group,
        id: "extra",
        members: [] }], "extra", "4"), false);
    const malformed = [{ ...group,
        id: "a",
        parentId: "b" }, { ...group,
        id: "b",
        parentId: "a",
        members: [] }];
    assert.ok(parseStackGroups(JSON.stringify({ groups: malformed })).groups.every(item => !item.parentId));
});

test("a group spans instances without confusing identically named stacks", () => {
    const result = groupVisibleStacks([ remote, third, local ], [ group ]);
    assert.deepEqual(result[0].stacks, [ remote, local ]);
    assert.deepEqual(result[1].stacks, [ third ]);
    assert.notEqual(stackIdentity(local), stackIdentity(remote));
    assert.notEqual(stackIdentity({ name: "a:b",
        endpoint: "c" }), stackIdentity({ name: "b",
        endpoint: "c:a" }));
});

test("permission and instance filters remain authoritative, including group counts", () => {
    const result = groupVisibleStacks([ local ], [ group ]);
    assert.deepEqual(result[0].stacks, [ local ]);
    assert.equal(result[0].stacks.length, 1);
    assert.deepEqual(groupVisibleStacks([], [ group ]), []);
    assert.equal(group.members.length, 2); // A temporarily disconnected instance is not removed.
});

test("search reveals collapsed matches without changing the saved preference", () => {
    assert.equal(groupVisibleStacks([ remote ], [ group ], true)[0].collapsed, false);
    assert.equal(groupVisibleStacks([ remote ], [ group ])[0].collapsed, true);
    assert.equal(group.collapsed, true);
});

test("assignment moves only the selected instance and removing a group restores ungrouped stacks", () => {
    const groups = assignStackGroup([ group, { id: "other",
        name: "Other",
        members: [],
        collapsed: false }], remote, "other");
    assert.deepEqual(groups[0].members, [ stackIdentity(local) ]);
    assert.deepEqual(groups[1].members, [ stackIdentity(remote) ]);
    const result = groupVisibleStacks([ local, remote ], groups.filter(item => item.id !== "web"));
    assert.deepEqual(result[1].stacks, [ local ]);
    assert.deepEqual(assignStackGroup(groups, remote, "")[1].members, []);
});

test("preferences survive reload and remain scoped to the signed-in user", () => {
    const state = { enabled: true,
        groups: [ group ] };
    assert.deepEqual(parseStackGroups(JSON.stringify(state)), state);
    assert.notEqual(stackGroupStorageKey("alice"), stackGroupStorageKey("bob"));
    assert.deepEqual(parseStackGroups(null), { enabled: false,
        groups: [] });
});

test("malformed or duplicate saved preferences never introduce phantom stacks", () => {
    assert.deepEqual(parseStackGroups("broken"), { enabled: false,
        groups: [] });
    const state = parseStackGroups(JSON.stringify({ enabled: true,
        groups: [ group, group, { ...group,
            id: "other",
            members: [ "invalid", "null", "[]", stackIdentity(local) ] }] }));
    assert.equal(state.groups.length, 2);
    assert.deepEqual(state.groups[1].members, []);
    assert.deepEqual(groupVisibleStacks([ third ], state.groups)[0].stacks, [ third ]);
});

test("existing sort and pin priority are preserved inside each group", () => {
    assert.deepEqual(groupVisibleStacks([ remote, local ], [ group ])[0].stacks, [ remote, local ]);
    assert.deepEqual(groupVisibleStacks([ local, remote ], [ group ])[0].stacks, [ local, remote ]);
});
