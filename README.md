node-sqs-to-elasticsearch
=========================

Simply polls from an SQS Queue, and indexes documents in ElasticSearch


Configuration
-------------

You must provide a module at `/app/config`.  Commonly you would just mount a directory
to `/app/config`, and provide an `index.js` that returns the configuration.

Here is an example `/app/config/index.js` showing all available options:

    module.exports = {
    
        logLevel: 'info',
    
        aws: {
            region: 'us-west-2',
            queueUrl: 'https://sqs.us-west-2.amazonaws.com/1234567890/my-queue',
            accessKeyId: '[accessKeyId]',
            secretAccessKey: '[secretAccessKey]'
        },
    
        es: {
            url: '127.0.0.1:9200',
            indexPrefix: 'messages-',
            type: 'message',
            loglevel: 'info',
            preprocess: function(message) {
                /*
                 * Pre-Process the message.  For example, you might want to
                 * add or remove certain fields that shouldn't be indexed
                 */
                return message;
            }
        }
    
    };


