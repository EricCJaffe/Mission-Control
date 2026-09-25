/**
 * The best-practice library: what each kind of thing needs, and how often.
 *
 * These are GENERIC defaults, drawn from manufacturer care guides and the
 * common service intervals across brands (sources on each entry). They are a
 * starting point until an asset has its exact make and model, at which point
 * "Research this model" on the asset page asks for the model-specific
 * schedule, and the owner's manual always wins over both.
 *
 * Kept in code rather than in a table on purpose: it is reference content that
 * changes by review, not by use, and a diff is the right way to change it.
 *
 * Every rule is an RFC 5545 RRULE in the subset src/lib/tasks/recurrence.ts
 * understands, so a library entry becomes an ordinary recurring task with no
 * translation. `anchor` pins a seasonal item to a date (MM-DD); without one the
 * first occurrence is staggered over the next few weeks, so loading the
 * starter inventory does not put sixty jobs on one Saturday.
 */

import { addDays } from '../day.ts';
import { nextOccurrence } from '../tasks/recurrence.ts';

export type Category =
  | 'small_engine'
  | 'lawn_mower'
  | 'tractor'
  | 'chainsaw'
  | 'boat'
  | 'pwc'
  | 'vehicle'
  | 'rv'
  | 'generator'
  | 'hvac'
  | 'water_system'
  | 'refrigerator'
  | 'dishwasher'
  | 'clothes_washer'
  | 'other';

export type CategoryInfo = {
  label: string;
  group: 'Engines & equipment' | 'Vehicles & water' | 'Home systems' | 'Appliances' | 'Other';
  meterUnit: 'hours' | 'miles' | null;
  /* Gets the off-season engine routine on top of its own items. */
  smallEngine: boolean;
};

