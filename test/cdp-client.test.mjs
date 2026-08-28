import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverDedicatedChromePorts } from "../scripts/cdp-client.mjs";

test("finds only deduplicated CDP ports for the same dedicated Chrome profile", () => {
  const profileDir = "C:\\Users\\Administrator\\.codex\\boss-company-business-talent-brief\\.boss-profile";
  const processLines = [
    `32208 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9223 --user-data-dir="${profileDir}"`,
    `35788 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --type=renderer --user-data-dir="${profileDir}" --remote-debugging-port=9223`,
    "49152 chrome.exe --remote-debugging-port=9444 --user-data-dir=C:\\Users\\Administrator\\other-profile",
    "49153 chrome.exe --remote-debugging-port=not-a-port --user-data-dir=C:\\Users\\Administrator\\other-profile",
  ];

  assert.deepEqual(discoverDedicatedChromePorts(profileDir, processLines), [9223]);
});
