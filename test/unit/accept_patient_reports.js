var _ = require('underscore'),
    moment = require('moment'),
    sinon = require('sinon'),
    transition = require('../../transitions/accept_patient_reports'),
    utils = require('../../lib/utils');

exports['signature'] = function(test) {
    test.ok(_.isFunction(transition.onMatch));
    test.equals(transition.onMatch.length, 3);

    test.ok(_.isFunction(transition.filter));
    test.equals(transition.filter.length, 1);
    test.done();
}

exports['filter validation'] = function(test) {
    test.equals(transition.filter({}), false);
    test.equals(transition.filter({
        form: 'x',
        related_entities: {
            clinic: {}
        }
    }), false);
    test.done();
}

exports['onMatch returns false if form not included'] = function(test) {
    sinon.stub(transition, 'getAcceptedReports').returns([ { form: 'x' }, { form: 'z' } ]);

    transition.onMatch({
        doc: {
            form: 'y'
        }
    }, {}, function(err, complete) {
        test.equals(err, null);
        test.equals(complete, false);

        transition.getAcceptedReports.restore();

        test.done();
    });
}

exports['onMatch with matching form calls getRegistrations and then matchRegistrations'] = function(test) {
    var getRegistrations,
        matchRegistrations;

    sinon.stub(transition, 'getAcceptedReports').returns([ { form: 'x' }, { form: 'z' } ]);

    getRegistrations = sinon.stub(utils, 'getRegistrations').callsArgWithAsync(1, null, []);
    matchRegistrations = sinon.stub(transition, 'matchRegistrations').callsArgWithAsync(1, null, true);

    transition.onMatch({
        doc: {
            form: 'x'
        }
    }, {}, function(err, complete) {
        test.equals(complete, true);

        test.equals(getRegistrations.called, true);
        test.equals(matchRegistrations.called, true);

        transition.getAcceptedReports.restore();
        getRegistrations.restore();
        matchRegistrations.restore();

        test.done();
    });
};

exports['matchRegistrations with no registrations adds error msg'] = function(test) {
    var doc;

    doc = {
        patient_id: 'x'
    };

    transition.matchRegistrations({
        registrations: [],
        doc: doc,
        report: {
            registration_not_found: 'not found {{patient_id}}'
        }
    }, function(err, complete) {
        test.ok(doc.errors);
        test.equals(doc.errors[0].message, 'not found x');

        test.done();
    });
}

exports['matchRegistrations with registrations adds reply'] = function(test) {
    var doc;

    doc = {
        patient_id: 'x',
        related_entities: {
            clinic: {
                contact: {
                    name: 'woot'
                }
            }
        }
    };

    transition.matchRegistrations({
        registrations: [{}],
        doc: doc,
        report: {
            report_accepted: 'Thank you, {{contact_name}}. ANC visit for {{patient_id}} has been recorded.'
        }
    }, function(err, complete) {
        test.ok(doc.tasks);
        test.equals(_.first(_.first(doc.tasks).messages).message, 'Thank you, woot. ANC visit for x has been recorded.');

        test.done();
    });
}

exports['patient id failing validation adds error'] = function(test) {
    var doc;

    doc = {
        patient_id: 'xxxx',
        form: 'x'
    };

    sinon.stub(transition, 'getAcceptedReports').returns([ {
        patient_id_validation_regexp: '\w{5}',
        invalid_patient_id: 'bad id {{patient_id}}',
        form: 'x'
    } ]);

    transition.onMatch({
        doc: doc
    }, {}, function(err, complete) {
        test.equals(complete, true);

        test.ok(doc.errors);
        test.equals(doc.errors[0].message, 'bad id xxxx');

        transition.getAcceptedReports.restore();

        test.done();
    });
}

exports['adding silence_type to matchRegistrations calls silenceReminders'] = function(test) {
    sinon.stub(transition, 'silenceReminders').callsArgWithAsync(1, null);

    transition.matchRegistrations({
        doc: {},
        registrations: [ {}, {}, {}],
        report: {
            silence_type: 'x'
        }
    }, function(err, complete) {
        test.equals(complete, true);
        test.equals(transition.silenceReminders.callCount, 3);

        transition.silenceReminders.restore();
        test.done();
    });
};

exports['silenceReminders testing'] = function(test) {
    var db,
        now = moment(),
        registration;

    db = { saveDoc: function() {} };

    sinon.stub(db, 'saveDoc').callsArgWithAsync(1, null);

    registration = {
        scheduled_tasks: [
            {
                due: now.clone().subtract(2, 'days'),
                group: 0,
                state: 'scheduled',
                type: 'x'
            },
            {
                due: now.clone().add(2, 'days'),
                group: 1,
                state: 'scheduled',
                type: 'x'
            },
            {
                due: now.clone().add(2, 'days'),
                group: 2,
                state: 'scheduled',
                type: 'y'
            },
            {
                due: now.clone().add(20, 'days'),
                group: 2,
                state: 'scheduled',
                type: 'x'
            },
            {
                due: now.clone().add(2, 'days'),
                group: 1,
                state: 'scheduled',
                type: 'x'
            }
        ]
    };

    transition.silenceReminders({
        db: db,
        registration: registration,
        type: 'x',
        reported_date: now.clone().toISOString(),
        silence_for: '19 days'
    }, function(err) {
        var tasks;

        test.equals(err, null);

        test.equals(db.saveDoc.called, true);

        tasks = registration.scheduled_tasks;

        test.equals(tasks[0].state, 'scheduled');
        test.equals(tasks[1].state, 'cleared');
        test.equals(tasks[2].state, 'scheduled');
        test.equals(tasks[3].state, 'scheduled');
        test.equals(tasks[4].state, 'cleared');


        test.done();
    });
};