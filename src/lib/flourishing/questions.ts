import type { AssessmentQuestion } from './types';

export const DEFAULT_QUESTION_SET_VERSION = 1;

const SCALE_LABELS = {
  low: 'Not true at all',
  high: 'Completely true',
};

export const DEFAULT_FLOURISHING_QUESTIONS: AssessmentQuestion[] = [
  { question_id: 'rel_q1', section: 1, domain: 'relational', question_text: 'I feel deeply connected to the people who matter most in my life.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 1 },
  { question_id: 'rel_q2', section: 1, domain: 'relational', question_text: 'I am consistently investing time, attention, and presence into key relationships.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 2 },
  { question_id: 'rel_q3', section: 1, domain: 'relational', question_text: 'When tension appears, I move toward repair rather than withdrawal or avoidance.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 3 },
  { question_id: 'rel_q4', section: 1, domain: 'relational', question_text: 'I feel known, supported, and able to ask for help when I need it.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 4 },

  { question_id: 'me_q1', section: 1, domain: 'mental_emotional', question_text: 'My inner life feels stable, peaceful, and grounded more often than chaotic.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 5 },
  { question_id: 'me_q2', section: 1, domain: 'mental_emotional', question_text: 'I am responding to stress in healthy, resilient ways.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 6 },
  { question_id: 'me_q3', section: 1, domain: 'mental_emotional', question_text: 'My thought life is marked by clarity, hope, and self-control.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 7 },
  { question_id: 'me_q4', section: 1, domain: 'mental_emotional', question_text: 'I am aware of my emotional state and not ruled by it.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 8 },

  { question_id: 'pb_q1', section: 2, domain: 'physical_brain', question_text: 'My energy, stamina, and recovery support the life I believe I am called to live.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 9 },
  { question_id: 'pb_q2', section: 2, domain: 'physical_brain', question_text: 'I am stewarding my body with consistency in sleep, movement, nutrition, and recovery.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 10 },
  { question_id: 'pb_q3', section: 2, domain: 'physical_brain', question_text: 'My mind feels sharp, focused, and capable of sustained effort.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 11 },
  { question_id: 'pb_q4', section: 2, domain: 'physical_brain', question_text: 'My current physical condition feels aligned with long-term health and mission stewardship.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 12 },

  { question_id: 'wm_q1', section: 2, domain: 'work_money_time', question_text: 'I am using my time in a way that reflects my values and priorities.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 13 },
  { question_id: 'wm_q2', section: 2, domain: 'work_money_time', question_text: 'My work feels fruitful and aligned rather than scattered and reactive.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 14 },
  { question_id: 'wm_q3', section: 2, domain: 'work_money_time', question_text: 'My financial choices reflect stewardship, wisdom, and peace.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 15 },
  { question_id: 'wm_q4', section: 2, domain: 'work_money_time', question_text: 'I am living with healthy margin rather than chronic overload.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 16 },

  { question_id: 'mp_q1', section: 3, domain: 'meaning_purpose_calling', question_text: 'I have a clear sense of what God is asking me to build or contribute in this season.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 17 },
  { question_id: 'mp_q2', section: 3, domain: 'meaning_purpose_calling', question_text: 'My daily efforts feel connected to a larger purpose rather than empty productivity.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 18 },
  { question_id: 'mp_q3', section: 3, domain: 'meaning_purpose_calling', question_text: 'I believe my gifts and experience are being used in meaningful ways.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 19 },
  { question_id: 'mp_q4', section: 3, domain: 'meaning_purpose_calling', question_text: 'I feel motivated by mission, not merely by momentum or obligation.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 20 },

  { question_id: 'fs_q1', section: 3, domain: 'faith_spiritual', question_text: 'My walk with God feels active, sincere, and central to my daily life.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 21 },
  { question_id: 'fs_q2', section: 3, domain: 'faith_spiritual', question_text: 'Prayer and Scripture are shaping how I think, decide, and live.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 22 },
  { question_id: 'fs_q3', section: 3, domain: 'faith_spiritual', question_text: 'I am quick to repent, receive grace, and realign when conviction comes.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 23 },
  { question_id: 'fs_q4', section: 3, domain: 'faith_spiritual', question_text: 'I feel spiritually awake, expectant, and responsive to God in this season.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 24 },

  { question_id: 'ow_q1', section: 4, domain: 'overall_wellbeing', question_text: 'Overall, my life feels coherent and aligned rather than fragmented.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 25 },
  { question_id: 'ow_q2', section: 4, domain: 'overall_wellbeing', question_text: 'I feel hopeful about the direction of my life over the next season.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 26 },
  { question_id: 'ow_q3', section: 4, domain: 'overall_wellbeing', question_text: 'I would describe my current life as flourishing rather than merely surviving.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 27 },
  { question_id: 'ow_q4', section: 4, domain: 'overall_wellbeing', question_text: 'I feel a healthy sense of gratitude, joy, and forward momentum right now.', question_type: 'scale_0_10', scale_labels: SCALE_LABELS, required: true, order: 28 },
];
