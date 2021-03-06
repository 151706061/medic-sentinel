var _ = require('underscore'),
    sinon = require('sinon'),
    messages = require('../../lib/messages'),
    utils = require('../../lib/utils'),
    transition = require('../../transitions/conditional_alerts');

var restore = function(objs) {
    _.each(objs, function(obj) {
        if (obj.restore) {
            obj.restore();
        }
    });
};

exports.tearDown = function(callback) {
    restore([
        transition._getConfig,
        messages.addMessage,
        utils.getRecentForm
    ]);
    callback();
};

exports['onMatch signature'] = function(test) {
    test.ok(_.isFunction(transition.onMatch));
    test.equals(transition.onMatch.length, 4);
    test.done();
};

exports['filter signature'] = function(test) {
    test.ok(_.isFunction(transition.filter));
    test.equals(transition.filter.length, 1);
    test.done();
};

exports['when document type is unknown do not pass filter'] = function(test) {
    test.equals(transition.filter({}), false);
    test.done();
};

exports['when document type matches pass filter'] = function(test) {
    sinon.stub(transition, '_getConfig').returns([{form: 'STCK'}]);
    test.equals(transition.filter({
        form: 'STCK',
        type: 'data_record'
    }), true);
    test.done();
};

exports['when no alerts are registered do nothing'] = function(test) {
    sinon.stub(transition, '_getConfig').returns([]);
    test.expect(2);
    transition.onMatch({}, {}, {}, function(err, changed) {
        test.equals(err, null);
        test.equals(changed, false);
        test.done();
    });
};

exports['when no alerts match document do nothing'] = function(test) {
    sinon.stub(transition, '_getConfig').returns([{
        form: 'STCK',
        condition: 'false'
    }]);
    test.expect(2);
    var doc = {
        form: 'PINK'
    };
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.equals(err, null);
        test.equals(changed, false);
        test.done();
    });
};

exports['when alert matches document send message'] = function(test) {
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'true',
            message: 'hello world',
            recipient: '+5555555'
        }, 
        '1': {
            form: 'XXXX',
            condition: 'true',
            message: 'goodbye world',
            recipient: '+6666666'
        }
    });
    var messageFn = sinon.spy(messages, 'addMessage');
    test.expect(4);
    var doc = {
        form: 'STCK'
    };
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.ok(messageFn.calledOnce);
        test.ok(messageFn.calledWith({
            doc: doc,
            phone: '+5555555',
            message: 'hello world'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};

exports['when alert matches multiple documents send message multiple times'] = function(test) {
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'true',
            message: 'hello world',
            recipient: '+5555555'
        }, 
        '1': {
            form: 'STCK',
            condition: 'true',
            message: 'goodbye world',
            recipient: '+6666666'
        }
    });
    var messageFn = sinon.spy(messages, 'addMessage');
    test.expect(5);
    var doc = {
        form: 'STCK'
    };
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.ok(messageFn.calledTwice);
        test.ok(messageFn.getCall(0).calledWith({
            doc: doc,
            phone: '+5555555',
            message: 'hello world'
        }));
        test.ok(messageFn.getCall(1).calledWith({
            doc: doc,
            phone: '+6666666',
            message: 'goodbye world'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};

exports['when alert matches document and condition is true send message'] = function(test) {
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'true',
            message: 'hello world',
            recipient: '+5555555'
        }, 
        '1': {
            form: 'STCK',
            condition: 'false',
            message: 'goodbye world',
            recipient: '+6666666'
        }
    });
    var messageFn = sinon.spy(messages, 'addMessage');
    test.expect(4);
    var doc = {
        form: 'STCK'
    };
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.ok(messageFn.calledOnce);
        test.ok(messageFn.calledWith({
            doc: doc,
            phone: '+5555555',
            message: 'hello world'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};

exports['when recent form condition is true send message'] = function(test) {
        
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'STCK(0).s1_avail == 0',
            message: 'out of units',
            recipient: '+5555555'
        }, 
        '1': {
            form: 'STCK',
            condition: 'STCK(0).s1_avail == 1',
            message: 'exactly 1 unit available',
            recipient: '+5555555'
        }
    });

    sinon.stub(utils, 'getRecentForm')
        .callsArgWith(1, null, [{
            reported_date: 1390427075750,
            doc: {
                s1_avail: 0
            }
        }]);

    var messageFn = sinon.spy(messages, 'addMessage');

    var doc = {
        form: 'STCK'
    };
    test.expect(4);
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.equals(messageFn.callCount, 1);
        test.ok(messageFn.calledWith({
            doc: doc,
            phone: '+5555555',
            message: 'out of units'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};

exports['handle missing condition reference gracefully'] = function(test) {
        
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'STCK(1).s1_avail == 0',
            message: 'out of units',
            recipient: '+5555555'
        }
    });

    sinon.stub(utils, 'getRecentForm')
        .callsArgWith(1, null, [{
            reported_date: 1390427075750,
            s1_avail: 0
        }]);

    var doc = {
        form: 'STCK'
    };
    test.expect(2);
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.equals(err, 'Cannot read property \'s1_avail\' of undefined');
        test.equals(changed, false);
        test.done();
    });
};

