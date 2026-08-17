export const generatedValueRules = {
  'source-id': '^custom-[a-z0-9]+$',
};

export function stableGeneratedValue(id, value) {
  const pattern = generatedValueRules[id];
  return pattern && new RegExp(pattern).test(value) ? `${id}:<generated>` : value;
}
