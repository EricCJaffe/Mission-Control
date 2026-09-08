import NavLink from "@/components/NavLink";

/*
 * The three brain views, in the order they earn their place.
 *
 * Scheduled work first: ~28 jobs run across three mechanisms and nothing
 * listed them together until this page, so it is the one that answers a
 * question nobody could otherwise answer. Clients second, briefs third.
 *
 * `exact` on /brain, because /brain/clients and /brain/briefs live underneath
 * it and without it the first tab stays lit on all three.
 */
export default function BrainTabs() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-full bg-slate-100 p-1">
      <NavLink href="/brain" label="Scheduled work" exact />
      <NavLink href="/brain/clients" label="Clients" />
      <NavLink href="/brain/briefs" label="Briefs" />
    </nav>
  );
}
