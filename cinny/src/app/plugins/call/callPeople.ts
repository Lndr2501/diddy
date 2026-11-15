/**
 * One entry per person in a call. Matrix lists every device (a computer and the iPhone that
 * works as its camera and microphone are two), but the room list, the "Live" counts and the call
 * header show people. The first membership of a person stands for them. No imports: tested in
 * tests/callPeople.test.cjs.
 */
export const onePerPerson = <T extends { userId?: string }>(memberships: T[]): T[] => {
  const seen = new Set<string>();
  let duplicate = false;
  const result = memberships.filter((m) => {
    if (!m.userId) return true;
    if (seen.has(m.userId)) {
      duplicate = true;
      return false;
    }
    seen.add(m.userId);
    return true;
  });
  // the same array when nobody is there twice, so memoized views stay as they are
  return duplicate ? result : memberships;
};
