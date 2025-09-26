const DataFetcher = require('./dataFetcher');
const SignalAnalyzer = require('./signalAnalyzer');
const moment = require('moment');

class TradingSignalScanner {
    constructor() {
        this.dataFetcher = new DataFetcher();
        this.signalAnalyzer = new SignalAnalyzer();
    }

    async scanAllSymbols(maxSymbols = 50) {
        try {
            console.log('🚀 Starting 4H Trading Signal Scanner');
            console.log('📅 Scanning from 2025-08-01 for recent 30-day signals\n');

            const symbols = await this.dataFetcher.getUSDTTradingPairs();
            const limitedSymbols = symbols.slice(0, maxSymbols);

            console.log(`🔍 Analyzing ${limitedSymbols.length} symbols...\n`);

            const results = [];
            let processedCount = 0;

            for (const symbol of limitedSymbols) {
                try {
                    console.log(`Processing ${symbol}... (${++processedCount}/${limitedSymbols.length})`);

                    const klineData = await this.dataFetcher.getHistoricalData(symbol);
                    const result = await this.signalAnalyzer.analyzeSymbol(symbol, klineData, this.dataFetcher);

                    if (result.signals && result.signals.length > 0) {
                        results.push(result);
                        const summary = result.summary;
                        const statusParts = [];
                        if (summary.upcoming > 0) statusParts.push(`${summary.upcoming} upcoming`);
                        if (summary.fresh > 0) statusParts.push(`${summary.fresh} fresh`);
                        if (summary.active > 0) statusParts.push(`${summary.active} active`);
                        if (summary.realized > 0) statusParts.push(`${summary.realized} realized`);

                        console.log(`✅ Found ${result.signals.length} signal(s) for ${symbol} (${statusParts.join(', ')})`);
                    } else {
                        console.log(`ℹ️  No signals found for ${symbol}${result.error ? ` (${result.error})` : ''}`);
                    }

                } catch (error) {
                    console.log(`❌ Error processing ${symbol}: ${error.message}`);
                }
            }

            this.displayCategorizedResults(results);

            return results;

        } catch (error) {
            console.error('❌ Scanner error:', error);
            throw error;
        }
    }

    displayResults(signals) {
        console.log('\n' + '='.repeat(80));
        console.log('📊 TRADING SIGNALS REPORT (Last 30 Days)');
        console.log('='.repeat(80));

        if (signals.length === 0) {
            console.log('No signals found in the last 30 days.');
            return;
        }

        console.log(`Total signals found: ${signals.length}\n`);

        console.log('Symbol'.padEnd(15) + 'PL Time'.padEnd(20) + 'PH Close'.padEnd(12) + 'PH Time'.padEnd(20) + 'Entry Price'.padEnd(12) + 'Entry Time');
        console.log('-'.repeat(95));

        signals.forEach(signal => {
            console.log(
                signal.symbol.padEnd(15) +
                signal.pl_ts.padEnd(20) +
                signal.ph_close.toFixed(6).padEnd(12) +
                signal.ph_ts.padEnd(20) +
                signal.entry_price.toFixed(6).padEnd(12) +
                signal.entry_ts
            );
        });

        console.log('\n' + '='.repeat(80));
    }

