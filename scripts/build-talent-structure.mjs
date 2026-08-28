import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizeDescription(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function parseSalary(value) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : null;
  if (!raw) return {
    raw: null, minMonthlyK: null, maxMonthlyK: null, salaryMonths: null,
    minDailyRmb: null, maxDailyRmb: null, minHourlyRmb: null, maxHourlyRmb: null,
  };
  const kRange = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|~|至)\s*(\d+(?:\.\d+)?)\s*[kK]/);
  const monthlyRmbRange = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|~|至)\s*(\d+(?:\.\d+)?)\s*元\s*(?:\/|每)\s*月/);
  const dailyRange = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|~|至)\s*(\d+(?:\.\d+)?)\s*元\s*(?:\/|每)\s*天/);
  const hourlyRange = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|~|至)\s*(\d+(?:\.\d+)?)\s*元\s*(?:\/|每)\s*时/);
  const months = raw.match(/(?:[·*xX]\s*)?(\d+)\s*薪/);
  return {
    raw,
    minMonthlyK: kRange ? Number(kRange[1]) : monthlyRmbRange ? Number(monthlyRmbRange[1]) / 1000 : null,
    maxMonthlyK: kRange ? Number(kRange[2]) : monthlyRmbRange ? Number(monthlyRmbRange[2]) / 1000 : null,
    salaryMonths: months ? Number(months[1]) : null,
    minDailyRmb: dailyRange ? Number(dailyRange[1]) : null,
    maxDailyRmb: dailyRange ? Number(dailyRange[2]) : null,
    minHourlyRmb: hourlyRange ? Number(hourlyRange[1]) : null,
    maxHourlyRmb: hourlyRange ? Number(hourlyRange[2]) : null,
  };
}

function populationFor(job) {
  const source = `${job.title || ""} ${job.employmentMode || ""} ${job.experience || ""}`;
  if (/实习|intern/i.test(source)) return "internship";
  if (/\d\s*天\s*\/\s*周\s*\d+\s*个?月/.test(source)) return "internship";
  return "nonIntern";
}

function isExperienceLevel(value) {
  return /^(?:经验不限|\d+(?:-\d+)?年|\d+年以上|\d+年以内)$/.test(String(value || "").trim());
}

function isLeadershipTitle(title) {
  return /负责人|总监|副总|总经理|总裁|\bVP\b|\bHead\b|\bChief\b|\bCTO\b|\bCEO\b|\bCOO\b|\bCFO\b|合伙人/i.test(title || "");
}

function classifyTalentRole(title) {
  const value = String(title || "");
  if (/算法|工程|研发|开发|测试|架构|技术|AI视频|Golang|Java|C\+\+|Python/i.test(value)) return "技术研发与质量";
  if (/产品|数据|PMO|项目/i.test(value)) return "产品、数据与项目";
  if (/增长|市场|营销|投放|销售|商务|客服|运营/i.test(value)) return "市场、销售与运营";
  if (/设计|内容|供稿|生态|品牌|公关/i.test(value)) return "创意、内容与生态";
  return "职能与专业支持";
}

function stringValues(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
}

function normalizeSignalIndex(signals) {
  return [...signals.values()]
    .map(signal => ({ ...signal, jobIds: [...signal.jobIds].sort() }))
    .sort((left, right) => (left.value > right.value) - (left.value < right.value));
}

function abilityEvidence(posting) {
  return normalizeDescription(posting.description)
    .split(/(?<=[。；;\n])/)
    .map(text => text.trim())
    .filter(text => text && /负责|主导|推动|制定|搭建|设计|分析|协同|管理|交付|优化|落地|规划|执行|研究|开发/.test(text))
    .map(sourceExcerpt => ({ jobId: posting.jobId, jobUrl: posting.url, sourceExcerpt }));
}

