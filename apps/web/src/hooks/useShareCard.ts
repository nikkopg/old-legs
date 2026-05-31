'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadShareImage } from '@/lib/api';

export type ShareCardState = 'idle' | 'generating' | 'uploading' | 'copied' | 'error';

export interface ShareCardInput {
  /** Distance string already formatted, e.g. "8.4 km" */
  distanceKm: number;
  /** Average pace in min/km */
  avgPaceMinPerKm: number;
  /** ISO date string of the activity */
  activityDate: string;
  /** Average HR in bpm, or null if unavailable */
  avgHr: number | null;
  /** Pak Har one-liner. When null the verdict line is omitted from the card. */
  verdictShort: string | null;
}

// ---------------------------------------------------------------------------
// Card constants — parchment palette, hardcoded light-mode so the PNG looks
// consistent when shared regardless of user's theme setting.
// ---------------------------------------------------------------------------
const C = {
  paper: '#f4efe4',
  ink: '#141210',
  accent: '#8a2a12',
  hairline: 'rgba(20,18,16,0.25)',
} as const;

const CARD_W = 800;
const CARD_H = 400;
// Retina: draw at 2× and let the PNG encode at full resolution.
const SCALE = 2;
const W = CARD_W * SCALE;
const H = CARD_H * SCALE;
const PX = 52 * SCALE; // horizontal padding
const PY = 44 * SCALE; // vertical padding

