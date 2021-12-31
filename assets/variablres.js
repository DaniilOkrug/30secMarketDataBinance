const config = require('../config/config.json');
const settings = require('../config/botSettings.json');

module.exports = {
    URL: 'https://coinmarketcap.com/ru/currencies/', //coinmarketcap url
    path: './info', //Path to main folder
    currentTime: Date.now(), //Current time for 
    tokens: Object.keys(config), //Tokens
    configEntries: Object.entries(config), // Tokens and pairs
    
    //Initial data for files
    initialData: {
        coinMarketCap: 'Coin;Price;Capitalization;Capitalization at full issue;Volume 243h;Volume/Capitalization;Circulating offer;Maximum offer;Total offer;',
        trade: 'Time;Price;Amount;Total;',
        info: 'Pair;bid;ask;Average price;Price change 24h;Max 24h;Min 24h;Volume 24h;'
    },

    //Data for coinsmarketcap
    coinsMarketCupData: {
        price: '',
        marketCap: '',
        marketCapFullEmission: '',
        volume: '',
        volumeToCap: '',
        circulatingOffer: '',
        maxOffer: '',
        generalOffer: ''
    },

    rates: {
        USD: 1,
    },
}