function buildTalentSignals(postings) {
  const skills = new Map();
  const keywords = new Map();
  const abilities = [];
  const add = (index, value, posting, source) => {
    if (!index.has(value)) index.set(value, { value, sources: new Set(), jobIds: new Set() });
    const signal = index.get(value);
    signal.sources.add(source);
    signal.jobIds.add(posting.jobId);
  };
  for (const posting of postings) {
    for (const value of [...posting.skills, ...posting.requirementTags]) {
      add(skills, value, posting, "explicit_skill_or_requirement_tag");
      add(keywords, value, posting, "explicit_skill_or_requirement_tag");
    }
    if (posting.title && posting.title !== "未观察到") add(keywords, posting.title, posting, "job_title");
    abilities.push(...abilityEvidence(posting));
  }
  return {
    skills: normalizeSignalIndex(skills).map(signal => ({ ...signal, sources: [...signal.sources].sort() })),
    abilityEvidence: abilities,
    keywords: normalizeSignalIndex(keywords).map(signal => ({ ...signal, sources: [...signal.sources].sort() })),
  };
}

function dimensionBreakdown(postings, valueFor, order = null) {
  const dimensions = new Map();
  for (const posting of postings) {
    const value = valueFor(posting) || "未观察到";
    if (!dimensions.has(value)) dimensions.set(value, { value, postingCount: 0, jobIds: [] });
    const dimension = dimensions.get(value);
    dimension.postingCount += 1;
    dimension.jobIds.push(posting.jobId);
  }
  return [...dimensions.values()]
    .map(dimension => ({ ...dimension, jobIds: dimension.jobIds.sort() }))
    .sort((left, right) => {
      if (order) return order.indexOf(left.value) - order.indexOf(right.value);
      return right.postingCount - left.postingCount || left.value.localeCompare(right.value, "zh-CN");
    });
}

function quantile(values, proportion) {
  const ordered = [...values].filter(Number.isFinite).sort((left, right) => left - right);
  if (ordered.length === 0) return null;
  const position = (ordered.length - 1) * proportion;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return ordered[low] + ((ordered[high] - ordered[low]) * (position - low));
}

function rangeMidpoint(posting, minimumField, maximumField) {
  const minimum = posting.salary[minimumField];
  const maximum = posting.salary[maximumField];
  return Number.isFinite(minimum) && Number.isFinite(maximum) ? (minimum + maximum) / 2 : null;
}

function midpointBands(postings, minimumField, maximumField, definitions) {
  return definitions
    .map(definition => ({ ...definition, postingCount: 0, jobIds: [] }))
    .map(band => {
      for (const posting of postings) {
        const midpoint = rangeMidpoint(posting, minimumField, maximumField);
        if (midpoint !== null && midpoint >= band.minimum && midpoint < band.maximum) {
          band.postingCount += 1;
          band.jobIds.push(posting.jobId);
        }
      }
      return { value: band.value, postingCount: band.postingCount, jobIds: band.jobIds.sort() };
    })
    .filter(band => band.postingCount > 0);
}

function compensationProfiles(postings, valueFor) {
  const groups = new Map();
  for (const posting of postings) {
    const value = valueFor(posting) || "未观察到";
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(posting);
  }
  return [...groups.entries()]
    .map(([value, groupedPostings]) => {
      const midpoints = groupedPostings.map(posting => rangeMidpoint(posting, "minMonthlyK", "maxMonthlyK"));
      return {
        value,
        postingCount: groupedPostings.length,
        jobIds: groupedPostings.map(posting => posting.jobId).sort(),
        medianMidpointK: quantile(midpoints, 0.5),
        middleFiftyRangeK: { low: quantile(midpoints, 0.25), high: quantile(midpoints, 0.75) },
        withSalaryMonthsCount: groupedPostings.filter(posting => posting.salary.salaryMonths !== null).length,
      };
    })
    .sort((left, right) => right.postingCount - left.postingCount || left.value.localeCompare(right.value, "zh-CN"));
}