exports['when complex condition is true send message'] = function(test) {
        
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'STCK(0).s1_avail < (STCK(0).s1_used + STCK(1).s1_used + STCK(2).s1_used ) / 3',
            message: 'low on units',
            recipient: '+5555555'
        }
    });

    sinon.stub(utils, 'getRecentForm')
        .callsArgWith(1, null, [{
            reported_date: 1,
            doc: {
                s1_avail: 9,
                s1_used: 2
            }
        }, {
            reported_date: 2,
            doc: {
                s1_avail: 7,
                s1_used: 4
            }
        }, {
            reported_date: 3,
            doc: {
                s1_avail: 3,
                s1_used: 5
            }
        }]);

    var messageFn = sinon.spy(messages, 'addMessage');

    var doc = {
        form: 'STCK'
    };
    test.expect(4);
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.equals(messageFn.callCount, 1);
        test.ok(messageFn.calledWith({
            doc: doc,
            phone: '+5555555',
            message: 'low on units'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};

exports['database records are sorted before condition evaluation'] = function(test) {
        
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'STCK(0).s1_avail < (STCK(0).s1_used + STCK(1).s1_used + STCK(2).s1_used ) / 3',
            message: 'low on units',
            recipient: '+5555555'
        }
    });

    sinon.stub(utils, 'getRecentForm')
        .callsArgWith(1, null, [{
            reported_date: 3,
            doc: {
                s1_avail: 3,
                s1_used: 5
            }
        }, {
            reported_date: 1,
            doc: {
                s1_avail: 9,
                s1_used: 2
            }
        }, {
            reported_date: 2,
            doc: {
                s1_avail: 7,
                s1_used: 4
            }
        }]);

    var messageFn = sinon.spy(messages, 'addMessage');

    var doc = {
        form: 'STCK'
    };
    test.expect(4);
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.equals(messageFn.callCount, 1);
        test.ok(messageFn.calledWith({
            doc: doc,
            phone: '+5555555',
            message: 'low on units'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};

exports['resolve the recipient if required'] = function(test) {
    var phone = '+123456789';
    sinon.stub(transition, '_getConfig').returns({
        '0': {
            form: 'STCK',
            condition: 'true',
            message: 'alarm',
            recipient: 'grandparent'
        }
    });
    var messageFn = sinon.spy(messages, 'addMessage');
    test.expect(4);
    var doc = {
        form: 'STCK',
        contact: {
            parent: {
                parent: {
                    parent: {
                        type: 'district_hospital',
                        contact: {
                            phone: phone
                        }
                    }
                }
            }
        }
    };
    transition.onMatch({ doc: doc }, {}, {}, function(err, changed) {
        test.ok(messageFn.calledOnce);
        test.ok(messageFn.calledWith({
            doc: doc,
            phone: phone,
            message: 'alarm'
        }));
        test.equals(err, null);
        test.equals(changed, true);
        test.done();
    });
};
