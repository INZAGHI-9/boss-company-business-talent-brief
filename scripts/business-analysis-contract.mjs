const FACT_TYPES = new Set(["offer", "customer_segment", "business_scenario", "commercial_route", "delivery_motion", "operating_action", "talent_requirement"]);
const CLASSIFICATIONS = new Set(["external_offer", "internal_capability", "unclear"]);
const CONFIDENCE = new Set(["explicit", "qualified", "ambiguous"]);
const THEME_STATUSES = new Set(["fact", "hypothesis", "watch"]);
const DIMENSIONS = ["commercial", "product", "talent"];
const BASELINE_RELATIONS = new Set(["deepens", "extends", "independent", "contradicts"]);
const REVIEW_DIMENSIONS = ["specificity", "grounding", "reasoning", "actionability", "compression"];
const REVIEW_CHECKS = ["jdGrounded", "businessReading", "coherentGrouping", "productLineBoundary", "baselineCoherence", "depth", "uncertainty"];
const WORKFLOW_HOSTS = new Set(["codex", "workbuddy"]);
const WORKFLOW_VERDICTS = new Set(["pass", "revise"]);
const COMMON_ANCHOR_TYPES = {
  commercial: new Set(["customer", "market", "offer", "delivery_object", "regional_operation"]),
  talent: new Set(["business_object", "capability_domain", "delivery_object", "manager", "responsibility_object"]),
};
const SECONDARY_ANCHOR_TYPES = new Set(["user_task", "mechanism", "commercial_interface", "delivery_object", "owner"]);
const GENERIC_ANCHORS = new Set(["产品", "负责", "岗位"]);
const COVERAGE_LENSES = {
  commercial: [
    ["customer_market", /面向(?:品牌)?客户|面向全球用户|SMB商家|海外用户/],
    ["commercial_route", /订阅.*(?:收入|业务)|商业化.*(?:策略|增长)|广告.*(?:会员|投放)|销售.*(?:方案|服务)|付费转化/],
    ["delivery_result", /交付.*(?:方案|服务)|收益评估|订单.*支付|用户生命周期.*(?:留存|续费)|全用户路径/],
  ],
  product: [
    ["user_scene", /(?:使用|创作|业务)场景|用户任务|用户旅程/],
    ["mechanism_iteration", /全生命周期|从需求定义.*上线|产品.*(?:策略|迭代|上线)|能力.*(?:规划|落地)/],
    ["commercial_interface", /收入负责|付费转化|订阅.*收入|广告.*会员|收益评估/],
    ["unassigned_technology", /AI (?:功能|能力)|AIGC.*(?:算法|生成)|Agent.*(?:应用|系统)|大模型.*(?:应用|模型)/],
  ],
  talent: [
    ["management_accountability", /负责人|团队搭建|核心指标负责|全生命周期管理|战略落地/],
    ["product_business", /全生命周期管理|业务场景.*(?:需求|解决)|项目交付|产品.*(?:策略|迭代|上线)/],
    ["engineering_delivery", /架构设计|高并发.*高可用|上线部署.*服务|生产环境.*(?:稳定|性能)|工程.*交付/],
    ["algorithm_data", /算法.*(?:模型|落地|迭代)|(?:大模型|Agent|AIGC).*(?:应用|技术|项目)|深度学习.*(?:模型|算法)/],
    ["growth_creative", /增长.*(?:运营|策略|闭环)|商业化.*(?:变现|产品)|广告创意|投放.*(?:渠道|管理)|付费转化/],
  ],
};

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function normalizeText(value) {
  return typeof value === "string" && hasText(value) ? value.trim() : "";
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !hasText(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const canonical = new Date(timestamp).toISOString();
  return value.includes(".") ? canonical === value : canonical === `${value.slice(0, -1)}.000Z`;
}

function createAnalysisInput({ candidate, coverage, capturedAt, jobs, entityResolution = null }) {
  return {
    schemaVersion: 1,
    snapshot: { company: candidate.company, brandId: candidate.brandId, capturedAt, coverage, entityResolution },
    jobs: jobs.map(job => ({
      jobId: job.jobId, title: job.title, url: job.finalUrl || job.jobLink || null,
      description: job.description || "", city: job.city || null, experience: job.experience || null,
      salary: job.salary || null, employmentMode: job.employmentMode || null,
      skills: job.skills || [], requirementTags: job.requirementTags || [],
    })),
  };
}

function detailCoverageCandidates(input, dimension) {
  return Object.fromEntries(COVERAGE_LENSES[dimension].map(([lens, pattern]) => [lens,
    input.jobs.filter(job => pattern.test(job.description)).map(job => job.jobId),
  ]));
}

function validateDetailCoverage(dimension, detail, input, screenByJobId, entryJobIds, coveredIds, unassignedIds, errors) {
  const coverage = detail.coverage;
  const lenses = COVERAGE_LENSES[dimension];
  if (!coverage || !Array.isArray(coverage.lenses) || coverage.lenses.length !== lenses.length) {
    errors.push(`detailAnalysis.${dimension}.coverage 必须覆盖本维度全部信号`);
    return;
  }
  const candidates = detailCoverageCandidates(input, dimension);
  const seen = new Set();
  const represented = new Set([...coveredIds, ...unassignedIds]);
  for (const [lens] of lenses) {
    const item = coverage.lenses.find(candidate => candidate?.id === lens);
    if (!item || seen.has(lens)) {
      errors.push(`detailAnalysis.${dimension}.coverage 缺少或重复 ${lens}`);
      continue;
    }
    seen.add(lens);
    const expected = candidates[lens];
    for (const jobId of expected) {
      if (screenByJobId.get(jobId)?.disposition === "excluded") {
        errors.push(`detailAnalysis.${dimension}.coverage.${lens} 候选 JD 不得标记 excluded`);
      }
    }
    const declared = [...new Set(item.candidateJobIds || [])];
    if (declared.length !== expected.length || declared.some(jobId => !expected.includes(jobId))) {
      errors.push(`detailAnalysis.${dimension}.coverage.${lens} 必须如实列出 JD 信号`);
    }
    if (!hasText(item.note)) errors.push(`detailAnalysis.${dimension}.coverage.${lens} 缺少 note`);
    if (!expected.length) {
      if (item.status !== "not_detected" || (item.representativeJobIds || []).length) errors.push(`detailAnalysis.${dimension}.coverage.${lens} 无信号时必须标记 not_detected`);
      continue;
    }
    if (item.status !== "represented" || !Array.isArray(item.representativeJobIds) || !item.representativeJobIds.length) {
      errors.push(`detailAnalysis.${dimension}.coverage.${lens} 检出信号时必须给出代表岗位`);
      continue;
    }
    for (const jobId of item.representativeJobIds) {
      if (!expected.includes(jobId) || !represented.has(jobId)) {
        errors.push(`detailAnalysis.${dimension}.coverage.${lens} 的代表岗位必须进入专题或待归属信号`);
      }
    }
  }
}

function validateQuotedEvidence(evidence, { prefix, jobsById, allowedJobIds, value = "", requireEveryJob = false }, errors) {
  if (!Array.isArray(evidence) || !evidence.length) {
    errors.push(`${prefix} 必须提供 JD evidence`);
    return;
  }
  const cited = new Set();
  for (const item of evidence) {
    const job = jobsById.get(item?.jobId);
    if (!job || !allowedJobIds.has(item.jobId)) {
      errors.push(`${prefix} 的 evidence 只能引用专题纳入岗位`);
      continue;
    }
    cited.add(item.jobId);
    if (!hasText(item?.sourceText) || !job.description.includes(item.sourceText)) errors.push(`${prefix} 的 sourceText 不存在于关联 JD`);
    if (value && !String(item?.sourceText || "").includes(value)) errors.push(`${prefix} 的 JD evidence 必须包含 ${value}`);
  }
  if (requireEveryJob && [...allowedJobIds].some(jobId => !cited.has(jobId))) errors.push(`${prefix} 必须覆盖每个纳入岗位`);
}

function validateAnchor(anchor, { prefix, jobsById, jobIds, types, productLineName = "" }, errors) {
  if (!anchor || !types.has(anchor.type) || !hasText(anchor.value) || GENERIC_ANCHORS.has(anchor.value)) {
    errors.push(`${prefix} 必须包含允许的 type 和非泛词 value`);
  }
  if (productLineName && anchor?.value === productLineName) errors.push(`${prefix} 不得复用父产品线名作为第二锚点`);
  validateQuotedEvidence(anchor?.evidence, {
    prefix, jobsById, allowedJobIds: jobIds, value: anchor?.value, requireEveryJob: true,
  }, errors);
}

function validateTopic(topic, { dimension, prefix, themesById, claimsById, effectiveClaimsById, entriesByJobId, jobsById, allowedJobIds = null, productLineName = "" }, errors) {
  for (const field of ["id", "baselineRelation", "title", "businessReading", "validationBoundary"]) {
    if (!hasText(topic?.[field])) errors.push(`${prefix} 缺少 ${field}`);
  }
  if (!BASELINE_RELATIONS.has(topic?.baselineRelation)) errors.push(`${prefix} 的 baselineRelation 无效`);
  const theme = themesById.get(topic?.baselineThemeId);
  if (topic?.baselineRelation !== "independent" && (!theme || !theme.dimensions.includes(dimension))) errors.push(`${prefix} 的 baselineThemeId 必须关联本维度主题`);
  if (topic?.baselineRelation === "contradicts") {
    const revision = topic?.baselineRevision;
    const claim = claimsById.get(revision?.claimId);
    const effective = effectiveClaimsById.get(revision?.claimId);
    if (!revision || !["replace", "downgrade"].includes(revision.action) || !claim || claim.themeId !== topic.baselineThemeId
      || !THEME_STATUSES.has(revision.status) || !hasText(revision.headline) || !hasText(revision.reason)) {
      errors.push(`${prefix} 的 contradicts 必须提供结构化 baselineRevision`);
    } else if (!effective || effective.status !== revision.status || effective.headline !== revision.headline) {
      errors.push(`${prefix} 的 baselineRevision 必须回写到 effectiveBaselineClaims`);
    }
  }
  const jobIds = [...new Set(topic?.jobIds || [])];
  if (!jobIds.length || jobIds.length !== (topic?.jobIds || []).length) errors.push(`${prefix} 必须提供唯一 jobIds`);
  const citedJobIds = new Set(jobIds);
  for (const jobId of citedJobIds) {
    if (!entriesByJobId.has(jobId) || (allowedJobIds && !allowedJobIds.has(jobId))) errors.push(`${prefix} 只能引用本专题允许的 included JD`);
  }
  if (!Array.isArray(topic?.jdFacts) || !topic.jdFacts.length) {
    errors.push(`${prefix} 缺少 jdFacts`);
  } else {
    validateQuotedEvidence(topic.jdFacts, { prefix: `${prefix}.jdFacts`, jobsById, allowedJobIds: citedJobIds, requireEveryJob: true }, errors);
    if (topic.jdFacts.some(fact => !hasText(fact?.role))) errors.push(`${prefix}.jdFacts 缺少 role`);
  }
  if (citedJobIds.size > 1) {
    if (dimension === "product") {
      validateAnchor(topic?.secondaryAnchor, {
        prefix: `${prefix}.secondaryAnchor`, jobsById, jobIds: citedJobIds, types: SECONDARY_ANCHOR_TYPES, productLineName,
      }, errors);
    } else {
      validateAnchor(topic?.commonAnchor, {
        prefix: `${prefix}.commonAnchor`, jobsById, jobIds: citedJobIds, types: COMMON_ANCHOR_TYPES[dimension],
      }, errors);
    }
  }
  const businessAnchor = productLineName || (dimension === "product" ? topic?.secondaryAnchor?.value : topic?.commonAnchor?.value);
  if (hasText(businessAnchor) && !String(topic?.businessReading || "").includes(businessAnchor)) {
    errors.push(`${prefix}.businessReading 必须围绕 JD 支撑的业务对象或产品线`);
  }
  if (!/(?:JD 未|当前不能|尚不能|待确认|无法判断|未说明)/.test(String(topic?.validationBoundary || ""))) {
    errors.push(`${prefix}.validationBoundary 必须说明 JD 证据的缺口`);
  }
  if (!Array.isArray(topic?.boundaries) || !topic.boundaries.some(hasText)) errors.push(`${prefix} 缺少 boundaries`);
}

function validateUnassignedSignals(signals, { prefix, jobsById, forbiddenJobIds = new Set() }, errors) {
  if (!Array.isArray(signals)) {
    errors.push(`${prefix} 必须为数组`);
    return new Set();
  }
  const ids = new Set();
  for (const signal of signals) {
    const job = jobsById.get(signal?.jobId);
    if (!job || ids.has(signal.jobId)) errors.push(`${prefix} 包含无效或重复 jobId`);
    ids.add(signal?.jobId);
    if (forbiddenJobIds.has(signal?.jobId)) errors.push(`${prefix} 不得重复归入正式专题的 JD`);
    if (!hasText(signal?.reason)) errors.push(`${prefix} 缺少 reason`);
    if (!hasText(signal?.sourceText) || !job?.description.includes(signal.sourceText)) errors.push(`${prefix} 的 sourceText 不存在于关联 JD`);
  }
  return ids;
}

function validateDetailAnalysis(input, analysis, errors) {
  if (!analysis?.detailAnalysis || typeof analysis.detailAnalysis !== "object") {
    errors.push("business-analysis.json detailAnalysis 必须为对象");
    return;
  }
  const jobsById = new Map(input.jobs.map(job => [job.jobId, job]));
  const themesById = new Map(analysis.themes.map(theme => [theme.id, theme]));
  const claimsById = new Map(analysis.claims.map(claim => [claim.id, claim]));
  const effectiveClaimsById = new Map((analysis.effectiveBaselineClaims || []).map(claim => [claim.claimId, claim]));
  const fieldsByDimension = {
    commercial: ["businessLine", "target", "motion", "outcome", "collaborator"],
    product: ["productLine", "productObject", "scenario", "mechanism", "commercialInterface", "supportingFunction"],
    talent: ["businessLine", "capabilityUnit", "roleType", "seniority", "responsibilityObject", "skills", "aiRole"],
  };
  for (const dimension of DIMENSIONS) {
    const detail = analysis.detailAnalysis[dimension];
    if (!detail || typeof detail !== "object") {
      errors.push(`detailAnalysis.${dimension} 必须为对象`);
      continue;
    }
    if (!Array.isArray(detail.screening)) {
      errors.push(`detailAnalysis.${dimension}.screening 必须为数组`);
      continue;
    }
    const screenByJobId = new Map();
    for (const screen of detail.screening) {
      if (!jobsById.has(screen?.jobId) || screenByJobId.has(screen.jobId)) {
        errors.push(`detailAnalysis.${dimension}.screening 包含无效或重复 jobId`);
        continue;
      }
      screenByJobId.set(screen.jobId, screen);
      if (!["included", "excluded", "unclear"].includes(screen?.disposition)) errors.push(`detailAnalysis.${dimension}.screening 的 disposition 无效`);
      if (!hasText(screen?.reason)) errors.push(`detailAnalysis.${dimension}.screening 缺少 reason`);
      const job = jobsById.get(screen.jobId);
      if (screen.disposition !== "excluded" && (!hasText(screen?.sourceText) || !job.description.includes(screen.sourceText))) errors.push(`detailAnalysis.${dimension}.screening 的 sourceText 不存在于关联 JD`);
    }
    if (screenByJobId.size !== jobsById.size) errors.push(`detailAnalysis.${dimension}.screening 必须覆盖全部 JD`);
    if (!Array.isArray(detail.entries)) errors.push(`detailAnalysis.${dimension}.entries 必须为数组`);
    const entryJobIds = new Set();
    for (const entry of detail.entries || []) {
      if (!jobsById.has(entry?.jobId) || entryJobIds.has(entry.jobId)) {
        errors.push(`detailAnalysis.${dimension}.entries 包含无效或重复 jobId`);
        continue;
      }
      entryJobIds.add(entry.jobId);
      if (screenByJobId.get(entry.jobId)?.disposition !== "included") errors.push(`detailAnalysis.${dimension}.entries 只能引用 included JD`);
      let knownFieldCount = 0;
      for (const field of fieldsByDimension[dimension]) {
        const value = entry[field];
        const valid = field === "skills" ? Array.isArray(value) : hasText(value);
        if (!valid) errors.push(`detailAnalysis.${dimension}.entries 缺少 ${field}`);
        const known = field === "skills" ? Array.isArray(value) && value.some(item => item !== "unknown") : value !== "unknown";
        if (known) knownFieldCount += 1;
        if (known) {
          const evidence = String(entry?.evidence?.[field] || "").trim();
          if (!evidence || !jobsById.get(entry.jobId).description.includes(evidence)) errors.push(`detailAnalysis.${dimension}.entries.${field} 的 evidence 不存在于关联 JD`);
        }
      }
      if (!knownFieldCount) errors.push(`detailAnalysis.${dimension}.entries.${entry.jobId} 至少保留一项可回溯 JD 字段`);
    }
    const includedJobIds = [...screenByJobId.values()].filter(screen => screen.disposition === "included").map(screen => screen.jobId);
    if (includedJobIds.some(jobId => !entryJobIds.has(jobId)) || entryJobIds.size !== includedJobIds.length) errors.push(`detailAnalysis.${dimension}.entries 必须覆盖全部 included JD`);
    const entriesByJobId = new Map((detail.entries || []).map(entry => [entry.jobId, entry]));
    const topicIds = new Set();
    const validateTopics = (topics, field, allowedJobIds = null, productLineName = "") => {
      if (!Array.isArray(topics)) {
        errors.push(`detailAnalysis.${dimension}.${field} 必须为数组`);
        return;
      }
      for (const topic of topics) {
        if (!topic?.id || topicIds.has(topic.id)) errors.push(`detailAnalysis.${dimension} 的专题 id 必须唯一`);
        topicIds.add(topic?.id);
        validateTopic(topic, { dimension, prefix: `detailAnalysis.${dimension}.${field}.${topic?.id || "未提供"}`, themesById, claimsById, effectiveClaimsById, entriesByJobId, jobsById, allowedJobIds, productLineName }, errors);
      }
    };
    if (dimension === "commercial") {
      validateTopics(detail.commercialThreads, "commercialThreads");
      const unassignedIds = validateUnassignedSignals(detail.unassignedSignals, { prefix: "detailAnalysis.commercial.unassignedSignals", jobsById }, errors);
      for (const signal of detail.unassignedSignals || []) {
        if (screenByJobId.get(signal?.jobId)?.disposition !== "unclear") {
          errors.push("detailAnalysis.commercial.unassignedSignals 只能引用 unclear JD");
        }
      }
      const coveredIds = new Set((detail.commercialThreads || []).flatMap(topic => (topic.jdFacts || []).map(fact => fact.jobId)));
      for (const jobId of entryJobIds) {
        if (!coveredIds.has(jobId) && !unassignedIds.has(jobId)) errors.push("detailAnalysis.commercial 的 included JD 必须进入专题或待归属信号");
      }
      validateDetailCoverage(dimension, detail, input, screenByJobId, entryJobIds, coveredIds, unassignedIds, errors);
      continue;
    }
    if (dimension === "talent") {
      validateTopics(detail.capabilityThreads, "capabilityThreads");
      const unassignedIds = validateUnassignedSignals(detail.unassignedSignals, { prefix: "detailAnalysis.talent.unassignedSignals", jobsById }, errors);
      for (const signal of detail.unassignedSignals || []) {
        if (screenByJobId.get(signal?.jobId)?.disposition !== "unclear") {
          errors.push("detailAnalysis.talent.unassignedSignals 只能引用 unclear JD");
        }
      }
      const coveredIds = new Set((detail.capabilityThreads || []).flatMap(topic => (topic.jdFacts || []).map(fact => fact.jobId)));
      for (const jobId of entryJobIds) {
        if (!coveredIds.has(jobId) && !unassignedIds.has(jobId)) errors.push("detailAnalysis.talent 的 included JD 必须进入专题或待归属信号");
      }
      validateDetailCoverage(dimension, detail, input, screenByJobId, entryJobIds, coveredIds, unassignedIds, errors);
      continue;
    }
    if (!Array.isArray(detail.productLines)) {
      errors.push("detailAnalysis.product.productLines 必须为数组");
      continue;
    }
    const productLineJobIds = new Set();
    const productLineIds = new Set();
    for (const line of detail.productLines) {
      const prefix = `detailAnalysis.product.productLines.${line?.id || "未提供"}`;
      if (!line?.id || productLineIds.has(line.id)) errors.push("detailAnalysis.product.productLines 的 id 必须唯一");
      productLineIds.add(line?.id);
      if (!hasText(line?.name)) errors.push(`${prefix} 缺少 name`);
      if (!Array.isArray(line?.deepDives) || !line.deepDives.length) errors.push(`${prefix} 必须提供 deepDives`);
      const lineJobIds = new Set((line?.deepDives || []).flatMap(topic => topic?.jobIds || []));
      for (const jobId of lineJobIds) {
        productLineJobIds.add(jobId);
        if (!entriesByJobId.has(jobId) || entriesByJobId.get(jobId).productLine !== line.name) errors.push(`${prefix} 的深挖只能引用该产品线的 included JD`);
      }
      validateQuotedEvidence(line?.lineEvidence, {
        prefix: `${prefix} 的每个纳入岗位产品线`, jobsById, allowedJobIds: lineJobIds, value: line?.name, requireEveryJob: true,
      }, errors);
      validateTopics(line?.deepDives, `productLines.${line?.id || "未提供"}.deepDives`, lineJobIds, line?.name || "");
    }
    const unassignedIds = validateUnassignedSignals(detail.unassignedSignals, { prefix: "detailAnalysis.product.unassignedSignals", jobsById, forbiddenJobIds: productLineJobIds }, errors);
    for (const signal of detail.unassignedSignals || []) {
      const screen = screenByJobId.get(signal?.jobId);
      const entry = entriesByJobId.get(signal?.jobId);
      if (screen?.disposition !== "unclear" || (entry && entry.productLine !== "unknown")) {
        errors.push("detailAnalysis.product.unassignedSignals 只能引用产品线未明确的 unclear JD");
      }
    }
    for (const jobId of entryJobIds) {
      if (!productLineJobIds.has(jobId)) errors.push("detailAnalysis.product 的每个 included entry 必须属于明确产品线并由 deepDive 引用");
    }
    for (const screen of screenByJobId.values()) {
      if (screen.disposition !== "excluded" && !productLineJobIds.has(screen.jobId) && !unassignedIds.has(screen.jobId)) errors.push("detailAnalysis.product 未归入产品线的 JD 必须放入 unassignedSignals");
    }
    validateDetailCoverage(dimension, detail, input, screenByJobId, entryJobIds, productLineJobIds, unassignedIds, errors);
  }
}

function validateEffectiveBaselineClaims(analysis, errors) {
  if (!Array.isArray(analysis?.effectiveBaselineClaims)) {
    errors.push("business-analysis.json effectiveBaselineClaims 必须为数组");
    return;
  }
  const claimIds = new Set();
  const baselineClaimIds = new Set(analysis.claims.map(claim => claim.id));
  for (const effective of analysis.effectiveBaselineClaims) {
    if (!baselineClaimIds.has(effective?.claimId) || claimIds.has(effective.claimId)) errors.push("effectiveBaselineClaims 必须唯一引用已有基线命题");
    claimIds.add(effective?.claimId);
    if (!THEME_STATUSES.has(effective?.status) || !hasText(effective?.headline)) errors.push("effectiveBaselineClaims 缺少有效 status 或 headline");
  }
  if ([...baselineClaimIds].some(id => !claimIds.has(id))) errors.push("effectiveBaselineClaims 必须覆盖全部基线命题");
}

function validateBusinessAnalysis(input, analysis) {
  const errors = [];
  if (!analysis || analysis.schemaVersion !== 1) errors.push("business-analysis.json schemaVersion 必须为 1");
  if (!analysis?.snapshot || analysis.snapshot.brandId !== input?.snapshot?.brandId) errors.push("business-analysis.json snapshot.brandId 必须与 analysis-input.json 一致");
  if (!analysis?.snapshot || analysis.snapshot.capturedAt !== input?.snapshot?.capturedAt) errors.push("business-analysis.json snapshot.capturedAt 必须与 analysis-input.json 一致");
  if (!hasText(analysis?.author)) errors.push("business-analysis.json 缺少 author");
  if (!Array.isArray(analysis?.facts)) errors.push("business-analysis.json facts 必须为数组");
  if (!Array.isArray(analysis?.themes)) errors.push("business-analysis.json themes 必须为数组");
  if (!Array.isArray(analysis?.claims)) errors.push("business-analysis.json claims 必须为数组");
  if (errors.length) return { ok: false, errors };
  const jobsById = new Map(input.jobs.map(job => [job.jobId, job]));
  const formalThemes = analysis.themes.filter(theme => theme?.status !== "watch");
  const watchThemes = analysis.themes.filter(theme => theme?.status === "watch");
  if (formalThemes.length > 3) errors.push("正式业务主题最多 3 条");
  if (watchThemes.length > 5) errors.push("待观察业务主题最多 5 条");
  const factIds = new Set();
  for (const fact of analysis.facts) {
    if (!fact?.id || factIds.has(fact.id)) errors.push(`事实 id 必须唯一：${fact?.id || "未提供"}`);
    factIds.add(fact?.id);
    if (!FACT_TYPES.has(fact?.type)) errors.push(`事实 ${fact?.id || "未提供"} 的 type 无效`);
    if (!CLASSIFICATIONS.has(fact?.classification)) errors.push(`事实 ${fact?.id || "未提供"} 的 classification 无效`);
    if (!CONFIDENCE.has(fact?.confidence)) errors.push(`事实 ${fact?.id || "未提供"} 的 confidence 无效`);
    if (!hasText(fact?.value)) errors.push(`事实 ${fact?.id || "未提供"} 缺少 value`);
    const job = jobsById.get(fact?.jobId);
    if (!job || !hasText(fact?.sourceText) || !job.description.includes(fact.sourceText)) errors.push(`事实 ${fact?.id || "未提供"} 的 sourceText 不存在于关联 JD`);
  }
  const themeIds = new Set();
  for (const theme of analysis.themes) {
    if (!theme?.id || themeIds.has(theme.id)) errors.push(`主题 id 必须唯一：${theme?.id || "未提供"}`);
    themeIds.add(theme?.id);
    if (!hasText(theme?.label) || !THEME_STATUSES.has(theme?.status)) errors.push(`主题 ${theme?.id || "未提供"} 的标签或 status 无效`);
    if (!Array.isArray(theme?.dimensions) || !theme.dimensions.length || theme.dimensions.some(dimension => !DIMENSIONS.includes(dimension))) errors.push(`主题 ${theme?.id || "未提供"} 的 dimensions 无效`);
    const evidence = (theme?.evidenceFactIds || []).map(id => analysis.facts.find(fact => fact.id === id)).filter(Boolean);
    if (!Array.isArray(theme?.evidenceFactIds) || evidence.length !== theme.evidenceFactIds.length || !evidence.length) errors.push(`主题 ${theme?.id || "未提供"} 引用了不存在的事实`);
    if (theme?.dimensions?.includes("commercial") && !evidence.some(fact => fact.classification === "external_offer")) errors.push(`商业主题 ${theme?.id || "未提供"} 必须至少有一条 external_offer 事实`);
  }
  const claimsById = new Set();
  for (const claim of analysis.claims) {
    if (!claim?.id || claimsById.has(claim.id)) errors.push(`命题 id 必须唯一：${claim?.id || "未提供"}`);
    claimsById.add(claim?.id);
    const theme = analysis.themes.find(item => item.id === claim?.themeId);
    if (!theme || !DIMENSIONS.includes(claim?.dimension) || !theme.dimensions.includes(claim.dimension)) errors.push(`命题 ${claim?.id || "未提供"} 的 themeId 或 dimension 无效`);
    if (claim?.status !== theme?.status) errors.push(`命题 ${claim?.id || "未提供"} 的 status 必须与关联主题一致`);
    for (const field of ["headline", "relationship", "implication", "validationQuestion"]) if (!hasText(claim?.[field])) errors.push(`命题 ${claim?.id || "未提供"} 缺少 ${field}`);
  }
  validateEffectiveBaselineClaims(analysis, errors);
  validateDetailAnalysis(input, analysis, errors);
  return { ok: errors.length === 0, errors };
}

function topicsForDimension(analysis, dimension) {
  const detail = analysis?.detailAnalysis?.[dimension] || {};
  if (dimension === "commercial") return detail.commercialThreads || [];
  if (dimension === "talent") return detail.capabilityThreads || [];
  return (detail.productLines || []).flatMap(line => (line.deepDives || []).map(topic => ({ ...topic, productLineName: line.name })));
}

function validateContentReview(review, analysis) {
  const errors = [];
  if (!review || review.schemaVersion !== 1) errors.push("content-review.json schemaVersion 必须为 1");
  if (!hasText(review?.author) || review.author !== analysis?.author) errors.push("content-review.json author 必须匹配 analysis.author");
  if (!hasText(review?.reviewer) || review.reviewer === analysis?.author) errors.push("content-review.json reviewer 必须独立于 analysis.author");
  if (!review?.dimensions || typeof review.dimensions !== "object") return { ok: false, errors: [...errors, "content-review.json dimensions 必须为对象"] };
  for (const dimension of DIMENSIONS) {
    const prefix = `content-review.json.dimensions.${dimension}`;
    const dimensionReview = review.dimensions[dimension];
    const topics = topicsForDimension(analysis, dimension);
    const topicIds = new Set(topics.map(topic => topic.id));
    if (!dimensionReview || typeof dimensionReview !== "object") {
      errors.push(`${prefix} 必须为对象`);
      continue;
    }
    if (dimensionReview.status !== "pass") errors.push(`${prefix}.status 必须为 pass`);
    if (!Array.isArray(dimensionReview.findings)) errors.push(`${prefix}.findings 必须为数组`);
    const coverage = analysis.detailAnalysis?.[dimension]?.coverage?.lenses || [];
    const coverageReview = dimensionReview.coverageReview;
    if (!coverageReview || coverageReview.verdict !== "pass" || !Array.isArray(coverageReview.lensReviews) || coverageReview.lensReviews.length !== coverage.length) {
      errors.push(`${prefix}.coverageReview 必须独立复核全部覆盖信号`);
    } else {
      const reviewedLenses = new Set();
      for (const lens of coverage) {
        const lensReview = coverageReview.lensReviews.find(item => item?.id === lens.id);
        if (!lensReview || reviewedLenses.has(lens.id) || lensReview.verdict !== "pass" || !hasText(lensReview.note)) {
          errors.push(`${prefix}.coverageReview 必须通过并说明 ${lens.id}`);
          continue;
        }
        reviewedLenses.add(lens.id);
        const expected = [...new Set(lens.representativeJobIds || [])];
        const actual = [...new Set(lensReview.representativeJobIds || [])];
        if (expected.length !== actual.length || expected.some(jobId => !actual.includes(jobId))) errors.push(`${prefix}.coverageReview.${lens.id} 必须复核同一代表岗位`);
      }
    }
    if (!Array.isArray(dimensionReview.topicReviews) || dimensionReview.topicReviews.length !== topicIds.size) {
      errors.push(`${prefix}.topicReviews 必须覆盖每个专题`);
      continue;
    }
    const reviewed = new Set();
    for (const topicReview of dimensionReview.topicReviews) {
      const topic = topics.find(item => item.id === topicReview?.topicId);
      if (!topicIds.has(topicReview?.topicId) || reviewed.has(topicReview.topicId)) errors.push(`${prefix}.topicReviews 包含无效或重复 topicId`);
      reviewed.add(topicReview?.topicId);
      if (topicReview?.verdict !== "pass") errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"}.verdict 必须为 pass`);
      if (!Array.isArray(topicReview?.findings)) errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"}.findings 必须为数组`);
      for (const check of REVIEW_CHECKS) if (topicReview?.checks?.[check] !== "pass") errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"}.checks.${check} 必须为 pass`);
      for (const check of REVIEW_CHECKS) if (!hasText(topicReview?.checkNotes?.[check])) errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"}.checkNotes.${check} 必须非空`);
      const sourceTexts = (topic?.jdFacts || []).map(fact => fact.sourceText).filter(hasText);
      if (!sourceTexts.some(sourceText => String(topicReview?.checkNotes?.jdGrounded || "").includes(sourceText))) {
        errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"}.checkNotes.jdGrounded 必须引用同专题 JD 原文`);
      }
      const anchor = dimension === "product" ? topic?.secondaryAnchor : topic?.commonAnchor;
      if (topic?.jobIds?.length > 1 && !String(topicReview?.checkNotes?.coherentGrouping || "").includes(anchor?.value || "")) {
        errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"}.checkNotes 必须说明共同锚点的业务含义`);
      }
      if (!hasText(topicReview?.summary) && !topicReview?.findings?.some(hasText)) errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"} 必须提供 summary 或 findings`);
      if (!Array.isArray(topicReview?.evidence) || !topicReview.evidence.some(item => topic?.jdFacts?.some(fact => fact.jobId === item?.jobId && fact.sourceText.includes(item?.sourceText)))) {
        errors.push(`${prefix}.topicReviews.${topicReview?.topicId || "未提供"} 必须提供同专题 JD evidence`);
      }
    }
    if ([...topicIds].some(id => !reviewed.has(id))) errors.push(`${prefix}.topicReviews 必须覆盖每个专题`);
  }
  return { ok: errors.length === 0, errors };
}

function validateWorkflowManifest(input, analysis, contentReview, manifest) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1) errors.push("workflow-manifest.json schemaVersion 必须为 1");
  if (!WORKFLOW_HOSTS.has(manifest?.host)) errors.push("workflow-manifest.json host 必须为 codex 或 workbuddy");
  if (manifest?.snapshot?.brandId !== input?.snapshot?.brandId || manifest?.snapshot?.capturedAt !== input?.snapshot?.capturedAt) {
    errors.push("workflow-manifest.json snapshot 必须与 analysis-input.json 一致");
  }
  const analysisRun = manifest?.analysisRun;
  const reviewRun = manifest?.reviewRun;
  if (!analysisRun || typeof analysisRun !== "object") {
    errors.push("workflow-manifest.json 缺少 analysisRun");
  } else {
    if (!normalizeText(analysisRun.taskId)) errors.push("workflow-manifest.json analysisRun 缺少 taskId");
    if (!normalizeText(analysisRun.author)) errors.push("workflow-manifest.json analysisRun 缺少 author");
    if (!isIsoTimestamp(analysisRun.completedAt)) errors.push("workflow-manifest.json analysisRun.completedAt 必须为非空 ISO 时间戳");
    if (analysisRun.startedAt !== undefined && !isIsoTimestamp(analysisRun.startedAt)) errors.push("workflow-manifest.json analysisRun.startedAt 必须为 ISO 时间戳");
    if (isIsoTimestamp(analysisRun.startedAt) && isIsoTimestamp(analysisRun.completedAt) && Date.parse(analysisRun.completedAt) < Date.parse(analysisRun.startedAt)) {
      errors.push("workflow-manifest.json analysisRun 完成时间不得早于开始时间");
    }
  }
  if (!reviewRun || typeof reviewRun !== "object") {
    errors.push("workflow-manifest.json 缺少 reviewRun");
  } else {
    if (!normalizeText(reviewRun.taskId)) errors.push("workflow-manifest.json reviewRun 缺少 taskId");
    if (!normalizeText(reviewRun.reviewer)) errors.push("workflow-manifest.json reviewRun 缺少 reviewer");
    if (!isIsoTimestamp(reviewRun.completedAt)) errors.push("workflow-manifest.json reviewRun.completedAt 必须为非空 ISO 时间戳");
  }
  const analysisTaskId = normalizeText(analysisRun?.taskId);
  const reviewTaskId = normalizeText(reviewRun?.taskId);
  const analysisAuthor = normalizeText(analysisRun?.author);
  const reviewReviewer = normalizeText(reviewRun?.reviewer);
  if (!analysisTaskId || !reviewTaskId || analysisTaskId === reviewTaskId) {
    errors.push("workflow-manifest.json 必须记录两个不同的 taskId");
  }
  if (!analysisAuthor || !reviewReviewer || analysisAuthor === reviewReviewer) {
    errors.push("workflow-manifest.json 分析作者和审稿者必须不同");
  }
  if (!WORKFLOW_VERDICTS.has(reviewRun?.verdict) || reviewRun?.verdict !== "pass") errors.push("workflow-manifest.json 审稿结论必须为 pass");
  if (isIsoTimestamp(analysisRun?.completedAt) && isIsoTimestamp(reviewRun?.completedAt) && Date.parse(reviewRun.completedAt) <= Date.parse(analysisRun.completedAt)) {
    errors.push("workflow-manifest.json reviewRun 完成时间必须晚于 analysisRun.completedAt");
  }
  if (analysisAuthor !== normalizeText(analysis?.author)) errors.push("workflow-manifest.json 分析作者必须匹配 business-analysis.json");
  if (analysisAuthor !== normalizeText(contentReview?.author) || reviewReviewer !== normalizeText(contentReview?.reviewer)) {
    errors.push("workflow-manifest.json 作者必须匹配 content-review.json");
  }
  return { ok: errors.length === 0, errors };
}

