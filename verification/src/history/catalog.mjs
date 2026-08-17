import fs from 'node:fs';
import path from 'node:path';

const categoryPatterns = [
  ['auth-sync', /auth|login|password|session|redis|upstash|登录|密码|账号|账户|同步|收藏|播放记录/i],
  ['deployment', /docker|cloudflare|vercel|deploy|build|镜像|版本|部署|构建|局域网|端口/i],
  ['platform', /android|apk|webview|ios|iphone|ipad|safari|电视|tv|车机|移动端/i],
  ['player-media', /player|video|m3u8|hls|播放|全屏|画中画|进度|缓冲|广告|弹幕|清晰度|分辨率|投屏/i],
  ['search-source', /search|source|subscription|搜索|换源|视频源|订阅|首页|推荐|海报|图片|分类|标签/i],
  ['security-proxy', /security|proxy|ssrf|xss|权限|安全|代理|漏洞/i],
  ['ui', /ui|button|layout|style|按钮|界面|布局|主题|logo|悬浮|鼠标|显示/i],
];

function read(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'verification', 'history', name), 'utf8'));
}

export function loadHistoryCatalog(root) {
  return {
    catalog: read(root, 'catalog.json'),
    baseline: read(root, 'baseline.json'),
    decisions: read(root, 'review-decisions.json'),
    commentDecisions: read(root, 'review-comment-decisions.json'),
  };
}

export function classifyItem(item, catalog, merged = false) {
  const labels = (item.labels || []).map((label) => typeof label === 'string' ? label : label.name);
  const text = `${item.title || ''}\n${item.body || ''}`;
  const categories = categoryPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (!categories.length) categories.push('general');
  const unverifiable = catalog.unverifiableIssues.find((entry) => entry.number === item.number);
  const override = catalog.regressionIssueOverrides.includes(item.number);
  const regressionRequired = merged || (!unverifiable && (labels.includes('bug') || override));
  const evidence = [...new Set(categories.flatMap((name) => catalog.evidence[name] || catalog.evidence.general))];
  return { categories, regressionRequired, evidence, unverifiableReason: unverifiable?.reason || null };
}

export function uncatalogedRecords(remote, catalog, currentPr = null) {
  return {
    issues: remote.issues.filter((item) => item.number > catalog.issueCutoff).map((item) => item.number),
    pullRequests: remote.pullRequests.filter((item) => item.number > catalog.pullRequestCutoff && item.number !== currentPr).map((item) => item.number),
  };
}

function validDigest(value) {
  return Number.isInteger(value?.count) && value.count >= 0 && /^[a-f0-9]{64}$/.test(value?.sha256 || '');
}

export function validateCatalog(root, catalog, baseline, decisions, commentDecisions) {
  const issues = new Set(catalog.issues);
  const prs = new Set(catalog.pullRequests);
  const unavailable = new Set(catalog.unavailablePullRequests);
  const regressionIssues = new Set(catalog.regressionIssues || []);
  const mergedPullRequests = new Set(catalog.mergedPullRequests || []);
  const decisionIds = new Set(decisions.map((item) => item.id));
  const commentIds = new Set(commentDecisions.map((item) => item.id));
  const duplicates = [
    ...(issues.size === catalog.issues.length ? [] : ['issue numbers']),
    ...(prs.size === catalog.pullRequests.length ? [] : ['pull-request numbers']),
    ...(unavailable.size === catalog.unavailablePullRequests.length ? [] : ['unavailable pull-request numbers']),
    ...(regressionIssues.size === (catalog.regressionIssues || []).length ? [] : ['regression issue numbers']),
    ...(mergedPullRequests.size === (catalog.mergedPullRequests || []).length ? [] : ['merged pull-request numbers']),
    ...(decisionIds.size === decisions.length ? [] : ['review decision ids']),
    ...(commentIds.size === commentDecisions.length ? [] : ['review-comment decision ids']),
  ];
  const evidence = [...new Set(Object.values(catalog.evidence).flat())];
  const missingEvidence = evidence.filter((file) => !fs.existsSync(path.join(root, file)));
  const invalidDecisionPrs = decisions.filter((item) => !prs.has(item.pr)).map((item) => item.id);
  const invalidCommentPrs = commentDecisions.filter((item) => !unavailable.has(item.pr)).map((item) => item.id);
  const overlappingPrs = catalog.unavailablePullRequests.filter((number) => prs.has(number));
  const invalidOverrides = catalog.regressionIssueOverrides.filter((number) => !issues.has(number));
  const invalidUnverifiable = catalog.unverifiableIssues.filter((item) => !issues.has(item.number)).map((item) => item.number);
  const invalidRegressionIssues = [...regressionIssues].filter((number) => !issues.has(number));
  const invalidMergedPullRequests = [...mergedPullRequests].filter((number) => !prs.has(number));
  const unverifiableRegressionIssues = catalog.unverifiableIssues.filter((item) => regressionIssues.has(item.number)).map((item) => item.number);
  const validStatuses = new Set(['open', 'fixed', 'dismissed']);
  const validPriorities = new Set(['critical', 'high', 'medium', 'low']);
  const invalidDecisionFields = [...decisions, ...commentDecisions].filter((item) => (
    !validStatuses.has(item.status) || !validPriorities.has(item.priority) || !item.contract || !item.reason
  )).map((item) => item.id);
  const digestKeys = ['issues', 'pullRequests', 'conversationComments', 'reviewComments', 'reviews', 'reviewThreads'];
  const invalidBaseline = [
    ...digestKeys.filter((key) => !validDigest(baseline[key])),
    ...(/^[a-f0-9]{64}$/.test(baseline.combinedSha256 || '') ? [] : ['combinedSha256']),
  ];
  return { duplicates, missingEvidence, invalidDecisionPrs, invalidCommentPrs, overlappingPrs,
    invalidOverrides, invalidUnverifiable, invalidRegressionIssues, invalidMergedPullRequests,
    unverifiableRegressionIssues, invalidDecisionFields, invalidBaseline };
}

export function priorityOf(body = '') {
  const text = body.toLowerCase();
  if (text.includes('critical')) return 'critical';
  if (text.includes('high')) return 'high';
  if (text.includes('medium')) return 'medium';
  return 'unspecified';
}
