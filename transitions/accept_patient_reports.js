var _ = require('underscore'),
    async = require('async'),
    config = require('../config'),
    messages = require('../lib/messages'),
    moment = require('moment'),
    validation = require('../lib/validation'),
    utils = require('../lib/utils'),
    date = require('../date');

module.exports = {
    filter: function(doc) {
        var self = module.exports;
        return Boolean(
            doc &&
            doc.form &&
            doc.reported_date &&
            !self._hasRun(doc) &&
            self._hasConfig(doc) &&
            utils.getClinicPhone(doc)
        );
    },
    _hasConfig: function(doc) {
        var self = module.exports;
        return Boolean(_.findWhere(self.getAcceptedReports(), {
            form: doc.form
        }));
    },
    _hasRun: function(doc) {
        return Boolean(
            doc &&
            doc.transitions &&
            doc.transitions.accept_patient_reports
        );
    },
    getAcceptedReports: function() {
        return config.get('patient_reports') || [];
    },
    silenceRegistrations: function(options, callback) {
        var report = options.report,
            registrations = options.registrations;

        if (report.silence_type) {
            async.forEach(registrations, function(registration, callback) {
                module.exports.silenceReminders({
                    db: options.db,
                    audit: options.audit,
                    reported_date: options.reported_date,
                    registration: registration,
                    silence_for: report.silence_for,
                    type: report.silence_type
                }, callback);
            }, function(err) {
                callback(err, true);
            });
        } else {
            callback(null, true);
        }
    },
    /* try to match a recipient return undefined otherwise */
    matchRegistrations: function(options, callback) {
        var registrations = options.registrations,
            doc = options.doc,
            locale = utils.getLocale(doc),
            report = options.report;

        if (registrations && registrations.length) {
            _.each(report.messages, function(msg) {
                if (msg.event_type === 'report_accepted') {
                    messages.addMessage({
                        doc: doc,
                        message: messages.getMessage(msg.message, locale),
                        phone: messages.getRecipientPhone(doc, msg.recipient),
                        registrations: registrations
                    });
                }
            });
            return module.exports.silenceRegistrations({
                db: options.db,
                audit: options.audit,
                report: report,
                reported_date: doc.reported_date,
                registrations: registrations
            }, callback);
        }

        var not_found_msg,
            default_msg = {
                doc: doc,
                message: 'sys.registration_not_found',
                phone: messages.getRecipientPhone(doc, 'from')
            };
        _.each(report.messages, function(msg) {
            if (msg.event_type === 'registration_not_found') {
                not_found_msg = {
                    doc: doc,
                    message: messages.getMessage(msg.message, locale),
                    phone: messages.getRecipientPhone(doc, msg.recipient)
                };
            }
        });
        if (not_found_msg) {
            messages.addMessage(not_found_msg);
            messages.addError(not_found_msg.doc, not_found_msg.message);
        } else {
            messages.addMessage(default_msg);
            messages.addError(default_msg.doc, default_msg.message);
        }
        callback(null, true);
    },
    // find the messages to clear
    findToClear: function(options) {
        var registration = options.registration.doc,
            reported_date = moment(options.reported_date),
            types = _.map(options.type.split(','), function(s) {
                return s.trim();
            }),
            silence_until,
            first;

        if (options.silence_for) {
            silence_until = reported_date.clone();
            silence_until.add(date.getDuration(options.silence_for));
        }

        return _.filter(utils.filterScheduledMessages(registration, types), function(msg) {
            var due = moment(msg.due),
                matches;

            // If we have a silence_until value then clear the entire group
            // matched within the silence window. Otherwise clear all messages
            // in the future.
            if (silence_until) {
                matches = (
                    due >= reported_date &&
                    due <= silence_until &&
                    msg.state === 'scheduled'
                );
                // capture first match for group matching
                if (matches && !first) {
                    first = msg;
                }
                // clear entire group
                return (first && first.group === msg.group);
            } else {
                return (
                    due >= reported_date &&
                    msg.state === 'scheduled'
                );
            }
        });
    },
    silenceReminders: function(options, callback) {
        var registration = options.registration.doc,
            toClear,
            audit = options.audit;

        // filter scheduled message by group
        toClear = module.exports.findToClear(options);

        if (toClear.length) {
            // captured all to clear; now "clear" them
            _.each(toClear, function(task) {
                if (task.state === 'scheduled') {
                    utils.setTaskState(task, 'cleared');
                }
            });
            audit.saveDoc(registration, callback);
        } else {
            callback();
        }
    },
    validate: function(config, doc, callback) {
        var validations = config.validations && config.validations.list;
        return validation.validate(doc, validations, callback);
    },
    handleReport: function(options, callback) {
        var db = options.db,
            doc = options.doc;

        utils.getRegistrations({
            db: db,
            id: doc.fields && doc.fields.patient_id
        }, function(err, registrations) {
            module.exports.matchRegistrations({
                db: db,
                audit: options.audit,
                doc: doc,
                registrations: registrations,
                report: options.report
            }, callback);
        });
    },
    onMatch: function(change, _db, _audit, callback) {
        var doc = change.doc,
            reports = module.exports.getAcceptedReports(),
            report;

        report = _.findWhere(reports, {
            form: doc.form
        });

        if (!report) {
            return callback();
        }

        module.exports.validate(report, doc, function(errors) {

            if (errors && errors.length > 0) {
                messages.addErrors(doc, errors);
                if (report.validations.join_responses) {
                    var msgs = [];
                    _.each(errors, function(err) {
                        if (err.message) {
                            msgs.push(err.message);
                        } else if (err) {
                            msgs.push(err);
                        }
                    });
                    messages.addReply(doc, msgs.join('  '));
                } else {
                    messages.addReply(doc, _.first(errors).message || _.first(errors));
                }
                return callback(null, true);
            }

            module.exports.handleReport({
                db: _db,
                audit: _audit,
                doc: doc,
                report: report
            }, callback);
        });
    }
};
