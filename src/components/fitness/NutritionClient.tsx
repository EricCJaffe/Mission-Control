'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Apple, Loader2, ShieldCheck, Sparkles, Utensils } from 'lucide-react';
import { Search, ScanLine, Trophy } from 'lucide-react';

type NutritionLog = {
  id: string;
  logged_at: string;
  meal_type: string;
  food_name: string;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  phosphorus_mg: number | null;
  food_rating: 'green' | 'yellow' | 'red';
};

type NutritionTarget = {
  sodium_max_mg: number;
  potassium_target_mg: number;
  phosphorus_max_mg: number;
  protein_target_g: number;
  fiber_target_g: number;
  calorie_target: number | null;
  pattern: string;
} | null;

type Props = {
  initialLogs: NutritionLog[];
  initialTarget: NutritionTarget;
};

type FoodReference = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  phosphorus_mg: number | null;
};

export default function NutritionClient({ initialLogs, initialTarget }: Props) {
  const router = useRouter();
  const [logs] = useState(initialLogs);
  const [, setTarget] = useState<NutritionTarget>(initialTarget);
  const [suggestions, setSuggestions] = useState<Record<string, unknown> | null>(null);
  const [insights, setInsights] = useState<Record<string, unknown> | null>(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [savingLog, setSavingLog] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingList, setSavingList] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [searchingFood, setSearchingFood] = useState(false);
  const [goal, setGoal] = useState('Support endurance training, heart health, kidney-aware recovery, and sustainable daily eating.');
  const [foodSearch, setFoodSearch] = useState('');
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [foodResults, setFoodResults] = useState<FoodReference[]>([]);
  const [quiz, setQuiz] = useState<Record<string, unknown> | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizResult, setQuizResult] = useState<string | null>(null);
  const [savedLists, setSavedLists] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [targetForm, setTargetForm] = useState({
    sodium_max_mg: String(initialTarget?.sodium_max_mg || 2000),
    potassium_target_mg: String(initialTarget?.potassium_target_mg || 3000),
    phosphorus_max_mg: String(initialTarget?.phosphorus_max_mg || 1000),
    protein_target_g: String(initialTarget?.protein_target_g || 150),
    fiber_target_g: String(initialTarget?.fiber_target_g || 30),
    calorie_target: initialTarget?.calorie_target ? String(initialTarget.calorie_target) : '',
    pattern: initialTarget?.pattern || 'mediterranean_dash',
  });
  const [foodForm, setFoodForm] = useState({
    meal_type: 'meal',
    food_name: '',
    serving_size: '',
    calories: '',
    protein_g: '',
    fiber_g: '',
    sodium_mg: '',
    potassium_mg: '',
    phosphorus_mg: '',
    notes: '',
  });

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, row) => ({
        calories: acc.calories + (row.calories || 0),
        protein_g: acc.protein_g + (row.protein_g || 0),
        fiber_g: acc.fiber_g + (row.fiber_g || 0),
        sodium_mg: acc.sodium_mg + (row.sodium_mg || 0),
      }),
      { calories: 0, protein_g: 0, fiber_g: 0, sodium_mg: 0 }
    );
  }, [logs]);

  async function searchFoods(params?: { barcode?: string }) {
    setSearchingFood(true);
    setError(null);
    try {
      const query = params?.barcode ? `barcode=${encodeURIComponent(params.barcode)}` : `q=${encodeURIComponent(foodSearch)}`;
      const res = await fetch(`/api/fitness/nutrition/search?${query}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to search foods');
      setFoodResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search foods');
    } finally {
      setSearchingFood(false);
    }
  }

  async function saveTarget() {
    setSavingTarget(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/nutrition/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save nutrition targets');
      setTarget(data.target);
      setMessage('Nutrition targets updated.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save nutrition targets');
    } finally {
      setSavingTarget(false);
    }
  }

  async function saveFood() {
    setSavingLog(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/nutrition/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(foodForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save food log');
      setMessage(`Food logged as ${data.log.food_rating}.`);
      setFoodForm({
        meal_type: 'meal',
        food_name: '',
        serving_size: '',
        calories: '',
        protein_g: '',
        fiber_g: '',
        sodium_mg: '',
        potassium_mg: '',
        phosphorus_mg: '',
        notes: '',
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save food log');
    } finally {
      setSavingLog(false);
    }
  }

  async function suggestMeals() {
    setLoadingSuggest(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/nutrition/suggest-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to generate meal suggestions');
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate meal suggestions');
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function loadInsights() {
    setLoadingInsights(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/nutrition/insights');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load nutrition insights');
      setInsights(data.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nutrition insights');
    } finally {
      setLoadingInsights(false);
    }
  }

  async function saveGroceryList() {
    if (!suggestions || !Array.isArray(suggestions.grocery_list)) return;
    setSavingList(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/nutrition/grocery-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'AI Nutrition Grocery List',
          goal,
          items: suggestions.grocery_list,
          source: 'ai_suggestions',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save grocery list');
      setSavedLists((prev) => [data.list, ...prev]);
      setMessage('Grocery list saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save grocery list');
    } finally {
      setSavingList(false);
    }
  }

  async function loadSavedLists() {
    try {
      const res = await fetch('/api/fitness/nutrition/grocery-lists');
      const data = await res.json();
      if (res.ok && data.ok) setSavedLists(data.lists || []);
    } catch {
      /* non-critical */
    }
  }

  async function loadQuiz() {
    setLoadingQuiz(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/nutrition/quiz');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load quiz');
      setQuiz(data.quiz);
      setQuizAnswers(new Array(Array.isArray(data.quiz?.questions) ? data.quiz.questions.length : 0).fill(-1));
      setQuizResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz');
    } finally {
      setLoadingQuiz(false);
    }
  }

  async function submitQuiz() {
    if (!quiz) return;
    setSubmittingQuiz(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/nutrition/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: quiz.topic,
          questions: quiz.questions,
          answers: quizAnswers,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to submit quiz');
      setQuizResult(`Score: ${data.score}/${data.total}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quiz');
    } finally {
      setSubmittingQuiz(false);
    }
  }

  function applyFoodReference(food: FoodReference) {
    setFoodForm((prev) => ({
      ...prev,
      food_name: food.name,
      serving_size: food.serving_size || prev.serving_size,
      calories: food.calories != null ? String(food.calories) : prev.calories,
      protein_g: food.protein_g != null ? String(food.protein_g) : prev.protein_g,
      fiber_g: food.fiber_g != null ? String(food.fiber_g) : prev.fiber_g,
      sodium_mg: food.sodium_mg != null ? String(food.sodium_mg) : prev.sodium_mg,
      potassium_mg: food.potassium_mg != null ? String(food.potassium_mg) : prev.potassium_mg,
      phosphorus_mg: food.phosphorus_mg != null ? String(food.phosphorus_mg) : prev.phosphorus_mg,
    }));
    setMessage(`Loaded nutrition values for ${food.name}.`);
  }

  useEffect(() => {
    void loadSavedLists();
  }, []);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Calories" value={String(Math.round(totals.calories))} />
        <StatCard label="Protein" value={`${Math.round(totals.protein_g)} g`} />
        <StatCard label="Fiber" value={`${Math.round(totals.fiber_g)} g`} />
        <StatCard label="Sodium" value={`${Math.round(totals.sodium_mg)} mg`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Nutrition Targets</h2>
          <p className="mt-1 text-sm text-slate-500">Cardiac/CKD guardrails with a Mediterranean-DASH default.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ['Sodium max (mg)', 'sodium_max_mg'],
              ['Potassium target (mg)', 'potassium_target_mg'],
              ['Phosphorus max (mg)', 'phosphorus_max_mg'],
              ['Protein target (g)', 'protein_target_g'],
              ['Fiber target (g)', 'fiber_target_g'],
              ['Calories target', 'calorie_target'],
            ].map(([label, key]) => (
              <label key={key} className="block text-sm font-medium text-slate-700">
                {label}
                <input
                  value={targetForm[key as keyof typeof targetForm]}
                  onChange={(event) => setTargetForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                />
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Pattern
            <select value={targetForm.pattern} onChange={(event) => setTargetForm((prev) => ({ ...prev, pattern: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
              <option value="mediterranean_dash">Mediterranean + DASH</option>
              <option value="mediterranean">Mediterranean</option>
              <option value="dash">DASH</option>
              <option value="cardiac_ckd">Cardiac + CKD conservative</option>
            </select>
          </label>
          <button
            type="button"
            onClick={saveTarget}
            disabled={savingTarget}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {savingTarget ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Save Targets
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">AI Meal Suggestions</h2>
              <p className="mt-1 text-sm text-slate-500">Build meal ideas, grocery lists, and weekly food focus from your health context.</p>
            </div>
            <button
              type="button"
              onClick={suggestMeals}
              disabled={loadingSuggest}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingSuggest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Suggest Meals
            </button>
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Planning goal
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>

          {suggestions ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Executive Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{String(suggestions.executive_summary || '')}</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ListCard title="Grocery List" items={asStrings(suggestions.grocery_list)} />
                <ListCard title="Weekly Focus" items={asStrings(suggestions.weekly_focus)} />
                <ListCard title="Education" items={asStrings(suggestions.education)} />
                <ListCard title="Methylation Food Notes" items={asStrings(suggestions.methylation_food_notes)} />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveGroceryList}
                  disabled={savingList}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <Apple className="h-4 w-4" />}
                  Save Grocery List
                </button>
              </div>
              <div className="space-y-3">
                {asRecords(suggestions.meal_plan).map((meal, index) => (
                  <div key={`${String(meal.meal_name)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{String(meal.meal_name || 'Meal')}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{String(meal.meal_type || 'meal')}</p>
                    <p className="mt-2 text-sm text-slate-700">{String(meal.why || '')}</p>
                    {meal.recipe ? <p className="mt-2 text-xs leading-6 text-slate-500">Recipe: {String(meal.recipe)}</p> : null}
                    <div className="mt-3 space-y-2">
                      {asRecords(meal.foods).map((food, foodIndex) => (
                        <div key={`${String(food.name)}-${foodIndex}`} className="rounded-xl bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900">{String(food.name || 'Food')}</p>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${pillClass(String(food.rating || 'yellow'))}`}>{String(food.rating || 'yellow')}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{String(food.reason || '')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Optional Food Log</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="block text-sm font-medium text-slate-700">
              Food search
              <input value={foodSearch} onChange={(event) => setFoodSearch(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Search oats, yogurt, salmon..." />
            </label>
            <button type="button" onClick={() => searchFoods()} disabled={searchingFood || !foodSearch.trim()} className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {searchingFood ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="block text-sm font-medium text-slate-700">
              Barcode lookup
              <input value={barcodeSearch} onChange={(event) => setBarcodeSearch(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="850000000001" />
            </label>
            <button type="button" onClick={() => searchFoods({ barcode: barcodeSearch })} disabled={searchingFood || !barcodeSearch.trim()} className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {searchingFood ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              Lookup
            </button>
          </div>
          {foodResults.length > 0 ? (
            <div className="mt-4 space-y-2">
              {foodResults.map((food) => (
                <button key={food.id} type="button" onClick={() => applyFoodReference(food)} className="w-full rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100">
                  <p className="text-sm font-semibold text-slate-900">{food.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{food.brand || 'Generic'} · {food.serving_size || 'Serving n/a'} · Sodium {food.sodium_mg ?? '—'} mg</p>
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Meal type
              <select value={foodForm.meal_type} onChange={(event) => setFoodForm((prev) => ({ ...prev, meal_type: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
                <option value="drink">Drink</option>
                <option value="meal">Meal</option>
              </select>
            </label>
            <Field label="Food name" value={foodForm.food_name} onChange={(value) => setFoodForm((prev) => ({ ...prev, food_name: value }))} />
            <Field label="Serving size" value={foodForm.serving_size} onChange={(value) => setFoodForm((prev) => ({ ...prev, serving_size: value }))} type="text" />
            <Field label="Calories" value={foodForm.calories} onChange={(value) => setFoodForm((prev) => ({ ...prev, calories: value }))} />
            <Field label="Protein (g)" value={foodForm.protein_g} onChange={(value) => setFoodForm((prev) => ({ ...prev, protein_g: value }))} />
            <Field label="Fiber (g)" value={foodForm.fiber_g} onChange={(value) => setFoodForm((prev) => ({ ...prev, fiber_g: value }))} />
            <Field label="Sodium (mg)" value={foodForm.sodium_mg} onChange={(value) => setFoodForm((prev) => ({ ...prev, sodium_mg: value }))} />
            <Field label="Potassium (mg)" value={foodForm.potassium_mg} onChange={(value) => setFoodForm((prev) => ({ ...prev, potassium_mg: value }))} />
            <Field label="Phosphorus (mg)" value={foodForm.phosphorus_mg} onChange={(value) => setFoodForm((prev) => ({ ...prev, phosphorus_mg: value }))} />
          </div>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Notes
            <textarea value={foodForm.notes} onChange={(event) => setFoodForm((prev) => ({ ...prev, notes: event.target.value }))} className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <button
            type="button"
            onClick={saveFood}
            disabled={savingLog || !foodForm.food_name.trim()}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingLog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Utensils className="h-4 w-4" />}
            Log Food
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Weekly Nutrition Insights</h2>
              <p className="mt-1 text-sm text-slate-500">Ties weekly intake to training load, labs, and current guardrails.</p>
            </div>
            <button
              type="button"
              onClick={loadInsights}
              disabled={loadingInsights}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Analyze
            </button>
          </div>

          {insights ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4 lg:col-span-2">
                <p className="text-sm font-semibold text-slate-900">Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{String(insights.summary || '')}</p>
              </div>
              <ListCard title="Wins" items={asStrings(insights.wins)} />
              <ListCard title="Risks" items={asStrings(insights.risks)} />
              <ListCard title="Next Actions" items={asStrings(insights.next_actions)} />
              <ListCard title="Doctor Topics" items={asStrings(insights.doctor_topics)} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Run analysis after you have targets or a few food logs.</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Saved Grocery Lists</h2>
          <button type="button" onClick={loadSavedLists} className="text-sm text-blue-600 hover:underline">Refresh</button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {savedLists.length === 0 ? <p className="text-sm text-slate-500">No saved grocery lists yet.</p> : savedLists.slice(0, 4).map((list) => (
            <div key={String(list.id)} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{String(list.title || 'Grocery List')}</p>
              <p className="mt-1 text-xs text-slate-500">{String(list.goal || '')}</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {asStrings(list.items).slice(0, 8).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Nutrition Quiz</h2>
            <p className="mt-1 text-sm text-slate-500">Short learning loops around sodium, workout fueling, kidney-aware choices, and cardiac-safe patterns.</p>
          </div>
          <button type="button" onClick={loadQuiz} disabled={loadingQuiz} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {loadingQuiz ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            New Quiz
          </button>
        </div>
        {quiz ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm font-semibold text-slate-900">{String(quiz.topic || 'Nutrition Quiz')}</p>
            {asRecords(quiz.questions).map((question, index) => (
              <div key={`${String(question.question)}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">{index + 1}. {String(question.question || '')}</p>
                <div className="mt-3 space-y-2">
                  {asStrings(question.options).map((option, optionIndex) => (
                    <label key={`${option}-${optionIndex}`} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="radio" name={`quiz-${index}`} checked={quizAnswers[index] === optionIndex} onChange={() => setQuizAnswers((prev) => prev.map((value, idx) => idx === index ? optionIndex : value))} />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button type="button" onClick={submitQuiz} disabled={submittingQuiz} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                {submittingQuiz ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                Submit Quiz
              </button>
              {quizResult ? <p className="text-sm text-emerald-700">{quizResult}</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Recent Food Entries</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {logs.slice(0, 10).map((log) => (
            <div key={log.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{log.food_name}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${pillClass(log.food_rating)}`}>{log.food_rating}</span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{log.meal_type}</p>
              <p className="mt-2 text-sm text-slate-700">
                {log.calories ?? '—'} cal · Protein {log.protein_g ?? '—'} g · Sodium {log.sodium_mg ?? '—'} mg
              </p>
              <p className="text-xs text-slate-500">Potassium {log.potassium_mg ?? '—'} mg · Phosphorus {log.phosphorus_mg ?? '—'} mg</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'number',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
    </label>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Apple className="h-4 w-4 text-emerald-500" />
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <ul className="mt-2 space-y-2 text-sm text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function asRecords(value: unknown) {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function pillClass(rating: string) {
  if (rating === 'green') return 'bg-emerald-100 text-emerald-700';
  if (rating === 'red') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}
