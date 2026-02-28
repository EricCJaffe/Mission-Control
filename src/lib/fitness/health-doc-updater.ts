/**
 * Health Document Auto-Updater Service
 *
 * Core service for keeping health.md synchronized with changes across the application.
 * Detects when updates are needed, generates proposed content, and applies approved changes.
 */

import { createClient } from '@supabase/supabase-js';
import { buildAISystemPrompt } from './health-context';
import { callOpenAI } from '@/lib/openai';
import { diffLines } from 'diff';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export type UpdateTrigger =
  | 'medication_change'
  | 'lab_upload'
  | 'metric_shift'
  | 'methylation_upload'
  | 'appointment_notes'
  | 'manual_edit'
  | 'ai_recommendation'
  | 'bp_reading'
  | 'workout_logged';

export type SectionUpdate = {
  section_number: number;
  section_name: string;
  current_content: string;
  proposed_content: string;
  diff_html?: string;
  reason: string;
  trigger: UpdateTrigger;
  trigger_data?: any;
  confidence: 'high' | 'medium' | 'low';
  priority?: number;
};

export type DiffResult = {
  html: string;
  has_changes: boolean;
  additions: number;
  deletions: number;
};

/**
 * Section definitions for health.md
 */
const SECTIONS = {
  1: { name: 'Medical History', marker: '## 1. Medical History' },
  2: { name: 'Medications (Active)', marker: '## 2. Medications (Active)' },
  3: { name: 'Supplements (Active)', marker: '## 3. Supplements (Active)' },
  4: { name: 'Medication Timing Protocol', marker: '## 4. Medication Timing Protocol' },
  5: { name: 'Supplements to Consider', marker: '## 5. Supplements to Consider' },
  6: { name: 'Vital Baselines & Targets', marker: '## 6. Vital Baselines & Targets' },
  7: { name: 'Training Constraints', marker: '## 7. Training Constraints' },
  8: { name: 'Nutrition Context', marker: '## 8. Nutrition Context' },
  9: { name: 'Genetic / Methylation', marker: '## 9. Genetic / Methylation' },
  10: { name: 'Recommended Baseline Tests', marker: '## 10. Recommended Baseline Tests' },
  11: { name: 'Health Priorities', marker: '## 11. Health Priorities' },
  12: { name: 'Update Triggers', marker: '## 12. Update Triggers' },
} as const;

