var _ = require('underscore'),
    sinon = require('sinon'),
    moment = require('moment'),
    schedules = require('../../lib/schedules');

exports['signature'] = function(test) {
    test.ok(_.isFunction(schedules.assignSchedule));
    test.equals(schedules.assignSchedule.length, 2);
    test.done();
};

exports['getOffset returns false for bad syntax'] = function(test) {
    test.equals(schedules.getOffset('x'), false);
    test.equals(schedules.getOffset('2 muppets'), false);
    test.equals(schedules.getOffset('one week'), false);
    test.done();
};

exports['getOffset returns durations for good syntax'] = function(test) {
    test.equals(schedules.getOffset('2 weeks').asDays(), 14);
    test.equals(schedules.getOffset('81 days').asDays(), 81);
    test.done();
};

exports['assignSchedule returns false if already has scheduled_task for that name'] = function(test) {

    var doc = {
        form: 'x',
        lmp_date: moment().valueOf(),
        scheduled_tasks: [
            {
                name: 'duckland'
            }
        ]
    };

    var added = schedules.assignSchedule(doc, {
        name: "duckland",
        start_from: 'lmp_date',
        messages: [
            {
                group: 1,
                offset: '1 week',
                message: "This is for serial number {{serial_number}}."
            },
            {
                group: 4,
                offset: '81 days',
                message: "This is for serial number {{serial_number}}."
            }
        ]
    });

    test.equals(added, false);
    test.equals(doc.scheduled_tasks.length, 1);
    test.done();
}

exports['schedule generates two messages'] = function(test) {

    var doc = {
        form: 'x',
        serial_number: 'abc',
        reported_date: moment().valueOf()
    };

    var added = schedules.assignSchedule(doc, {
        name: 'duckland',
        start_from: 'reported_date',
        messages: [
            {
                group: 1,
                offset: '1 week',
                message: "This is for serial number {{serial_number}}."
            },
            {
                group: 4,
                offset: '81 days',
                message: "This is for serial number {{serial_number}}."
            }
        ]
    });

    test.equals(added, true);
    test.ok(doc.scheduled_tasks);
    test.equals(doc.scheduled_tasks.length, 2);
    test.equals(moment(doc.scheduled_tasks[1].due).diff(doc.reported_date, 'days'), 81);

    test.done();
}

exports['scheduled due timestamp respects timezone'] = function(test) {
    var doc = {
        form: 'x',
        reported_date: "2050-03-13T13:06:22.002Z"
    };
    var added = schedules.assignSchedule(doc, {
        name: 'duckland',
        start_from: 'reported_date',
        messages: [
            {
                group: 1,
                offset: '1 day',
                send_time: '08:00 +00:00',
                message: "This is for serial number {{serial_number}}."
            }
        ]
    });
    test.equals(added, true);
    test.equals(doc.scheduled_tasks.length, 1);
    test.equals(
        moment(doc.scheduled_tasks[0].due).toISOString(),
        "2050-03-14T08:00:00.000Z"
    );
    test.done();
}

exports['scheduled item without message is skipped'] = function(test) {
    var doc = {
        form: 'x',
        reported_date: "2050-03-13T13:06:22.002Z"
    };
    var added = schedules.assignSchedule(doc, {
        name: 'duckland',
        start_from: 'reported_date',
        messages: [
            {
                group: 1,
                offset: '1 day',
                send_time: '08:00 +00:00',
                message: ""
            }
        ]
    });
    test.equals(added, false);
    test.ok(!doc.scheduled_tasks);
    test.done();
}

exports['scheduled item with only spaces message is skipped'] = function(test) {
    var doc = {
        form: 'x',
        reported_date: "2050-03-13T13:06:22.002Z"
    };
    var added = schedules.assignSchedule(doc, {
        name: 'duckland',
        start_from: 'reported_date',
        messages: [
            {
                group: 1,
                offset: '1 day',
                send_time: '08:00 +00:00',
                message: "  "
            }
        ]
    });
    test.equals(added, false);
    test.ok(!doc.scheduled_tasks);
    test.done();
}

