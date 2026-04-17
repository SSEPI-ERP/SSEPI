import { mountNavActivityFeed } from './nav-activity-feed.js';

function run() {
  if (!document.getElementById('sidebar')) return;
  mountNavActivityFeed();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
} else {
  run();
}
