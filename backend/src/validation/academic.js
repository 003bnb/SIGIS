const LEVELS = new Set(['L1', 'L2', 'L3', 'M1', 'M2']);

function isValidLevel(value) {
  return typeof value === 'string' && LEVELS.has(value.trim());
}

function isValidAcademicYear(value) {
  if (typeof value !== 'string') return false;
  const match = /^([1-9]\d{3})-([1-9]\d{3})$/.exec(value.trim());
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
}

module.exports = { isValidLevel, isValidAcademicYear };
