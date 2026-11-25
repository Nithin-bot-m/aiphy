// V2 domain metadata loaded cleanly from seeds/v2/ (single source of truth).
const fs = require('fs');
const path = require('path');

const V2_SEEDS_DIR = path.join(__dirname, '../../../seeds/v2');

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(V2_SEEDS_DIR, filename), 'utf8'));
}

const CLUSTERS = loadJson('clusters.json');
const CROSSWALK = loadJson('parent_student_crosswalk.json');
const COUNSELLOR_PROMPT_MD = fs.readFileSync(
  path.join(V2_SEEDS_DIR, 'PROMPT_Counsellor_Mapping_Agent.md'),
  'utf8'
);

const CLUSTER_IDS = Object.keys(CLUSTERS).sort(); // C01..C16
const APTITUDE_DIMS_V2 = ['V', 'N', 'L', 'S', 'P', 'CRE', 'EQ'];
const PERSONALITY_DIMS = ['O', 'C', 'E', 'A', 'N'];
const THINKING_STYLES = ['ANALYTIC', 'CREATIVE', 'PRACTICAL', 'SOCIAL', 'LEADER', 'RISK', 'SOLO_TEAM'];
const VALUE_CODES = ['SEC', 'MON', 'STA', 'CRE', 'HELP', 'AUT', 'ADV', 'LRN'];
const EQ_FACETS = ['TEAM', 'STRESS', 'LEAD', 'COMM', 'EMPATHY', 'SELFCONTROL'];
const DECISION_STYLES = ['RATIONAL', 'INTUITIVE', 'DEPENDENT', 'AVOIDANT'];

// Grade 10 stream rollups per 00_Interest_Segregation_and_Scoring.md §7.
const GRADE_10_STREAMS = [
  { id: 'science_pcm', name: 'Science (PCM)', clusters: ['C01', 'C07', 'C08', 'C11'] },
  { id: 'science_pcb', name: 'Science (PCB)', clusters: ['C02', 'C08', 'C09', 'C10', 'C11'] },
  { id: 'commerce', name: 'Commerce', clusters: ['C03', 'C16', 'C15'] },
  { id: 'arts_humanities', name: 'Arts & Humanities', clusters: ['C04', 'C05', 'C06', 'C12', 'C14'] },
  { id: 'vocational', name: 'Vocational & Applied', clusters: ['C13', 'C15', 'C05', 'C11'] }
];

// Deterministic activity-keyword dictionary per cluster for offline open_text matching.
const CLUSTER_KEYWORDS = {
  C01: ['code', 'coding', 'program', 'software', 'robot', 'robotics', 'computer', 'app', 'website', 'circuit', 'machine', 'tech', 'ai', 'electronic', 'gaming', 'engineer', 'hack'],
  C02: ['doctor', 'medicine', 'medical', 'health', 'hospital', 'patient', 'nurse', 'clinic', 'anatomy', 'biology', 'first aid', 'pharmacy', 'therapy', 'heal'],
  C03: ['business', 'finance', 'money', 'stock', 'market', 'bank', 'account', 'trade', 'invest', 'econom', 'profit', 'budget', 'commerce', 'tax', 'company'],
  C04: ['law', 'legal', 'court', 'judge', 'debate', 'policy', 'government', 'civil', 'ias', 'upsc', 'constitution', 'rights', 'politics', 'diplomat', 'argue'],
  C05: ['design', 'draw', 'sketch', 'paint', 'art', 'fashion', 'architect', 'film', 'video', 'photo', 'animate', 'graphic', 'ui', 'ux', 'craft', 'poster', 'music'],
  C06: ['teach', 'tutor', 'explain', 'psychology', 'counsel', 'mentor', 'child', 'student', 'school', 'classroom', 'understand', 'therapy', 'education'],
  C07: ['army', 'navy', 'air force', 'police', 'defence', 'military', 'ncc', 'uniform', 'drill', 'pilot', 'service', 'security', 'discipline', 'march'],
  C08: ['research', 'lab', 'experiment', 'microscope', 'science', 'physics', 'chemistry', 'gene', 'dna', 'astronomy', 'space', 'discover', 'hypothesis', 'molecule'],
  C09: ['nature', 'forest', 'wildlife', 'bird', 'tree', 'plant', 'climate', 'ocean', 'marine', 'environment', 'recycle', 'trek', 'ecology', 'conservation'],
  C10: ['animal', 'pet', 'dog', 'cat', 'vet', 'veterinary', 'wildlife', 'horse', 'farm animal', 'zoo', 'rescue', 'creature'],
  C11: ['farm', 'crop', 'soil', 'garden', 'agriculture', 'food', 'harvest', 'plant', 'seed', 'dairy', 'horticulture', 'nutrition'],
  C12: ['community', 'volunteer', 'ngo', 'charity', 'poor', 'help', 'society', 'clean', 'campaign', 'social work', 'rural', 'equality'],
  C13: ['sport', 'cricket', 'football', 'run', 'athlete', 'gym', 'fitness', 'yoga', 'swim', 'coach', 'badminton', 'workout', 'exercise', 'tournament'],
  C14: ['write', 'story', 'poem', 'essay', 'journal', 'news', 'book', 'novel', 'read', 'blog', 'language', 'podcast', 'script', 'edit', 'publish'],
  C15: ['cook', 'chef', 'bake', 'hotel', 'travel', 'tour', 'event', 'plan', 'party', 'guest', 'hospitality', 'flight', 'kitchen', 'restaurant'],
  C16: ['startup', 'founder', 'sell', 'shop', 'product', 'idea', 'pitch', 'lead', 'venture', 'entrepreneur', 'brand', 'create business']
};

