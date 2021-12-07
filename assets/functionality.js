const fsAsync = require('./fsAsync');
const fs = require('fs');
const { convert } = require('cashify');
const axios = require('axios');
const variables = require('./variablres');

module.exports = {

    /**
     * Creates directory with files in that directory
     * 
     * @param {String} path path to the directory
     */
    createDirecory: async function (path) {
        await fsAsync.mkdir(path, (err) => {
            if (err) { //If directory exists
                switch (err.code) {
                    case 'EEXIST':
                        console.log(`Direcotry ${path} already exists!`);
                        break;
                    default:
                        throw err;
                }
            }
        });
    },

    /**
     * Creates files with entire content
     * 
     * @param {{
     *              path: string,
     *              content: string,
     *         }[]} files Array of paths and contents for files
     */
    createFiles: function (files) {
        files.forEach(file => {
            if (!fs.existsSync(file.path)) {
                fsAsync.writeFile(file.path, file.content, (err) => {
                    if (err) throw err;
                });
            } else {
                console.log(`File ${file.path} exists!`);
            }
        });
    },

    convertToUSDT: function (value) {
        return Number(value) * variables.rates.USD
    },

    getCurrencyRates: async function (currency) {
        const promise = new Promise((resolve, reject) => {
            axios.get(`https://api.exchangerate-api.com/v4/latest/${currency}`)
                .then(function (response) {
                    resolve(response.data.rates);
                });
        });

        promise.then((value) => {
            variables.rates = value;
        });
    }
}