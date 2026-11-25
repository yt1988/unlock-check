// The deployment adds our own measurement endpoints as <meta> tags from the Worker's environment; without them the
// page is the self-hosted fallback. These tests cover both sides of that (tool-contract.md §2, #142).
import { test } from "node:test";
import assert from "node:assert/strict";
import { endpointTags } from "../src/worker.js";
import { readAnchors } from "../src/egress.js";

test("the worker adds endpoint metas only when the environment has them", () => {
  assert.deepEqual(endpointTags({}), []);
  assert.deepEqual(endpointTags({ MS_ANCHORS: "cn=https://a;intl=https://b" }), [["ms-anchors", "cn=https://a;intl=https://b"]]);
  assert.deepEqual(endpointTags({ MS_ANCHORS: "a", MS_EGRESS: "stun=x" }), [["ms-anchors", "a"], ["ms-egress", "stun=x"]]);
});

test("readAnchors is empty without the meta (the self-hosted fallback)", () => {
  const doc = content => ({ querySelector: () => content == null ? null : { getAttribute: () => content } });
  assert.deepEqual(readAnchors(doc(null)), { cn: "", intl: "" });
  assert.deepEqual(readAnchors(doc("cn=https://a;intl=https://b")), { cn: "https://a", intl: "https://b" });
});
