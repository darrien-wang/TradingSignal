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

            const allSignals = [];
            let processedCount = 0;

            for (const symbol of limitedSymbols) {
                try {
                    console.log(`Processing ${symbol}... (${++processedCount}/${limitedSymbols.length})`);

                    const klineData = await this.dataFetcher.getHistoricalData(symbol);
                    const result = this.signalAnalyzer.analyzeSymbol(symbol, klineData);

                    if (result.signals && result.signals.length > 0) {
                        allSignals.push(...result.signals);
                        console.log(`✅ Found ${result.signals.length} signal(s) for ${symbol}`);
                    } else {
                        console.log(`ℹ️  No signals found for ${symbol}${result.error ? ` (${result.error})` : ''}`);
                    }

                } catch (error) {
                    console.log(`❌ Error processing ${symbol}: ${error.message}`);
                }
            }

            allSignals.sort((a, b) => new Date(b.entry_ts) - new Date(a.entry_ts));

            this.displayResults(allSignals);

            return allSignals;

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

    async scanSingleSymbol(symbol) {
        try {
            console.log(`🔍 Analyzing ${symbol}...`);

            const klineData = await this.dataFetcher.getHistoricalData(symbol);
            const result = this.signalAnalyzer.analyzeSymbol(symbol, klineData);

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