import type { OhlcvBar } from "../marketdata/types.js";
import { detectPatterns } from "./candlesticks/index.js";
import type { TrendContext } from "./candlesticks/types.js";
import { ema, rsi, macd, bollingerBands, relativeVolume } from "./indicators/index.js";
import { RISK_LIMITS } from "../config/riskLimits.js";
import { DEFAULT_SIGNAL_WEIGHTS, type Decision, type SignalVote, type SignalWeights } from "./types.js";

const DECISION_THRESHOLD = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trendFromEma(closes: number[]): { trend: TrendContext; ema9: number | null; ema21: number | null } {
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const last9 = ema9[ema9.length - 1];
  const last21 = ema21[ema21.length - 1];
  if (last9 === null || last21 === null) return { trend: "neutral", ema9: last9, ema21: last21 };
  if (last9 > last21) return { trend: "up", ema9: last9, ema21: last21 };
  if (last9 < last21) return { trend: "down", ema9: last9, ema21: last21 };
  return { trend: "neutral", ema9: last9, ema21: last21 };
}

function candlestickVote(bars: OhlcvBar[], trend: TrendContext): SignalVote | null {
  const matches = detectPatterns(bars, trend);
  if (matches.length === 0) return null;

  const volConfirmed = (relativeVolume(bars, 20) ?? 0) >= RISK_LIMITS.volumeConfirmationMultiplier;
  const discount = volConfirmed ? 1 : RISK_LIMITS.volumeConfirmationDiscount;

  const total = matches.reduce((sum, m) => sum + (m.direction === "bullish" ? m.strength : -m.strength) * discount, 0);
  const vote = clamp(total / matches.length, -1, 1);
  return { key: "candlestick", vote, detail: matches.map((m) => `${m.name}(${m.direction},${m.strength.toFixed(2)})`).join(", ") + (volConfirmed ? "" : " [no volume confirmation]") };
}

function trendVote(ema9: number | null, ema21: number | null): SignalVote | null {
  if (ema9 === null || ema21 === null || ema21 === 0) return null;
  const vote = clamp(Math.tanh(((ema9 - ema21) / ema21) * 50), -1, 1);
  return { key: "trend", vote, detail: `EMA9=${ema9.toFixed(4)} EMA21=${ema21.toFixed(4)}` };
}

/**
 * Mean-reversion vote: neutral (0) inside the configured overbought/oversold
 * band, scaling toward ±1 only as RSI moves past that band toward the
 * extremes (0/100) — matching the plan's stated "RSI(14), overbought/
 * oversold at 70/30" strategy default (RISK_LIMITS.rsiOverbought/
 * rsiOversold), rather than a flat linear map around 50 that ignored those
 * configured thresholds entirely.
 */
function rsiVote(closes: number[]): SignalVote | null {
  const series = rsi(closes, 14);
  const last = series[series.length - 1];
  if (last === null) return null;

  const { rsiOverbought, rsiOversold } = RISK_LIMITS;
  let vote = 0;
  if (last >= rsiOverbought) {
    vote = -((last - rsiOverbought) / (100 - rsiOverbought));
  } else if (last <= rsiOversold) {
    vote = (rsiOversold - last) / rsiOversold;
  }

  return { key: "momentum_rsi", vote: clamp(vote, -1, 1), detail: `RSI(14)=${last.toFixed(1)} (overbought>=${rsiOverbought}, oversold<=${rsiOversold})` };
}

function macdVote(closes: number[]): SignalVote | null {
  const { histogram } = macd(closes, 12, 26, 9);
  const last = histogram[histogram.length - 1];
  const price = closes[closes.length - 1];
  if (last === null || price === 0) return null;
  const scale = price * 0.01;
  const vote = clamp(last / scale, -1, 1);
  return { key: "momentum_macd", vote, detail: `MACD histogram=${last.toFixed(4)}` };
}

function bollingerVote(closes: number[]): SignalVote | null {
  const { upper, lower } = bollingerBands(closes, 20, 2);
  const u = upper[upper.length - 1];
  const l = lower[lower.length - 1];
  const price = closes[closes.length - 1];
  if (u === null || l === null || u === l) return null;
  const position = (price - l) / (u - l);
  const vote = clamp((0.5 - position) * 2, -1, 1);
  return { key: "volatility_bbands", vote, detail: `price position in bands=${position.toFixed(2)}` };
}

function sentimentVote(sentimentScore: number | null): SignalVote | null {
  if (sentimentScore === null) return null;
  return { key: "sentiment", vote: clamp(sentimentScore, -1, 1), detail: `sentiment score=${sentimentScore.toFixed(2)}` };
}

function socialChatterVote(chatterScore: number | null): SignalVote | null {
  if (chatterScore === null) return null;
  return { key: "social_chatter", vote: clamp(chatterScore, -1, 1), detail: `StockTwits/X chatter score=${chatterScore.toFixed(2)}` };
}

/**
 * Combines candlestick + indicator + macro-sentiment + per-symbol social-
 * chatter signals into one decision. `weights` come from
 * `learning/weightStore` — this function is otherwise pure/deterministic
 * so it's cheap to unit test and to run in the backtest harness against
 * historical bars.
 */
export function computeSignal(bars: OhlcvBar[], sentimentScore: number | null, socialChatterScore: number | null = null, weights: SignalWeights = DEFAULT_SIGNAL_WEIGHTS): Decision {
  const closes = bars.map((b) => b.close);
  const { trend, ema9, ema21 } = trendFromEma(closes);

  const votes: (SignalVote | null)[] = [
    candlestickVote(bars, trend),
    trendVote(ema9, ema21),
    rsiVote(closes),
    macdVote(closes),
    bollingerVote(closes),
    sentimentVote(sentimentScore),
    socialChatterVote(socialChatterScore),
  ];

  const contributingSignals = votes
    .filter((v): v is SignalVote => v !== null)
    .map((v) => {
      const weight = weights[v.key];
      return { ...v, weight, contribution: v.vote * weight };
    });

  const weightSum = contributingSignals.reduce((sum, s) => sum + s.weight, 0);
  const score = weightSum === 0 ? 0 : clamp(contributingSignals.reduce((sum, s) => sum + s.contribution, 0) / weightSum, -1, 1);
  const confidence = Math.abs(score);

  const action = score > DECISION_THRESHOLD ? "BUY" : score < -DECISION_THRESHOLD ? "SELL" : "HOLD";

  return { action, confidence, score, contributingSignals };
}
