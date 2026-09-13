export type CubicBezier = readonly [number, number, number, number];

export type MotionTokens = {
  durationMs: {
    instant: number;
    feedback: number;
    standard: number;
    emphasized: number;
  };
  easing: {
    standard: CubicBezier;
    enter: CubicBezier;
    exit: CubicBezier;
  };
  distance: {
    none: number;
    micro: number;
    small: number;
    medium: number;
  };
  scale: {
    rest: number;
    pressed: number;
  };
};

export type MotionOverrides = {
  durationMs?: Partial<MotionTokens['durationMs']>;
  easing?: Partial<MotionTokens['easing']>;
  distance?: Partial<MotionTokens['distance']>;
  scale?: Partial<MotionTokens['scale']>;
};

const defaultMotionTokens: MotionTokens = {
  durationMs: {
    instant: 0,
    feedback: 100,
    standard: 200,
    emphasized: 300,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
  },
  distance: {
    none: 0,
    micro: 4,
    small: 12,
    medium: 24,
  },
  scale: {
    rest: 1,
    pressed: 0.98,
  },
};

/**
 * Shared, serializable motion tokens for native host surfaces and mini-apps.
 * Product configuration may tune values inside the platform budgets; it may
 * not add a second animation vocabulary or bypass reduced-motion behavior.
 */
export function createMotionTokens(
  overrides: MotionOverrides = {},
): MotionTokens {
  const tokens: MotionTokens = {
    durationMs: {
      instant:
        overrides.durationMs?.instant ?? defaultMotionTokens.durationMs.instant,
      feedback:
        overrides.durationMs?.feedback ??
        defaultMotionTokens.durationMs.feedback,
      standard:
        overrides.durationMs?.standard ??
        defaultMotionTokens.durationMs.standard,
      emphasized:
        overrides.durationMs?.emphasized ??
        defaultMotionTokens.durationMs.emphasized,
    },
    easing: {
      standard:
        overrides.easing?.standard ?? defaultMotionTokens.easing.standard,
      enter: overrides.easing?.enter ?? defaultMotionTokens.easing.enter,
      exit: overrides.easing?.exit ?? defaultMotionTokens.easing.exit,
    },
    distance: {
      none: overrides.distance?.none ?? defaultMotionTokens.distance.none,
      micro: overrides.distance?.micro ?? defaultMotionTokens.distance.micro,
      small: overrides.distance?.small ?? defaultMotionTokens.distance.small,
      medium: overrides.distance?.medium ?? defaultMotionTokens.distance.medium,
    },
    scale: {
      rest: overrides.scale?.rest ?? defaultMotionTokens.scale.rest,
      pressed: overrides.scale?.pressed ?? defaultMotionTokens.scale.pressed,
    },
  };

  validateMotionTokens(tokens);
  return tokens;
}

function assertRange(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
}

function validateMotionTokens(tokens: MotionTokens): void {
  if (tokens.durationMs.instant !== 0) {
    throw new Error('motion.durationMs.instant must remain 0');
  }
  assertRange('motion.durationMs.feedback', tokens.durationMs.feedback, 0, 100);
  assertRange('motion.durationMs.standard', tokens.durationMs.standard, 0, 300);
  assertRange(
    'motion.durationMs.emphasized',
    tokens.durationMs.emphasized,
    0,
    300,
  );
  if (
    tokens.durationMs.feedback > tokens.durationMs.standard ||
    tokens.durationMs.standard > tokens.durationMs.emphasized
  ) {
    throw new Error('motion durations must remain ordered');
  }

  for (const [name, value] of Object.entries(tokens.distance)) {
    assertRange(`motion.distance.${name}`, value, 0, 24);
  }
  if (tokens.distance.none !== 0) {
    throw new Error('motion.distance.none must remain 0');
  }

  if (tokens.scale.rest !== 1) {
    throw new Error('motion.scale.rest must remain 1');
  }
  assertRange('motion.scale.pressed', tokens.scale.pressed, 0.95, 1);

  for (const [name, curve] of Object.entries(tokens.easing)) {
    if (curve.length !== 4) {
      throw new Error(`motion.easing.${name} must have four coordinates`);
    }
    curve.forEach((coordinate, index) => {
      assertRange(`motion.easing.${name}[${index}]`, coordinate, 0, 1);
    });
  }
}

/**
 * Reduced motion preserves state feedback while removing travel, scaling, and
 * transition time. The host must send this effective set to every mini-app.
 */
export function reduceMotion(tokens: MotionTokens): MotionTokens {
  return {
    ...tokens,
    durationMs: {
      instant: 0,
      feedback: 0,
      standard: 0,
      emphasized: 0,
    },
    distance: {
      none: 0,
      micro: 0,
      small: 0,
      medium: 0,
    },
    scale: {
      rest: 1,
      pressed: 1,
    },
  };
}
