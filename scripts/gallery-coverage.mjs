// `npm run gallery:coverage`: every image under docs/design/**, gallery/** and tests/**-snapshots/**
// must be reachable from a gallery post (gallery/**/post.md). Exits 1 and lists the strays otherwise.
import { fileURLToPath } from 'node:url';
import { findUncoveredImages } from './gallery-index.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { posts, covered, uncovered } = findUncoveredImages(root);
console.log(`gallery coverage: ${posts} posts, ${covered} distinct images covered, ${uncovered.length} uncovered`);
if (uncovered.length) {
  for (const rel of uncovered) console.log(`  not in any post: ${rel}`);
  console.log('Add a post (gallery/<branch>/<date>-<slug>/post.md) that shows these. See gallery/README.md.');
  process.exit(1);
}
