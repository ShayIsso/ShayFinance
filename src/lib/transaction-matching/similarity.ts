import { extractMerchant } from "./merchant";

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matched = new Array<boolean>(s1.length).fill(false);
  const s2Matched = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (!s2Matched[j] && s1[i] === s2[j]) {
        s1Matched[i] = true;
        s2Matched[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matched[i]) continue;
    while (!s2Matched[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1: string, s2: string): number {
  const jaroScore = jaro(s1, s2);
  if (jaroScore === 0) return 0;

  let prefixLen = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  while (prefixLen < maxPrefix && s1[prefixLen] === s2[prefixLen]) {
    prefixLen++;
  }

  return jaroScore + prefixLen * 0.1 * (1 - jaroScore);
}

export function scoreSimilarity(a: string, b: string): number {
  const normA = extractMerchant(a);
  const normB = extractMerchant(b);

  if (normA === "" && normB === "") return 1;
  if (normA === "" || normB === "") return 0;

  // Square the JW score to increase discrimination between moderate and high matches
  const jw = jaroWinkler(normA, normB);
  return jw * jw;
}
