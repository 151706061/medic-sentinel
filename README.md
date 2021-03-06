[![Build Status](https://travis-ci.org/medic/medic-sentinel.png?branch=master)](https://travis-ci.org/medic/medic-sentinel)

## Install

Get node deps with  `npm install`.

## Run

`node server.js`

Debug mode:

`node server.js debug`

## Run Tests

`grunt test`


## Overview

Sentinel uses the changes feed on a CouchDB database and runs a set of
transitions on a document.  It also manages some scheduled tasks like message
schedules.

## Settings

Export a `COUCH_URL` env variable so sentinel knows what database to use. e.g.

```bash
export COUCH_URL='http://root:123qwe@localhost:5984/medic'
```

Throughout this document we will be refering to `ddoc`. Here we mean the currently deployed `_design/medic` ddoc from medic-webapp.

Default settings values are in `defaults.js`.  On initial start, and when there
are changes to the ddoc, sentinel reads `ddoc.app_settings` to determine configuration.

By default all transitions are disabled, to enable a transition modify the
`transitions` property on `ddoc.app_settings`.

### Transitions Configuration Examples

#### Enabled

A transition is enabled if the value associated with its name is [truthy](https://developer.mozilla.org/en-US/docs/Glossary/Truthy).

In both of these examples all three transitions are enabled:

```json
{
  "transitions": {
    "registrations": true,
    "default_responses": true,
    "update_clinics": true
  }
}
```

```json 
{
  "transitions": {
    "registrations": {
      "param": "val"
    },
    "default_responses": {},
    "update_clinics": {}
  }
}
```

#### Disabled

A transition is disabled if either the value associated with its name is [falsey](https://developer.mozilla.org/en-US/docs/Glossary/Falsy), or it has `"disable"` set to `true`, or the transition is missing.

In all three examples below the `registrations` transition is disabled.

```json
{
  "transitions": {}
}
```

```json
{
  "transitions": {
    "registrations": false
  }
}
```

```json
{
  "transitions": {
    "registrations": {
      "disable": true
    }
  }
}
```

## Transitions API

A transition does async processing of a document once per rev/change, and obeys
the following rules:

* has a `filter` function that determines if it needs to run/be applied to a
  document.

* accepts a document as a reference and makes changes using that reference,
  copying is discouraged.
  
* does not have side effects outside of the document passed in.  This might be
  extended in the future to manage changes to multiple documents, but for now
  the transition is responsible for these types of changes.

* guarantees the consistency of a document. 

* runs serially in any order.

* is repeatable, it can run multiple times on the same document without
  negative effect.  You can use the `transitions` property on a document to
  determine if a transition has run.


Callback arguments:

* callback(err, true)

  The document is saved and `ok` property value is false if `err` is truthy.

* callback(err)

  The document is saved and `ok` property value is false if `err` is truthy.
  Use this when a transition fails and should be re-run.

* callback()

  Nothing to be done, the document is not saved and next transition continues.
  Transitions will run again on next change.
