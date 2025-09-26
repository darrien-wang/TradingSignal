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

        // 使用容错规则检查，需要更多K线空间
        for (let i = startIndex + 2; i < klineData.length - 4; i++) {
            // 使用新的容错检查方法
            if (this.isFiveBarPatternWithContainment(klineData, i - 2)) {
                const phPrice = klineData[i].close;

                // 检查区间极大
                if (this.isRegionalHigh(klineData, pivotLow.index, i, phPrice)) {
                    // 检查更低高点规则：当前PH必须低于前一个PH
                    const isLowerHigh = this.isLowerHigh(pullbackHighs, phPrice);

                    if (isLowerHigh) {
                        pullbackHighs.push({
                            index: i,
                            price: phPrice,
                            timestamp: klineData[i].closeTime,
                            kline: klineData[i],
                            window: [
                                klineData[i - 2],
                                klineData[i - 1],
                                klineData[i],
                                klineData[i + 1],
                                klineData[i + 2]
                            ]
                        });
                    }
                }
            }
        }

        return pullbackHighs;
    }

    // 检查更低高点规则
    isLowerHigh(existingPHs, currentPrice) {
        // 如果没有先前的PH，则接受当前PH
        if (existingPHs.length === 0) {
            return true;
        }

        // 找到最近的（最后一个）PH
        const lastPH = existingPHs[existingPHs.length - 1];

        // 当前PH必须低于前一个PH
        return currentPrice < lastPH.price;
    }

    isFiveBarPattern(window) {
        const c = window.map(k => k.close);

        // 左侧两根创新高（严格单调上行）：C[i-2] < C[i-1] < C[i]
        const leftUptrend = c[0] < c[1] && c[1] < c[2];

        // 右侧第一根必须下跌：C[i+1] < C[i]
        const firstRightDown = c[3] < c[2];

        // 右侧第二根检查（含容错规则）：
        // 标准情况：C[i+2] < C[i+1]
        // 容错情况：如果 C[i+2] >= C[i+1]，检查是否有后续K线继续下跌
        let secondRightValid = c[4] < c[3]; // 标准情况

        return leftUptrend && firstRightDown && secondRightValid;
    }

    // 新方法：检查扩展窗口的包含容错规则
    isFiveBarPatternWithContainment(klineData, startIndex) {
        if (startIndex + 4 >= klineData.length) return false;

        const window = [];
        for (let j = 0; j < 5; j++) {
            window.push(klineData[startIndex + j]);
        }

        const c = window.map(k => k.close);
        const leftUptrend = c[0] < c[1] && c[1] < c[2];
        const firstRightDown = c[3] < c[2];

        if (!leftUptrend || !firstRightDown) return false;

        // 标准右二下跌
        if (c[4] < c[3]) return true;

        // 容错规则：右二反弹，检查右三
        if (startIndex + 5 < klineData.length) {
            const c5 = klineData[startIndex + 5].close;
            if (c5 < c[3]) return true; // C[i+3] < C[i+1]
        }

        // 容错规则：右三也反弹，检查右四
        if (startIndex + 6 < klineData.length) {
            const c6 = klineData[startIndex + 6].close;
            if (c6 < c[4]) return true; // C[i+4] < C[i+2]
        }

        return false;
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

    async generateEntrySignals(klineData, pullbackHighs, symbol, dataFetcher) {
        const signals = [];
        const thirtyDaysAgo = moment.utc().subtract(30, 'days').valueOf();

        for (const ph of pullbackHighs) {
            const entryIndex = ph.index + 2;

            if (entryIndex < klineData.length) {
                const entryKline = klineData[entryIndex];

                if (entryKline.closeTime >= thirtyDaysAgo) {
                    // 获取实时价格而不是历史数据的最后一根
                    let currentPrice = klineData[klineData.length - 1].close; // 默认值
                    try {
                        const realTimePrice = await dataFetcher.getCurrentPrice(symbol);
                        if (realTimePrice) {
                            currentPrice = realTimePrice;
                        }
                    } catch (error) {
                        console.warn(`Failed to get real-time price for ${symbol}, using last close price`);
                    }

                    // 计算表现：价格下跌为负值（有利于做空）
                    const performancePercent = ((currentPrice - entryKline.close) / entryKline.close) * 100;

                    signals.push({
                        ph: ph,
                        entryPrice: entryKline.close,
                        entryTimestamp: entryKline.closeTime,
                        entryKline: entryKline,
                        currentPrice: currentPrice,
                        performancePercent: performancePercent
                    });
                }
            }
        }

        return signals;
    }

    // New method to find Right-1 stage signals (potential upcoming signals)
    findRight1Signals(klineData, pivotLow) {
        const right1Signals = [];
        const startIndex = pivotLow.index + 1;
        const thirtyDaysAgo = moment.utc().subtract(30, 'days').valueOf();

        // Right-1阶段：最新的K线是Right-1，等待Right-2确认
        // 只检查最后一个可能的位置（最新K线作为Right-1）
        const i = klineData.length - 2; // PH位置（Right-1是最后一根）

        if (i >= startIndex + 2) {
            const window4 = [
                klineData[i - 2],  // i-2
                klineData[i - 1],  // i-1
                klineData[i],      // i (PH候选)
                klineData[i + 1]   // i+1 (Right-1, 最新K线)
            ];

            const c = window4.map(k => k.close);

            // 检查左侧上涨：C[i-2] < C[i-1] < C[i]
            const leftUptrend = c[0] < c[1] && c[1] < c[2];

            // 检查第一个右侧下跌：C[i+1] < C[i]
            const right1Valid = c[3] < c[2];

            // 检查时间过滤
            const isRecentEnough = window4[3].closeTime >= thirtyDaysAgo;

            if (leftUptrend && right1Valid && isRecentEnough) {
                const phPrice = c[2]; // C[i]

                // 检查区间极大：C[i]必须是PL后的最高收盘价
                if (this.isRegionalHigh(klineData, pivotLow.index, i, phPrice)) {
                    right1Signals.push({
                        index: i,                           // PH位置
                        price: phPrice,                     // PH价格
                        timestamp: window4[2].closeTime,    // PH时间
                        kline: window4[2],                  // PH K线
                        window: window4,                    // 4根K线窗口
                        right1Timestamp: window4[3].closeTime, // Right-1时间
                        right1Price: c[3],                  // Right-1价格
                        symbol: 'placeholder'               // 符号占位
                    });
                }
            }
        }

        return right1Signals;
    }

    // Categorize signals by stage
    categorizeSignals(entrySignals, right1Signals) {
        const now = moment.utc();
        const categorized = {
            upcoming: [],      // Right-1 stage (将要出现)
            fresh: [],         // Just confirmed within 24h (刚出现)
            active: [],        // Confirmed but not yet dropped 8% (已经出现)
            realized: []       // Already dropped 8%+ (已兑现下跌)
        };

        // Categorize Right-1 signals as upcoming (将要出现)
        right1Signals.forEach(signal => {
            categorized.upcoming.push({
                ...signal,
                stage: 'upcoming',
                description: 'Right-1阶段 - 等待下根K线确认信号'
            });
        });

        // Categorize confirmed entry signals (已确认的入场信号)
        entrySignals.forEach(signal => {
            const entryTime = moment.utc(signal.entryTimestamp);
            const hoursFromEntry = now.diff(entryTime, 'hours');

            // 已兑现下跌：价格下跌8%或更多（做空获利）
            if (signal.performancePercent <= -8) {
                categorized.realized.push({
                    ...signal,
                    stage: 'realized',
                    description: `已兑现下跌 ${Math.abs(signal.performancePercent.toFixed(2))}%`
                });
            }
            // 刚出现：24小时内确认的新信号
            else if (hoursFromEntry <= 24) {
                categorized.fresh.push({
                    ...signal,
                    stage: 'fresh',
                    description: `刚确认信号 - ${signal.performancePercent >= 0 ? '+' : ''}${signal.performancePercent.toFixed(2)}%`
                });
            }
            // 已经出现：确认超过24小时但未大幅下跌
            else {
                categorized.active.push({
                    ...signal,
                    stage: 'active',
                    description: `活跃信号 - ${signal.performancePercent >= 0 ? '+' : ''}${signal.performancePercent.toFixed(2)}%`
                });
            }
        });

        return categorized;
    }

    async analyzeSymbol(symbol, klineData, dataFetcher) {
        if (!klineData || klineData.length < 5) {
            return { symbol, signals: [], error: 'Insufficient data' };
        }

        try {
            const pivotLow = this.findPivotLow(klineData);
            if (!pivotLow) {
                return { symbol, signals: [], error: 'No pivot low found' };
            }

            const pullbackHighs = this.findPullbackHighs(klineData, pivotLow);
            const entrySignals = await this.generateEntrySignals(klineData, pullbackHighs, symbol, dataFetcher);
            const right1Signals = this.findRight1Signals(klineData, pivotLow);

            // Debug info for BNBUSDT
            if (symbol === 'BNBUSDT') {
                console.log(`\n🔍 DEBUG ${symbol}:`);
                console.log(`PL: ${pivotLow.price} at index ${pivotLow.index}, time: ${moment.utc(pivotLow.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                console.log(`Pullback Highs: ${pullbackHighs.length}`);
                console.log(`Entry Signals: ${entrySignals.length}`);
                console.log(`Right-1 Signals: ${right1Signals.length}`);
                console.log(`Total klines: ${klineData.length}`);

                if (pullbackHighs.length > 0) {
                    console.log(`\n📍 Pullback High Details:`);
                    pullbackHighs.forEach((ph, idx) => {
                        const phIndex = ph.index;
                        console.log(`\nPH ${idx + 1} at index ${phIndex}: ${ph.price} (${moment.utc(ph.timestamp).format('YYYY-MM-DD HH:mm:ss')})`);

                        // 显示扩展窗口来检查容错规则
                        const extendedWindow = [];
                        for (let j = -2; j <= 4; j++) {
                            if (phIndex + j >= 0 && phIndex + j < klineData.length) {
                                extendedWindow.push({
                                    index: phIndex + j,
                                    close: klineData[phIndex + j].close,
                                    time: moment.utc(klineData[phIndex + j].closeTime).format('MM-DD HH:mm')
                                });
                            }
                        }

                        console.log(`  Extended window (i-2 to i+4):`);
                        extendedWindow.forEach((k, i) => {
                            const position = ['i-2', 'i-1', 'i', 'i+1', 'i+2', 'i+3', 'i+4'][i] || `i+${i-2}`;
                            console.log(`    ${position}: ${k.close.toFixed(2)} [${k.time}]`);
                        });

                        // 检查左侧上涨
                        if (extendedWindow.length >= 3) {
                            const leftTrend = extendedWindow[0].close < extendedWindow[1].close && extendedWindow[1].close < extendedWindow[2].close;
                            console.log(`  ✓ Left uptrend: ${extendedWindow[0].close.toFixed(2)} < ${extendedWindow[1].close.toFixed(2)} < ${extendedWindow[2].close.toFixed(2)} = ${leftTrend}`);
                        }

                        // 检查右侧下跌及容错规则
                        if (extendedWindow.length >= 4) {
                            const right1Down = extendedWindow[3].close < extendedWindow[2].close;
                            console.log(`  ✓ Right-1 down: ${extendedWindow[3].close.toFixed(2)} < ${extendedWindow[2].close.toFixed(2)} = ${right1Down}`);

                            if (extendedWindow.length >= 5) {
                                const right2Down = extendedWindow[4].close < extendedWindow[3].close;
                                console.log(`  ? Right-2 down: ${extendedWindow[4].close.toFixed(2)} < ${extendedWindow[3].close.toFixed(2)} = ${right2Down}`);

                                if (!right2Down && extendedWindow.length >= 6) {
                                    const right3Down = extendedWindow[5].close < extendedWindow[3].close;
                                    console.log(`  ✓ Containment R3: ${extendedWindow[5].close.toFixed(2)} < ${extendedWindow[3].close.toFixed(2)} = ${right3Down}`);
                                }
                            }
                        }

                        console.log(`  ✓ Regional high: ${this.isRegionalHigh(klineData, pivotLow.index, phIndex, ph.price)}`);

                        // 检查更低高点
                        if (idx > 0) {
                            const prevPH = pullbackHighs[idx - 1];
                            console.log(`  ✓ Lower high: ${ph.price.toFixed(2)} < ${prevPH.price.toFixed(2)} = ${ph.price < prevPH.price}`);
                        } else {
                            console.log(`  ✓ First PH: No previous PH to compare`);
                        }
                    });
                }

                if (entrySignals.length > 0) {
                    console.log(`\n💰 Entry Signal Details:`);
                    entrySignals.forEach((signal, idx) => {
                        console.log(`Entry ${idx + 1}: ${signal.entryPrice.toFixed(2)} at ${moment.utc(signal.entryTimestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                        console.log(`  Current: ${signal.currentPrice.toFixed(2)}, Performance: ${signal.performancePercent.toFixed(2)}%`);
                    });
                }
            }

            // Categorize all signals
            const categorized = this.categorizeSignals(entrySignals, right1Signals);

            // Format signals for output
            const formatSignal = (signal, isUpcoming = false) => ({
                symbol,
                timeframe: '4h',
                stage: signal.stage,
                description: signal.description,
                pl_ts: moment.utc(pivotLow.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                ph_close: signal.price,
                ph_ts: moment.utc(signal.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                ...(isUpcoming ? {
                    right1_price: signal.right1Price,
                    right1_ts: moment.utc(signal.right1Timestamp).format('YYYY-MM-DD HH:mm:ss'),
                    next_close_needed: 'For signal confirmation'
                } : {
                    entry_price: signal.entryPrice,
                    entry_ts: moment.utc(signal.entryTimestamp).format('YYYY-MM-DD HH:mm:ss'),
                    current_price: signal.currentPrice,
                    performance: `${signal.performancePercent.toFixed(2)}%`
                })
            });

            const allSignals = [
                ...categorized.upcoming.map(s => formatSignal(s, true)),
                ...categorized.fresh.map(s => formatSignal(s)),
                ...categorized.active.map(s => formatSignal(s)),
                ...categorized.realized.map(s => formatSignal(s))
            ];

            return {
                symbol,
                pivotLow,
                pullbackHighs,
                signals: allSignals,
                categorized: categorized,
                summary: {
                    upcoming: categorized.upcoming.length,
                    fresh: categorized.fresh.length,
                    active: categorized.active.length,
                    realized: categorized.realized.length,
                    total: allSignals.length
                }
            };
        } catch (error) {
            return { symbol, signals: [], error: error.message };
        }
    }
}

module.exports = SignalAnalyzer;