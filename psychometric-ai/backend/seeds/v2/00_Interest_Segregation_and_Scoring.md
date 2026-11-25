# Interest Segregation and Scoring Spec (for the AI agent)

Purpose: convert all module responses into ranked career clusters, flags and a student plus parent report. Machine-readable cluster data is in `clusters.json`. Item files are JSONL: line 1 is `_meta`, every other line is one item.

## 1. Pipeline
1. Validate responses (section 8).
2. Score each module into dimensions (section 3).
3. Normalise (section 4).
4. Compute 16 cluster scores (section 5).
5. Apply flags and rules (section 6).
6. Map to 10th streams or 12th courses (section 7).
7. Add parent comparison (section 6.5), then generate the report (section 9).

## 2. The 16 clusters
| ID | Cluster | RIASEC (1st,2nd,3rd) | Aptitude weights | Personality targets | Top values | Gem candidate | 10th stream |
|---|---|---|---|---|---|---|---|
| C01 | Engineering, Tech and AI | R,I,C | V5 N20 L30 S20 P10 CRE10 EQ5 | O+ C+ | LRN,AUT,MON | N | Science (PCM) |
| C02 | Medicine and Healthcare | I,S,R | V15 N10 L20 S10 P15 EQ30 | C+ A+ | HELP,STA,SEC | N | Science (PCB) |
| C03 | Business, Finance and Economics | E,C,I | V15 N30 L25 P10 CRE5 EQ15 | C+ E+ | MON,STA,AUT | N | Commerce |
| C04 | Law, Policy and Civil Services | E,S,I | V30 N5 L25 P10 CRE10 EQ20 | E+ O+ | STA,HELP,SEC | N | Arts/Humanities |
| C05 | Design and Media | A,R,E | V10 L5 S30 P10 CRE35 EQ10 | O++ | CRE,AUT | Y | Arts/Humanities or Vocational |
| C06 | Education and Psychology | S,A,I | V25 N5 L10 P10 CRE15 EQ35 | A+ E+ | HELP,SEC,LRN | N | Arts/Humanities |
| C07 | Defence and Uniformed Services | R,S,E | V5 N15 L20 S10 P20 CRE5 EQ25 | C+ E+ N+ | ADV,STA,SEC | N | Science (PCM) preferred, any stream for some entries |
| C08 | Life Sciences and Research | I,R,A | V10 N20 L30 S10 P20 CRE5 EQ5 | O+ C+ | LRN,AUT | N | Science (PCM or PCB) |
| C09 | Environment, Nature and Wildlife | R,I,S | V10 N10 L20 S15 P15 CRE15 EQ15 | O+ A+ | HELP,ADV,LRN | Y | Science (PCB) |
| C10 | Animals and Veterinary | R,I,S | V10 N5 L25 S5 P20 CRE5 EQ30 | A+ C+ | HELP,LRN | Y | Science (PCB) |
| C11 | Agriculture and Food Science | R,I,E | V10 N15 L20 S10 P20 CRE10 EQ15 | C+ O+ | AUT,LRN,SEC | Y | Science (PCB or PCM) |
| C12 | Social Impact and Public Service | S,E,A | V25 N10 L10 P10 CRE10 EQ35 | A++ | HELP,SEC | Y | Arts/Humanities |
| C13 | Sports, Fitness and Wellness | R,S,E | V5 N5 L15 S15 P25 CRE10 EQ25 | E+ C+ | ADV,HELP | Y | Any stream / Vocational |
| C14 | Writing, Languages and Journalism | A,S,E | V40 L10 P10 CRE25 EQ15 | O+ | CRE,AUT,LRN | Y | Arts/Humanities |
| C15 | Hospitality and Travel | E,S,R | V20 N10 L10 P15 CRE10 EQ35 | E+ A+ | ADV,MON | Y | Any stream / Vocational |
| C16 | Entrepreneurship | E,A,I | V10 N20 L20 P10 CRE20 EQ20 | E+ O+ | AUT,MON,ADV | N | Commerce (any stream possible) |

