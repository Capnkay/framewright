import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VIEWPORT_MODES,
  getModeConfig,
  stacksAtBreakpoint,
  MD_BREAKPOINT_PX,
} from '../client/src/studio/ResponsiveToggle.logic.js';

test('desktop mode fills the pane and keeps the two-column layout (R11)', () => {
  const desktop = getModeConfig('desktop');
  assert.equal(desktop.id, 'desktop');
  assert.equal(desktop.width, '100%');
  assert.equal(
    stacksAtBreakpoint('desktop'),
    false,
    'desktop must stay above the md: breakpoint, so the section stays two columns',
  );
});

test('mobile mode is genuinely below the md: breakpoint, so the section stacks (R11)', () => {
  const mobile = getModeConfig('mobile');
  assert.equal(mobile.id, 'mobile');
  assert.equal(mobile.width, '375px');

  // The point of the task. R11's stacking comes from `flex-col md:flex-row`, and
  // `md:` is `@media (min-width: 768px)` — evaluated against the viewport, never
  // an ancestor's width. A "mobile" preview that is not actually narrower than
  // the breakpoint renders two squeezed columns and demonstrates the opposite of
  // what R11 asks for.
  assert.ok(
    Number.parseInt(mobile.width, 10) < MD_BREAKPOINT_PX,
    `mobile width must be under the md: breakpoint (${MD_BREAKPOINT_PX}px) or nothing stacks`,
  );
  assert.equal(stacksAtBreakpoint('mobile'), true);
});

test('an unknown mode falls back to desktop rather than rendering nothing', () => {
  assert.equal(getModeConfig('watch').id, 'desktop');
  assert.equal(getModeConfig(undefined).id, 'desktop');
  assert.equal(stacksAtBreakpoint('watch'), false);
});

test('both R11 viewports are offered', () => {
  assert.deepEqual(Object.keys(VIEWPORT_MODES), ['desktop', 'mobile']);
});
