"use strict";

var winston = require('winston'),
    moment = require('moment'),
    config = require('../config');

var Log = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            level: config.logLevel,
            prettyPrint: true,
            colorize: true,
            timestamp: function() {
                return moment().format('YYYY-MM-DD hh:mm:ss');
            }
        })
    ]
});

module.exports = Log;
