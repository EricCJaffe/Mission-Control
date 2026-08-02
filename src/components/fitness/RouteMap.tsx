import { Mountain, Route as RouteIcon } from 'lucide-react';
import {
  projectRoute,
  toSvgPath,
  routeDistanceMiles,
  type RoutePoint,
} from '@/lib/fitness/route-map';

type Props = {
  points: RoutePoint[];
  elevationGainM?: number | null;
  elevationLossM?: number | null;
  width?: number;
  height?: number;
};

const M_TO_FT = 3.28084;

/**
 * Draws a workout's GPS trace as an inline SVG.
 *
 * No tiles and no map library: a bare trace shows the shape of the route,
 * which is the thing worth seeing on a workout page, and it renders on the
 * server with no key, no network call and no third-party script.
 */
export default function RouteMap({
  points,
  elevationGainM,
  elevationLossM,
  width = 640,
  height = 320,
}: Props) {
  if (!points || points.length < 2) return null;

  const projected = projectRoute(points, width, height);
  const path = toSvgPath(projected);
  if (!path) return null;

  const start = projected[0];
  const end = projected[projected.length - 1];
  const miles = routeDistanceMiles(points);

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
      <div className="bg-slate-50">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Route map, ${miles} miles`}
        >
          {/* Casing under the line so the trace stays legible where it
              crosses itself on an out-and-back. */}
          <path d={path} fill="none" stroke="#ffffff" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path} fill="none" stroke="#0ea5e9" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={start.x} cy={start.y} r={6} fill="#059669" stroke="#fff" strokeWidth={2} />
          <circle cx={end.x} cy={end.y} r={6} fill="#e11d48" stroke="#fff" strokeWidth={2} />
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <RouteIcon className="h-3.5 w-3.5 text-sky-600" />
          <span className="font-semibold tabular-nums">{miles} mi</span>
        </span>
        {elevationGainM != null && (
          <span className="flex items-center gap-1.5">
            <Mountain className="h-3.5 w-3.5 text-slate-400" />
            <span className="tabular-nums">
              +{Math.round(elevationGainM * M_TO_FT)} ft
              {elevationLossM != null && ` / −${Math.round(elevationLossM * M_TO_FT)} ft`}
            </span>
          </span>
        )}
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-600" /> start
          <span className="ml-2 h-2 w-2 rounded-full bg-rose-600" /> finish
        </span>
        <span className="ml-auto text-slate-300 tabular-nums">{points.length} pts</span>
      </div>
    </div>
  );
}