function validateReview(review) {
  const errors = [];
  if (!review || !["pass", "revise"].includes(review.status)) errors.push("review.status 必须为 pass 或 revise");
  if (!review?.scores || typeof review.scores !== "object") errors.push("review.scores 必须为对象");
  for (const dimension of REVIEW_DIMENSIONS) {
    const score = review?.scores?.[dimension];
    if (!Number.isInteger(score) || score < 0 || score > 2) errors.push(`review.scores.${dimension} 必须为 0 到 2 的整数`);
  }
  if (errors.length) return { ok: false, errors };
  const total = REVIEW_DIMENSIONS.reduce((sum, dimension) => sum + review.scores[dimension], 0);
  if (review.status === "pass" && (total < 8 || REVIEW_DIMENSIONS.some(dimension => review.scores[dimension] < 1))) errors.push("review.status 为 pass 时总分至少 8 且每项至少 1 分");
  if (!Array.isArray(review.findings)) errors.push("review.findings 必须为数组");
  return { ok: errors.length === 0, errors };
}

function buildThemeRegistry(analysis, previousRegistry = null, updates = []) {
  const currentThemeIds = new Set(analysis.themes.map(theme => theme.id));
  const carriedThemes = updates.filter(update => !currentThemeIds.has(update.theme.id)).map(update => ({ ...update.theme, missingSnapshots: (update.theme.missingSnapshots || 0) + 1 }));
  const effectiveByClaimId = new Map((analysis.effectiveBaselineClaims || []).map(claim => [claim.claimId, claim]));
  const themes = analysis.themes.map(theme => {
    const claims = analysis.claims.filter(claim => claim.themeId === theme.id);
    const status = theme.status === "watch" || claims.some(claim => effectiveByClaimId.get(claim.id)?.status === "watch")
      ? "watch"
      : theme.status;
    return { id: theme.id, label: theme.label, status, evidenceFactIds: [...theme.evidenceFactIds], monitoringTriggers: [...(theme.monitoringTriggers || [])], missingSnapshots: 0 };
  });
  return { schemaVersion: 1, themes: [...themes, ...carriedThemes] };
}

