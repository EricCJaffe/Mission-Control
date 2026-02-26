'use client';

import { useState } from 'react';

const BAR_WEIGHT = 45;
const PLATES = [45, 35, 25, 10, 5, 2.5];

type PlateSet = { weight: number; count: number };

function calcPlates(targetLbs: number): PlateSet[] | null {
  const perSide = (targetLbs - BAR_WEIGHT) / 2;
  if (perSide < 0) return null;

  let remaining = perSide;
  const result: PlateSet[] = [];

  for (const plate of PLATES) {
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.push({ weight: plate, count });
      remaining = Math.round((remaining - plate * count) * 10) / 10;
    }
  }

  if (remaining > 0.01) return null; // can't make exact weight
  return result;
}

export default function PlateCalculator() {
  const [target, setTarget] = useState('');
  const plates = target ? calcPlates(parseFloat(target)) : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Plate Calculator</h3>
      <div className="flex gap-2 items-center mb-4">
        <input
          type="number"
          step="2.5"
          min="45"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target lbs"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-32"
        />
        <span className="text-xs text-slate-500">({BAR_WEIGHT} lb bar)</span>
      </div>

      {target && (
        <div>
          {plates === null ? (
            <p className="text-xs text-red-500">
              {parseFloat(target) < BAR_WEIGHT
                ? `Minimum is ${BAR_WEIGHT} lbs (bar only)`
                : "Can't make that exact weight with standard plates"}
            </p>
          ) : plates.length === 0 ? (
            <p className="text-sm text-slate-600 font-medium">Bar only ({BAR_WEIGHT} lbs)</p>
          ) : (
            <div>
              <p className="text-xs text-slate-500 mb-2">Per side:</p>
              <div className="flex flex-wrap gap-2">
                {plates.map(({ weight, count }) => (
                  <div key={weight} className="flex items-center gap-1">
                    {Array.from({ length: count }).map((_, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${
                          weight === 45 ? 'bg-blue-600 h-8 w-8' :
                          weight === 35 ? 'bg-green-600 h-7 w-7' :
                          weight === 25 ? 'bg-red-500 h-6 w-6' :
                          weight === 10 ? 'bg-slate-600 h-5 w-5' :
                          weight === 5  ? 'bg-yellow-600 h-4 w-4' :
                          'bg-slate-400 h-4 w-4 text-[10px]'
                        }`}
                      >
                        {weight < 10 ? weight : weight}
                      </span>
                    ))}
                    <span className="text-xs text-slate-500">×{count}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Each side: {plates.reduce((sum, p) => sum + p.weight * p.count, 0)} lbs
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
