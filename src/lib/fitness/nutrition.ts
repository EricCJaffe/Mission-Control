export type NutritionTargets = {
  sodium_max_mg: number;
  potassium_target_mg: number;
  phosphorus_max_mg: number;
  protein_target_g: number;
  fiber_target_g: number;
};

export type FoodReference = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  phosphorus_mg: number | null;
  saturated_fat_g: number | null;
  tags: string[];
};

export function rateFoodForCardiacKidneyTargets(food: {
  sodium_mg?: number | null;
  potassium_mg?: number | null;
  phosphorus_mg?: number | null;
  protein_g?: number | null;
}) {
  const sodium = food.sodium_mg || 0;
  const potassium = food.potassium_mg || 0;
  const phosphorus = food.phosphorus_mg || 0;

  if (sodium >= 700 || potassium >= 700 || phosphorus >= 350) return 'red';
  if (sodium >= 400 || potassium >= 450 || phosphorus >= 250) return 'yellow';
  return 'green';
}

export function sumNutrition(logs: Array<Record<string, unknown>>) {
  return logs.reduce<{
    calories: number;
    protein_g: number;
    fiber_g: number;
    sodium_mg: number;
    potassium_mg: number;
    phosphorus_mg: number;
  }>(
    (acc, row) => ({
      calories: acc.calories + (Number(row.calories) || 0),
      protein_g: acc.protein_g + (Number(row.protein_g) || 0),
      fiber_g: acc.fiber_g + (Number(row.fiber_g) || 0),
      sodium_mg: acc.sodium_mg + (Number(row.sodium_mg) || 0),
      potassium_mg: acc.potassium_mg + (Number(row.potassium_mg) || 0),
      phosphorus_mg: acc.phosphorus_mg + (Number(row.phosphorus_mg) || 0),
    }),
    {
      calories: 0,
      protein_g: 0,
      fiber_g: 0,
      sodium_mg: 0,
      potassium_mg: 0,
      phosphorus_mg: 0,
    }
  );
}

export function searchFoodReferences(query: string, foods: FoodReference[]) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return foods
    .map((food) => ({
      food,
      score: scoreFoodMatch(normalized, food),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.food)
    .slice(0, 10);
}

export function dailyNutritionScore(params: {
  totals: ReturnType<typeof sumNutrition>;
  target: NutritionTargets | null;
}) {
  const target = params.target;
  if (!target) return { score: 0, maxScore: 4 };

  let score = 0;
  if (params.totals.sodium_mg <= target.sodium_max_mg) score += 1;
  if (params.totals.fiber_g >= target.fiber_target_g * 0.7) score += 1;
  if (params.totals.protein_g >= target.protein_target_g * 0.7) score += 1;
  if (params.totals.phosphorus_mg <= target.phosphorus_max_mg * 1.1) score += 1;
  return { score, maxScore: 4 };
}

export function gradeNutritionScore(score: number, maxScore: number) {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.75) return 'green';
  if (pct >= 0.5) return 'yellow';
  return 'red';
}

function scoreFoodMatch(query: string, food: FoodReference) {
  const haystacks = [food.name, food.brand || '', ...(food.tags || [])].map((value) => value.toLowerCase());
  let score = 0;
  for (const value of haystacks) {
    if (value === query) score += 12;
    else if (value.startsWith(query)) score += 8;
    else if (value.includes(query)) score += 4;
  }
  return score;
}