    displayCategorizedResults(results) {
        console.log('\n' + '='.repeat(100));
        console.log('📊 CATEGORIZED TRADING SIGNALS REPORT (Last 30 Days)');
        console.log('='.repeat(100));

        if (results.length === 0) {
            console.log('No signals found in the last 30 days.');
            return;
        }

        // Collect all signals by category
        const allUpcoming = [];
        const allFresh = [];
        const allActive = [];
        const allRealized = [];

        results.forEach(result => {
            allUpcoming.push(...result.categorized.upcoming);
            allFresh.push(...result.categorized.fresh);
            allActive.push(...result.categorized.active);
            allRealized.push(...result.categorized.realized);
        });

        // Display summary
        const totalSignals = allUpcoming.length + allFresh.length + allActive.length + allRealized.length;
        console.log(`Total signals found: ${totalSignals}`);
        console.log(`📈 Upcoming (Right-1): ${allUpcoming.length} | 🆕 Fresh: ${allFresh.length} | ⏳ Active: ${allActive.length} | ✅ Realized: ${allRealized.length}\n`);

        // Display Upcoming Signals (Right-1 stage) - Most Important
        if (allUpcoming.length > 0) {
            console.log('🔥 UPCOMING SIGNALS (Right-1 Stage - Watch Closely!)');
            console.log('='.repeat(100));

            allUpcoming.forEach(signal => {
                // Find the symbol from results
                const result = results.find(r => r.categorized.upcoming.includes(signal));
                const symbolName = result ? result.symbol : 'Unknown';
                const r1Date = moment.utc(signal.right1Timestamp).format('MM-DD HH:mm');
                console.log(`${symbolName} [${r1Date}] - PH: ${signal.price?.toFixed(6) || 'N/A'} | R1: ${signal.right1Price?.toFixed(6) || 'N/A'} | ${signal.description}`);
            });
            console.log('');
        }

        // Display Fresh Signals
        if (allFresh.length > 0) {
            console.log('🆕 FRESH SIGNALS (Just Confirmed - Within 24h)');
            console.log('='.repeat(100));

            allFresh.forEach(signal => {
                const result = results.find(r => r.categorized.fresh.includes(signal));
                const symbolName = result ? result.symbol : 'Unknown';
                const entryDate = moment.utc(signal.entryTimestamp).format('MM-DD HH:mm');
                console.log(`${symbolName} [${entryDate}] - Entry: ${signal.entryPrice?.toFixed(6) || 'N/A'} | Current: ${signal.currentPrice?.toFixed(6) || 'N/A'} | Perf: ${signal.performancePercent?.toFixed(2) || 'N/A'}%`);
            });
            console.log('');
        }

        // Display Active Signals
        if (allActive.length > 0) {
            console.log('⏳ ACTIVE SIGNALS (Confirmed, Not Yet -8%)');
            console.log('='.repeat(100));

            allActive.forEach(signal => {
                const result = results.find(r => r.categorized.active.includes(signal));
                const symbolName = result ? result.symbol : 'Unknown';
                const entryDate = moment.utc(signal.entryTimestamp).format('MM-DD HH:mm');
                console.log(`${symbolName} [${entryDate}] - Entry: ${signal.entryPrice?.toFixed(6) || 'N/A'} | Current: ${signal.currentPrice?.toFixed(6) || 'N/A'} | Perf: ${signal.performancePercent?.toFixed(2) || 'N/A'}%`);
            });
            console.log('');
        }

        // Display Realized Signals
        if (allRealized.length > 0) {
            console.log('✅ REALIZED SIGNALS (Already Dropped 8%+)');
            console.log('='.repeat(100));

            allRealized.forEach(signal => {
                const result = results.find(r => r.categorized.realized.includes(signal));
                const symbolName = result ? result.symbol : 'Unknown';
                const entryDate = moment.utc(signal.entryTimestamp).format('MM-DD HH:mm');
                console.log(`${symbolName} [${entryDate}] - Entry: ${signal.entryPrice?.toFixed(6) || 'N/A'} | Current: ${signal.currentPrice?.toFixed(6) || 'N/A'} | Perf: ${signal.performancePercent?.toFixed(2) || 'N/A'}%`);
            });
            console.log('');
        }

        console.log('='.repeat(100));
    }

    async scanSingleSymbol(symbol) {
        try {
            console.log(`🔍 Analyzing ${symbol}...`);

            const klineData = await this.dataFetcher.getHistoricalData(symbol);
            const result = await this.signalAnalyzer.analyzeSymbol(symbol, klineData, this.dataFetcher);

            console.log('\nDetailed Analysis:');
            console.log(`Symbol: ${symbol}`);

            if (result.pivotLow) {
                console.log(`Pivot Low: ${result.pivotLow.price} at ${moment.utc(result.pivotLow.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
            }

            if (result.pullbackHighs) {
                console.log(`Pullback Highs found: ${result.pullbackHighs.length}`);
            }

            if (result.signals && result.signals.length > 0) {
                console.log('\nEntry Signals:');
                this.displayResults(result.signals);
            } else {
                console.log(`No signals found${result.error ? `: ${result.error}` : ''}`);
            }

            return result;

        } catch (error) {
            console.error(`Error analyzing ${symbol}:`, error);
            throw error;
        }
    }
}

async function main() {
    const scanner = new TradingSignalScanner();

    const args = process.argv.slice(2);

    if (args.length > 0 && args[0].toUpperCase().includes('USDT')) {
        await scanner.scanSingleSymbol(args[0].toUpperCase());
    } else {
        const maxSymbols = args[0] ? parseInt(args[0]) : 20;
        await scanner.scanAllSymbols(maxSymbols);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TradingSignalScanner;