// Creativity flexibility category dictionary for M4 CRE divergent thinking scoring.
const CRE_FLEXIBILITY_CATEGORIES = [
  ['wrap', 'pack', 'box', 'parcel', 'protect', 'cushion'],
  ['clean', 'wipe', 'window', 'glass', 'polish', 'absorb', 'dry'],
  ['art', 'craft', 'origami', 'collage', 'papier', 'draw', 'paint', 'hat', 'boat', 'plane'],
  ['burn', 'fire', 'fuel', 'compost', 'mulch', 'garden', 'fertilizer'],
  ['cover', 'tablecloth', 'book cover', 'shade', 'insulate', 'stuff', 'fill'],
  ['build', 'bridge', 'tower', 'brick', 'support', 'doorstop', 'weight'],
  ['container', 'pot', 'vase', 'funnel', 'feeder', 'bottle', 'holder', 'cup'],
  ['music', 'instrument', 'drum', 'shaker', 'noise', 'game', 'toy', 'puzzle'],
  ['note', 'write', 'sign', 'poster', 'read', 'learn', 'cutout', 'list'],
  ['emergency', 'signal', 'filter', 'trap', 'solar', 'float', 'tool']
];

// Distress keywords per PROMPT_Counsellor_Mapping_Agent Rule §2.6
const DISTRESS_PATTERNS = [
  /\b(kill myself|end my life|suicid|self[\s-]?harm|cut myself|hurt myself)\b/i,
  /\b(hopeless|worthless|no reason to live|want to die|nobody cares)\b/i,
  /\b(being abused|abuse at home|hits me|beaten at home|panic attack every)\b/i
];

// Negative-valence prompt filter for open_text (don't score worries as positive interest).
const NON_POSITIVE_OPEN_TEXT_REGEX = /\b(worry|worries|stress|unhappy|fail|hate|dislike|fear|anxious|scared)\b/i;

function detectDistress(text) {
  if (!text || typeof text !== 'string') return false;
  return DISTRESS_PATTERNS.some((re) => re.test(text));
}

module.exports = {
  V2_SEEDS_DIR,
  CLUSTERS,
  CROSSWALK,
  COUNSELLOR_PROMPT_MD,
  CLUSTER_IDS,
  APTITUDE_DIMS_V2,
  PERSONALITY_DIMS,
  THINKING_STYLES,
  VALUE_CODES,
  EQ_FACETS,
  DECISION_STYLES,
  GRADE_10_STREAMS,
  CLUSTER_KEYWORDS,
  CRE_FLEXIBILITY_CATEGORIES,
  NON_POSITIVE_OPEN_TEXT_REGEX,
  detectDistress
};

