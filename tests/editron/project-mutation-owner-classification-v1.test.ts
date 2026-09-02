import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROJECT_MUTATION_OWNER_GROUPS_V1,
  classifiedProjectMutationOwnerMethodsV1,
} from "@/lib/editron/services/project-mutation-owner-classification-v1";

const METHOD_START = /^  (?:(?:private|protected) )?async ([A-Za-z0-9_]+)\(/gm;
const PERSISTENCE_WRITE_OR_DELEGATION =
  /(?:\.(?:insertOne|updateOne|updateMany|findOneAndUpdate|replaceOne|bulkWrite|deleteOne|deleteMany)|commitProjectDeletionV1)\s*\(/;

function detectedProjectServicePersistenceMethods(): string[] {
  const source = readFileSync(
    join(process.cwd(), "lib/editron/services/project-service.ts"),
    "utf8",
  );
  const starts = [...source.matchAll(METHOD_START)].map((match) => ({
    name: match[1]!,
    index: match.index!,
  }));
  return starts
    .filter((start, index) => {
      const end = starts[index + 1]?.index ?? source.length;
      return PERSISTENCE_WRITE_OR_DELEGATION.test(source.slice(start.index, end));
    })
    .map(({ name }) => name)
    .sort();
}

describe("ProjectService mutation-owner classification V1", () => {
  it("classifies every persistence-writing method exactly once", () => {
    const classified = classifiedProjectMutationOwnerMethodsV1();
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified).toEqual(detectedProjectServicePersistenceMethods());
  });

  it("keeps active render-state writers explicit about invalidation", () => {
    for (const [name, group] of Object.entries(PROJECT_MUTATION_OWNER_GROUPS_V1)) {
      expect(group.methods.length, name).toBeGreaterThan(0);
      expect(group.reason.trim().length, name).toBeGreaterThan(20);
      if (group.renderEffect === "ACTIVE_RENDER_STATE") {
        expect(
          ["REQUIRED", "PRODUCED_BY_OWNER"],
          `${name} must invalidate active render state`,
        ).toContain(group.renderSnapshotInvalidation);
      }
      if (group.renderEffect === "METADATA_ONLY" || group.renderEffect === "PROOF_ONLY") {
        expect(group.rangeAndLockFence, name).toBe("NOT_APPLICABLE");
        expect(group.renderSnapshotInvalidation, name).toBe("NOT_APPLICABLE");
      }
    }
  });

  it("records producer-side evidence exceptions instead of circular prerequisites", () => {
    expect(PROJECT_MUTATION_OWNER_GROUPS_V1.ANALYSIS_NATIVE_AUDIO_EVIDENCE)
      .toMatchObject({
        mediaEvidence: "PRODUCED_BY_OWNER",
        renderSnapshotInvalidation: "CONDITIONAL",
      });
    expect(PROJECT_MUTATION_OWNER_GROUPS_V1.AUDIO_RIGHTS_POLICY)
      .toMatchObject({
        rightsEvidence: "PRODUCED_BY_OWNER",
        renderSnapshotInvalidation: "REQUIRED",
      });
  });

  it("keeps unresolved cross-queue owners visible instead of certifying them", () => {
    expect(PROJECT_MUTATION_OWNER_GROUPS_V1.PROJECT_DELETION.closure)
      .toBe("LOCAL_GUARDS_VERIFIED");
    expect(PROJECT_MUTATION_OWNER_GROUPS_V1.PROXY_MASTER_ACTIVE_SOURCE.closure)
      .toBe("QUEUE_3_4_DEPENDENCY");
    expect(PROJECT_MUTATION_OWNER_GROUPS_V1.ANALYSIS_NATIVE_AUDIO_EVIDENCE.closure)
      .toBe("QUEUE_3_4_DEPENDENCY");
    expect(Object.entries(PROJECT_MUTATION_OWNER_GROUPS_V1)
      .filter(([, group]) => group.closure !== "LOCAL_GUARDS_VERIFIED")
      .map(([name]) => name)
      .sort()).toEqual([
        "ANALYSIS_NATIVE_AUDIO_EVIDENCE",
        "PROXY_MASTER_ACTIVE_SOURCE",
      ]);
  });
});