export const CATEGORIES: Record<Category, CategoryInfo> = {
  tractor:        { label: 'Tractor',                 group: 'Engines & equipment', meterUnit: 'hours', smallEngine: true },
  lawn_mower:     { label: 'Lawn mower',              group: 'Engines & equipment', meterUnit: 'hours', smallEngine: true },
  chainsaw:       { label: 'Chainsaw',                group: 'Engines & equipment', meterUnit: null,    smallEngine: true },
  small_engine:   { label: 'Small engine (other)',    group: 'Engines & equipment', meterUnit: 'hours', smallEngine: true },
  vehicle:        { label: 'Car / truck',             group: 'Vehicles & water',    meterUnit: 'miles', smallEngine: false },
  rv:             { label: 'RV / motorhome',          group: 'Vehicles & water',    meterUnit: 'miles', smallEngine: false },
  generator:      { label: 'Generator',               group: 'Engines & equipment', meterUnit: 'hours', smallEngine: false },
  boat:           { label: 'Boat',                    group: 'Vehicles & water',    meterUnit: 'hours', smallEngine: true },
  pwc:            { label: 'Jet ski',                 group: 'Vehicles & water',    meterUnit: 'hours', smallEngine: true },
  hvac:           { label: 'Air conditioning / HVAC', group: 'Home systems',        meterUnit: null,    smallEngine: false },
  water_system:   { label: 'Water system',            group: 'Home systems',        meterUnit: null,    smallEngine: false },
  refrigerator:   { label: 'Refrigerator',            group: 'Appliances',          meterUnit: null,    smallEngine: false },
  dishwasher:     { label: 'Dishwasher',              group: 'Appliances',          meterUnit: null,    smallEngine: false },
  clothes_washer: { label: 'Clothes washer',          group: 'Appliances',          meterUnit: null,    smallEngine: false },
  other:          { label: 'Other',                   group: 'Other',               meterUnit: null,    smallEngine: false },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function isCategory(value: string): value is Category {
  return value in CATEGORIES;
}

export type LibraryItem = {
  key: string;
  title: string;
  rule: string;
  /* MM-DD. Seasonal items start from this date; others are staggered. */
  anchor?: string;
  /* "…or every N hours/miles, whichever comes first." */
  meterInterval?: number;
  instructions: string;
  /* One line on why it matters — becomes the task's `why`. */
  why: string;
  /* Scheduled automatically when an asset is added. The rest are offered. */
  seed: boolean;
};

const OFF_SEASON = 'FREQ=MONTHLY;BYMONTH=11,12,1,2,3';

/*
 * The off-season engine routine, shared by every engine category.
 *
 * The research is honest about a split here: fuel treatment is what every
 * manufacturer and fuel supplier agrees on; the monthly start is a common
 * owner habit that forum opinion divides on. Both are kept because Eric asked
 * for the start specifically, and the instructions carry the one condition
 * that makes it help rather than hurt — run it to full temperature or don't
 * start it at all, since a two-minute start condenses water in the crankcase.
 */
const SMALL_ENGINE_ITEMS: LibraryItem[] = [
  {
    key: 'engine.stabilize_fuel',
    title: 'Stabilize fuel before storage',
    rule: 'FREQ=YEARLY',
    anchor: '11-01',
    instructions:
      'Top the tank with fresh fuel (ethanol-free if you can get it), add stabilizer at the label rate, and run 5–10 minutes so treated fuel reaches the carburetor or injectors. A full tank leaves less air for condensation. For anything stored 60+ days with a carburetor, shut the fuel valve and run it dry, or drain the float bowl.',
    why: 'Stale ethanol fuel varnishes carburetors — the most common reason a small engine will not start in spring.',
    seed: true,
  },
  {
    key: 'engine.winter_start',
    title: 'Off-season start — run to full temperature',
    rule: OFF_SEASON,
    anchor: '11-01',
    instructions:
      'Start it and run 10–15 minutes until fully warm, under load if practical (engage blades, drive it, run the saw). Check for leaks, weak battery or hard starting while you are there. Do NOT do a two-minute start: a short run condenses water in the crankcase and exhaust without burning it off. If there is no time for a full run, skip the month.',
    why: 'Keeps seals lubricated and the battery exercised, and surfaces a no-start in January instead of on the first mowing day.',
    seed: true,
  },
  {
    key: 'engine.spring_startup',
    title: 'Spring startup inspection',
    rule: 'FREQ=YEARLY',
    anchor: '03-01',
    instructions:
      'Charge or replace the battery, check oil level and color, inspect belts, hoses and fuel lines for cracks, check tire pressure, and confirm every safety interlock still cuts the engine.',
    why: 'Finds the winter damage — mice, dead battery, cracked fuel line — before the season needs the machine.',
    seed: true,
  },
];

export const LIBRARY: Record<Category, LibraryItem[]> = {
  lawn_mower: [
    {
      key: 'mower.oil',
      title: 'Change engine oil',
      rule: 'FREQ=YEARLY',
      anchor: '03-01',
      meterInterval: 50,
      instructions: 'Warm the engine, drain, and refill with the grade on the engine decal (typically SAE 30 or 10W-30). Replace the oil filter if it has one. Every 50 hours or each spring, whichever first.',
      why: 'Small air-cooled engines run hot and shear oil fast; old oil is the leading cause of worn bearings.',
      seed: true,
    },
    {
      key: 'mower.blades',
      title: 'Sharpen and balance blades',
      rule: 'FREQ=MONTHLY;INTERVAL=2;BYMONTH=3,5,7,9',
      anchor: '03-15',
      meterInterval: 25,
      instructions: 'Disconnect the plug wire. Remove, sharpen to the original angle, and balance on a nail before refitting — an unbalanced blade destroys spindle bearings. Replace if cracked, bent or thinned.',
      why: 'A dull blade tears grass, which browns and invites disease, and makes the engine work harder.',
      seed: true,
    },
    {
      key: 'mower.air_filter',
      title: 'Clean or replace air filter',
      rule: 'FREQ=MONTHLY;INTERVAL=3;BYMONTH=3,6,9',
      anchor: '03-01',
      meterInterval: 25,
      instructions: 'Tap out paper elements; replace when light will not pass through. Wash foam pre-filters in soapy water, dry, and lightly oil. Dusty conditions halve the interval.',
      why: 'A choked filter makes the engine run rich, foul the plug and lose power.',
      seed: true,
    },
    {
      key: 'mower.plug',
      title: 'Replace spark plug',
      rule: 'FREQ=YEARLY',
      anchor: '03-01',
      meterInterval: 100,
      instructions: 'Gap to spec (commonly 0.030"). Note the plug number in Parts on this asset.',
      why: 'Cheap, and the difference between one pull and ten.',
      seed: false,
    },
    {
      key: 'mower.deck',
      title: 'Clean under the deck; check tires and belts',
      rule: 'FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10',
      anchor: '04-01',
      instructions: 'Scrape caked clippings (they hold moisture and rust the deck), check tire pressure evenly side to side for an even cut, and look over drive and deck belts for glazing or cracks.',
      why: 'Uneven tires scalp the lawn; a rusted-through deck is a replacement, not a repair.',
      seed: false,
    },
  ],

  tractor: [
    {
      key: 'tractor.oil',
      title: 'Change engine oil and filter',
      rule: 'FREQ=YEARLY',
      anchor: '03-01',
      meterInterval: 150,
      instructions: 'Most compact diesels call for 100–250 hours (first change often at 50). Use the manual\'s interval and grade — enter the model on this asset and run the research to replace this default.',
      why: 'Diesel soot loads the oil even at low hours; annual changes matter as much as hourly ones on a lightly used tractor.',
      seed: true,
    },
    {
      key: 'tractor.grease',
      title: 'Grease all fittings',
      rule: 'FREQ=MONTHLY',
      meterInterval: 10,
      instructions: 'Every zerk on the front axle, loader pins, three-point hitch and PTO shaft — typically every 8–10 hours of use or monthly. Pump until clean grease pushes out the old.',
      why: 'Loader and axle pins wear fastest of anything on a tractor, and grease is the whole defense.',
      seed: true,
    },
    {
      key: 'tractor.hydraulic',
      title: 'Change hydraulic/transmission fluid and filter',
      rule: 'FREQ=YEARLY;INTERVAL=2',
      anchor: '03-01',
      meterInterval: 400,
      instructions: 'Use the specified universal tractor fluid (UTF) — not generic hydraulic oil. Clean the suction screen while drained.',
      why: 'The same fluid runs the transmission, loader and brakes; contaminated fluid takes all three.',
      seed: true,
    },
    {
      key: 'tractor.air_filter',
      title: 'Inspect air filter and radiator screen',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      meterInterval: 50,
      instructions: 'Blow out the primary element from the inside with low-pressure air; never wash it. Clear chaff from the radiator screen and grille.',
      why: 'Mowing and brush work plug the radiator screen; overheating follows within the hour.',
      seed: true,
    },
    {
      key: 'tractor.fuel_filter',
      title: 'Replace fuel filter; drain water separator',
      rule: 'FREQ=YEARLY',
      anchor: '10-15',
      meterInterval: 400,
      instructions: 'Drain the water separator bowl more often if you see water. Bleed the fuel system per the manual after the change.',
      why: 'Water in diesel destroys injection pumps, which cost more than the tractor\'s annual service many times over.',
      seed: false,
    },
    {
      key: 'tractor.coolant',
      title: 'Test coolant; replace every 2 years',
      rule: 'FREQ=YEARLY;INTERVAL=2',
      anchor: '10-15',
      instructions: 'Check freeze point with a hydrometer or strips each fall; replace per the manual.',
      why: 'Depleted coolant corrodes from inside long before it fails to protect against cold.',
      seed: false,
    },
  ],

  chainsaw: [
    {
      key: 'saw.chain_bar',
      title: 'Sharpen chain; clean bar groove and oil holes',
      rule: 'FREQ=MONTHLY',
      instructions: 'Sharpen when it throws dust instead of chips. Clean the bar groove and oil port, flip the bar to even wear, and check the sprocket. Confirm the chain oiler throws a line of oil on a bright surface.',
      why: 'A dull chain is the leading cause of kickback and of a saw worked to death.',
      seed: true,
    },
    {
      key: 'saw.air_filter',
      title: 'Clean air filter and cooling fins',
      rule: 'FREQ=MONTHLY',
      instructions: 'After each day of cutting in season. Brush sawdust from the cylinder fins and starter housing.',
      why: 'Two-stroke saws run lean and hot when choked; a lean seizure ends the engine.',
      seed: true,
    },
    {
      key: 'saw.plug_fuel_filter',
      title: 'Replace spark plug and fuel filter',
      rule: 'FREQ=YEARLY',
      anchor: '03-01',
      instructions: 'Fish the fuel filter out of the tank with a wire hook. Use fresh 2-stroke mix at the correct ratio (commonly 50:1) — premixed ethanol-free fuel stores best.',
      why: 'Mixed fuel goes stale within about 30 days without stabilizer.',
      seed: false,
    },
  ],

  small_engine: [
    {
      key: 'small.oil',
      title: 'Change oil',
      rule: 'FREQ=YEARLY',
      anchor: '03-01',
      meterInterval: 50,
      instructions: 'Four-stroke only. Generators often need a first change at 20–25 hours.',
      why: 'Air-cooled engines are hard on oil.',
      seed: true,
    },
    {
      key: 'small.air_filter',
      title: 'Clean air filter',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      meterInterval: 25,
      instructions: 'Tap out paper elements, wash and re-oil foam.',
      why: 'Keeps the mixture right and the plug clean.',
      seed: false,
    },
    {
      key: 'small.generator_load',
      title: 'Run generator under load',
      rule: 'FREQ=MONTHLY',
      instructions: 'For a generator: run 20–30 minutes with a real load plugged in, and check the transfer switch or cord set. Skip for other equipment.',
      why: 'The day you need a generator is the worst day to learn it will not start.',
      seed: false,
    },
  ],

  boat: [
    {
      key: 'boat.engine_service',
      title: 'Annual engine service (oil, filters, gear lube)',
      rule: 'FREQ=YEARLY',
      anchor: '02-15',
      meterInterval: 100,
      instructions: 'Engine oil and filter (4-stroke), fuel filter and water-separator element, lower-unit gear oil (look for milky oil — water past a seal), and grease steering and tilt points. Every 100 hours or yearly, whichever first.',
      why: 'Marine engines work at sustained high load in a corrosive environment; the annual service is the minimum, not the nice-to-have.',
      seed: true,
    },
    {
      key: 'boat.impeller',
      title: 'Replace water-pump impeller',
      rule: 'FREQ=YEARLY;INTERVAL=2',
      anchor: '02-15',
      meterInterval: 300,
      instructions: 'Every 2–3 years (sooner in sandy or silty water). Watch the tell-tale stream every launch in between.',
      why: 'A failed impeller overheats the engine in minutes, usually far from the ramp.',
      seed: true,
    },
    {
      key: 'boat.anodes_trailer',
      title: 'Check anodes; grease trailer bearings',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      instructions: 'Replace sacrificial anodes at half-consumed. Grease or check trailer hubs and bearing buddies, test trailer lights and brakes, and inspect tires for dry rot.',
      why: 'Trailer bearings fail on the highway, and spent anodes mean the engine starts corroding instead.',
      seed: true,
    },
    {
      key: 'boat.battery',
      title: 'Check batteries and bilge pump',
      rule: 'FREQ=MONTHLY',
      instructions: 'Voltage, terminals, a maintainer during storage, and a float-switch test on the bilge pump.',
      why: 'A dead bilge pump sinks a boat at the dock.',
      seed: false,
    },
    {
      key: 'boat.flush',
      title: 'Flush engine with fresh water',
      rule: 'FREQ=WEEKLY;BYDAY=SU',
      instructions: 'After every use — especially salt or brackish water. Muffs or flush port, 5–10 minutes, engine running for most outboards (check yours). Delete this schedule if you prefer to do it by habit rather than by reminder.',
      why: 'Salt crystallizes in cooling passages and corrodes from inside.',
      seed: false,
    },
  ],

  pwc: [
    {
      key: 'pwc.flush',
      title: 'Flush cooling system after riding',
      rule: 'FREQ=WEEKLY;BYDAY=SU',
      instructions: 'After every ride, salt or fresh. Start the engine first, THEN turn on the hose; run 1–2 minutes (per the manual — some models differ); turn the water off BEFORE the engine, then rev briefly to clear water. Delete this if you do it by habit.',
      why: 'Salt, sand and silt clog cooling passages; the manufacturers all put this first.',
      seed: true,
    },
    {
      key: 'pwc.service',
      title: 'Annual service (oil, filter, plugs, pump inspection)',
      rule: 'FREQ=YEARLY',
      anchor: '02-15',
      meterInterval: 50,
      instructions: 'Every 50 hours or 12 months across Yamaha, Sea-Doo and Kawasaki. Oil and filter, plugs, inspect impeller and wear ring, grease the driveshaft splines and steering.',
      why: 'A worn wear ring is the usual cause of "it just feels slower".',
      seed: true,
    },
    {
      key: 'pwc.battery',
      title: 'Check battery; tender during storage',
      rule: 'FREQ=MONTHLY',
      instructions: 'Keep it on a maintainer whenever it sits more than two weeks. Replace every 3–5 years.',
      why: 'PWC batteries are small and self-discharge quickly.',
      seed: true,
    },
    {
      key: 'pwc.trailer',
      title: 'Trailer bearings, lights and tires',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      instructions: 'Grease hubs, test lights, check tire pressure and dry rot, rinse the trailer after salt water.',
      why: 'The trailer is the part most likely to strand you.',
      seed: false,
    },
  ],

  vehicle: [
    {
      key: 'car.oil',
      title: 'Oil and filter change',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      meterInterval: 5000,
      instructions: 'Most modern synthetic-oil engines run 5,000–10,000 miles; follow the maintenance minder or the manual\'s "severe service" interval for short trips and heat.',
      why: 'The one service that decides whether an engine reaches 200,000 miles.',
      seed: true,
    },
    {
      key: 'car.rotate',
      title: 'Rotate tires; check tread and alignment',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      meterInterval: 6000,
      instructions: 'Usually with every oil change. Replace at 4/32" for wet-road grip. Uneven wear means alignment.',
      why: 'Rotation evens wear and is often required to keep the tire warranty.',
      seed: true,
    },
    {
      key: 'car.pressure',
      title: 'Check tire pressure (and spare)',
      rule: 'FREQ=MONTHLY',
      instructions: 'Cold, to the door-jamb placard — not the number on the sidewall.',
      why: 'Under-inflation is the top cause of tire failure and costs fuel economy.',
      seed: true,
    },
    {
      key: 'car.filters',
      title: 'Replace engine and cabin air filters',
      rule: 'FREQ=YEARLY',
      anchor: '04-01',
      meterInterval: 15000,
      instructions: 'Cabin filter yearly in pollen and humidity; engine filter every 15,000–30,000 miles or when dirty.',
      why: 'A clogged cabin filter is most of a weak, musty AC.',
      seed: true,
    },
    {
      key: 'car.inspection',
      title: 'Annual safety check: brakes, battery, wipers, fluids',
      rule: 'FREQ=YEARLY',
      anchor: '10-01',
      instructions: 'Brake pad and rotor check, battery load test (heat kills batteries in 3–4 years in the South), wiper blades, coolant, brake and transmission fluid per the manual, lights.',
      why: 'Catches the failures that strand you rather than the ones that merely wear.',
      seed: true,
    },
  ],

  /*
   * The coach: a 2026 Entegra Esteem 29V on a Ford E-450 (7.3L gas). From the
   * schedule in the "Travel RV and Vacations" handoff pack, 2026-09-25. Items
   * marked "verify" there say so in their instructions — the owner's manual
   * wins. The pack's cadence is a monthly review on the 1st and a quarterly
   * roof / seal / tow-bar review, so the monthly and quarterly checks are one
   * task each rather than six separate reminders on the same morning.
   */
  rv: [
    {
      key: 'rv.monthly_review',
      title: 'Monthly RV check (1st of the month)',
      rule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      instructions: 'Chassis fluids (coolant, transmission, brake, washer) · house batteries · test the LP detector (note its expiry) · test smoke and CO alarms · extinguisher gauge in the green · clean the roof A/C filters if it has been in use.',
      why: 'Six quick checks that each fail silently: a dead CO alarm or an expired LP detector gives no warning until it matters.',
      seed: true,
    },
    {
      key: 'rv.quarterly_review',
      title: 'Quarterly: roof, slide seals, tow bar',
      rule: 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1',
      anchor: '10-01',
      instructions: 'Roof seams and sealant (Florida sun — reseal as needed) · clean and condition slide seals · clean and dry-lube the Blue Ox Avail legs (Blue Ox recommends dry lube); inspect boots and pins.',
      why: 'Roof leaks are the most expensive RV damage and start as a hairline crack in sealant.',
      seed: true,
    },
    {
      key: 'rv.oil',
      title: 'Engine oil and filter (7.3L); inspect air filter',
      rule: 'FREQ=YEARLY',
      meterInterval: 5000,
      instructions: 'Follow the Ford oil-life monitor; about 5,000 miles when towing (severe duty) or 12 months. Inspect the engine air filter at the same visit. Verify the interval in the Ford schedule.',
      why: 'Towing is severe duty by Ford\'s own definition.',
      seed: true,
    },
    {
      key: 'rv.brakes',
      title: 'Inspect brakes',
      rule: 'FREQ=YEARLY',
      meterInterval: 10000,
      instructions: '12 months or 10,000 miles (verify with Ford). A 14,500 lb coach plus a Jeep stops on these.',
      why: 'The heaviest thing you drive, towing the second-heaviest.',
      seed: true,
    },
    {
      key: 'rv.trans_coolant',
      title: 'Transmission fluid and coolant service — check the Ford schedule',
      rule: 'FREQ=YEARLY',
      instructions: 'Towing puts the transmission on the severe-duty schedule. Look up the E-450 7.3L intervals, set the right miles here, and log what the shop does.',
      why: 'The interval was never confirmed; this reminder exists until it is.',
      seed: true,
    },
    {
      key: 'rv.annual_chassis',
      title: 'Annual: chassis battery, wipers, lug-nut torque, tire DOT dates',
      rule: 'FREQ=YEARLY',
      anchor: '09-01',
      instructions: 'Load-test the chassis battery · new wiper blades (Florida sun) · torque the lug nuts (and after any wheel service) · read the tire DOT date codes; RV tires age out at about 6–7 years before they wear out.',
      why: 'Tires on an RV fail by age, not tread.',
      seed: true,
    },
    {
      key: 'rv.annual_house',
      title: 'Annual: slides, jacks, propane, water heater, sanitize',
      rule: 'FREQ=YEARLY',
      anchor: '09-15',
      instructions: 'Slide mechanism inspect and lube (verify with Entegra) · hydraulic jack fluid and inspection · professional propane leak test · tankless water heater service and descale (verify the brand manual) · sanitize the fresh-water system (also after storage) · baseplate bolt torque · Demco and Coach Link full inspection.',
      why: 'Everything that only fails at a campground, checked once a year at home.',
      seed: true,
    },
    {
      key: 'rv.awning',
      title: 'Clean awning fabric; inspect arms',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      instructions: 'Mild soap, soft brush, dry fully before rolling up.',
      why: 'Mildew in a rolled awning spreads fast in humidity.',
      seed: true,
    },
    {
      key: 'rv.water_filter',
      title: 'Replace water filter cartridge',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      instructions: 'Every 3 months or per the cartridge rating.',
      why: 'An old filter restricts flow at every park.',
      seed: true,
    },
    {
      key: 'rv.black_deep',
      title: 'Black tank deep clean (ice + dish soap)',
      rule: 'FREQ=MONTHLY;INTERVAL=2',
      instructions: 'Every 3–4 trips: before a travel day add ~10 gal water, a bag of ice and dish soap; driving scrubs the walls; dump on arrival. See the Black Tank guide.',
      why: 'Sensors misread once the tank walls are coated.',
      seed: false,
    },
    {
      key: 'rv.winterize',
      title: 'Freeze-protect / winterize',
      rule: 'FREQ=YEARLY',
      anchor: '11-15',
      instructions: 'Some fresh-water lines are exposed under the coach. When 32°F or below is expected: drain or heat the lines, or winterize fully.',
      why: 'One freezing night splits an exposed line.',
      seed: false,
    },
  ],

  /* Onan QG 4000 on the coach. Hours from the generator's own meter. */
  generator: [
    {
      key: 'gen.oil',
      title: 'Oil and filter; air filter',
      rule: 'FREQ=YEARLY',
      meterInterval: 150,
      instructions: 'About 150 hours or 12 months, whichever first (verify in the Onan manual). Air filter on the same interval.',
      why: 'Generators run long at full load; oil is what keeps them alive.',
      seed: true,
    },
    {
      key: 'gen.plug',
      title: 'Spark plug',
      rule: 'FREQ=YEARLY;INTERVAL=3',
      meterInterval: 450,
      instructions: 'About 450 hours (verify).',
      why: 'Hard starts and fault codes often begin at the plug.',
      seed: true,
    },
    {
      key: 'gen.exercise',
      title: 'Exercise: run 2 hours under load',
      rule: 'FREQ=MONTHLY',
      instructions: 'Roof A/C on, about 2 hours. Blocked until fault 45 is repaired — see Open issues.',
      why: 'Stale fuel and dry seals are why a generator will not start when it is needed.',
      seed: true,
    },
  ],

  hvac: [
    {
      key: 'hvac.filter',
      title: 'Replace air filter',
      rule: 'FREQ=MONTHLY;INTERVAL=2',
      instructions: '1" filters every 1–3 months — every 2 in a humid, run-all-year climate, monthly with pets or allergies; 4–5" media filters every 6–12 months. Write the size (e.g. 20x25x1, MERV 8–11) in Parts on this asset.',
      why: 'A loaded filter cuts airflow, freezes coils, and is the most common cause of a service call.',
      seed: true,
    },
    {
      key: 'hvac.drain',
      title: 'Flush condensate drain line',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      instructions: 'Pour a cup of distilled vinegar (not bleach, which can damage some pans and PVC cement) into the access tee at the air handler, wait 30 minutes, flush with water. Confirm the float/safety switch trips.',
      why: 'In a humid climate the drain line grows algae, backs up, and floods the ceiling or trips the unit off.',
      seed: true,
    },
    {
      key: 'hvac.tuneup',
      title: 'Professional tune-up',
      rule: 'FREQ=YEARLY;BYMONTH=4,10',
      anchor: '04-01',
      instructions: 'Spring for cooling, fall for heating: refrigerant charge, capacitor and contactor, coil cleaning, blower, heat-strip or furnace safety check.',
      why: 'Weak capacitors fail on the hottest day of the year; a tune-up finds them for the cost of the part.',
      seed: true,
    },
    {
      key: 'hvac.condenser',
      title: 'Clear and rinse outdoor condenser',
      rule: 'FREQ=YEARLY',
      anchor: '05-01',
      instructions: 'Power off at the disconnect. Clear 2 feet of vegetation, rinse the fins from the inside out with a garden hose (never a pressure washer), straighten bent fins.',
      why: 'A dirty condenser raises head pressure and energy use by double digits.',
      seed: false,
    },
  ],

  water_system: [
    {
      key: 'water.sediment',
      title: 'Replace sediment pre-filter',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      instructions: 'Every 3–6 months; sooner on well water or when pressure drops. Shut off, relieve pressure, replace the cartridge and O-ring lube, note the cartridge size in Parts.',
      why: 'The pre-filter protects everything downstream; it clogs first.',
      seed: true,
    },
    {
      key: 'water.carbon',
      title: 'Replace carbon filter',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      instructions: 'Every 6–12 months, or at the gallon rating. Remove if you do not have one.',
      why: 'A spent carbon filter stops removing chlorine and taste long before it looks dirty.',
      seed: true,
    },
    {
      key: 'water.softener_salt',
      title: 'Check softener salt; test hardness',
      rule: 'FREQ=MONTHLY',
      instructions: 'Keep salt a few inches above the water line; break up any salt bridge. Test output hardness with a strip each January. Clean the brine tank yearly.',
      why: 'A salt bridge silently stops softening, and scale builds in the water heater.',
      seed: true,
    },
    {
      key: 'water.uv',
      title: 'Replace UV lamp; clean quartz sleeve',
      rule: 'FREQ=YEARLY',
      anchor: '01-15',
      instructions: 'Lamp every 12 months even if lit — output drops below the dose for reliable disinfection after about 9,000 hours. Clean the sleeve every 6 months, replace it every 2 years. Remove if you have no UV unit.',
      why: 'A UV lamp that still glows can have stopped disinfecting.',
      seed: false,
    },
    {
      key: 'water.well_test',
      title: 'Lab-test well water',
      rule: 'FREQ=YEARLY',
      anchor: '04-15',
      instructions: 'Bacteria (total coliform/E. coli) and nitrates at minimum; after flooding, test again. County health departments often do it cheaply. Remove if you are on city water.',
      why: 'Private wells are not tested by anyone else.',
      seed: false,
    },
    {
      key: 'water.heater',
      title: 'Flush water heater; test relief valve',
      rule: 'FREQ=YEARLY',
      anchor: '01-15',
      instructions: 'Drain a few gallons until clear, lift the T&P relief valve briefly. Check the anode rod every 3 years.',
      why: 'Sediment shortens tank life and makes the burner or element work harder.',
      seed: false,
    },
  ],

  refrigerator: [
    {
      key: 'fridge.coils',
      title: 'Vacuum condenser coils',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      instructions: 'Unplug, remove the kick plate or pull it out, vacuum with a coil brush. Every 6 months; every 3 with pets.',
      why: 'Dusty coils make the compressor run longer and hotter — the main cause of early compressor failure.',
      seed: true,
    },
    {
      key: 'fridge.water_filter',
      title: 'Replace water filter',
      rule: 'FREQ=MONTHLY;INTERVAL=6',
      instructions: 'Every 6 months or at the indicator. Flush 2–4 gallons through after fitting. Note the filter part number in Parts.',
      why: 'An old filter restricts flow and stops filtering.',
      seed: true,
    },
    {
      key: 'fridge.gaskets',
      title: 'Clean door gaskets; check temperatures',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      instructions: 'Wipe seals with warm soapy water; a dollar bill closed in the door should drag. Fridge 37°F, freezer 0°F. Empty the drip pan if accessible.',
      why: 'A leaking seal wastes energy and frosts the freezer.',
      seed: true,
    },
  ],

  dishwasher: [
    {
      key: 'dish.filter',
      title: 'Clean filter and run cleaner cycle',
      rule: 'FREQ=MONTHLY',
      instructions: 'Twist out the filter, rinse and brush under warm water. Then run an empty hot cycle with a dishwasher cleaner tablet (Whirlpool, Maytag and Affresh all say monthly). Wipe the door gasket and the bottom of the door.',
      why: 'A clogged filter redeposits food on "clean" dishes and strains the pump.',
      seed: true,
    },
    {
      key: 'dish.spray_arms',
      title: 'Check spray arms and drain air gap',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      instructions: 'Clear spray-arm holes with a toothpick, confirm the arms spin freely, and clean the air gap at the sink if you have one.',
      why: 'Blocked jets are the usual cause of one rack washing badly.',
      seed: false,
    },
  ],

  clothes_washer: [
    {
      key: 'washer.clean',
      title: 'Run tub-clean cycle; wipe gasket and dispenser',
      rule: 'FREQ=MONTHLY',
      instructions: 'Empty hot "Clean Washer" cycle with a washer-cleaner tablet or 2 cups of vinegar. Front-loaders: wipe inside the door gasket folds and leave the door ajar between loads. Pull and rinse the detergent drawer.',
      why: 'Residue and mildew build in the gasket and outer tub — the source of musty laundry.',
      seed: true,
    },
    {
      key: 'washer.pump_filter',
      title: 'Clean drain-pump filter',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      instructions: 'Front-loaders: towel down, open the small door at the bottom front, drain via the hose, unscrew and clear the filter (coins, hair ties). Skip for top-loaders without one.',
      why: 'A blocked pump filter is the usual cause of "will not drain" errors.',
      seed: true,
    },
    {
      key: 'washer.hoses',
      title: 'Inspect fill hoses',
      rule: 'FREQ=YEARLY',
      anchor: '01-15',
      instructions: 'Look for bulges, cracks or rust at the ends. Replace every 5 years, preferably with braided stainless.',
      why: 'A burst fill hose floods at full water pressure until someone notices.',
      seed: true,
    },
  ],

  other: [],
};

/** Everything that applies to a category, its own items first. */
export function itemsFor(category: Category): LibraryItem[] {
  const own = LIBRARY[category] ?? [];
  return CATEGORIES[category]?.smallEngine ? [...own, ...SMALL_ENGINE_ITEMS] : own;
}

export function findItem(key: string): LibraryItem | null {
  for (const list of [...Object.values(LIBRARY), SMALL_ENGINE_ITEMS]) {
    const hit = list.find((i) => i.key === key);
    if (hit) return hit;
  }
  return null;
}

/**
 * The anchor and first due date for a schedule starting today.
 *
 * Seasonal items anchor on their most recent MM-DD, so the rule's own months
 * decide the first date (the winter start lands on Nov 1, not on today).
 * Everything else anchors `stagger` days out, clamped to the 28th so a monthly
 * rule never skips February.
 */
export function firstDue(
  rule: string,
  todayIso: string,
  opts: { anchor?: string; stagger?: number } = {},
): { anchor: string; due: string } {
  let anchor: string;
  if (opts.anchor) {
    const year = Number(todayIso.slice(0, 4));
    anchor = `${year}-${opts.anchor}`;
    if (anchor > todayIso) anchor = `${year - 1}-${opts.anchor}`;
  } else {
    anchor = addDays(todayIso, opts.stagger ?? 0);
    if (Number(anchor.slice(8, 10)) > 28) anchor = `${anchor.slice(0, 8)}28`;
  }
  const from = anchor > todayIso ? anchor : todayIso;
  const due = nextOccurrence(rule, anchor, addDays(from, -1)) ?? from;
  return { anchor, due };
}

/*
 * The starting inventory, one of each thing Eric named on 2026-09-24. Names
 * are placeholders until he adds the exact makes and models.
 */
export const STARTER: Array<{ name: string; category: Category }> = [
  { name: 'Tractor', category: 'tractor' },
  { name: 'Lawn mower', category: 'lawn_mower' },
  { name: 'Chainsaw', category: 'chainsaw' },
  { name: 'Boat', category: 'boat' },
  { name: 'Jet ski', category: 'pwc' },
  { name: 'Car', category: 'vehicle' },
  { name: 'Air conditioning', category: 'hvac' },
  { name: 'Water system', category: 'water_system' },
  { name: 'Refrigerator', category: 'refrigerator' },
  { name: 'Dishwasher', category: 'dishwasher' },
  { name: 'Clothes washer', category: 'clothes_washer' },
];
