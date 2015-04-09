'use strict';

var _ = require('lodash'),
    Promise = require('bluebird'),
    moment = require('moment'),
    AWS = require('aws-sdk'),
    elasticsearch = require('elasticsearch'),
    config = require('../config'),
    log = require('./log'),
    assertValidAWSMessage = require('./assertValidAWSMessage');

Promise.longStackTraces();

var queueUrl = config.aws.queueUrl,
    awsRegion = config.aws.region,
    elasticSearchUrl = config.es.url,
    indexPrefix = config.es.indexPrefix,
    indexType = config.es.type,
    indexFormat = 'YYYY.MM.DD';


AWS.config.update({
    region: awsRegion,
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
});

var sqs = new AWS.SQS({
    apiVersion: '2012-11-05'
});
Promise.promisifyAll(sqs);


var client = new elasticsearch.Client({
    host: elasticSearchUrl,
    log: config.es.loglevel
});


log.info("Starting SQS To ElasticSearch Agent" +
    "\n\tSQS Queue URL: %s" +
    "\n\tSQS Region: %s" +
    "\n\tElasticSearch URL: %s" +
    "\n\tElasticSearch Index: %s" +
    "\n\tElasticSearch Type: %s",
    queueUrl, config.aws.region,
    elasticSearchUrl, indexPrefix + indexFormat, indexType);



retrieveMessages();

function retrieveMessages() {
    var messages;

    return Promise.resolve()
        .then(function() {
            var params = {
                QueueUrl: queueUrl,
                MaxNumberOfMessages: 10,
                VisibilityTimeout: 10,
                WaitTimeSeconds: 10
            };
            return sqs.receiveMessageAsync(params);
        })
        .then(function(data) {
            messages = data.Messages || [];
            return Promise.map(messages, processMessage);
        })
        .then(function() {
            if (messages.length) {
                return deleteMessages(messages);
            }
        })
        .then(function() {
            messages.length && log.info('Processed %s messages', messages.length);
            setTimeout(retrieveMessages, 10); //schedule again
        })
        .catch(function(err) {
            log.error("Error occurred moving messages from SQS to ES: ", err);
            log.error(err.stack);
            log.error("Waiting 10s to try again...");
            setTimeout(retrieveMessages, 10000);
        });
}

function deleteMessages(messages) {
    log.debug("Deleting %s messages", messages.length);
    var params = {
        QueueUrl: queueUrl,
        Entries: _.map(messages, function(msg) {
            return {
                Id: msg.MessageId,
                ReceiptHandle: msg.ReceiptHandle
            };
        })
    };
    return sqs.deleteMessageBatchAsync(params);
}

function processMessage(message) {
    var body = JSON.parse(message.Body);
    return Promise.resolve()
        .then(function() {
            return assertValidAWSMessage(body)
        })
        .then(function() {
            return indexEvent(body);
        });
}

function indexEvent(message) {
    var timestamp = moment(message.Timestamp);
    var indexMessage = config.es.preprocess ? config.es.preprocess(message) : message;
    indexMessage['@timestamp'] = timestamp.toDate();

    return new Promise(function(resolve, reject) {
        var data = {
            id: message.MessageId,
            timestamp: timestamp.toDate(),
            index: indexPrefix + timestamp.format(indexFormat),
            type: indexType,
            body: indexMessage
        };

        log.debug("Indexing Data: ", data);
        client.index(data, function (err, res) {
            if (err) return reject(err);
            resolve(res);
        });
    })
}

