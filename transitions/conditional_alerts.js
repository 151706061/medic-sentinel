var config = require('../config'),
    _ = require('underscore'),
    messages = require('../lib/messages'),
    utils = require('../lib/utils'),
    async = require('async'),
    vm = require('vm');

module.exports = {
    _getConfig: function() {
        return _.extend({}, config.get('alerts'));
    },
    _hasConfig: function(doc) {
        var self = module.exports;
        // confirm the form is defined on a reminder config
        return _.find(self._getConfig(), function(obj) {
            return obj.form &&
                doc.form.match(new RegExp('^\\s*'+obj.form+'\\s*$','i'));
        });
    },
    _runCondition: function(condition, context, callback) {
        try {
            callback(null, vm.runInNewContext(condition, context));
        } catch(e) {
            var lines = e.message.split('\n');
            callback(lines[lines.length - 1]);
        }
    },
    _evaluateCondition: function(doc, alert, callback) {
        var context = { doc: doc };
        if (alert.condition.indexOf(alert.form) === -1) {
            module.exports._runCondition(alert.condition, context, callback);
        } else {
            utils.getRecentForm({
                doc: doc,
                formName: alert.form
            }, function(err, rows) {
                if (err) {
                    return callback(err);
                }
                rows = _.sortBy(rows, function(row) {
                    return row.reported_date;
                });
                context[alert.form] = function(i) {
                    var row = rows[rows.length - 1 - i];
                    return row ? row.doc : row;
                };
                module.exports._runCondition(alert.condition, context, callback);
            });
        }
    },
    _hasRun: function(doc) {
        return Boolean(
            doc &&
            doc.transitions &&
            doc.transitions.conditional_alerts
        );
    },
    filter: function(doc) {
        var self = module.exports;
        return Boolean(
            doc &&
            doc.form &&
            doc.type === 'data_record' &&
            self._hasConfig(doc) &&
            !self._hasRun(doc)
        );
    },
    onMatch: function(change, db, audit, cb) {
        var doc = change.doc,
            config = module.exports._getConfig(),
            updated = false;

        async.each(
            _.values(config),
            function(alert, callback) {
                if (alert.form === doc.form) {
                    module.exports._evaluateCondition(doc, alert, function(err, result) {
                        if (err) {
                            return callback(err);
                        } else if(result) {
                            var phone = messages.getRecipientPhone(
                                doc, 
                                alert.recipient, 
                                alert.recipient
                            );
                            messages.addMessage({
                                doc: doc,
                                phone: phone,
                                message: alert.message
                            });
                            updated = true;
                        }
                        callback();
                    });
                } else {
                    callback();
                }
            }, 
            function(err) {
                cb(err, updated);
            }
        );

    }
};