function compensationDimensions(postings, nonIntern, internship) {
  const nonInternMonthlyPostings = nonIntern.filter(posting => rangeMidpoint(posting, "minMonthlyK", "maxMonthlyK") !== null);
  const nonInternMidpoints = nonInternMonthlyPostings.map(posting => rangeMidpoint(posting, "minMonthlyK", "maxMonthlyK"));
  const monthlyPostingsWithSalaryMonths = nonInternMonthlyPostings.filter(posting => posting.salary.salaryMonths !== null);
  const annualizedMidpoints = monthlyPostingsWithSalaryMonths
    .map(posting => rangeMidpoint(posting, "minMonthlyK", "maxMonthlyK") * posting.salary.salaryMonths);
  const internshipDailyPostings = internship.filter(posting => rangeMidpoint(posting, "minDailyRmb", "maxDailyRmb") !== null);
  const internshipDailyMidpoints = internshipDailyPostings.map(posting => rangeMidpoint(posting, "minDailyRmb", "maxDailyRmb"));
  return {
    nonInternMonthly: {
      postingCount: nonInternMonthlyPostings.length,
      totalNonInternPostingCount: nonIntern.length,
      withSalaryMonthsCount: nonInternMonthlyPostings.filter(posting => posting.salary.salaryMonths !== null).length,
      withoutSalaryMonthsCount: nonInternMonthlyPostings.filter(posting => posting.salary.salaryMonths === null).length,
      medianMidpointK: quantile(nonInternMidpoints, 0.5),
      middleFiftyRangeK: { low: quantile(nonInternMidpoints, 0.25), high: quantile(nonInternMidpoints, 0.75) },
      salaryMonthDistribution: dimensionBreakdown(monthlyPostingsWithSalaryMonths, posting => `${posting.salary.salaryMonths}薪`),
      annualizedFixedCash: {
        postingCount: annualizedMidpoints.length,
        medianMidpointK: quantile(annualizedMidpoints, 0.5),
        middleFiftyRangeK: { low: quantile(annualizedMidpoints, 0.25), high: quantile(annualizedMidpoints, 0.75) },
      },
      midpointBands: midpointBands(nonInternMonthlyPostings, "minMonthlyK", "maxMonthlyK", [
        { value: "10K以下", minimum: -Infinity, maximum: 10 },
        { value: "10-<15K", minimum: 10, maximum: 15 },
        { value: "15-<20K", minimum: 15, maximum: 20 },
        { value: "20-<30K", minimum: 20, maximum: 30 },
        { value: "30K及以上", minimum: 30, maximum: Infinity },
      ]),
      byRoleFamily: compensationProfiles(nonInternMonthlyPostings, posting => classifyTalentRole(posting.title)),
      byCity: compensationProfiles(nonInternMonthlyPostings, posting => posting.city),
      byExperience: compensationProfiles(nonInternMonthlyPostings.filter(posting => isExperienceLevel(posting.experience)), posting => posting.experience),
    },
    internshipDaily: {
      postingCount: internshipDailyPostings.length,
      totalInternshipPostingCount: internship.length,
      medianMidpointRmb: quantile(internshipDailyMidpoints, 0.5),
      midpointBands: midpointBands(internshipDailyPostings, "minDailyRmb", "maxDailyRmb", [
        { value: "150元/天以下", minimum: -Infinity, maximum: 150 },
        { value: "150-<200元/天", minimum: 150, maximum: 200 },
        { value: "200-<250元/天", minimum: 200, maximum: 250 },
        { value: "250元/天及以上", minimum: 250, maximum: Infinity },
      ]),
    },
    hourlyPostingCount: postings.filter(posting => rangeMidpoint(posting, "minHourlyRmb", "maxHourlyRmb") !== null).length,
  };
}

function workforceDimensions(postings) {
  const countSalaryCoverage = (population) => {
    const comparable = population.filter(posting => posting.salary.minMonthlyK !== null && posting.salary.maxMonthlyK !== null);
    return {
      comparableMonthlyKPostingCount: comparable.length,
      nonComparablePostingCount: population.length - comparable.length,
      totalPostingCount: population.length,
    };
  };
  const nonIntern = postings.filter(posting => posting.employmentPopulation === "nonIntern");
  const internship = postings.filter(posting => posting.employmentPopulation === "internship");
  const experiencedNonIntern = nonIntern.filter(posting => isExperienceLevel(posting.experience));
  const nonstandardExperience = nonIntern.filter(posting => !isExperienceLevel(posting.experience));
  return {
    roleFamilies: dimensionBreakdown(postings, posting => classifyTalentRole(posting.title)),
    cities: dimensionBreakdown(postings, posting => posting.city),
    experience: dimensionBreakdown(experiencedNonIntern, posting => posting.experience),
    experienceUnclassified: dimensionBreakdown(nonstandardExperience, posting => posting.experience),
    internshipCommitment: dimensionBreakdown(internship, posting => posting.experience),
    employment: dimensionBreakdown(postings, posting => posting.employmentPopulation, ["internship", "nonIntern", "unknown"]),
    salaryCoverage: {
      ...countSalaryCoverage(postings),
      nonIntern: countSalaryCoverage(nonIntern),
      internship: countSalaryCoverage(internship),
    },
    compensation: compensationDimensions(postings, nonIntern, internship),
  };
}

