// Pre-scoring Validity & Safety checks per 00_Interest_Segregation_and_Scoring.md §8
// and PROMPT_Counsellor_Mapping_Agent.md §2.6 (Distress protocol).

const { detectDistress } = require('./v2Constants');
const { parseKey, parseOpts } = require('./blueprintV2Strategy');

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Evaluate pre-scoring response validity without mutating or blocking submission.
 * Raises explicit flags causing `provisional` status where effort/consistency checks trigger.
 * @param {Array} responsesJoined  response rows joined with v2_items columns
 */
function runValidityChecks(responsesJoined) {
  const flags = [];
  const likertTimes = [];
  const aptitudeFast = [];
  let aptitudeTotal = 0;

  // Ordered Likert answers for straight-lining run check (skip Module 1 profile context)
  const orderedLikerts = [...responsesJoined]
    .filter((r) => r.module >= 2 && r.module <= 7 && r.item_type === 'likert5' && r.numeric_value != null)
    .sort((a, b) => (a.display_order || a.item_id) - (b.display_order || b.item_id));

  for (const r of responsesJoined) {
    const rt = Number(r.response_time_ms || 0);
    if (r.module >= 2 && r.item_type === 'likert5' && rt > 0) {
      likertTimes.push(rt);
    }
    if (r.module === 4 && r.item_type === 'mcq') {
      aptitudeTotal += 1;
      if (rt > 0 && rt < 3000) aptitudeFast.push(r.external_id);
    }
  }

  // 1. Speeding check
  const likertMedianMs = median(likertTimes);
  if (likertMedianMs !== null && likertMedianMs < 2000 && likertTimes.length >= 10) {
    flags.push({
      code: 'speeding_likert',
      severity: 'warn',
      detail: `Median Likert response time was ${(likertMedianMs / 1000).toFixed(1)}s (< 2.0s threshold).`
    });
  }
  if (aptitudeFast.length >= 3 || (aptitudeTotal >= 4 && aptitudeFast.length / aptitudeTotal >= 0.4)) {
    flags.push({
      code: 'speeding_aptitude',
      severity: 'warn',
      detail: `${aptitudeFast.length} aptitude items were answered under 3.0s.`
    });
  }

  // 2. Straight-lining check: 12 consecutive identical Likert ratings
  let maxRun = 0;
  let curRun = 0;
  let prevVal = null;
  for (const r of orderedLikerts) {
    const v = Number(r.numeric_value);
    if (v === prevVal) {
      curRun += 1;
    } else {
      curRun = 1;
      prevVal = v;
    }
    if (curRun > maxRun) maxRun = curRun;
  }
  if (maxRun >= 12) {
    flags.push({
      code: 'straight_lining',
      severity: 'warn',
      detail: `${maxRun} identical consecutive Likert answers detected.`
    });
  }

  // 3. M3 INFREQ social desirability check (mean >= 4.2 flags)
  const infreqVals = [];
  for (const r of responsesJoined) {
    if (r.module === 3 && r.sub === 'INFREQ' && r.numeric_value != null) {
      infreqVals.push(Number(r.numeric_value));
    }
  }
  const infreqMean = infreqVals.length > 0
    ? infreqVals.reduce((a, b) => a + b, 0) / infreqVals.length
    : null;
  if (infreqMean !== null && infreqMean >= 4.2) {
    flags.push({
      code: 'social_desirability',
      severity: 'info',
      detail: `Infrequency check elevated (${infreqMean.toFixed(1)}/5); responses may lean strongly toward idealized answers.`
    });
  }

  // 4. Paired item consistency check (M2 LIKE5 cluster polarity vs forced_choice/best_worst picks)
  const likertClusterPolarity = {};
  for (const r of responsesJoined) {
    if (r.module === 2 && r.sub === 'INT' && r.item_type === 'likert5' && r.numeric_value != null) {
      const k = parseKey(r);
      if (k.cluster) {
        (likertClusterPolarity[k.cluster] ||= []).push(Number(r.numeric_value) - 3);
      }
    }
  }
  let pairsChecked = 0;
  let pairDisagreements = 0;
  for (const r of responsesJoined) {
    if (r.module === 2 && r.sub === 'INT' && (r.item_type === 'forced_choice' || r.item_type === 'best_worst')) {
      const opts = parseOpts(r);
      let posCluster = null;
      let negCluster = null;
      if (r.item_type === 'forced_choice' && r.answer_key) {
        const chosen = opts.find((o) => o.k === r.answer_key);
        const other = opts.find((o) => o.k !== r.answer_key);
        posCluster = chosen?.cluster;
        negCluster = other?.cluster;
      } else if (r.item_type === 'best_worst' && r.response_json) {
        let parsed = {};
        try { parsed = JSON.parse(r.response_json); } catch { /* ignore invalid JSON */ }
        posCluster = opts.find((o) => o.k === parsed.most)?.cluster;
        negCluster = opts.find((o) => o.k === parsed.least)?.cluster;
      }
      if (posCluster && negCluster && likertClusterPolarity[posCluster] && likertClusterPolarity[negCluster]) {
        const avgPos = likertClusterPolarity[posCluster].reduce((a, b) => a + b, 0) / likertClusterPolarity[posCluster].length;
        const avgNeg = likertClusterPolarity[negCluster].reduce((a, b) => a + b, 0) / likertClusterPolarity[negCluster].length;
        // Disagreement: liked B strongly more than A on Likert yet preferred A over B here (clear reversal >= 1.5 difference)
        if (avgPos - avgNeg <= -1.5) {
          pairDisagreements += 1;
        }
        pairsChecked += 1;
      }
    }
  }
  if (pairsChecked >= 3 && pairDisagreements / pairsChecked > 0.30) {
    flags.push({
      code: 'paired_inconsistency',
      severity: 'warn',
      detail: `${Math.round((pairDisagreements / pairsChecked) * 100)}% disagreement between rating items and paired comparisons.`
    });
  }

  // 5. Distress text scan (safety Rule §2.6 — checked across student open_text)
  const distressItems = [];
  for (const r of responsesJoined) {
    if (r.item_type === 'open_text' && r.response_text && detectDistress(r.response_text)) {
      distressItems.push(r.external_id || `item_${r.item_id}`);
    }
  }

  const hasEffortFlag = flags.some((f) => ['speeding_likert', 'speeding_aptitude', 'straight_lining', 'paired_inconsistency'].includes(f.code));

  return {
    flags,
    is_provisional_due_to_validity: hasEffortFlag,
    distress_detected: distressItems.length > 0,
    distress_item_ids: distressItems,
    metrics: {
      likert_median_ms: likertMedianMs ? Math.round(likertMedianMs) : null,
      aptitude_fast_count: aptitudeFast.length,
      max_straight_line_run: maxRun,
      infreq_mean: infreqMean != null ? Number(infreqMean.toFixed(2)) : null,
      paired_disagreement_rate: pairsChecked > 0 ? Number((pairDisagreements / pairsChecked).toFixed(2)) : null
    }
  };
}

module.exports = { runValidityChecks };
