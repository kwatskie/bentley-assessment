const SHARED_COG = [2, 2, 2, 0, 1];

const ROLE_COG = {
  'Care Aide / PSW':                 [1, 1, 1, 2, 1, 2, 1, 1, 1, 1],
  'Receptionist / Front Desk':       [1, 1, 1, 0, 1, 0, 1, 1, 2, 2],
  'Housekeeping / Maintenance':      [0, 1, 1, 1, 0, 1, 2, 2, 1, 1],
  'Department Manager / Supervisor': [1, 2, 1, 2, 1, 1, 1, 0, 2, 1],
  'Server':                          [2, 2, 2, 2, 1, 2, 1, 0, 1, 1],
  'Cook':                            [2, 1, 0, 2, 0, 2, 1, 1, 2, 1],
};

const SHARED_EQ = [2, 2, 1, 2, 2];

const ROLE_EQ = {
  'Care Aide / PSW':                 [1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 1],
  'Receptionist / Front Desk':       [1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  'Housekeeping / Maintenance':      [1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2],
  'Department Manager / Supervisor': [1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 2],
  'Server':                          [1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2],
  'Cook':                            [1, 1, 2, 2, 1, 2, 2, 2, 1, 1, 2],
};

const PERSONALITY_TRAITS = [
  'Openness', 'Conscientiousness', 'Extraversion', 'Agreeableness', 'Stress Tolerance',
  'Openness', 'Conscientiousness', 'Agreeableness', 'Stress Tolerance', 'Conscientiousness',
];

export const VALID_ROLES = Object.keys(ROLE_COG);

export function resolveRole(role) {
  if (VALID_ROLES.includes(role)) return role;
  return VALID_ROLES.find(k =>
    role && role.toLowerCase().includes(k.split('/')[0].trim().toLowerCase())
  ) || null;
}

export function calculateScores(role, answers) {
  const key = resolveRole(role);
  if (!key) return null;

  const cogCorrect = [...SHARED_COG, ...ROLE_COG[key]];
  const eqCorrect  = [...SHARED_EQ,  ...ROLE_EQ[key]];

  let cog = 0;
  cogCorrect.forEach((correct, i) => { if (answers[i] === correct) cog++; });

  const eqOffset = cogCorrect.length;
  let eq = 0;
  eqCorrect.forEach((correct, i) => { if (answers[eqOffset + i] === correct) eq++; });

  const personalityOffset = eqOffset + eqCorrect.length;
  const oceanSum   = { Openness: 0, Conscientiousness: 0, Extraversion: 0, Agreeableness: 0, 'Stress Tolerance': 0 };
  const oceanCount = { Openness: 0, Conscientiousness: 0, Extraversion: 0, Agreeableness: 0, 'Stress Tolerance': 0 };
  PERSONALITY_TRAITS.forEach((trait, i) => {
    const val = answers[personalityOffset + i];
    if (typeof val === 'number' && val >= 1 && val <= 5) {
      oceanSum[trait]   += val;
      oceanCount[trait] += 1;
    }
  });

  const ocean = {};
  Object.keys(oceanSum).forEach(trait => {
    const count = oceanCount[trait];
    ocean[trait] = count > 0 ? Math.min(100, Math.round((oceanSum[trait] / (count * 5)) * 100)) : 0;
  });

  return {
    cognitive: { score: cog, max: cogCorrect.length, pct: Math.round((cog / cogCorrect.length) * 100) },
    eq:        { score: eq,  max: eqCorrect.length,  pct: Math.round((eq  / eqCorrect.length)  * 100) },
    ocean,
  };
}

export function computeWasCorrect(role, answers) {
  const key = resolveRole(role);
  if (!key) return [];
  const cogCorrect = [...SHARED_COG, ...ROLE_COG[key]];
  const eqCorrect  = [...SHARED_EQ,  ...ROLE_EQ[key]];
  const result = [];
  cogCorrect.forEach((c, i) => result.push(answers[i] === c));
  const eqOffset = cogCorrect.length;
  eqCorrect.forEach((c, i)  => result.push(answers[eqOffset + i] === c));
  PERSONALITY_TRAITS.forEach(() => result.push(null));
  return result;
}
