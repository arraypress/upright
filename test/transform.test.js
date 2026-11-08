import { describe, expect, test } from 'vitest';
import {
  ACTIONS, IDENTITY_STATE, applyTo, fitScale, isIdentity, multiply, parseMatrix, parseRotate,
  parseScale, parseTranslate, placement, rotation, scaling, step, translation,
} from '../transform.js';

const run = (...actions) => actions.reduce(step, IDENTITY_STATE);

/** The on-screen matrix each action applies, written out independently of step(). */
const SCREEN = {
  'rotate-right': [0, 1, -1, 0, 0, 0],
  'rotate-left': [0, -1, 1, 0, 0, 0],
  'rotate-180': [-1, 0, 0, -1, 0, 0],
  'flip-horizontal': [-1, 0, 0, 1, 0, 0],
  'flip-vertical': [1, 0, 0, -1, 0, 0],
};
const stateMatrix = ({ r, f }) => multiply(rotation(r), scaling(f ? -1 : 1, 1));

/** What CSS draws for translate · rotate · scale · transform, about the origin. */
const drawn = (styles, transform, width, height) =>
  [
    translation(...parseTranslate(styles.translate, width, height)),
    rotation(parseRotate(styles.rotate)),
    scaling(...parseScale(styles.scale)),
    parseMatrix(transform),
  ].reduce(multiply);

/** Output is rounded (px to 0.001, degrees to 0.0001), so composed checks allow 0.005 px. */
const close = (actual, expected, digits = 6) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));

describe('step: turns accumulate', () => {
  test('right, right is 180°; four rights is upright again', () => {
    expect(run('rotate-right', 'rotate-right')).toEqual({ r: 180, f: false });
    expect(run('rotate-right', 'rotate-180')).toEqual({ r: 270, f: false });
    expect(isIdentity(run('rotate-right', 'rotate-right', 'rotate-right', 'rotate-right'))).toBe(true);
  });

  test('left undoes right, and left from upright is 270°', () => {
    expect(run('rotate-left')).toEqual({ r: 270, f: false });
    expect(isIdentity(run('rotate-right', 'rotate-left'))).toBe(true);
  });

  test('reset clears everything', () => {
    expect(run('rotate-right', 'flip-vertical', 'reset')).toEqual(IDENTITY_STATE);
  });
});

describe('step: flips combine with rotation', () => {
  test('flipping twice is a no-op; horizontal then vertical is a half turn', () => {
    expect(isIdentity(run('flip-horizontal', 'flip-horizontal'))).toBe(true);
    expect(run('flip-horizontal', 'flip-vertical')).toEqual({ r: 180, f: false });
  });

  test('a horizontal flip after a quarter turn mirrors the screen, not the original', () => {
    // Turned right then mirrored left-right on screen: the same as mirrored, then turned left.
    expect(run('rotate-right', 'flip-horizontal')).toEqual({ r: 270, f: true });
    expect(run('rotate-right', 'flip-vertical')).toEqual({ r: 90, f: true });
  });

  test('every sequence of clicks matches doing them one after another on screen', () => {
    // Every sequence of up to four actions.
    const actions = ACTIONS.filter((a) => a !== 'reset');
    let sequences = [[]];
    for (let length = 0; length < 4; length++) {
      sequences = sequences.flatMap((seq) => [seq, ...actions.map((a) => [...seq, a])]);
    }
    for (const seq of new Set(sequences.map(JSON.stringify))) {
      const clicks = JSON.parse(seq);
      const expected = clicks.reduce((m, a) => multiply(SCREEN[a], m), [1, 0, 0, 1, 0, 0]);
      close(stateMatrix(run(...clicks)), expected);
    }
  });
});

describe('fit scaling', () => {
  test('a sideways turn shrinks to fit the box; upright and 180° stay full size', () => {
    expect(fitScale({ r: 90 }, 200, 100)).toBe(0.5);
    expect(fitScale({ r: 270 }, 100, 400)).toBe(0.25);
    expect(fitScale({ r: 90 }, 120, 120)).toBe(1);
    expect(fitScale({ r: 180 }, 200, 100)).toBe(1);
    expect(fitScale({ r: 0, f: true }, 200, 100)).toBe(1);
  });

  test('it fits the box as the page draws it (a page stretch counts)', () => {
    expect(fitScale({ r: 90 }, 200, 100, scaling(2, 1))).toBe(0.25);
  });

  test('a zero-size box is left alone', () => {
    expect(fitScale({ r: 90 }, 0, 100)).toBe(1);
  });

  test('the turned media sits inside its box, centred', () => {
    const styles = placement({ r: 90, f: false }, { width: 200, height: 100, origin: [100, 50] });
    expect(styles).toEqual({ translate: '0px 0px', rotate: '90deg', scale: '0.5 0.5' });
    const m = drawn(styles, 'none', 200, 100);
    // Corners relative to the centre origin land within ±100 × ±50, touching top and bottom.
    const corners = [[-100, -50], [100, -50], [100, 50], [-100, 50]].map((p) => applyTo(m, p));
    expect(Math.max(...corners.map(([x]) => Math.abs(x)))).toBeCloseTo(25);
    expect(Math.max(...corners.map(([, y]) => Math.abs(y)))).toBeCloseTo(50);
  });
});