// ---------------------------------------------------------------------------
// Text wrap helper
// ---------------------------------------------------------------------------
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function fmtPace(minPerKm: number): string {
  const totalSec = Math.round(minPerKm * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(isoString: string): string {
  const d = new Date(isoString);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Canvas draw
// ---------------------------------------------------------------------------
async function drawCard(input: ShareCardInput): Promise<Blob> {
  const IW = W - PX * 2; // inner width

  // Pre-load fonts at the sizes we will use before touching the canvas.
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load(`400 ${88 * SCALE}px "Abril Fatface"`),
    document.fonts.load(`400 ${72 * SCALE}px "Abril Fatface"`),
    document.fonts.load(`400 ${56 * SCALE}px "Abril Fatface"`),
    document.fonts.load(`700 ${26 * SCALE}px "Space Mono"`),
    document.fonts.load(`400 ${18 * SCALE}px "Space Mono"`),
    document.fonts.load(`600 ${16 * SCALE}px "Work Sans"`),
    document.fonts.load(`600 ${14 * SCALE}px "Work Sans"`),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.textBaseline = 'top';

  // Background
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // ── Footer (built bottom-up) ──────────────────────────────────────────────
  const footerLabelH = 16 * SCALE;
  const footerRuleGap = 20 * SCALE;
  const footerRuleY = H - PY - footerLabelH - footerRuleGap;
  const footerLabelY = footerRuleY + footerRuleGap;

  // Accent rule
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX, footerRuleY);
  ctx.lineTo(W - PX, footerRuleY);
  ctx.stroke();

  // Left attribution
  ctx.font = `600 ${footerLabelH}px "Work Sans"`;
  ctx.fillStyle = C.accent;
  ctx.globalAlpha = 0.75;
  // letterSpacing is not universally supported on canvas — simulate with fillText
  ctx.letterSpacing = '4px';
  ctx.fillText('BY PAK HAR · OLD LEGS', PX, footerLabelY);

  // Right: website
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.45;
  ctx.letterSpacing = '2px';
  ctx.fillText('oldlegs.app', W - PX, footerLabelY);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';

  // ── Stats strip ───────────────────────────────────────────────────────────
  const statsGapAboveFooter = 36 * SCALE;
  const statsPadTop = 28 * SCALE;
  const statLabelH = 14 * SCALE;
  const statLabelValueGap = 8 * SCALE;
  const statValueH = 26 * SCALE;
  const statsBlockH = statsPadTop + statLabelH + statLabelValueGap + statValueH;
  const statsTop = footerRuleY - statsGapAboveFooter - statsBlockH;

  // Hairline above stats
  ctx.strokeStyle = C.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PX, statsTop);
  ctx.lineTo(W - PX, statsTop);
  ctx.stroke();

  // Build stat columns
  type StatCol = { label: string; value: string; unit: string };
  const statCols: StatCol[] = [
    { label: 'DISTANCE', value: input.distanceKm.toFixed(2), unit: 'km' },
    { label: 'PACE', value: fmtPace(input.avgPaceMinPerKm), unit: '/km' },
    { label: 'DATE', value: fmtDate(input.activityDate), unit: '' },
  ];
  if (input.avgHr !== null) {
    statCols.push({ label: 'AVG HR', value: String(input.avgHr), unit: 'bpm' });
  }

  const colW = IW / statCols.length;
  for (let i = 0; i < statCols.length; i++) {
    const col = statCols[i];
    const colX = PX + i * colW;
    const padL = i === 0 ? 0 : 28 * SCALE;

    // Vertical divider
    if (i > 0) {
      ctx.strokeStyle = C.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(colX, statsTop + statsPadTop);
      ctx.lineTo(colX, statsTop + statsBlockH);
      ctx.stroke();
    }

    const textX = colX + padL;
    const labelY = statsTop + statsPadTop;
    const valueY = labelY + statLabelH + statLabelValueGap;

    // Label
    ctx.font = `600 ${statLabelH}px "Work Sans"`;
    ctx.fillStyle = C.ink;
    ctx.globalAlpha = 0.5;
    ctx.letterSpacing = '4px';
    ctx.fillText(col.label, textX, labelY);

    // Value
    ctx.font = `700 ${statValueH}px "Space Mono"`;
    ctx.fillStyle = C.ink;
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
    ctx.fillText(col.value, textX, valueY);

    // Unit
    if (col.unit) {
      const valW = ctx.measureText(col.value).width;
      ctx.font = `400 ${18 * SCALE}px "Space Mono"`;
      ctx.globalAlpha = 0.5;
      ctx.fillText(col.unit, textX + valW + 6, valueY + 8);
      ctx.globalAlpha = 1;
    }
  }

  // ── Masthead: "OLD LEGS" top-left ─────────────────────────────────────────
  const mastheadH = 14 * SCALE;
  ctx.font = `600 ${mastheadH}px "Work Sans"`;
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.65;
  ctx.letterSpacing = '6px';
  ctx.fillText('OLD LEGS', PX, PY);
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';

  // Hairline below masthead
  const mastheadLineY = PY + mastheadH + 10 * SCALE;
  ctx.strokeStyle = C.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PX, mastheadLineY);
  ctx.lineTo(W - PX, mastheadLineY);
  ctx.stroke();

  // ── Headline: verdict_short or distance ──────────────────────────────────
  //
  // Available vertical space for the headline: between mastheadLineY and statsTop.
  // Include a small internal top/bottom gap inside this area.
  const headlineAreaTop = mastheadLineY + 16 * SCALE;
  const headlineAreaBot = statsTop - 16 * SCALE;
  const headlineAreaH = headlineAreaBot - headlineAreaTop;

  // Determine content: prefer verdict_short; fall back to distance headline.
  const headlineText = input.verdictShort
    ? (input.verdictShort.length > 120
      ? `${input.verdictShort.slice(0, 117)}...`
      : input.verdictShort)
    : `${input.distanceKm.toFixed(1)} KM`;

  // Pick font size so wrapped lines fit vertically.
  // Try 44 → 36 → 28 px (display sizes before scaling).
  const candidateSizes = [44, 36, 28].map(s => s * SCALE);
  let chosenSize = candidateSizes[candidateSizes.length - 1];
  let chosenLines: string[] = [];

  for (const fs of candidateSizes) {
    ctx.font = `400 ${fs}px "Abril Fatface"`;
    const lines = wrapText(ctx, headlineText, IW);
    const totalH = lines.length * fs * 1.12;
    if (totalH <= headlineAreaH) {
      chosenSize = fs;
      chosenLines = lines;
      break;
    }
  }

  // If we never found a size that fits (very long verdict), use smallest and truncate.
  if (chosenLines.length === 0) {
    chosenSize = candidateSizes[candidateSizes.length - 1];
    ctx.font = `400 ${chosenSize}px "Abril Fatface"`;
    chosenLines = wrapText(ctx, headlineText, IW);
  }

  ctx.font = `400 ${chosenSize}px "Abril Fatface"`;
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '-1px';

  const lineH = chosenSize * 1.12;
  const totalTextH = chosenLines.length * lineH;
  // Vertically center in the headline area
  const startY = headlineAreaTop + (headlineAreaH - totalTextH) / 2;

  for (let i = 0; i < chosenLines.length; i++) {
    ctx.fillText(chosenLines[i], PX, startY + i * lineH);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useShareCard() {
  const [state, setState] = useState<ShareCardState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Reset to idle after "copied" so the button label reverts after 2s.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(async (input: ShareCardInput) => {
    // Guard against double-trigger while in progress.
    if (state === 'generating' || state === 'uploading') return;

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setError(null);

    try {
      // Step 1: draw the canvas card
      setState('generating');
      const blob = await drawCard(input);

      // Step 2: upload to /share-image
      setState('uploading');
      const { token } = await uploadShareImage(blob);

      // Step 3: build the share URL using the /share/[token] page (not the raw image)
      const shareUrl = `${window.location.origin}/share/${token}`;

      // Step 4: copy to clipboard
      await navigator.clipboard.writeText(shareUrl);

      setState('copied');

      // Auto-revert after 2s
      resetTimerRef.current = setTimeout(() => {
        setState('idle');
        resetTimerRef.current = null;
      }, 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      setState('error');
    }
  }, [state]);

  return { shareState: state, shareError: error, triggerShare: trigger };
}
