var _ = require('underscore'),
    transition = require('../../transitions/patient_registration'),
    sinon = require('sinon'),
    moment = require('moment'),
    utils = require('../../lib/utils'),
    related_entities,
    config;

related_entities = {
    clinic: {
        contact: {
            phone: '+1234',
            name: 'Julie'
        }
    }
};

function getMessage(doc, idx) {
    if (!doc || !doc.tasks) return;
    if (idx) {
        if (!doc.tasks[idx]) return;
        return _.first(doc.tasks[idx].messages);
    } else {
        return _.first(_.first(doc.tasks).messages);
    }
}

exports.setUp = function(callback) {
    sinon.stub(transition, 'getConfig').returns([{
        form: 'PATR',
        type: 'patient',
        validations: [
            {
                property: 'patient_name',
                rule: 'lenMin(1) && lenMax(100)',
                message: 'Invalid patient name.'
            }
        ],
        messages: [
            {
                message: "thanks {{contact_name}}",
                recipient: "reporting_unit",
                locale: "en"
            },
            {
                message: "gracias {{contact_name}}",
                recipient: "reporting_unit",
                locale: "es"
            },
            {
                message: "thanks {{caregiver_name}}",
                recipient: "caregiver_phone",
                locale: "en"
            },
            {
                message: "gracias {{caregiver_name}}",
                recipient: "caregiver_phone",
                locale: "es"
            }
        ]
    }]);
    callback();
};

exports.tearDown = function(callback) {
    if (utils.getRegistrations.restore) {
        utils.getRegistrations.restore();
    }

    if (transition.getConfig.restore) {
        transition.getConfig.restore();
    }

    callback();
}

exports['getWeeksSinceLMP returns 0 not NaN or null'] = function(test) {
    test.equals(transition.getWeeksSinceLMP({lmp: 0}), 0);
    test.equals(typeof transition.getWeeksSinceLMP({lmp: 0}), 'number');
    test.equals(transition.getWeeksSinceLMP({weeks_since_lmp: 0}), 0);
    test.equals(typeof transition.getWeeksSinceLMP({weeks_since_lmp: 0}), 'number');
    test.equals(transition.getWeeksSinceLMP({last_menstrual_period: 0}), 0);
    test.equals(typeof transition.getWeeksSinceLMP({last_menstrual_period: 0}), 'number');
    test.done();
};

exports['getWeeksSinceLMP always returns number'] = function(test) {
    test.equals(transition.getWeeksSinceLMP({lmp: '12'}), 12);
    test.done();
};

exports['getWeeksSinceDOB always returns string'] = function(test) {
    test.equals(typeof transition.getWeeksSinceDOB({dob: '4'}), 'string');
    test.equals(typeof transition.getWeeksSinceDOB({dob: '0'}), 'string');
    test.equals(typeof transition.getWeeksSinceDOB({dob: 0}), 'string');
    test.done();
};

exports['getWeeksSinceLMP supports three property names'] = function(test) {
    test.equals(transition.getWeeksSinceLMP({lmp: '12'}), 12);
    test.equals(transition.getWeeksSinceLMP({weeks_since_lmp: '12'}), 12);
    test.equals(transition.getWeeksSinceLMP({last_menstrual_period: '12'}), 12);
    test.done();
};

exports['getWeeksSinceDOB supports three property names'] = function(test) {
    test.equals(transition.getWeeksSinceDOB({dob: '12'}), 12);
    test.equals(transition.getWeeksSinceDOB({weeks_since_dob: '12'}), 12);
    test.equals(transition.getWeeksSinceDOB({weeks_since_birth: '12'}), 12);
    test.done();
};

