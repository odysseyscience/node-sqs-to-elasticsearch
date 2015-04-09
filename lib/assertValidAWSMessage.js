'use strict';

var Promise = require('bluebird'),
    _ = require('lodash'),
    moment = require('moment'),
    log = require('./log'),
    request = require('request'),
    crypto = require('crypto'),
    Cache = require('expiring-lru-cache');


// Keep 100 certs for up to 2 weeks
var certCache = new Cache({size: 100, expiry: moment.duration(2, 'weeks')});


/**
 * Checks the message to see if its valid.
 * @see http://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.verify.signature.html
 */
function assertValidAWSMessage(message) {
    log.debug("Verifying message: ", message.Type, message.MessageId);
    return retrieveSigningCert(message)
        .then(function(cert) {
            return validateMessage(cert, message);
        });
}


function validateMessage(cert, message) {
    var sigString = buildSignatureString(message);
    if (!sigString) {
        return Promise.reject('Unsupported message type: ' + message.Type);
    }

    var verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(sigString, 'utf8');
    var valid = verifier.verify(cert, message.Signature, 'base64');
    if (!valid) {
        return Promise.reject("Invalid message signature");
    }
}

function retrieveSigningCert(message) {
    return new Promise(function(resolve, reject) {
        var certUrl = message.SigningCertURL;
        if (!certUrl) {
            return reject();
        }

        var cert = certCache.get(certUrl);
        if (cert) {
            resolve(cert);
        }

        request(certUrl, function(err, res, cert) {
            if (err) return reject(err);
            certCache.set(certUrl, cert);
            resolve(cert);
        });
    });
}


// Taken from: https://bitbucket.org/IlskenLabs/aws-snsclient/src/0177d3e112f336926e88983d0698c538e0663855/lib/snsclient.js?at=master
function buildSignatureString(message) {
    var chunks = [];
    if(message.Type === 'Notification') {
        chunks.push('Message');
        chunks.push(message.Message);
        chunks.push('MessageId');
        chunks.push(message.MessageId);
        if(message.Subject) {
            chunks.push('Subject');
            chunks.push(message.Subject);
        }
        chunks.push('Timestamp');
        chunks.push(message.Timestamp);
        chunks.push('TopicArn');
        chunks.push(message.TopicArn);
        chunks.push('Type');
        chunks.push(message.Type);
    } else if(message.Type === 'SubscriptionConfirmation') {
        chunks.push('Message');
        chunks.push(message.Message);
        chunks.push('MessageId');
        chunks.push(message.MessageId);
        chunks.push('SubscribeURL');
        chunks.push(message.SubscribeURL);
        chunks.push('Timestamp');
        chunks.push(message.Timestamp);
        chunks.push('Token');
        chunks.push(message.Token);
        chunks.push('TopicArn');
        chunks.push(message.TopicArn);
        chunks.push('Type');
        chunks.push(message.Type);
    } else { return false; }

    return chunks.join('\n')+'\n';
}

module.exports = assertValidAWSMessage;
