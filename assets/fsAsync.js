const fs = require('fs');
const util = require('util');

module.exports = {
    mkdir: util.promisify(fs.mkdir),
    writeFile: util.promisify(fs.writeFile), 
}