exports['filter passes until we have patient_id and expected_date'] = function(test) {
    test.equals(transition.filter({
        form: 'PATR',
        reported_date: 'x',
        related_entities: {clinic: {contact: {phone: 'x'}}},
        patient_name: 'x',
        errors: []
    }), true);
    test.equals(transition.filter({
        form: 'PATR',
        reported_date: 'x',
        related_entities: {clinic: {contact: {phone: 'x'}}},
        patient_name: 'x',
        errors: []
    }), true);
    test.equals(transition.filter({
        form: 'PATR',
        reported_date: 'x',
        related_entities: {clinic: {contact: {phone: 'x'}}},
        patient_name: 'x',
        patient_id: 'xyz',
        errors: []
    }), false);
    test.done();
};

exports['setBirthDate sets birth_date correctly for weeks_since_birth: 0'] = function(test) {
    var doc,
        start = moment().startOf('week');
    doc = {
        weeks_since_birth: 0
    };
    transition.setBirthDate(doc);
    test.ok(doc.birth_date);
    test.equals(doc.birth_date, start.clone().add(0, 'weeks').toISOString());
    test.done();
};

exports['valid form adds patient_id'] = function(test) {

    sinon.stub(utils, 'getRegistrations').callsArgWithAsync(1, null, []);

    var doc = {
        form: 'PATR',
        patient_name: 'abc'
    };

    transition.onMatch({
        doc: doc
    }, {}, function(err, complete) {
        test.equals(err, null);
        test.equals(complete, true);
        test.ok(doc.patient_id);
        test.equals(doc.tasks, undefined);
        test.done();
    });
};

exports['registration sets up responses'] = function(test) {

    sinon.stub(utils, 'getRegistrations').callsArgWithAsync(1, null, []);

    var doc = {
        form: 'PATR',
        patient_name: 'foo',
        caregiver_name: 'Sam',
        caregiver_phone: '+987',
        related_entities: related_entities,
        locale: 'en'
    };

    transition.onMatch({
        doc: doc
    }, {}, function(err, complete) {
        test.equals(err, null);
        test.equals(complete, true);
        test.ok(doc.tasks);
        test.equals(doc.tasks && doc.tasks.length, 2);

        var msg0 = getMessage(doc, 0);
        test.ok(msg0);
        test.ok(msg0.uuid);
        test.ok(msg0.to);
        test.ok(msg0.message);
        if (msg0) {
            delete msg0.uuid;
            test.deepEqual(msg0, {
                to: '+1234',
                message: 'thanks Julie'
            });
        }

        /*
         * Also checks that recipient using doc property value is handled
         * resolved correctly
         * */
        var msg1 = getMessage(doc, 1);
        test.ok(msg1);
        test.ok(msg1.uuid);
        test.ok(msg1.to);
        test.ok(msg1.message);
        if (msg1) {
            delete msg1.uuid;
            test.deepEqual(msg1, {
                to: '+987',
                message: 'thanks Sam'
            });
        }
        test.done();
    });
};

exports['registration responses support locale'] = function(test) {

    sinon.stub(utils, 'getRegistrations').callsArgWithAsync(1, null, []);

    var doc = {
        form: 'PATR',
        patient_name: 'foo',
        caregiver_name: 'Sam',
        caregiver_phone: '+987',
        related_entities: related_entities,
        locale: 'es' //spanish
    };

    transition.onMatch({
        doc: doc
    }, {}, function(err, complete) {
        test.equals(err, null);
        test.equals(complete, true);
        test.ok(doc.tasks);
        test.equals(doc.tasks && doc.tasks.length, 2);

        var msg0 = getMessage(doc, 0);
        test.ok(msg0);
        test.ok(msg0.uuid);
        test.ok(msg0.to);
        test.ok(msg0.message);
        if (msg0) {
            delete msg0.uuid;
            test.deepEqual(msg0, {
                to: '+1234',
                message: 'gracias Julie'
            });
        }

        /*
         * Also checks that recipient using doc property value is resolved
         * correctly.
         * */
        var msg1 = getMessage(doc, 1);
        test.ok(msg1);
        test.ok(msg1.uuid);
        test.ok(msg1.to);
        test.ok(msg1.message);
        if (msg1) {
            delete msg1.uuid;
            test.deepEqual(msg1, {
                to: '+987',
                message: 'gracias Sam'
            });
        }
        test.done();
    });
};