Dimension codes. Aptitude: V verbal, N numerical, L logical, S spatial, P perceptual speed and accuracy, CRE creativity, EQ emotional intelligence. Personality: O openness, C conscientiousness, E extraversion, A agreeableness, N emotional stability (+ high, ++ very high). Values: SEC security, MON money, STA status, CRE creativity, HELP helping/purpose, AUT autonomy, ADV adventure, LRN learning.

## 3. How each item type is scored
| Type | Rule |
|---|---|
| likert5 (LIKE5) | raw = value minus 3 (range -2 to +2). Add to `key.cluster` and to each `key.riasec` letter times its weight |
| likert5 (AGREE5) on activity items | FLOW or INTRINSIC raw = value minus 3 added to `Passion_raw[cluster]` |
| likert5 generic (scale tag) | add to the scale named in `key.scale`; if `reverse` is true use 6 minus value |
| best_worst | chosen MOST = +2, chosen LEAST = -1, applied to that option's cluster and riasec |
| forced_choice | chosen = +1, other = -1 on each option's cluster and riasec |
| scenario | score of chosen option (1 to 4) goes to `key.scale` |
| open_text | map text to nearest activities with semantic similarity; add `weight` to the matched clusters (negative for boring-work item) |
| aptitude (M4) | 1 if correct else 0, times difficulty weight (easy 1, medium 1.5, hard 2); speed bonus only for P dimension |
| ranking (M5) | rank r of 8 gives value score 100 - (r-1)*100/7 |
| SJT (M6) | best option 3, acceptable 2, poor 1, harmful 0, summed into EQ and sub-skills |
| M7 | confidence, anxiety, learning style and career awareness as 1 to 5 sums per sub-scale |

Extra rules: TECH scale mean adds (mean-3)*2 to C01 interest raw; ENTRE scale mean adds (mean-3)*2 to C16 interest raw; SECURITY adds to value SEC (and subtracts from C16 fit).

## 4. Normalisation
- Interest: for each student compute Interest_raw for the 16 clusters, convert to z-scores within the student (removes the habit of liking everything or nothing), then Interest = clip(50 + 15*z, 0, 100).
- Passion: Passion_c = ((mean of FLOW and INTRINSIC items for cluster c) - 1)/4*100, then add open-text evidence.
- Aptitude: each dimension converted to a percentile against grade-specific norms. Until each grade has 500 or more completed students use min-max against item maximum, and mark `norm_status: provisional` in the report.
- Personality: Big Five as percentile on the same norm approach.
- Never mix 10th and 12th norms.

## 5. Cluster score (0 to 100)
`Aptitude_c = sum over d of weight[c][d] * percentile[d]`
`PersonalityFit_c = mean over trait targets of (percentile for + target; 100 minus percentile for - target)`; `ValuesFit_c = mean value score of the cluster's top values`
`PersVal_c = 0.6 * PersonalityFit_c + 0.4 * ValuesFit_c`
**`Final_c = 0.35*Interest_c + 0.20*Passion_c + 0.25*Aptitude_c + 0.20*PersVal_c`**

Picks per student:
- **Passion Pick** = highest of 0.6*Interest + 0.4*Passion.
- **Strength Pick** = highest Aptitude_c among clusters with Interest_c >= 40.
- **Balanced Pick** = highest Final_c.
- Show top 5 clusters by Final_c. Confidence: High if Final(top1) - Final(top6) >= 15, Medium if 8 to 14, Low below 8 (then say "exploring" and advise a counsellor session).
- Tie within 2 points: prefer the cluster with higher Passion, then higher Interest.
- RIASEC code = top 3 letters of the summed riasec raw scores.