describe('placement', () => {
  test('upright needs nothing', () => {
    expect(placement(IDENTITY_STATE, { width: 10, height: 10 })).toBeNull();
  });

  test('a mirror is a negative x scale', () => {
    expect(placement({ r: 0, f: true }, { width: 200, height: 100 }).scale).toBe('-1 1');
    expect(placement({ r: 90, f: true }, { width: 200, height: 100 }).scale).toBe('-0.5 0.5');
  });

  test('with the origin at the top left, it still turns about the centre', () => {
    const styles = placement({ r: 90, f: false }, { width: 200, height: 100, origin: [0, 0] });
    expect(styles.translate).toBe('125px 0px');
    // The centre (100, 50) from the origin stays put.
    close(applyTo(drawn(styles, 'none', 200, 100), [100, 50]), [100, 50]);
  });
});

describe('composing with the page\'s own transform', () => {
  /** Checks the two things that matter: the centre stays put, and the turn is on screen. */
  function expectComposed(state, box) {
    const styles = placement(state, box);
    const { width, height, origin, transform, page } = box;
    const pageAll = [
      translation(...parseTranslate(page?.translate, width, height)),
      rotation(parseRotate(page?.rotate)),
      scaling(...parseScale(page?.scale)),
      parseMatrix(transform),
    ].reduce(multiply);
    const after = drawn(styles, transform, width, height);
    const centre = [width / 2 - origin[0], height / 2 - origin[1]];
    close(applyTo(after, centre), applyTo(pageAll, centre), 2);
    const s = fitScale(state, width, height, pageAll);
    const linear = multiply(multiply(stateMatrix(state), scaling(s)), [...pageAll.slice(0, 4), 0, 0]);
    close(after.slice(0, 4), linear.slice(0, 4), 4);
    return styles;
  }

  test('a page translate in `transform` is kept and the box doesn\'t move', () => {
    expectComposed({ r: 90, f: false }, { width: 200, height: 100, origin: [100, 50], transform: 'matrix(1, 0, 0, 1, 30, 10)' });
  });

  test('a centring translate(-50%, -50%) in the `translate` property comes through unchanged', () => {
    const styles = expectComposed({ r: 90, f: true }, {
      width: 200, height: 100, origin: [100, 50], transform: 'none',
      page: { translate: '-50% -50%', rotate: 'none', scale: 'none' },
    });
    expect(styles.translate).toBe('-100px -50px');
  });

  test('if the page mirrored the image, "clockwise" is still clockwise on screen', () => {
    expectComposed({ r: 90, f: false }, { width: 200, height: 100, origin: [100, 50], transform: 'matrix(-1, 0, 0, 1, 0, 0)' });
  });

  test('a page tilt, hover scale and odd origin all compose', () => {
    expectComposed({ r: 270, f: true }, {
      width: 300, height: 120, origin: [0, 120], transform: 'matrix(0.98, 0.17, -0.17, 0.98, 12, -4)',
      page: { translate: '5px 7px', rotate: '10deg', scale: '1.05' },
    });
  });

  test('3D page transforms aren\'t composed: the turn alone, about the origin', () => {
    expect(placement({ r: 90, f: false }, {
      width: 200, height: 100, origin: [100, 50], transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
    })).toEqual({ translate: '0px 0px', rotate: '90deg', scale: '0.5 0.5' });
  });
});

describe('reading computed styles', () => {
  test('units and forms Chrome may report', () => {
    expect(parseScale('105%')).toEqual([1.05, 1.05]);
    expect(parseScale('2 3')).toEqual([2, 3]);
    expect(parseScale('1 1 2')).toBeNull();
    expect(parseRotate('z 45deg')).toBe(45);
    expect(parseRotate('0.25turn')).toBe(90);
    expect(parseRotate('x 45deg')).toBeNull();
    expect(parseTranslate('10px', 50, 50)).toEqual([10, 0]);
    expect(parseTranslate('1px 2px 3px', 50, 50)).toBeNull();
    expect(parseMatrix('none')).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
