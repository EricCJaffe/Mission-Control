-- ============================================================
-- SEED EXERCISES — Global library (user_id = NULL)
-- Readable by all authenticated users, not modifiable by users
-- ============================================================

insert into public.exercises (name, category, equipment, muscle_groups, is_compound, is_template) values

-- PUSH
('Flat Barbell Bench Press',    'push', 'barbell',    '{"chest","triceps","shoulders"}', true,  true),
('Incline Barbell Bench Press', 'push', 'barbell',    '{"chest","triceps","shoulders"}', true,  true),
('Decline Barbell Bench Press', 'push', 'barbell',    '{"chest","triceps"}',             true,  true),
('Flat Dumbbell Press',         'push', 'dumbbell',   '{"chest","triceps","shoulders"}', true,  true),
('Incline Dumbbell Press',      'push', 'dumbbell',   '{"chest","triceps","shoulders"}', true,  true),
('Overhead Press (Barbell)',    'push', 'barbell',    '{"shoulders","triceps"}',         true,  true),
('Dumbbell Shoulder Press',     'push', 'dumbbell',   '{"shoulders","triceps"}',         true,  true),
('Cable Chest Fly',             'push', 'cable',      '{"chest"}',                       false, true),
('Dumbbell Lateral Raise',      'push', 'dumbbell',   '{"shoulders"}',                   false, true),
('Tricep Pushdown (Cable)',      'push', 'cable',      '{"triceps"}',                     false, true),
('Overhead Tricep Extension',   'push', 'cable',      '{"triceps"}',                     false, true),
('Skull Crushers',              'push', 'barbell',    '{"triceps"}',                     false, true),
('Dips (Chest)',                 'push', 'bodyweight', '{"chest","triceps"}',             true,  true),
('Push-up',                     'push', 'bodyweight', '{"chest","triceps","shoulders"}', true,  true),

-- PULL
('Deadlift',                    'pull', 'barbell',    '{"back","hamstrings","glutes"}',  true,  true),
('Barbell Row',                 'pull', 'barbell',    '{"back","biceps"}',               true,  true),
('Lat Pulldown',                'pull', 'cable',      '{"back","biceps"}',               true,  true),
('Seated Cable Row',            'pull', 'cable',      '{"back","biceps"}',               true,  true),
('Pull-up',                     'pull', 'bodyweight', '{"back","biceps"}',               true,  true),
('Chin-up',                     'pull', 'bodyweight', '{"back","biceps"}',               true,  true),
('Face Pull',                   'pull', 'cable',      '{"rear_delts","rotator_cuff"}',   false, true),
('Dumbbell Row',                'pull', 'dumbbell',   '{"back","biceps"}',               false, true),
('Barbell Curl',                'pull', 'barbell',    '{"biceps"}',                      false, true),
('Dumbbell Bicep Curl',         'pull', 'dumbbell',   '{"biceps"}',                      false, true),
('Hammer Curl',                 'pull', 'dumbbell',   '{"biceps","brachialis"}',         false, true),
('Shrugs',                      'pull', 'barbell',    '{"traps"}',                       false, true),

-- LEGS
('Back Squat',                  'legs', 'barbell',    '{"quads","glutes","hamstrings"}', true,  true),
('Front Squat',                 'legs', 'barbell',    '{"quads","glutes"}',              true,  true),
('Leg Press',                   'legs', 'machine',    '{"quads","glutes","hamstrings"}', true,  true),
('Romanian Deadlift (RDL)',     'legs', 'barbell',    '{"hamstrings","glutes"}',         true,  true),
('Leg Curl (Machine)',           'legs', 'machine',    '{"hamstrings"}',                  false, true),
('Leg Extension (Machine)',      'legs', 'machine',    '{"quads"}',                       false, true),
('Calf Raise (Standing)',        'legs', 'machine',    '{"calves"}',                      false, true),
('Walking Lunge',               'legs', 'dumbbell',   '{"quads","glutes","hamstrings"}', true,  true),
('Bulgarian Split Squat',       'legs', 'dumbbell',   '{"quads","glutes"}',              true,  true),

-- CORE
('Plank',                       'core', 'bodyweight', '{"core","abs"}',                  false, true),
('Hanging Knee Raise',          'core', 'bodyweight', '{"abs","hip_flexors"}',           false, true),
('Cable Crunch',                'core', 'cable',      '{"abs"}',                         false, true),
('Russian Twist',               'core', 'bodyweight', '{"obliques","abs"}',              false, true),
('Ab Wheel Rollout',            'core', 'other',      '{"abs","core"}',                  false, true),
('Dead Bug',                    'core', 'bodyweight', '{"core","abs"}',                  false, true),
('Bird Dog',                    'core', 'bodyweight', '{"core","back"}',                 false, true),

-- CARDIO
('Treadmill Run',               'cardio', 'treadmill', '{"cardio"}',                     false, true),
('Outdoor Run',                 'cardio', null,         '{"cardio"}',                     false, true),
('Walk',                        'cardio', null,         '{"cardio"}',                     false, true),
('Treadmill Walk',              'cardio', 'treadmill',  '{"cardio"}',                     false, true),
('Indoor Cycling (Trainer)',    'cardio', 'trainer',    '{"cardio","quads","glutes"}',    false, true),
('Outdoor Cycling',             'cardio', 'bike',       '{"cardio","quads","glutes"}',    false, true),
('Elliptical',                  'cardio', 'machine',    '{"cardio"}',                     false, true),

-- MOBILITY
('Foam Rolling',                'mobility', 'other',     '{"full_body"}',                 false, true),
('Dynamic Warm-up',             'mobility', 'bodyweight', '{"full_body"}',                 false, true),
('Hip Flexor Stretch',          'mobility', 'bodyweight', '{"hip_flexors"}',               false, true),
('Thoracic Rotation',           'mobility', 'bodyweight', '{"back","thoracic_spine"}',     false, true)

on conflict do nothing;
