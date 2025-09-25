# 4H Trading Signal Scanner

A Node.js application that scans USDT trading pairs for short entry signals based on the "Recent Low → Pullback High (5-bar) → Right-2 Close Entry" pattern on 4H timeframe.

## Features

- Scans USDT trading pairs from Binance
- Detects Pivot Low (PL) - most recent lowest close since 2025-08-01
- Identifies Pullback High (PH) using 5-bar pattern with regional maximum validation
- Generates entry signals with 30-day filter
- Excludes leveraged tokens (UP/DOWN, BULL/BEAR, 3L/3S, etc.)

## Installation

```bash
npm install
```

## Usage

### Scan All Symbols (default: 20 symbols)
```bash
npm start
```

### Scan Specific Number of Symbols
```bash
npm start 50
```

### Analyze Single Symbol
```bash
npm start BTCUSDT
```

## Signal Criteria

1. **Pivot Low (PL)**: Most recent lowest close price since 2025-08-01 00:00:00 UTC
2. **Pullback High (PH)**: 5-bar pattern where:
   - Left 2 bars: C[i-2] < C[i-1] < C[i] (strictly increasing)
   - Right 2 bars: C[i+1] < min(C[i], C[i-1], C[i-2]) and C[i+2] < min(C[i+1], C[i], C[i-1], C[i-2])
   - C[i] equals the highest close since PL
3. **Entry**: Triggered at i+2 close, filtered to last 30 days only

## Output Format

```
Symbol         PL Time             PH Close    PH Time             Entry Price Entry Time
BTCUSDT        2025-08-15 12:00:00 45000.50    2025-09-01 08:00:00 43200.25   2025-09-01 16:00:00
```

## Files Structure

- `src/index.js` - Main scanner application
- `src/dataFetcher.js` - Binance API data fetching
- `src/signalAnalyzer.js` - Signal detection logic
- `package.json` - Dependencies and scripts