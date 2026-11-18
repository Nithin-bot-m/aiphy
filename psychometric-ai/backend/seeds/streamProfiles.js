// Default stream profiles: weights + career clusters + curriculum mapping.
// Seeded into scoring_rules (versioned). Admins may edit weights; text content
// is reference information shown in reports.

const STREAM_PROFILES = {
  pcm: {
    stream_id: 'pcm',
    stream_name: 'Science / PCM',
    weights: { numerical: 0.35, abstract: 0.25, riasec_i: 0.25, riasec_r: 0.15 },
    career_clusters: [
      'Engineering & Technology (Computer, Electronics, Mechanical)',
      'Data Science & Artificial Intelligence',
      'Architecture & Design Technology',
      'Physical Sciences & Research'
    ],
    curriculum_boards: {
      CBSE: 'Physics, Chemistry, Mathematics (+ Computer Science / English)',
      ICSE: 'ISC Science: Physics, Chemistry, Mathematics (+ elective)',
      IB: 'IB DP: Mathematics AA (HL), Physics (HL), + one science/subject of choice'
    }
  },
  pcb: {
    stream_id: 'pcb',
    stream_name: 'Science / PCB',
    weights: { numerical: 0.20, abstract: 0.20, riasec_i: 0.35, riasec_s: 0.15, grit: 0.10 },
    career_clusters: [
      'Medicine & Allied Health Sciences',
      'Biotechnology & Life Sciences Research',
      'Pharmacy & Clinical Sciences',
      'Environmental & Agricultural Sciences'
    ],
    curriculum_boards: {
      CBSE: 'Physics, Chemistry, Biology (+ Psychology / English)',
      ICSE: 'ISC Science: Physics, Chemistry, Biology (+ elective)',
      IB: 'IB DP: Biology (HL), Chemistry (HL), Mathematics (SL/HL)'
    }
  },
  commerce_math: {
    stream_id: 'commerce_math',
    stream_name: 'Commerce with Mathematics',
    weights: { numerical: 0.30, riasec_e: 0.30, riasec_c: 0.20, grit: 0.20 },
    career_clusters: [
      'Chartered Accountancy & Finance',
      'Economics & Actuarial Science',
      'Business Analytics & Quantitative Marketing',
      'Entrepreneurship & Management'
    ],
    curriculum_boards: {
      CBSE: 'Accountancy, Business Studies, Economics, Mathematics',
      ICSE: 'ISC Commerce: Accounts, Commerce, Economics, Mathematics',
      IB: 'IB DP: Economics (HL), Business Management (HL), Mathematics (SL)'
    }
  },
  commerce_no_math: {
    stream_id: 'commerce_no_math',
    stream_name: 'Commerce without Mathematics',
    weights: { riasec_e: 0.35, riasec_c: 0.30, riasec_s: 0.20, grit: 0.15 },
    career_clusters: [
      'Company Secretary & Corporate Law',
      'Marketing, Communications & Brand Management',
      'Human Resources & Operations',
      'Hospitality, Travel & Event Management'
    ],
    curriculum_boards: {
      CBSE: 'Accountancy, Business Studies, Economics (+ Entrepreneurship)',
      ICSE: 'ISC Commerce: Accounts, Commerce, Economics (+ elective)',
      IB: 'IB DP: Business Management (HL), Economics (SL)'
    }
  },
  humanities_law: {
    stream_id: 'humanities_law',
    stream_name: 'Humanities / Law',
    weights: { verbal: 0.35, riasec_s: 0.25, riasec_a: 0.25, riasec_e: 0.15 },
    career_clusters: [
      'Law & Judicial Services',
      'Civil Services & Public Policy',
      'Psychology & Counselling (with further study)',
      'Journalism, Media & Content'
    ],
    curriculum_boards: {
      CBSE: 'Political Science, History/Legal Studies, Psychology/Economics, English',
      ICSE: 'ISC Humanities: Political Science, Sociology, History, English',
      IB: 'IB DP: History (HL), Global Politics (HL), English A (HL)'
    }
  },
  design: {
    stream_id: 'design',
    stream_name: 'Design / Creative Arts',
    weights: { spatial: 0.35, riasec_a: 0.35, abstract: 0.15, riasec_i: 0.15 },
    career_clusters: [
      'UI/UX & Interaction Design',
      'Product & Industrial Design / Architecture',
      'Animation, Game Design & VFX',
      'Fashion & Communication Design'
    ],
    curriculum_boards: {
      CBSE: 'Any stream + Design/Fine Arts elective; portfolio preparation matters most',
      ICSE: 'ISC Arts: Art, Design (+ Computer Applications)',
      IB: 'IB DP: Visual Arts (HL), Design Technology (HL)'
    }
  },
  vocational: {
    stream_id: 'vocational',
    stream_name: 'Vocational / Applied Tech',
    weights: { riasec_r: 0.40, riasec_c: 0.30, aptitude_total: 0.30 },
    career_clusters: [
      'IT & Software Services (NSQF applied tracks)',
      'Automotive, Electronics & Mechatronics',
      'Media Production & Sound Engineering',
      'Healthcare Technology & Paramedical Skills'
    ],
    curriculum_boards: {
      CBSE: 'Skill subjects (IT, AI, Automotive) + core subjects',
      ICSE: 'ISC Vocational electives',
      IB: 'IB Career-related Programme (CP)'
    }
  }
};

module.exports = { STREAM_PROFILES };