exports['schedule does not generate messages in past'] = function(test) {
    var added,
        doc;

    doc = {
        form: 'x',
        serial_number: 'abc',
        some_date: moment().subtract(12, 'weeks').toISOString()
    };

    added = schedules.assignSchedule(doc, {
        name: 'duckland',
        start_from: 'some_date',
        messages: [
            {
                group: 1,
                offset: '1 week',
                message: "This is for serial number {{serial_number}}."
            },
            {
                group: 4,
                offset: '20 weeks',
                message: "This is for serial number {{serial_number}}."
            }
        ]
    });

    test.equals(added, true);
    test.ok(doc.scheduled_tasks);
    test.equals(doc.scheduled_tasks.length, 1);
    test.equals(moment(doc.scheduled_tasks[0].due).diff(doc.some_date, 'weeks'), 20);

    test.done();
}

exports['schedule with registration_response creates message task'] = function(test) {
    var added,
        doc;
    doc = {
        form: 'x',
        from: '+123',
        serial_number: 'abc',
        reported_date: moment().valueOf(),
        related_entities: {
            clinic: {
                contact: {
                    phone: '123'
                }
            }
        }
    };

    added = schedules.assignSchedule(doc, {
        name: 'duckland',
        registration_response: 'Thanks for registering.',
        start_from: 'reported_date',
        messages: [
            {
                group: 1,
                offset: '1 week',
                message: "This is for serial number {{serial_number}}."
            },
            {
                group: 4,
                offset: '81 days',
                message: "This is for serial number {{serial_number}}."
            }
        ]
    });

    test.equals(added, true);
    test.ok(doc.scheduled_tasks);
    test.equals(doc.tasks.length, 1);
    test.equals(doc.tasks[0].messages.length, 1);
    test.equals(doc.tasks[0].messages[0].to, '123');
    test.equals(doc.tasks[0].messages[0].message, 'Thanks for registering.');

    test.done();
}

exports['when start from is null send response but skip schedule creation'] = function(test) {
    var added;

    var doc = {
        form: 'x',
        reported_date: null,
        related_entities: {
            clinic: {
                contact: {
                    phone: '123'
                }
            }
        }
    };

    added = schedules.assignSchedule(doc, {
        name: 'duckland',
        registration_response: 'Thanks for registering.',
        start_from: 'reported_date',
        messages: [
            {
                group: 1,
                offset: '1 week',
                message: "This is for serial number {{serial_number}}."
            },
            {
                group: 4,
                offset: '81 days',
                message: "This is for serial number {{serial_number}}."
            }
        ]
    });

    test.equals(added, true);
    test.ok(!doc.scheduled_tasks);
    test.equals(doc.tasks.length, 1);
    test.equals(doc.tasks[0].messages.length, 1);
    test.equals(doc.tasks[0].messages[0].to, '123');
    test.equals(doc.tasks[0].messages[0].message, 'Thanks for registering.');

    test.done();
}

exports['alreadyRun validation'] = function(test) {
    test.equals(schedules.alreadyRun({}, 'x'), false);
    test.equals(schedules.alreadyRun({
        scheduled_tasks: [
            {
                name: 'y'
            }
        ]
    }, 'x'), false);
    test.equals(schedules.alreadyRun({
        scheduled_tasks: [
            {
                name: 'x'
            }
        ]
    }, 'x'), true)
    test.equals(schedules.alreadyRun({
        tasks: [
            {
                name: 'y'
            }
        ],
        scheduled_tasks: [
            {
                name: 'y'
            }
        ]
    }, 'x'), false);
    test.equals(schedules.alreadyRun({
        tasks: [
            {
                name: 'x'
            }
        ],
        scheduled_tasks: [
            {
                name: 'y'
            }
        ]
    }, 'x'), true);
    test.done();
};