// Question bank seed — versioned battery for assessment version V1.
//
// Psychometric notes (see docs/PSYCHOMETRIC_LIMITATIONS.md):
//   - The audited version shipped ONE item per dimension (single-item "scales").
//     This bank provides 2 aptitude items, 3 RIASEC items and 2 grit items per
//     dimension — still a screening-depth MVP battery, not a validated instrument.
//   - All items are fixed-form (FixedAssessmentStrategy). IRT fields (a/b/c) are
//     stored with defaults for the future adaptive strategy but are NOT used in
//     scoring.
//   - A few work-style items are transparently reverse-flavoured self-honesty
//     probes; reverse scoring is NOT applied in the MVP (documented limitation).

const LIKERT_OPTIONS = [
  { key: '1', text: 'Strongly Disagree', score: 1 },
  { key: '2', text: 'Disagree', score: 2 },
  { key: '3', text: 'Neutral', score: 3 },
  { key: '4', text: 'Agree', score: 4 },
  { key: '5', text: 'Strongly Agree', score: 5 }
];

const STREAM_CHOICES = [
  { key: 'pcm', text: 'Science with Physics, Chemistry, Maths (PCM)', score: 0 },
  { key: 'pcb', text: 'Science with Physics, Chemistry, Biology (PCB)', score: 0 },
  { key: 'commerce_math', text: 'Commerce with Mathematics', score: 0 },
  { key: 'commerce_no_math', text: 'Commerce without Mathematics', score: 0 },
  { key: 'humanities_law', text: 'Humanities / Arts / Law', score: 0 },
  { key: 'design', text: 'Design / Creative Arts', score: 0 },
  { key: 'vocational', text: 'Vocational / Applied Technology', score: 0 }
];

const PRIORITY_CHOICES = [
  { key: 'stability', text: 'Financial stability and job security', score: 0 },
  { key: 'prestige', text: 'Professional prestige and recognition', score: 0 },
  { key: 'fulfillment', text: 'Passion, creativity and self-expression', score: 0 },
  { key: 'entrepreneurship', text: 'Building something of their own', score: 0 },
  { key: 'balanced', text: 'A balanced mix of the above', score: 0 },
  { key: 'exploration', text: 'Keeping options open and exploring first', score: 0 }
];

function mcq(module, category, dimension, difficulty, text, options) {
  return { module, category, dimension, difficulty, question_text: text, question_type: 'single_choice', options };
}

function likert(module, category, dimension, texts) {
  return texts.map(text => ({
    module, category, dimension, difficulty: null,
    question_text: text, question_type: 'likert_5',
    options: LIKERT_OPTIONS.map(o => ({ ...o }))
  }));
}

