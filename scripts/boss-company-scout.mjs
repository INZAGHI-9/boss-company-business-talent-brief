#!/usr/bin/env node

import { main } from "./collector/boss-company-scout.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export { analyze, assertCompleteDetails, compareSnapshots, saveOutputs, selectCompany } from "./collector/boss-company-scout.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`\n失败：${error.message}`);
    process.exitCode = 1;
  });
}
