const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

class DataFetcher {
    constructor() {
        this.baseURL = 'https://api.binance.com/api/v3';
        this.apiKey = process.env.binance_api;
        this.apiSecret = process.env.binance_key;

        if (this.apiKey) {
            console.log('✅ API credentials loaded');
        }
    }

    async getUSDTTradingPairs() {
        try {
            const response = await axios.get(`${this.baseURL}/exchangeInfo`);
            const symbols = response.data.symbols
                .filter(symbol =>
                    symbol.quoteAsset === 'USDT' &&
                    symbol.status === 'TRADING' &&
                    !this.isLeverageToken(symbol.symbol)
                )
                .map(symbol => symbol.symbol);

            console.log(`Found ${symbols.length} USDT trading pairs`);
            return symbols;
        } catch (error) {
            console.error('Error fetching trading pairs:', error.message);
            throw error;
        }
    }

    isLeverageToken(symbol) {
        const leveragePatterns = [
            /UP$/, /DOWN$/, /BULL$/, /BEAR$/,
            /3L$/, /3S$/, /5L$/, /5S$/,
            /LEVERAGED/, /INVERSE/
        ];
        return leveragePatterns.some(pattern => pattern.test(symbol));
    }

    async getKlineData(symbol, interval = '4h', startTime = null, endTime = null) {
        try {
            const params = {
                symbol: symbol,
                interval: interval,
                limit: 1000
            };

            if (startTime) {
                params.startTime = startTime;
            }
            if (endTime) {
                params.endTime = endTime;
            }

            const config = { params };
            if (this.apiKey) {
                config.headers = {
                    'X-MBX-APIKEY': this.apiKey
                };
            }

            const response = await axios.get(`${this.baseURL}/klines`, config);

            return response.data.map(kline => ({
                openTime: parseInt(kline[0]),
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: parseInt(kline[6])
            }));
        } catch (error) {
            console.error(`Error fetching kline data for ${symbol}:`, error.message);
            throw error;
        }
    }

    async getHistoricalData(symbol, startDate = '2025-08-01') {
        const startTime = moment.utc(startDate).valueOf();
        const endTime = moment.utc().valueOf();

        let allData = [];
        let currentStartTime = startTime;

        while (currentStartTime < endTime) {
            const data = await this.getKlineData(symbol, '4h', currentStartTime);

            if (data.length === 0) break;

            allData = allData.concat(data);
            currentStartTime = data[data.length - 1].closeTime + 1;

            if (data.length < 1000) break;

            await this.delay(100);
        }

        return allData.filter(kline => kline.closeTime <= endTime);
    }

    // 获取实时价格
    async getCurrentPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/ticker/price`, {
                params: { symbol }
            });
            return parseFloat(response.data.price);
        } catch (error) {
            console.error(`Failed to get current price for ${symbol}:`, error.message);
            return null;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DataFetcher;