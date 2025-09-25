const moment = require('moment');

class SignalAnalyzer {
    constructor() {
        this.anchorDate = '2025-08-01T00:00:00.000Z';
    }

    findPivotLow(klineData) {
        const anchorTimestamp = moment.utc(this.anchorDate).valueOf();

        let minPrice = null;
        let pivotLowIndex = -1;

        for (let i = 0; i < klineData.length; i++) {
            if (klineData[i].closeTime >= anchorTimestamp) {
                if (minPrice === null || klineData[i].low <= minPrice) {
                    minPrice = klineData[i].low;
                    pivotLowIndex = i;
                }
            }
        }

        if (pivotLowIndex === -1) return null;

        return {
            index: pivotLowIndex,
            price: minPrice,
            timestamp: klineData[pivotLowIndex].closeTime,
            kline: klineData[pivotLowIndex]
        };
    }

    findPullbackHighs(klineData, pivotLow) {
        const pullbackHighs = [];
        const startIndex = pivotLow.index + 1;

        for (let i = startIndex + 2; i < klineData.length - 2; i++) {
            const window = [
                klineData[i - 2],
                klineData[i - 1],
                klineData[i],
                klineData[i + 1],
                klineData[i + 2]
            ];

            if (this.isFiveBarPattern(window)) {
                const phPrice = window[2].close;

                if (this.isRegionalHigh(klineData, pivotLow.index, i, phPrice)) {
                    pullbackHighs.push({
                        index: i,
                        price: phPrice,
                        timestamp: window[2].closeTime,
                        kline: window[2],
                        window: window
                    });
                }
            }
        }

        return pullbackHighs;
    }

    isFiveBarPattern(window) {
        const c = window.map(k => k.close);

        const leftUptrend = c[0] < c[1] && c[1] < c[2];

        const rightDowntrend = c[3] < c[2] && c[4] < c[3];

        return leftUptrend && rightDowntrend;
    }

    isRegionalHigh(klineData, pivotLowIndex, currentIndex, price) {
        const tolerance = 1e-8;

        for (let i = pivotLowIndex + 1; i < klineData.length; i++) {
            if (klineData[i].close > price + tolerance) {
                return false;
            }
        }

        return true;
    }

    generateEntrySignals(klineData, pullbackHighs) {
        const signals = [];
        const thirtyDaysAgo = moment.utc().subtract(30, 'days').valueOf();

        for (const ph of pullbackHighs) {
            const entryIndex = ph.index + 2;

            if (entryIndex < klineData.length) {
                const entryKline = klineData[entryIndex];

                if (entryKline.closeTime >= thirtyDaysAgo) {
                    signals.push({
                        ph: ph,
                        entryPrice: entryKline.close,
                        entryTimestamp: entryKline.closeTime,
                        entryKline: entryKline
                    });
                }
            }
        }

        return signals;
    }

    analyzeSymbol(symbol, klineData) {
        if (!klineData || klineData.length < 5) {
            return { symbol, signals: [], error: 'Insufficient data' };
        }

        try {
            const pivotLow = this.findPivotLow(klineData);
            if (!pivotLow) {
                return { symbol, signals: [], error: 'No pivot low found' };
            }

            const pullbackHighs = this.findPullbackHighs(klineData, pivotLow);
            if (pullbackHighs.length === 0) {
                return { symbol, signals: [], pivotLow, error: 'No pullback highs found' };
            }

            const entrySignals = this.generateEntrySignals(klineData, pullbackHighs);

            return {
                symbol,
                pivotLow,
                pullbackHighs,
                signals: entrySignals.map(signal => ({
                    symbol,
                    timeframe: '4h',
                    pl_ts: moment.utc(pivotLow.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                    ph_close: signal.ph.price,
                    ph_ts: moment.utc(signal.ph.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                    entry_price: signal.entryPrice,
                    entry_ts: moment.utc(signal.entryTimestamp).format('YYYY-MM-DD HH:mm:ss')
                }))
            };
        } catch (error) {
            return { symbol, signals: [], error: error.message };
        }
    }
}

module.exports = SignalAnalyzer;