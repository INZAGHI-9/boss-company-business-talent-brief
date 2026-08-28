import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const businessTalentDirectory = path.join(skillsDirectory, "boss-company-business-talent-brief");
const opportunityDirectory = path.join(skillsDirectory, "boss-company-opportunity-entry");

test("splits the company brief into business-talent and opportunity-entry skills without modes", () => {
  for (const directory of [businessTalentDirectory, opportunityDirectory]) {
    assert.equal(existsSync(path.join(directory, "SKILL.md")), true, `missing ${directory}`);
    assert.equal(existsSync(path.join(directory, "agents", "openai.yaml")), true, `missing metadata for ${directory}`);
  }

  const businessTalent = readFileSync(path.join(businessTalentDirectory, "SKILL.md"), "utf8");
  const opportunity = readFileSync(path.join(opportunityDirectory, "SKILL.md"), "utf8");

  assert.match(businessTalent, /业务战略报告/);
  assert.match(businessTalent, /人才战略报告/);
  assert.doesNotMatch(businessTalent, /sales-entry-opportunity-report\.md|customer-business-baseline\.md|quick-prompt\.md|deep-prompts\.md|快速版|深化版/);

  assert.match(opportunity, /客户业务底稿/);
  assert.match(opportunity, /商机切入报告/);
  assert.doesNotMatch(opportunity, /business-strategy-report\.md|talent-strategy-report\.md|quick-prompt\.md|deep-prompts\.md|快速版|深化版/);
});
