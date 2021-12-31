const config = require('./config/config.json');
const settings = require('./config/botSettings.json');
const variables = require('./assets/variablres');

const needle = require('needle');
const cheerio = require('cheerio');
const fs = require('fs');
const Binance = require('node-binance-api');
const { logger } = require('./config/advanced/logger');

const { createDirecory, createFiles, convertToUSDT, getCurrencyRates } = require('./assets/functionality');

//Global variables
const binance = new Binance().options({
    APIKEY: settings.apiKey,
    APISECRET: settings.secretKey,
});

needle.defaults({ open_timeout: 90000 });

const pairs = variables.configEntries.flatMap((arr) => { return arr[1] });

let binanceOrderBook = {};
let binanceTrades = {};
let currentCoinMarketCapData = {};

pairs.forEach((pair) => {
    binanceOrderBook[pair] = {}; //Create initial object

    binanceOrderBook[pair].prices = []; //Average price during interval
    binanceOrderBook[pair].qty = 0; //Amount during scpecific interval
    binanceOrderBook[pair].totalAmount = 0; // Total amount from start
    binanceOrderBook[pair].time = 0; // Last trade time
    binanceOrderBook[pair].precision = 0; // Set precision to pair

    binanceTrades[pair] = {};
    binanceTrades[pair].bid = 0;
    binanceTrades[pair].ask = 0;
    binanceTrades[pair].averagePrice = 0; //Average price during 24h
    binanceTrades[pair].priceChange = 0;
    binanceTrades[pair].high = 0; //Max 24h
    binanceTrades[pair].low = 0; //Min 24h
    binanceTrades[pair].volume = 0; //Volume 24h
});

