/** Compares dotted versions ("1.10.0" > "1.9.2"); a missing part counts as 0. */
export const compareVersions = (a: string, b: string): number => {
  const parse = (v: string) => v.split('.').map((part) => parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};