function buildQuestionBank() {
  const bank = [];

  // ==================== APTITUDE (2 per dimension) ====================
  bank.push(mcq('aptitude', 'Numerical Reasoning', 'numerical', 'easy',
    'What number completes the sequence: 3, 7, 15, 31, 63, ___?',
    [['A', '125', 0], ['B', '127', 1], ['C', '129', 0], ['D', '131', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Numerical Reasoning', 'numerical', 'hard',
    'A shopkeeper increases a price by 20% and then offers a 20% discount. Compared to the original price, the final price is:',
    [['A', 'The same as the original', 0], ['B', '4% lower than the original', 1], ['C', '4% higher than the original', 0], ['D', '20% lower than the original', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Abstract Reasoning', 'abstract', 'medium',
    'Three gears mesh in a line: Gear A turns Gear B, and Gear B turns Gear C. If Gear A rotates clockwise, how does Gear C rotate?',
    [['A', 'Clockwise', 1], ['B', 'Counter-clockwise', 0], ['C', 'It stays still', 0], ['D', 'Cannot be determined from the information given', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Abstract Reasoning', 'abstract', 'medium',
    'In a code language, CAT is written as DBU. How would DOG be written?',
    [['A', 'EPH', 1], ['B', 'EPG', 0], ['C', 'EOH', 0], ['D', 'DPH', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Verbal Reasoning', 'verbal', 'easy',
    'Complete the analogy: TELESCOPE is to ASTRONOMER as MICROSCOPE is to ___.',
    [['A', 'Microbiologist', 1], ['B', 'Architect', 0], ['C', 'Philosopher', 0], ['D', 'Historian', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Verbal Reasoning', 'verbal', 'medium',
    'Choose the word most nearly OPPOSITE in meaning to "PRUDENT":',
    [['A', 'Careful', 0], ['B', 'Reckless', 1], ['C', 'Wise', 0], ['D', 'Thoughtful', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Spatial Reasoning', 'spatial', 'hard',
    'A cube has side 1 opposite side 6, and side 2 opposite side 5. Which side must be opposite side 3?',
    [['A', 'Side 1', 0], ['B', 'Side 4', 1], ['C', 'Side 5', 0], ['D', 'Side 2', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Spatial Reasoning', 'spatial', 'medium',
    'If you rotate the letter "N" by 90 degrees clockwise, which shape is it most similar to?',
    [['A', 'The letter Z', 1], ['B', 'The letter M', 0], ['C', 'The letter W', 0], ['D', 'The letter H', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Logical Deduction', 'logical', 'medium',
    'Statements: (1) All algorithms require computational logic. (2) Some computational logic requires mathematical proofs. Which conclusion DEFINITELY follows?',
    [['A', 'All algorithms require mathematical proofs', 0], ['B', 'At least some algorithms intersect with mathematical proofs', 0], ['C', 'No algorithms require mathematical proofs', 0], ['D', 'None of the above conclusions definitely follows', 1]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Logical Deduction', 'logical', 'hard',
    'If it rains, the match is cancelled. The match was NOT cancelled. What can be concluded?',
    [['A', 'It rained', 0], ['B', 'It did not rain', 1], ['C', 'The match was postponed', 0], ['D', 'Cannot conclude anything', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Data Interpretation', 'data', 'medium',
    'A vehicle travels 60 km/h for 2 hours, then 90 km/h for 3 hours. What is the average speed for the whole trip?',
    [['A', '75 km/h', 0], ['B', '78 km/h', 1], ['C', '72 km/h', 0], ['D', '80 km/h', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));
  bank.push(mcq('aptitude', 'Data Interpretation', 'data', 'hard',
    'In a class of 40 students, 25 like maths, 20 like science, and 10 like both. How many like NEITHER subject?',
    [['A', '5', 1], ['B', '10', 0], ['C', '15', 0], ['D', '0', 0]].map(([k, t, s]) => ({ key: k, text: t, score: s }))));

  // ==================== RIASEC (3 per dimension) ====================
  bank.push(...likert('riasec', 'Realistic (self-report)', 'R', [
    'I enjoy taking apart devices or gadgets to see how they work and putting them back together.',
    'I would rather build or repair something physical (a model, a circuit, a bicycle) than write an essay about it.',
    'Hands-on activities in workshops or labs excite me more than classroom discussions.'
  ]));
  bank.push(...likert('riasec', 'Investigative (self-report)', 'I', [
    'I feel energised when I investigate why natural phenomena happen (space, genetics, weather, chemical reactions).',
    'I enjoy searching for evidence before forming an opinion, even if it takes a long time.',
    'Solving puzzles or problems with no obvious answer is fun for me.'
  ]));
  bank.push(...likert('riasec', 'Artistic (self-report)', 'A', [
    'I prefer assignments with no single right answer where I can express original ideas.',
    'I often sketch, write stories, make music, or create digital content in my free time.',
    'Rigid rules and fixed structure feel limiting when I am being creative.'
  ]));
  bank.push(...likert('riasec', 'Social (self-report)', 'S', [
    'I feel most fulfilled when I tutor classmates who are struggling or help resolve conflicts between friends.',
    'People often come to me with their problems, and I genuinely like helping.',
    'I would rather work in a team than alone on most tasks.'
  ]));
  bank.push(...likert('riasec', 'Enterprising (self-report)', 'E', [
    'I enjoy pitching ideas, leading teams, or convincing others to support a plan.',
    'I notice opportunities to organise events, sell things, or start small projects.',
    'Taking charge of a group project feels natural to me.'
  ]));
  bank.push(...likert('riasec', 'Conventional (self-report)', 'C', [
    'I find satisfaction in organising data, keeping records tidy, and following checklists.',
    'I like working with clear rules, accurate numbers and step-by-step procedures.',
    'I double-check my work carefully for errors before submitting it.'
  ]));

  // ==================== GRIT / WORK STYLE (2 per dimension) ====================
  bank.push(...likert('grit', 'Persistence', 'persistence', [
    'When I get stuck on a difficult problem, I keep trying different approaches before asking for help.',
    'I finish whatever I begin, even when it becomes boring or frustrating.'
  ]));
  bank.push(...likert('grit', 'Focus', 'focus', [
    'I can study continuously for a long stretch without checking my phone or getting distracted.',
    'New ideas and projects sometimes distract me from previous ones.'
  ]));
  bank.push(...likert('grit', 'Conscientiousness', 'conscientiousness', [
    'I maintain an organised study plan and meet my deadlines without being reminded.',
    'I keep my notes and workspace orderly so I can find things quickly.'
  ]));
  bank.push(...likert('grit', 'Curiosity', 'curiosity', [
    'When a teacher introduces an intriguing topic, I look it up beyond what is required for the exam.',
    'I enjoy learning about subjects that are not part of my syllabus.'
  ]));
  bank.push(...likert('grit', 'Stress Resilience', 'stress_resilience', [
    'During exam weeks, I stay calm and keep a steady sleep and study routine.',
    'Timed tests make me so nervous that my performance suffers.'
  ]));
  bank.push(...likert('grit', 'Deliberate Practice', 'deliberate_practice', [
    'I deliberately practise my weakest topics instead of only revising what I already know.',
    'When my answer is wrong, I study the correct method step by step until I can do it myself.'
  ]));
  bank.push(...likert('grit', 'Response to Failure', 'response_to_failure', [
    'After a disappointing test score, I analyse my mistakes and change how I prepare.',
    'A bad result makes me want to give up on that subject.'
  ]));

  // ==================== PARENT INVENTORY ====================
  bank.push(...likert('parent_perception', 'Observed Analytical Ability', 'observed_analytical', [
    'My child independently chooses to solve maths, technical or scientific problems without reminders.',
    'My child asks curious "how does this work?" questions and looks for answers on their own.'
  ]));
  bank.push(...likert('parent_perception', 'Observed Creativity & Verbal Inclination', 'observed_creative', [
    'In free time, my child writes, draws, debates, or creates things rather than only consuming content.',
    'My child expresses ideas in original ways — stories, art, designs, or arguments.'
  ]));
  bank.push(...likert('parent_perception', 'Observed Study Habits', 'observed_study_habits', [
    'My child maintains a steady study schedule without constant supervision.',
    'My child completes homework and projects ahead of deadlines.'
  ]));
  bank.push(...likert('parent_perception', 'Observed Stress Response', 'observed_stress_resilience', [
    'When results disappoint my child, they recover and try constructive next steps.',
    'During exam pressure, my child stays composed and sleeps reasonably well.'
  ]));
  bank.push({
    module: 'parent_expectation', category: 'Expected Grade 11 Stream', dimension: 'expected_stream',
    difficulty: null, question_type: 'categorical',
    question_text: 'Which academic stream do you primarily envision for your child in Grade 11?',
    options: STREAM_CHOICES.map(o => ({ ...o }))
  });
  bank.push({
    module: 'parent_expectation', category: 'Career Outcome Priority', dimension: 'outcome_priority',
    difficulty: null, question_type: 'categorical',
    question_text: 'What matters most to you in your child\'s future career?',
    options: PRIORITY_CHOICES.map(o => ({ ...o }))
  });

  return bank;
}

module.exports = { buildQuestionBank, STREAM_CHOICES, PRIORITY_CHOICES };