## 6. Flags and special rules
### 6.1 Hidden Gem
Cluster is Gem candidate = Y AND Interest >= 70 AND Passion >= 70 AND Aptitude >= 50. Report must show real career paths (from section 7), entry routes, and an earning ladder (entry, 5-year, 10-year) taken ONLY from verified data in the earning-ladder table the product owner supplies. Never invent salary figures; if missing write "data pending".
### 6.2 Growth Path
Interest >= 70 AND Passion >= 70 AND Aptitude < 50. Never reject. Show the weak aptitude dimensions, how to build them, and a 6-month plan. If GRIT_PE is low, say the plan needs steady practice.
### 6.3 Passion health type (person level)
- Harmonious: HARM high (>=3.5), OBS and PRESSURE low (<3).
- Obsessive: OBS >= 3.5.
- Pressure-driven: PRESSURE >= 3.5. Discount that student's stated passion by 25 percent in Final_c and flag for a parent conversation.
- Exploring: GRIT_CI low (<2.5) and no cluster Passion >= 60. Recommend exploration activities before deciding.
### 6.4 Grit and readiness
Grit = mean of GRIT_CI and GRIT_PE (scenario scores rescaled 1 to 4 to 1 to 5). Low grit with a top-3 cluster that has a long study route (C02, C07, C08, C04) adds a "preparation needed" note, not a rejection.
### 6.5 Parent gap (Module 8, not scored)
- Alignment gap = difference between parent-observed strengths per cluster and the student's cluster scores. Cluster with parent view high and student Interest < 50 is a **Hidden Talent**.
- Expectation gap = Module 1 `parent_pref` cluster versus student top 5. If outside top 5, show "Parent Page" with talking points, the parent cluster's real fit score, and the student's top clusters' paths.
- Parents answer separately; never show one parent's answers to the other or to the student unless consent is recorded.
### 6.6 Fairness (hard rules)
- Gender, handedness, caste, religion, city and family income NEVER change interest, passion, aptitude or cluster scores, and NEVER filter or reorder clusters.
- Budget and relocation (Module 1) filter only the college and course suggestions in the reality-check section, never the clusters.
- Marks band never reduces any cluster score. It is used only to suggest backup routes.
- Run a fairness audit per release: compare mean cluster scores by gender; flag any cluster with a gap above 0.3 SD for item review.

## 7. Mapping to outputs
### 10th (stream selection)
Stream score = max over its clusters of Final_c weighted by 0.7, plus 0.3 times the mean of the next best cluster in the same stream. Streams: Science PCM (C01, C07, C08, C11), Science PCB (C02, C08, C09, C10, C11), Commerce (C03, C16, C15), Arts/Humanities (C04, C05, C06, C12, C14), Vocational/Other (C13, C15, C05, C11). Output the top stream, a second option, and what to watch for.
### 12th (course and career)
Output top 5 clusters, 3 courses and 3 careers per cluster, entrance exams, and a backup route.

