// Pure Canvas Psychometric Visualizations (Holland Radar, Grit Gauge, Congruence Meter)

/**
 * Draws a 6-axis RIASEC Holland Code Radar Chart
 */
function drawHollandRadar(canvasId, riasecData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 360;
  const height = canvas.clientHeight || 360;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) - 48;

  const axes = [
    { label: 'Realistic (R)', keys: ['R', 'r_score'], color: '#ef4444' },
    { label: 'Investigative (I)', keys: ['I', 'i_score'], color: '#3b82f6' },
    { label: 'Artistic (A)', keys: ['A', 'a_score'], color: '#ec4899' },
    { label: 'Social (S)', keys: ['S', 's_score'], color: '#10b981' },
    { label: 'Enterprising (E)', keys: ['E', 'e_score'], color: '#f59e0b' },
    { label: 'Conventional (C)', keys: ['C', 'c_score'], color: '#8b5cf6' }
  ];

  ctx.clearRect(0, 0, width, height);

  // Draw concentric background web
  const levels = 5;
  for (let l = 1; l <= levels; l++) {
    const r = (radius / levels) * l;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Draw spokes
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Axis label
    const labelX = centerX + (radius + 24) * Math.cos(angle);
    const labelY = centerY + (radius + 24) * Math.sin(angle);
    ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = axes[i].color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(axes[i].label, labelX, labelY);
  }

  // Plot student scores. Null/unmeasured values render at centre, never as a fake 50.
  ctx.beginPath();
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
    let val = null;
    for (const k of axes[i].keys) {
      if (riasecData && riasecData[k] !== null && riasecData[k] !== undefined) { val = riasecData[k]; break; }
    }
    const r = ((val ?? 0) / 100) * radius;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    points.push({ x, y, val });
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Polygon fill & stroke
  const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0.25)');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw node points
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/**
 * Draws Circular Gauge for Grit or Alignment
 */
function drawRadialGauge(canvasId, value, maxValue = 100, label = '', color = '#6366f1') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 200;
  const height = canvas.clientHeight || 200;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) - 20;

  ctx.clearRect(0, 0, width, height);

  // Background arc
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Value arc
  const pct = Math.min(1, Math.max(0, value / maxValue));
  const endAngle = 0.75 * Math.PI + pct * 1.5 * Math.PI;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, endAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Value text
  ctx.font = '800 28px Outfit, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value, centerX, centerY - 6);

  // Subtitle / label
  ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(label, centerX, centerY + 18);
}

window.drawHollandRadar = drawHollandRadar;
window.drawRadialGauge = drawRadialGauge;
