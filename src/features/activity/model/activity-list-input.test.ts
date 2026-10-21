import { describe, expect, it } from "vitest";

import { activityListInput } from "./activity-list-input";

const cursor = "a04509c1-b524-494a-8662-8d6ed7bcfc8d";
const storeId = "5b2e0c3a-1d4f-4f7e-9a8b-2c3d4e5f6a7b";

describe("activityListInput", () => {
  it("uses 50 as the default page size, with no filters", () => {
    expect(activityListInput.parse({})).toEqual({ limit: 50 });
  });

  it("accepts a cursor with a direction, and the action and store filters", () => {
    expect(
      activityListInput.parse({ cursor, direction: "prev", action: "refunded", storeId }),
    ).toEqual({ limit: 50, cursor, direction: "prev", action: "refunded", storeId });
  });

  it("rejects a page size outside 1 to 100", () => {
    expect(activityListInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(activityListInput.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("rejects an action the timeline doesn't have, and ids that aren't uuids", () => {
    expect(activityListInput.safeParse({ action: "deleted" }).success).toBe(false);
    expect(activityListInput.safeParse({ cursor: "NS-1003" }).success).toBe(false);
    expect(activityListInput.safeParse({ storeId: "stockholm" }).success).toBe(false);
  });
});
