import type { PillTone } from '@/components/ui/DataTable';

/**
 * A lab flag as a pill tone, for every lab table.
 *
 * Out of range either way (low, high, critical_*) is red; borderline is yellow;
 * in range is green. Low is NOT blue: blue is this app's primary-action color,
 * and a low reading is as much a finding as a high one.
 */
export function labFlagTone(flag: string | null | undefined): PillTone {
  switch ((flag ?? '').toLowerCase()) {
    case 'normal':
      return 'green';
    case 'borderline':
      return 'yellow';
    case 'low':
    case 'high':
      return 'red';
    default:
      // critical, critical_low, critical_high
      return (flag ?? '').toLowerCase().startsWith('critical') ? 'red' : 'slate';
  }
}