(async () => {
    try {
        console.log('Config:' + JSON.stringify(config));

        if (Object.keys(config) == 0) {
            throw 'Config keys number is 0';
        }

        //Get rates for the base currency
        getCurrencyRates('RUB');

        //Determine precision
        const exchangeInfo = await binance.exchangeInfo();
        exchangeInfo.symbols.forEach((pair) => {
            if (pairs.includes(pair.symbol)) {
                binanceOrderBook[pair.symbol].precision = pair.baseAssetPrecision;
            }
        });

        //Creating info directory
        createDirecory(variables.path);

        //Cretaing directory for every token
        variables.tokens.forEach((token) => {
            createDirecory(`${variables.path}/${token}`);
            createFiles([
                {
                    "path": `${variables.path}/${token}/${token}_COINMARKETCUP.csv`,
                    "content": variables.initialData.coinMarketCap + '\n'
                }
            ]);
        });

        //Creating directories and files for pairs
        variables.configEntries.forEach((arr) => {
            const token = arr[0];
            const pairs = arr[1];

            //Add pair to currentCoinMarketCapData
            currentCoinMarketCapData[token] = '';

            pairs.forEach((pair) => {
                //Check existing directory
                const pairDirectoryPath = `${variables.path}/${token}/${pair}`;

                createDirecory(pairDirectoryPath);
                createFiles([
                    {
                        "path": `${pairDirectoryPath}/${pair}_INFO.csv`,
                        "content": variables.initialData.info + '\n'
                    },
                    {
                        "path": `${pairDirectoryPath}/${pair}_TRADE.csv`,
                        "content": variables.initialData.trade + '\n'
                    },
                    {
                        "path": `${pairDirectoryPath}/${pair}_Merged.csv`,
                        "content": variables.initialData.trade + variables.initialData.info + variables.initialData.coinMarketCap + '\n'
                    }
                ]);
            });
        });

        binance.websockets.prevDay(pairs, (error, response) => {
            if (error) throw error;
            binanceTrades[response.symbol].averagePrice = response.averagePrice;
            binanceTrades[response.symbol].priceChange = response.priceChange;
            binanceTrades[response.symbol].high = response.high;
            binanceTrades[response.symbol].low = response.low;
            binanceTrades[response.symbol].volume = response.volume;
        });

        //Open websocket for colleting info
        binance.websockets.trades(pairs, (trade) => {
            binanceOrderBook[trade.s].qty += Number(trade.q);
            binanceOrderBook[trade.s].time = trade.E;
            binanceOrderBook[trade.s].prices.push(Number(trade.p));
        });

        binance.websockets.bookTickers((response) => {
            if (pairs.includes(response.symbol)) {
                binanceTrades[response.symbol].bid = response.bestBid;
                binanceTrades[response.symbol].ask = response.bestAsk;
            }
        });

        variables.currentTime = Date.now();
        setInterval(() => {
            getCurrencyRates('RUB');
        }, 300000); // Every 5 minutes

        //Info and trades file
        let infoFileData = {};
        let tradesFileData = {};
        let mergedData = {};
        pairs.forEach((pair) => {
            infoFileData[pair] = '';
            tradesFileData[pair] = '';
            mergedData[pair] = '';
        });

        setInterval(() => {
            variables.currentTime = Date.now();

            variables.configEntries.forEach((arr) => {
                const token = arr[0];
                const pairs = arr[1];

                pairs.forEach((pair) => {
                    //Check existing directory
                    const pairDirectoryPath = `${variables.path}/${token}/${pair}`;

                    binanceOrderBook[pair].totalAmount += Number(binanceOrderBook[pair].qty);

                    const averagePrice = () => {
                        if (binanceOrderBook[pair].prices.length > 0) {
                            return binanceOrderBook[pair].prices.reduce((prev, cur) => { return Number(prev) + Number(cur); }) / binanceOrderBook[pair].prices.length;
                        }

                        return 0;
                    };

                    const date = new Date(variables.currentTime);
                    const time = `${date.getFullYear()}/${date.getMonth()}/${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;

                    //Write data for Trades file
                    tradesFileData[pair] += `${time};${averagePrice()};${binanceOrderBook[pair].qty};${binanceOrderBook[pair].totalAmount};\n`;

                    //Add TRADE data to MERGED file
                    mergedData[pair] += `${time};${averagePrice()};${binanceOrderBook[pair].qty};${binanceOrderBook[pair].totalAmount};`;

                    //Write TRADE file
                    fs.appendFile(`${pairDirectoryPath}/${pair}_TRADE.csv`, tradesFileData[pair], function (err) {
                        try {
                            if (err) throw err;
                            tradesFileData[pair] = '';
                        } catch {
                            if (err.code == "EBUSY") console.log(`File ${pairDirectoryPath}/${pair}_TRADE.csv is busy!`);
                        }
                    });

                    binanceOrderBook[pair].prices = [];
                    binanceOrderBook[pair].qty = 0;

                    //Write data for INFO file
                    infoFileData[pair] += `${pair};${binanceTrades[pair].bid};${binanceTrades[pair].ask};${binanceTrades[pair].averagePrice};${binanceTrades[pair].priceChange};${binanceTrades[pair].high};${binanceTrades[pair].low};${binanceTrades[pair].volume};\n`;

                    //Add INFO data to MERGED file
                    mergedData[pair] += `${pair};${binanceTrades[pair].bid};${binanceTrades[pair].ask};${binanceTrades[pair].averagePrice};${binanceTrades[pair].priceChange};${binanceTrades[pair].high};${binanceTrades[pair].low};${binanceTrades[pair].volume};`;

                    //Add COINMARKETCAP data to MERGED file
                    const currentToken = variables.configEntries.find(entry => {
                        return entry[1].includes(pair);
                    });
                    mergedData[pair] += currentCoinMarketCapData[currentToken[0]] + '\n';

                    //Write INFO file
                    fs.appendFile(`${pairDirectoryPath}/${pair}_INFO.csv`, infoFileData[pair], function (err) {
                        try {
                            if (err) throw err;
                            infoFileData[pair] = '';
                        } catch {
                            if (err.code == "EBUSY") console.log(`File ${pairDirectoryPath}/${pair}_INFO.csv is busy!`);
                        }
                    });

                    //Write MERGED file
                    fs.appendFile(`${pairDirectoryPath}/${pair}_Merged.csv`, mergedData[pair], function (err) {
                        try {
                            if (err) throw err;
                            mergedData[pair] = '';
                        } catch {
                            if (err.code == "EBUSY") console.log(`File ${pairDirectoryPath}/${pair}_Merged.csv is busy!`);
                        }
                    });
                });
            });
        }, Number(settings.binanceInterval) * 1000);

        //Coinmarketcap file
        let coinmarketcapFileData = {};
        variables.tokens.forEach((token) => {
            coinmarketcapFileData[token] = '';
        });
        setInterval(() => {
            variables.tokens.forEach((token) => {
                const tokenURL = `${variables.URL}${token.toLocaleLowerCase()}/`;

                needle.get(tokenURL, function (err, res) {
                    if (err) throw err;

                    var $ = cheerio.load(res.body, null, false);

                    variables.coinsMarketCupData.price = $('div.priceValue').first().text();

                    let currentContentBlock = $('div.statsContainer').find('div.statsBlock').first(); //Get first element of the content block

                    while (currentContentBlock.is('div')) {
                        if (currentContentBlock.is('div.statsBlock')) {
                            let innerContentBlock = currentContentBlock.find('div.statsBlockInner').first();
                            let currentLabelBlock = innerContentBlock.find('div.statsLabel').first();

                            switch (currentLabelBlock.text()) {
                                case 'Рыночная капитализация':
                                    variables.coinsMarketCupData.marketCap = innerContentBlock.find('div.statsValue').first().text();
                                    break;
                                case 'Рыночная капитализация при полной эмиссии':
                                    variables.coinsMarketCupData.marketCapFullEmission = innerContentBlock.find('div.statsValue').first().text();
                                    break;
                                case 'Объем 24ч':
                                    variables.coinsMarketCupData.volume = innerContentBlock.find('div.statsValue').first().text();
                                    variables.coinsMarketCupData.volumeToCap = innerContentBlock.next().first().find('div.statsValue').first().text();
                                    break;
                            }
                        } else {
                            let currentBlock = currentContentBlock.find('div.statsLabel').first();

                            if (currentBlock.text() == 'Циркулирующее предложение') {
                                variables.coinsMarketCupData.circulatingOffer = currentContentBlock.find('div.statsValue').first().text();
                                currentBlock = currentContentBlock.children().length == 4 ? currentBlock.next().next() : currentBlock.next().next().next();
                            }

                            if (currentBlock.find('div.statsLabel').text() == 'Максимальное предложение') {
                                variables.coinsMarketCupData.maxOffer = currentBlock.find('div.maxSupplyValue').first().text();
                                currentBlock = currentBlock.next();
                            }

                            if (currentBlock.find('div.statsLabel').text() == 'Общее предложение') {
                                variables.coinsMarketCupData.generalOffer = currentBlock.find('div.maxSupplyValue').first().text();
                                currentBlock.remove();
                            }
                        }

                        currentContentBlock = currentContentBlock.next();
                    }

                    const regExp = new RegExp(',', 'g');
                    variables.coinsMarketCupData.price = variables.coinsMarketCupData.price.replace(regExp, '');
                    variables.coinsMarketCupData.marketCap = variables.coinsMarketCupData.marketCap.replace(regExp, '');
                    variables.coinsMarketCupData.marketCapFullEmission = variables.coinsMarketCupData.marketCapFullEmission.replace(regExp, '');
                    variables.coinsMarketCupData.volume = variables.coinsMarketCupData.volume.replace(regExp, '');

                    currentCoinMarketCapData[token] = token + ';' + convertToUSDT(variables.coinsMarketCupData.price.slice(1)) + ';';
                    currentCoinMarketCapData[token] += convertToUSDT(variables.coinsMarketCupData.marketCap.slice(1)) + ';';
                    currentCoinMarketCapData[token] += convertToUSDT(variables.coinsMarketCupData.marketCapFullEmission.slice(1)) + ';';
                    currentCoinMarketCapData[token] += convertToUSDT(variables.coinsMarketCupData.volume.slice(1)) + ';';
                    currentCoinMarketCapData[token] += variables.coinsMarketCupData.volumeToCap + ';';
                    currentCoinMarketCapData[token] += variables.coinsMarketCupData.circulatingOffer + ';';
                    currentCoinMarketCapData[token] += variables.coinsMarketCupData.maxOffer + ';';
                    currentCoinMarketCapData[token] += variables.coinsMarketCupData.generalOffer + ';';

                    coinmarketcapFileData[token] += currentCoinMarketCapData[token] + '/n';

                    fs.appendFile(`${variables.path}/${token}/${token}_COINMARKETCUP.csv`, coinmarketcapFileData[token], function (err) {
                        try {
                            if (err) throw err;
                            coinmarketcapFileData[token] = '';
                        } catch {
                            if (err.code == "EBUSY") console.log(`File ${variables.path}/${token}/${token}_COINMARKETCUP.csv is busy!`);
                        }
                    });
                });
            });
        }, Number(settings.coinMarketCapInterval) * 1000);
    } catch (err) {
        console.error(err);
        logger.error(new Error(err));
    }
})();