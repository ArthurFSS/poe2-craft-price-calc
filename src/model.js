const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createLine = (values = {}) => ({
  id: makeId(),
  type: '',
  item: '',
  qty: 1,
  price: 0,
  ...values,
});

export const createStep = (values = {}) => ({
  id: makeId(),
  comment: '',
  repetitions: 1,
  lines: [createLine()],
  ...values,
});

export const createRecipe = (name) => ({
  id: makeId(),
  name,
  base: { item: '', price: 0 },
  steps: [createStep()],
});

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const roundDivineUp = (value) => {
  const number = asNumber(value);
  if (number <= 0) return 0;
  return Math.max(0.01, Math.ceil((number - Number.EPSILON) * 100) / 100);
};

const normalizeLine = (line = {}) =>
  createLine({
    type: String(line.type ?? ''),
    item: String(line.item ?? ''),
    qty: asNumber(line.qty, 1),
    price: asNumber(line.price),
  });

const normalizeStep = (step = {}) =>
  createStep({
    comment: String(step.comment ?? ''),
    repetitions: Math.max(1, Math.floor(asNumber(step.repetitions, 1))),
    lines: Array.isArray(step.lines) && step.lines.length
      ? step.lines.map(normalizeLine)
      : [createLine()],
  });

const migrateLegacyRecipe = (recipe) => {
  const rows = Array.isArray(recipe.rows) ? recipe.rows : [];
  const base = rows.find((row) => row.base) ?? {};
  const ingredientRows = rows.filter((row) => !row.base);

  return {
    id: makeId(),
    name: String(recipe.name || 'Untitled recipe'),
    base: {
      item: String(base.item ?? ''),
      price: asNumber(base.price),
    },
    steps: ingredientRows.length
      ? ingredientRows.map((row) => createStep({ lines: [normalizeLine(row)] }))
      : [createStep()],
  };
};

export function normalizeCrafts(input) {
  const recipes = Array.isArray(input) ? input : input?.crafts;
  if (!Array.isArray(recipes)) throw new Error('The file does not contain a list of recipes.');

  return recipes.map((recipe) => {
    if (Array.isArray(recipe.rows)) return migrateLegacyRecipe(recipe);

    return {
      id: makeId(),
      name: String(recipe.name || 'Untitled recipe'),
      base: {
        item: String(recipe.base?.item ?? ''),
        price: asNumber(recipe.base?.price),
      },
      steps: Array.isArray(recipe.steps) && recipe.steps.length
        ? recipe.steps.map(normalizeStep)
        : [createStep()],
    };
  });
}

export const lineTotal = (line) =>
  roundDivineUp(asNumber(line.qty) * roundDivineUp(line.price));

export const stepUnitTotal = (step) =>
  roundDivineUp(step.lines.reduce((sum, line) => sum + lineTotal(line), 0));

export const stepTotal = (step) => roundDivineUp(stepUnitTotal(step) * step.repetitions);

export const recipeTotal = (recipe) =>
  roundDivineUp(
    roundDivineUp(recipe.base.price)
      + recipe.steps.reduce((sum, step) => sum + stepTotal(step), 0),
  );

export const priceLookupKey = (type, item) => `${type}\u0000${item}`;

export function refreshRecipePrices(recipe, latestPrices) {
  let recipeChanged = false;
  const steps = recipe.steps.map((step) => {
    let stepChanged = false;
    const lines = step.lines.map((line) => {
      if (!line.type || !line.item) return line;

      const key = priceLookupKey(line.type, line.item);
      if (!latestPrices.has(key)) return line;

      const price = Number(latestPrices.get(key)) || 0;
      if (price === Number(line.price)) return line;

      stepChanged = true;
      recipeChanged = true;
      return { ...line, price };
    });

    return stepChanged ? { ...step, lines } : step;
  });

  return recipeChanged ? { ...recipe, steps } : recipe;
}

export const formatDivine = (value) =>
  roundDivineUp(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