| ID | Careers (8) | 12th courses | Entrance routes (verify yearly) |
|---|---|---|---|
| C01 | Software Engineer; AI/ML Engineer; Robotics Engineer; Mechanical Engineer; Electronics/Embedded Engineer; Civil/Structural Engineer; Cybersecurity Analyst; Aerospace Engineer | B.Tech/BE; B.Sc Computer Science; Diploma Engineering | JEE Main/Advanced; State CET; BITSAT; CUET |
| C02 | Doctor (MBBS); Dentist; Physiotherapist; Nurse / Nurse Practitioner; Pharmacist; Radiology/Lab Technologist; Nutritionist/Dietitian; Public Health Specialist | MBBS; BDS; BPT; B.Sc Nursing; B.Pharm; Allied Health Sciences | NEET-UG; State health-science exams |
| C03 | Economist; Chartered Accountant; Investment/Financial Analyst; Actuary; Management Consultant; Marketing Manager; Banker; Data/Business Analyst | B.Com; BBA/BMS; BA/B.Sc Economics; CA/CS/CMA; Actuarial Science | CUET; CA Foundation; IPMAT; CMAT/NPAT |
| C04 | Lawyer; IAS/IPS/Civil Servant; Judicial Services Officer; Policy Analyst; Diplomat (IFS); Corporate Counsel; Public Administrator; Political Strategist | BA LLB / BBA LLB; BA (Pol Sci/History/Public Admin); Integrated Law | CLAT; AILET; CUET; UPSC (after graduation) |
| C05 | Graphic/UI-UX Designer; Architect; Fashion Designer; Animator/VFX Artist; Film/Video Producer; Interior Designer; Product/Industrial Designer; Game Designer | B.Des; B.Arch; BFA; B.Sc Animation/VFX; Fashion Design | UCEED; NID DAT; NIFT; NATA/JEE Paper 2; CUET |
| C06 | Psychologist/Counsellor; Teacher/Professor; Special Educator; Learning Designer/EdTech; School Counsellor; HR/Talent Development Specialist; Child Development Specialist; Speech/Occupational Therapist | BA/B.Sc Psychology; B.Ed (integrated); BA Education; Child Development | CUET; NCET (integrated B.Ed) |
| C07 | Army Officer; Navy Officer; Air Force Officer/Pilot; Police Officer (IPS/State); Central Armed Police Forces Officer; Merchant Navy Officer; Defence Scientist (DRDO); Fire/Disaster Response Officer | NDA route; CDS route; Merchant Navy courses; B.Sc/B.Tech then services | NDA; CDS; AFCAT; CAPF; State police exams |
| C08 | Research Scientist; Biotechnologist; Geneticist; Chemist/Materials Scientist; Physicist/Astronomer; Microbiologist; Pharma R&D Scientist; Bioinformatics Specialist | B.Sc (Physics/Chem/Bio/Maths); Integrated MSc/BS-MS; B.Sc Biotechnology | IISER IAT; NEST; CUET; KVPY-successor/state fellowships |
| C09 | Wildlife Biologist; Conservation Scientist; Climate Analyst; Environmental Consultant; Marine Biologist; Forest Officer; Renewable Energy Specialist; Sustainability Manager | B.Sc Environmental Science; B.Sc Forestry; B.Sc Zoology/Marine Biology; B.Tech Environmental/Renewable | CUET; State forestry/agri exams; Indian Forest Service (after graduation) |
| C10 | Veterinary Doctor; Wildlife Veterinarian; Animal Behaviourist; Zoo/Sanctuary Manager; Animal Nutritionist; Dairy/Poultry Scientist; Aquaculture Specialist; Animal Welfare Officer | BVSc and AH; B.Sc Zoology/Animal Science; Fisheries Science; Dairy Technology | NEET-UG (BVSc); ICAR AIEEA; CUET |
| C11 | Agricultural Scientist; Food Technologist; Agri-Tech Entrepreneur; Horticulturist; Food Safety Officer; Agribusiness Manager; Soil/Water Scientist; Dairy/Plantation Manager | B.Sc/B.Tech Agriculture; B.Tech Food Technology; B.Sc Horticulture; Agribusiness | ICAR AIEEA; State CETs; CUET |
| C12 | Social Worker; NGO/Programme Manager; Development Economist; Public Health Worker; CSR Manager; Community Organiser; Human Rights Advocate; Disaster Relief Coordinator | BSW/MSW; BA Development Studies/Sociology; Public Policy programmes | CUET; University entrance tests (TISS-BAT etc.) |
| C13 | Professional Athlete; Sports Coach; Sports Scientist; Sports Physiotherapist; Fitness/Wellness Entrepreneur; Sports Analyst; Sports Manager; Yoga/Wellness Therapist | BPEd/B.Sc Sports Science; Sports Management; Yoga Science; BPT (sports) | CUET; Sports university entrance and trials |
| C14 | Journalist; Author/Content Writer; Translator/Interpreter; Editor/Publisher; Copywriter; Linguist; Screenwriter; Podcaster/Media Host | BA English/Languages; BA Journalism and Mass Communication; Creative Writing | CUET; IIMC/university entrance tests |
| C15 | Hotel Manager; Chef; Event Planner; Travel Entrepreneur; Aviation Services/Cabin Crew; Tourism Manager; Food and Beverage Manager; Resort/Cruise Operations Manager | BHM/Hotel Management; BBA Tourism/Aviation; Culinary Arts; Event Management | NCHM JEE; CUET; University tests |
| C16 | Startup Founder; Business Owner; Product Manager; Sales/Growth Head; Franchise Owner; Social Entrepreneur; Venture Analyst; Creator-Business Owner | BBA (Entrepreneurship); B.Com; Any degree plus incubator/startup programmes | CUET; IPMAT; University tests |