export class HealthDocUpdater {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabaseUrl = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    this.supabaseKey = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  }

  /**
   * Get Supabase client
   */
  private getClient() {
    return createClient(this.supabaseUrl, this.supabaseKey);
  }

  /**
   * Load current health.md content
   */
  async loadCurrentHealthDoc(userId: string): Promise<string | null> {
    const supabase = this.getClient();

    const { data, error } = await supabase
      .from('health_documents')
      .select('content')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();

    if (error || !data) {
      console.error('Failed to load health document:', error);
      return null;
    }

    return data.content;
  }

  /**
   * Extract a specific section from health.md
   */
  extractSection(content: string, sectionNumber: number): string | null {
    const section = SECTIONS[sectionNumber as keyof typeof SECTIONS];
    if (!section) return null;

    const lines = content.split('\n');
    const startIdx = lines.findIndex(line => line.trim() === section.marker);

    if (startIdx === -1) return null;

    // Find next section marker or end of document
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        endIdx = i;
        break;
      }
    }

    return lines.slice(startIdx, endIdx).join('\n').trim();
  }

  /**
   * Detect if updates are needed for given trigger
   */
  async detectUpdates(
    userId: string,
    trigger: UpdateTrigger,
    triggerData?: any
  ): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];

    switch (trigger) {
      case 'medication_change':
        updates.push(...(await this.detectMedicationUpdates(userId, triggerData)));
        break;

      case 'lab_upload':
        updates.push(...(await this.detectLabUpdates(userId, triggerData)));
        break;

      case 'metric_shift':
        updates.push(...(await this.detectMetricShiftUpdates(userId, triggerData)));
        break;

      case 'methylation_upload':
        updates.push(...(await this.detectMethylationUpdates(userId, triggerData)));
        break;

      case 'bp_reading':
        updates.push(...(await this.detectBPUpdates(userId, triggerData)));
        break;

      case 'workout_logged':
        updates.push(...(await this.detectWorkoutUpdates(userId, triggerData)));
        break;

      default:
        console.warn(`Unsupported trigger type: ${trigger}`);
    }

    return updates;
  }

  /**
   * Detect medication-related updates
   */
  private async detectMedicationUpdates(userId: string, triggerData: any): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];
    const healthDoc = await this.loadCurrentHealthDoc(userId);
    if (!healthDoc) return updates;

    // Section 2: Medications (Active)
    const currentMeds = this.extractSection(healthDoc, 2);
    if (currentMeds) {
      const proposedMeds = await this.generateMedicationsSection(userId);
      if (proposedMeds && proposedMeds !== currentMeds) {
        updates.push({
          section_number: 2,
          section_name: 'Medications (Active)',
          current_content: currentMeds,
          proposed_content: proposedMeds,
          reason: `Medication ${triggerData?.action || 'changed'}: ${triggerData?.medication_name || 'Unknown'}`,
          trigger: 'medication_change',
          trigger_data: triggerData,
          confidence: 'high',
          priority: 10,
        });
      }
    }

    // Section 3: Supplements (Active)
    const currentSupps = this.extractSection(healthDoc, 3);
    if (currentSupps) {
      const proposedSupps = await this.generateSupplementsSection(userId);
      if (proposedSupps && proposedSupps !== currentSupps) {
        updates.push({
          section_number: 3,
          section_name: 'Supplements (Active)',
          current_content: currentSupps,
          proposed_content: proposedSupps,
          reason: `Supplement ${triggerData?.action || 'changed'}: ${triggerData?.medication_name || 'Unknown'}`,
          trigger: 'medication_change',
          trigger_data: triggerData,
          confidence: 'high',
          priority: 10,
        });
      }
    }

    // Section 4: Medication Timing Protocol (AI-generated)
    const currentTiming = this.extractSection(healthDoc, 4);
    if (currentTiming && updates.length > 0) {
      // Only regenerate timing if medications or supplements changed
      const proposedTiming = await this.generateTimingProtocolSection(userId);
      if (proposedTiming && proposedTiming !== currentTiming) {
        updates.push({
          section_number: 4,
          section_name: 'Medication Timing Protocol',
          current_content: currentTiming,
          proposed_content: proposedTiming,
          reason: 'Medication/supplement regimen changed, timing protocol needs update',
          trigger: 'medication_change',
          trigger_data: triggerData,
          confidence: 'medium',
          priority: 8,
        });
      }
    }

    return updates;
  }

  /**
   * Detect lab-related updates
   */
  private async detectLabUpdates(userId: string, triggerData: any): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];
    const healthDoc = await this.loadCurrentHealthDoc(userId);
    if (!healthDoc) return updates;

    // Section 6: Vital Baselines & Targets
    const currentBaselines = this.extractSection(healthDoc, 6);
    if (currentBaselines) {
      const proposedBaselines = await this.generateVitalBaselinesSection(userId, triggerData);
      if (proposedBaselines && proposedBaselines !== currentBaselines) {
        updates.push({
          section_number: 6,
          section_name: 'Vital Baselines & Targets',
          current_content: currentBaselines,
          proposed_content: proposedBaselines,
          reason: `Lab results uploaded: ${triggerData?.test_names?.join(', ') || 'Multiple tests'}`,
          trigger: 'lab_upload',
          trigger_data: triggerData,
          confidence: 'high',
          priority: 9,
        });
      }
    }

    return updates;
  }

  /**
   * Detect metric shift updates
   */
  private async detectMetricShiftUpdates(userId: string, triggerData: any): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];
    const healthDoc = await this.loadCurrentHealthDoc(userId);
    if (!healthDoc) return updates;

    // Section 6: Vital Baselines & Targets
    const currentBaselines = this.extractSection(healthDoc, 6);
    if (currentBaselines) {
      const proposedBaselines = await this.generateVitalBaselinesSection(userId, triggerData);
      if (proposedBaselines && proposedBaselines !== currentBaselines) {
        const shifts = triggerData?.shifts || [];
        const shiftDescription = shifts.map((s: any) => `${s.metric.toUpperCase()}: ${s.old_value} → ${s.new_value}`).join(', ');

        updates.push({
          section_number: 6,
          section_name: 'Vital Baselines & Targets',
          current_content: currentBaselines,
          proposed_content: proposedBaselines,
          reason: `Metric shifts detected: ${shiftDescription}`,
          trigger: 'metric_shift',
          trigger_data: triggerData,
          confidence: 'medium',
          priority: 6,
        });
      }
    }

    return updates;
  }

  /**
   * Detect methylation report updates
   */
  private async detectMethylationUpdates(userId: string, triggerData: any): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];
    const healthDoc = await this.loadCurrentHealthDoc(userId);
    if (!healthDoc) return updates;

    // Section 9: Genetic / Methylation
    const currentGenetic = this.extractSection(healthDoc, 9);
    if (currentGenetic) {
      const proposedGenetic = await this.generateGeneticSection(userId, triggerData);
      if (proposedGenetic && proposedGenetic !== currentGenetic) {
        updates.push({
          section_number: 9,
          section_name: 'Genetic / Methylation',
          current_content: currentGenetic,
          proposed_content: proposedGenetic,
          reason: 'Methylation report uploaded and processed',
          trigger: 'methylation_upload',
          trigger_data: triggerData,
          confidence: 'high',
          priority: 7,
        });
      }
    }

    return updates;
  }

  /**
   * Detect BP reading updates
   */
  private async detectBPUpdates(userId: string, triggerData: any): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];
    const healthDoc = await this.loadCurrentHealthDoc(userId);
    if (!healthDoc) return updates;

    // Only update if BP is significantly elevated (not normal/elevated)
    const flagLevel = triggerData?.flag_level;
    if (!flagLevel || flagLevel === 'normal' || flagLevel === 'elevated') {
      return updates;
    }

    // Section 6: Vital Baselines & Targets
    const currentBaselines = this.extractSection(healthDoc, 6);
    if (currentBaselines) {
      const proposedBaselines = await this.generateVitalBaselinesSection(userId, triggerData);
      if (proposedBaselines && proposedBaselines !== currentBaselines) {
        updates.push({
          section_number: 6,
          section_name: 'Vital Baselines & Targets',
          current_content: currentBaselines,
          proposed_content: proposedBaselines,
          reason: `Blood pressure reading flagged: ${triggerData.systolic}/${triggerData.diastolic} (${flagLevel})`,
          trigger: 'bp_reading',
          trigger_data: triggerData,
          confidence: 'medium',
          priority: 8,
        });
      }
    }

    return updates;
  }

  /**
   * Detect workout pattern updates
   */
  private async detectWorkoutUpdates(userId: string, triggerData: any): Promise<SectionUpdate[]> {
    const updates: SectionUpdate[] = [];
    const healthDoc = await this.loadCurrentHealthDoc(userId);
    if (!healthDoc) return updates;

    // Analyze workout for concerning patterns
    const { WorkoutTriggerDetector } = await import('./workout-trigger-detector');
    const detector = new WorkoutTriggerDetector(this.supabaseUrl, this.supabaseKey);

    const patterns = await detector.analyzeWorkout({
      userId,
      workoutId: triggerData.workout_id,
      workoutType: triggerData.workout_type,
      durationMin: triggerData.duration_min,
      tss: triggerData.tss,
      strainScore: triggerData.strain_score,
      avgHr: triggerData.avg_hr,
      maxHr: triggerData.max_hr,
      rpeSession: triggerData.rpe_session,
      compliancePct: triggerData.compliance_pct,
    });

    // Only trigger update if concerning patterns detected
    if (patterns.length === 0) return updates;

    // Section 7: Training Constraints (if cardiac anomaly or intolerance)
    const hasCardiacConcern = patterns.some(p =>
      p.pattern_type === 'cardiac_anomaly' || p.pattern_type === 'exercise_intolerance'
    );

    if (hasCardiacConcern) {
      const currentConstraints = this.extractSection(healthDoc, 7);
      if (currentConstraints) {
        const proposedConstraints = await this.generateTrainingConstraintsSection(userId, {
          patterns,
          workout: triggerData,
        });
        if (proposedConstraints && proposedConstraints !== currentConstraints) {
          const patternDesc = patterns.map(p => p.description).join('; ');
          updates.push({
            section_number: 7,
            section_name: 'Training Constraints',
            current_content: currentConstraints,
            proposed_content: proposedConstraints,
            reason: `Workout patterns detected: ${patternDesc}`,
            trigger: 'workout_logged',
            trigger_data: { ...triggerData, patterns },
            confidence: 'medium',
            priority: patterns.some(p => p.severity === 'high') ? 9 : 7,
          });
        }
      }
    }

    // Section 6: Vital Baselines (if training load spike)
    const hasLoadSpike = patterns.some(p => p.pattern_type === 'training_load_spike');
    if (hasLoadSpike) {
      const currentBaselines = this.extractSection(healthDoc, 6);
      if (currentBaselines) {
        const proposedBaselines = await this.generateVitalBaselinesSection(userId, {
          patterns,
          workout: triggerData,
        });
        if (proposedBaselines && proposedBaselines !== currentBaselines) {
          updates.push({
            section_number: 6,
            section_name: 'Vital Baselines & Targets',
            current_content: currentBaselines,
            proposed_content: proposedBaselines,
            reason: `Training load spike detected in workout (${triggerData.tss} TSS)`,
            trigger: 'workout_logged',
            trigger_data: { ...triggerData, patterns },
            confidence: 'low',
            priority: 5,
          });
        }
      }
    }

    return updates;
  }

  /**
   * Generate medications section content
   */
  private async generateMedicationsSection(userId: string): Promise<string> {
    const supabase = this.getClient();

    const { data: meds } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .in('type', ['prescription', 'otc'])
      .order('name');

    if (!meds || meds.length === 0) {
      return '## 2. Medications (Active)\n\nNo active prescription medications.';
    }

    let section = '## 2. Medications (Active)\n\n';
    section += '| Medication | Class | Dose | Frequency | Timing | Purpose |\n';
    section += '|-----------|-------|------|-----------|--------|---------||\n';

    for (const med of meds) {
      const name = med.medication_name || med.name || 'Unknown';
      const dosage = med.dosage || '';
      const frequency = med.frequency || '';
      const timing = med.timing || '';
      const purpose = med.purpose || med.indication || '';

      section += `| **${name}** | ${med.class || 'Unknown'} | ${dosage} | ${frequency} | ${timing} | ${purpose} |\n`;
    }

    section += '\n### Medication Notes\n';
    section += '- **Coffee timing**: 2 cups morning (sometimes half-caf). Take meds 30-60 min **after** coffee for optimal beta-blocker absorption.\n';
    section += '- **Food with meds**: Aspirin with food (GI protection). Others can be taken with or without food.\n';
    section += '- **No missed doses**: Adherence is critical for graft patency and cardiac protection.\n';

    return section;
  }

  /**
   * Generate supplements section content
   */
  private async generateSupplementsSection(userId: string): Promise<string> {
    const supabase = this.getClient();

    const { data: supps } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('type', 'supplement')
      .order('name');

    if (!supps || supps.length === 0) {
      return '## 3. Supplements (Active)\n\nNo active supplements.';
    }

    let section = '## 3. Supplements (Active)\n\n';
    section += '| Supplement | Dose | Frequency | Timing | Purpose |\n';
    section += '|-----------|------|-----------|--------|---------||\n';

    for (const supp of supps) {
      const name = supp.medication_name || supp.name || 'Unknown';
      const dosage = supp.dosage || '';
      const frequency = supp.frequency || '';
      const timing = supp.timing || '';
      const purpose = supp.purpose || supp.indication || '';

      section += `| **${name}** | ${dosage} | ${frequency} | ${timing} | ${purpose} |\n`;
    }

    section += '\n### Supplement Notes\n';
    section += '- **Fat-soluble vitamins** (D3, CoQ10): Take with breakfast for optimal absorption.\n';
    section += '- **CoQ10 is non-negotiable** with statin therapy — muscle and cardiac energy depend on it.\n';

    return section;
  }

  /**
   * Generate timing protocol section (AI-powered)
   */
  private async generateTimingProtocolSection(userId: string): Promise<string> {
    try {
      const systemPrompt = await buildAISystemPrompt(userId, 'health_doc_update');

      const userPrompt = `Generate the "Medication Timing Protocol" section (§4) of health.md.

Based on the current medications and supplements in your context, create morning and evening stacks showing:
- When to take each medication/supplement
- Proper timing relative to coffee/food
- Any special instructions

Format:
### Morning Stack (30-60 min after coffee)
1. **[Medication]** ([class])
2. ...

### Evening Stack (with or after dinner)
1. **[Medication]** ([class])
2. ...

### Biweekly (if applicable)
- **[Medication]** ([instructions])

Return ONLY the section content starting with "## 4. Medication Timing Protocol", nothing else.`;

      const content = await callOpenAI({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        user: userPrompt,
      });

      return content.trim();
    } catch (error) {
      console.error('Error generating timing protocol section:', error);
      return '## 4. Medication Timing Protocol\n\n(Error generating timing protocol - please update manually)';
    }
  }

  /**
   * Generate vital baselines section (AI-powered)
   */
  private async generateVitalBaselinesSection(userId: string, triggerData?: any): Promise<string> {
    try {
      const systemPrompt = await buildAISystemPrompt(userId, 'health_doc_update');

      const userPrompt = `Update the "Vital Baselines & Targets" section (§6) of health.md.

${triggerData?.shifts ? `Recent metric shifts:\n${JSON.stringify(triggerData.shifts, null, 2)}\n\n` : ''}
${triggerData?.test_names ? `Recent lab tests: ${triggerData.test_names.join(', ')}\n\n` : ''}

Generate the updated table with:
- Latest "Current Baseline" values from recent data
- Keep all target values unchanged
- Update clinical notes if relevant (e.g., "Improving with Z2 training" if RHR dropped)

Return ONLY the section content starting with "## 6. Vital Baselines & Targets", nothing else.`;

      const content = await callOpenAI({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        user: userPrompt,
      });

      return content.trim();
    } catch (error) {
      console.error('Error generating vital baselines section:', error);
      return '## 6. Vital Baselines & Targets\n\n(Error generating baselines - please update manually)';
    }
  }

  /**
   * Generate genetic/methylation section (AI-powered)
   */
  private async generateGeneticSection(userId: string, triggerData: any): Promise<string> {
    try {
      const systemPrompt = await buildAISystemPrompt(userId, 'methylation_analysis');

      const userPrompt = `Generate the "Genetic / Methylation" section (§9) of health.md based on the uploaded methylation report.

Methylation data:
${JSON.stringify(triggerData?.markers || {}, null, 2)}

Include:
- Key SNPs with genotypes
- Implications for health
- Supplement recommendations
- Lifestyle considerations

Return ONLY the section content starting with "## 9. Genetic / Methylation", nothing else.`;

      const content = await callOpenAI({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        user: userPrompt,
      });

      return content.trim();
    } catch (error) {
      console.error('Error generating genetic section:', error);
      return '## 9. Genetic / Methylation\n\n(Error generating genetic section - please update manually)';
    }
  }

  /**
   * Generate supplements to consider section (AI-powered)
   */
  private async generateSupplementsToConsiderSection(userId: string): Promise<string> {
    try {
      const systemPrompt = await buildAISystemPrompt(userId, 'supplement_recommendation');

      const userPrompt = `Generate the "Supplements to Consider" section (§5) of health.md.

Based on my current health profile, medications, recent labs, and genetic data (if available), recommend supplements that:
1. Are evidence-based for cardiac patients
2. Are safe at eGFR 60 (kidney-aware)
3. Don't interact negatively with current medications
4. Address any gaps in my current regimen

Format as a table:
| Supplement | Purpose | Kidney Safety (eGFR 60) | Evidence Level | Priority |

Also include a "Supplements to AVOID" subsection with contraindications.

Return ONLY the section content starting with "## 5. Supplements to Consider", nothing else.`;

      const content = await callOpenAI({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        user: userPrompt,
      });

      return content.trim();
    } catch (error) {
      console.error('Error generating supplements to consider section:', error);
      return '## 5. Supplements to Consider\n\n(Error generating recommendations - please update manually)';
    }
  }

  /**
   * Generate training constraints section (AI-powered)
   */
  private async generateTrainingConstraintsSection(userId: string, triggerData?: any): Promise<string> {
    try {
      const systemPrompt = await buildAISystemPrompt(userId, 'workout_builder');

      const userPrompt = `Generate the "Training Constraints" section (§7) of health.md.

${triggerData?.new_max_hr ? `New max HR detected: ${triggerData.new_max_hr} bpm\n\n` : ''}

This section contains NON-NEGOTIABLE cardiac safety rules:
1. HR ceiling (beta-blocker adjusted max)
2. HR Zones (Z1-Z4 with bpm ranges)
3. Extended warm-up requirements
4. Cool-down requirements
5. Heat precautions (Jacksonville FL climate)
6. Hydration emphasis (eGFR 60)
7. No Valsalva maneuver

Keep all safety rules intact. Update HR zones if new max HR provided, otherwise keep current zones.

Return ONLY the section content starting with "## 7. Training Constraints", nothing else.`;

      const content = await callOpenAI({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        user: userPrompt,
      });

      return content.trim();
    } catch (error) {
      console.error('Error generating training constraints section:', error);
      return '## 7. Training Constraints\n\n(Error generating constraints - please update manually)';
    }
  }

  /**
   * Create diff between current and proposed content
   */
  createDiff(current: string, proposed: string): DiffResult {
    const diff = diffLines(current, proposed);

    let html = '<div class="diff-viewer">';
    let additions = 0;
    let deletions = 0;

    diff.forEach((part) => {
      const cssClass = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-unchanged';
      const lines = part.value.split('\n').filter(line => line.length > 0);

      if (part.added) additions += lines.length;
      if (part.removed) deletions += lines.length;

      lines.forEach(line => {
        html += `<div class="${cssClass}">${this.escapeHtml(line)}</div>`;
      });
    });

    html += '</div>';

    return {
      html,
      has_changes: additions > 0 || deletions > 0,
      additions,
      deletions,
    };
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Save pending updates to database
   */
  async savePendingUpdates(
    userId: string,
    updates: SectionUpdate[],
    batchId?: string
  ): Promise<string[]> {
    const supabase = this.getClient();
    const ids: string[] = [];

    const batch = batchId || crypto.randomUUID();

    for (const update of updates) {
      const diff = this.createDiff(update.current_content, update.proposed_content);

      const { data, error } = await supabase
        .from('health_doc_pending_updates')
        .insert({
          user_id: userId,
          section_number: update.section_number,
          section_name: update.section_name,
          current_content: update.current_content,
          proposed_content: update.proposed_content,
          diff_html: diff.html,
          trigger_type: update.trigger,
          trigger_data: update.trigger_data,
          reason: update.reason,
          confidence: update.confidence,
          priority: update.priority || 0,
          batch_id: batch,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving pending update:', error);
      } else if (data) {
        ids.push(data.id);
      }
    }

    return ids;
  }

  /**
   * Apply approved updates to health.md
   */
  async applyUpdates(userId: string, updateIds: string[]): Promise<{ success: boolean; new_version?: number }> {
    const supabase = this.getClient();

    // Load approved updates
    const { data: updates, error: loadError } = await supabase
      .from('health_doc_pending_updates')
      .select('*')
      .in('id', updateIds)
      .eq('user_id', userId)
      .eq('status', 'approved');

    if (loadError || !updates || updates.length === 0) {
      console.error('Failed to load approved updates:', loadError);
      return { success: false };
    }

    // Load current health document
    const { data: currentDoc, error: docError } = await supabase
      .from('health_documents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();

    if (docError || !currentDoc) {
      console.error('Failed to load current health document:', docError);
      return { success: false };
    }

    // Apply updates to content
    let updatedContent = currentDoc.content;

    // Sort updates by section number to apply in order
    updates.sort((a, b) => a.section_number - b.section_number);

    for (const update of updates) {
      const sectionPattern = new RegExp(
        `(## ${update.section_number}\\. [^\\n]+)[\\s\\S]*?(?=## \\d+\\.|$)`,
        'g'
      );

      updatedContent = updatedContent.replace(sectionPattern, update.proposed_content + '\n\n');
    }

    // Update "Last updated" date in header
    const today = new Date().toISOString().split('T')[0];
    updatedContent = updatedContent.replace(
      /Last updated: \d{4}-\d{2}-\d{2}/,
      `Last updated: ${today}`
    );

    // Mark old document as not current
    await supabase
      .from('health_documents')
      .update({ is_current: false })
      .eq('id', currentDoc.id);

    // Create new version
    const { data: newDoc, error: insertError } = await supabase
      .from('health_documents')
      .insert({
        user_id: userId,
        content: updatedContent,
        version: currentDoc.version + 1,
        is_current: true,
      })
      .select('id, version')
      .single();

    if (insertError || !newDoc) {
      console.error('Failed to create new health document version:', insertError);
      return { success: false };
    }

    // Create change log entry
    const changeSummary = updates.map(u => `§${u.section_number} ${u.section_name}: ${u.reason}`).join('; ');

    // Map trigger type to change type
    const primaryTrigger = updates[0]?.trigger_type || 'auto_update';
    let changeType = primaryTrigger;

    // Map trigger types to valid change_type values
    if (primaryTrigger === 'manual_edit') changeType = 'manual_edit';
    else if (primaryTrigger === 'ai_recommendation') changeType = 'ai_update';

    await supabase
      .from('health_document_changes')
      .insert({
        user_id: userId,
        document_id: newDoc.id,
        change_type: changeType,
        change_summary: changeSummary,
        changed_by: 'system',
      });

    // Mark updates as applied
    await supabase
      .from('health_doc_pending_updates')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
      })
      .in('id', updateIds);

    return { success: true, new_version: newDoc.version };
  }
}
