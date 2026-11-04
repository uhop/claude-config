// What counts as a test and as an existing assertion changed: one home for `/release-check` and
// `/process-review`. The spellings come from a survey of the fleet's test lines (D55).

export const TEST_PLACES = ['tests', 'test', 'ts-test', 'ts-tests', '__tests__'];

export const TEST_PATHS = [
  ...TEST_PLACES.map(place => `:(glob)**/${place}/**`),
  ':(glob)**/*.test.*'
];

const TEST_PATH = new RegExp(`(?:^|/)(?:${TEST_PLACES.join('|')})/|\\.test\\.[^/]+$`);

export const isTestPath = path => TEST_PATH.test(path);

const ASSERTION =
  /^(?:await\s+|return\s+)?(?:t\.(?!test\b|comment\b|plan\b|skip\b|skipTest\b|end\b|todo\b|diagnostic\b)\w+\(|assert(?:\.\w+)?\(|expect\(|eval\(\s*(?:\w+\.)?TEST\b)/;

const same = text => text.trim().replace(/\s+/g, ' ');

/**
 * Of a diff's test lines, each `{added, file, text}`: the existing assertions removed or rewritten,
 * and how many assertions were added. A line that only moved or was reindented counts as neither.
 */
export const assertionChanges = lines => {
  const unmatched = new Map();
  for (const line of lines)
    if (line.added) unmatched.set(same(line.text), (unmatched.get(same(line.text)) ?? 0) + 1);
  const rewritten = [];
  let moved = 0;
  for (const line of lines) {
    const text = same(line.text);
    if (line.added || !ASSERTION.test(text)) continue;
    if (unmatched.get(text)) {
      unmatched.set(text, unmatched.get(text) - 1);
      ++moved;
    } else rewritten.push({file: line.file, text});
  }
  const added = lines.filter(line => line.added && ASSERTION.test(same(line.text))).length - moved;
  return {rewritten, added};
};