Mark every exam list as "verify for the current year" in the report.

## 8. Validity checks (run before scoring)
- Speeding: median response time under 2 seconds on likert items, or an aptitude item answered under 3 seconds repeatedly: flag `low_effort`.
- Straight-lining: 12 identical consecutive likert answers: flag.
- Inconsistency: paired items (same activity in Likert and forced choice) disagreeing on direction in more than 30 percent of pairs: flag.
- Social desirability: infrequency items in Modules 3 and 7 (to be added in later batches).
- If any flag is raised, show results as "provisional" and suggest a retake or a counsellor call.

## 9. Final report JSON the agent must output
```json
{"student_id":"", "grade":"10|12", "norm_status":"provisional|final", "validity":{"flags":[]},
 "riasec_code":"", "passion_type":"", "grit":0,
 "aptitude":{"V":0,"N":0,"L":0,"S":0,"P":0,"CRE":0,"EQ":0},
 "personality":{"O":0,"C":0,"E":0,"A":0,"N":0}, "values_rank":[],
 "clusters":[{"id":"","name":"","interest":0,"passion":0,"aptitude":0,"persval":0,"final":0,"flags":[]}],
 "top5":[], "picks":{"passion":"","strength":"","balanced":""}, "confidence":"High|Medium|Low",
 "hidden_gems":[], "growth_paths":[],
 "streams_10":[], "courses_12":[], "careers":[], "reality_check":{"budget_fit":"","relocation_fit":"","backup_routes":[]},
 "parent_page":{"alignment_gaps":[],"hidden_talents":[],"expectation_gap":"","talking_points":[]} }
```
## 10. Item schema for later modules (so every batch matches)
- M3 Personality and Thinking: `{"id","module":3,"sub":"O|C|E|A|N|ANALYTIC|CREATIVE|PRACTICAL|SOCIAL|LEADER|RISK|SOLO_TEAM","type":"likert5|scenario","stem","options","key":{"scale","reverse"}}`
- M4 Aptitude: `{"id","module":4,"dim":"V|N|L|S|P|CRE","type":"mcq","grade","difficulty":"easy|medium|hard","time_sec","stem","options":[{"k","text"}],"answer":"k","explanation"}`
- M5 Values: `{"id","module":5,"type":"ranking|forced_choice","stem","options":[{"k","text","value":"SEC|MON|STA|CRE|HELP|AUT|ADV|LRN"}]}`
- M6 EQ and Soft Skills: `{"id","module":6,"sub":"TEAM|STRESS|LEAD|COMM|EMPATHY|SELFCONTROL","type":"sjt","stem","options":[{"k","text","score":0-3}]}`
- M7 Academic Confidence and Readiness: `{"id","module":7,"sub":"SELF_EFFICACY|ANXIETY|LEARNING_STYLE|CAREER_AWARENESS|DECISION_STYLE","type":"likert5|scenario","stem","options","key"}`
- M8 Parent Observation: `{"id","module":8,"respondent":"parent","sub":"EARLY_BEHAVIOUR|MULTIPLE_INTELLIGENCE|TEACHER_FEEDBACK|STRENGTH|STRUGGLE|EXPECTATION","type":"likert5|multi_select|open_text","stem","options","key":{"cluster_hint","intelligence"}}`
Every item in every batch must carry: unique `id`, `grade` (10, 12 or both), and a scoring `key` or `answer`. No career-stereotype wording, no gendered assumptions, 10th wording at grade 8 reading level.

## 12. Counsellor mapping layer
After scoring, run the Counsellor Mapping Agent (`PROMPT_Counsellor_Mapping_Agent.md`). It uses `parent_student_crosswalk.json`, the Module 8 mirror items (`M8_Parent_Mirror_Items_Batch02.jsonl`) and this scoring output, and returns a `counsellor_map_v1` JSON that `counsellor_map_dashboard.html` renders as three graphs (cluster map, perception gap, evidence trace) plus insight cards with suggestions. Parent data never changes student scores.