function compareThemeRegistries(previousRegistry, currentAnalysis, { removedJobIds = [] } = {}) {
  const previousById = new Map((previousRegistry?.themes || []).map(theme => [theme.id, theme]));
  const currentUpdates = currentAnalysis.themes.map(theme => {
    const previous = previousById.get(theme.id);
    if (!previous) return { theme, status: "new", reason: "本期新增业务主题" };
    const gainedFacts = theme.evidenceFactIds.filter(id => !previous.evidenceFactIds.includes(id));
    const lostFacts = previous.evidenceFactIds.filter(id => !theme.evidenceFactIds.includes(id));
    if (previous.status === "watch" && theme.status !== "watch" && gainedFacts.length) return { theme, status: "strengthened", reason: "新增独立经营事实使待观察主题升级" };
    if (lostFacts.length || removedJobIds.length) return { theme, status: "needs_confirmation", reason: "岗位变化不足以单独证明业务主题减弱" };
    return { theme, status: "unchanged", reason: "未观察到足以改变主题状态的事实变化" };
  });
  const missingUpdates = (previousRegistry?.themes || []).filter(previous => !currentAnalysis.themes.some(theme => theme.id === previous.id)).map(previous => ({ theme: previous, status: (previous.missingSnapshots || 0) >= 1 ? "weakened" : "needs_confirmation", reason: (previous.missingSnapshots || 0) >= 1 ? "连续两期未获得新的独立经营事实支持，主题暂降级" : "本期未出现该主题的新事实，需下期继续复核" }));
  return [...currentUpdates, ...missingUpdates];
}

export { buildThemeRegistry, compareThemeRegistries, createAnalysisInput, detailCoverageCandidates, validateBusinessAnalysis, validateContentReview, validateReview, validateWorkflowManifest };
