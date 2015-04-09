'use strict';

var _ = require('lodash'),
    Promise = require('bluebird'),
    moment = require('moment'),
    AWS = require('aws-sdk'),
    elasticsearch = require('elasticsearch'),
    config = require('../config'),
    log = require('./log'),
    assertValidAWSMessage = require('./assertValidAWSMessage');


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
    var params = {
        QueueUrl: queueUrl,
        AttributeNames: [ 'SentTimestamp' ],
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 10,
        WaitTimeSeconds: 10
    };

    sqs.receiveMessage(params, function(err, data) {
        if (err) {
            log.error("Error retrieving messages from SQS... Waiting 10s to try again...", err, err.stack);
            setTimeout(retrieveMessages, 10000); //cool off for 10s
        }
        else {
            setTimeout(retrieveMessages, 10); //schedule again immediately
            var messages = data.Messages;
            if (messages) {
                log.info('Processing %s messages', messages.length);
                _.each(messages, processMessage);
                deleteMessages(messages);
            }
        }
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
    sqs.deleteMessageBatch(params, function(err, data) {
        if (err) {
            log.error("Error deleting messages from SQS...", err, err.stack);
        }
        else {
            if (_.any(data.Failed, 'SenderFault')) {
                log.error("Error deleting messages (marked SenderFault!): %s.", _.pluck(data.Failed, 'Id'));
            }
            else if (data.Successful) {
                log.debug("Successfully deleted %s messages", data.Successful.length);
            }
        }
    });
}

function processMessage(message) {
    var sentAt = moment(parseInt(message.Attributes.SentTimestamp, 10));
    var json;
    try {
        var body = JSON.parse(message.Body);
        json = JSON.parse(body.Message);
    }
    catch(e) {
        log.warn("Unable to parse JSON from message body... skipping.... ", message);
        return;
    }

    return assertValidAWSMessage(body)
        .then(function() {
            return indexEvent(sentAt, json);
        })
        .catch(function(err) {
            log.warn("Error handling or verifying message. ", err, body);
        });
}

function indexEvent(sentAt, json) {
    return new Promise(function(resolve, reject) {
        var event = config.es.preprocess ? config.es.preprocess(json) : json;
        log.debug("Indexing: ", event);
        client.index({
            index: indexPrefix + sentAt.format(indexFormat),
            type: indexType,
            body: event
        }, function (err, res) {
            if (err) return reject(err);
            resolve(res);
        });
    })
}