function blankSegments() {
  return {
    nonIntern: { postingCount: 0, jdTemplateCount: 0 },
    internship: { postingCount: 0, jdTemplateCount: 0 },
    unknown: { postingCount: 0, jdTemplateCount: 0 },
  };
}

function buildTalentStructure(analysisInput) {
  const jobs = Array.isArray(analysisInput?.jobs) ? analysisInput.jobs : [];
  const uniqueJobIds = new Set();
  const postings = jobs.map((job, index) => {
    const jobId = String(job?.jobId || `unidentified-${index + 1}`);
    uniqueJobIds.add(jobId);
    return {
      jobId,
      title: job?.title || "未观察到",
      url: job?.url || null,
      city: job?.city || null,
      experience: job?.experience || null,
      skills: stringValues(job?.skills),
      requirementTags: stringValues(job?.requirementTags),
      employmentPopulation: populationFor(job || {}),
      salary: parseSalary(job?.salary),
      description: typeof job?.description === "string" ? job.description : "",
    };
  });
  const populationSegments = blankSegments();
  for (const posting of postings) populationSegments[posting.employmentPopulation].postingCount += 1;

  const unformedPostings = [];
  const groups = new Map();
  for (const posting of postings) {
    const normalizedDescription = normalizeDescription(posting.description);
    if (!normalizedDescription) {
      unformedPostings.push({ jobId: posting.jobId, reason: "JD为空" });
      continue;
    }
    const key = `${posting.employmentPopulation}\u0000${normalizedDescription}`;
    if (!groups.has(key)) groups.set(key, { population: posting.employmentPopulation, description: normalizedDescription, postings: [] });
    groups.get(key).postings.push(posting);
  }
  const templates = [...groups.values()].map((group, index) => {
    populationSegments[group.population].jdTemplateCount += 1;
    return {
      templateId: `jd-template-${index + 1}`,
      population: group.population,
      representativeJobId: group.postings[0].jobId,
      postingJobIds: group.postings.map(posting => posting.jobId),
      postingCount: group.postings.length,
      titles: [...new Set(group.postings.map(posting => posting.title))],
      description: group.description,
    };
  });

  const observedSalaryPostings = postings.filter(posting => posting.salary.minMonthlyK !== null && posting.salary.maxMonthlyK !== null);
  const salaryRanking = observedSalaryPostings
    .filter(posting => posting.employmentPopulation === "nonIntern")
    .sort((left, right) => right.salary.maxMonthlyK - left.salary.maxMonthlyK || right.salary.minMonthlyK - left.salary.minMonthlyK || left.jobId.localeCompare(right.jobId))
    .map((posting, index) => ({
      jobId: posting.jobId,
      rank: index + 1,
      title: posting.title,
      city: posting.city,
      experience: posting.experience,
      salary: posting.salary,
    }));
  const leadershipTitleJobIds = postings
    .filter(posting => posting.employmentPopulation === "nonIntern" && isLeadershipTitle(posting.title))
    .map(posting => posting.jobId);

  return {
    schemaVersion: 1,
    snapshot: analysisInput?.snapshot || {},
    summary: {
      postingCount: postings.length,
      uniqueJobIdCount: uniqueJobIds.size,
      jdTemplateCount: templates.length,
      populationSegments,
      salaryCoverage: { observedPostingCount: observedSalaryPostings.length, totalPostingCount: postings.length },
    },
    postings,
    templates,
    attentionSignals: { leadershipTitleJobIds, salaryRanking },
    talentSignals: buildTalentSignals(postings),
    workforceDimensions: workforceDimensions(postings),
    internshipPostings: postings.filter(posting => posting.employmentPopulation === "internship"),
    unformedPostings,
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--output");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (!inputPath || !outputPath) throw new Error("用法: node build-talent-structure.mjs --input <analysis-input.json> --output <talent-structure.json>");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, `${JSON.stringify(buildTalentStructure(input), null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { buildTalentStructure, classifyTalentRole };
