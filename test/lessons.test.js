import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, nextLesson, shouldShowLesson } from '../src/lessons.js';

test('lessons have unique ids and all their parts', () => {
  assert.ok(LESSONS.length >= 25);
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
  for (const l of LESSONS) for (const key of ['id', 'icon', 'topic', 'title', 'body', 'action']) assert.ok(l[key], `${l.id} is missing ${key}`);
});

test('lessons come in order, skip seen ones, and show once a day', () => {
  assert.equal(nextLesson(undefined).id, LESSONS[0].id);
  assert.equal(nextLesson({ seen: [LESSONS[0].id] }).id, LESSONS[1].id);
  assert.ok(nextLesson({ seen: LESSONS.map((l) => l.id) }));
  assert.equal(shouldShowLesson(undefined, '2026-11-09'), true);
  assert.equal(shouldShowLesson({ lastShown: '2026-11-09' }, '2026-11-09'), false);
  assert.equal(shouldShowLesson({ lastShown: '2026-11-08' }, '2026-11-09'), true);
  assert.equal(shouldShowLesson({ off: true }, '2026-11-09'), false);
});
