import fs from 'node:fs';
import path from 'node:path';

let axeSource;

function source(ctx) {
  if (!axeSource) axeSource = fs.readFileSync(path.join(ctx.config.verifyDir, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  return axeSource;
}

export async function scanAxe(page, ctx) {
  await page.addScriptTag({ content: source(ctx) });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ['violations', 'incomplete'],
      rules: { 'color-contrast': { enabled: true } },
    });
    const compact = (item) => ({
      id: item.id, impact: item.impact, description: item.description, help: item.help,
      helpUrl: item.helpUrl, nodes: item.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary, html: node.html.slice(0, 500) })),
    });
    return { violations: result.violations.map(compact), incomplete: result.incomplete.map(compact) };
  });
}
