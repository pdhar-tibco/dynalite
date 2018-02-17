var inherits = require('inherits')
var AbstractLevelDOWN = require('abstract-leveldown').AbstractLevelDOWN
var AbstractIterator = require('abstract-leveldown').AbstractIterator
var ltgt = require('ltgt')
var createRBT = require('./rbtree')
var Buffer = require('safe-buffer').Buffer

// In Node, use global.setImmediate. In the browser, use a consistent
// microtask library to give consistent microtask experience to all browsers
var setImmediate = require('./immediate')
var path = require( 'path' );
var fs = require( 'graceful-fs' );
var del = require( 'del' ).sync;
var utils = require( './utils' );
var writeJSON = utils.writeJSON;

function gt (value) {
  return ltgt.compare(value, this._upperBound) > 0
}

function gte (value) {
  return ltgt.compare(value, this._upperBound) >= 0
}

function lt (value) {
  return ltgt.compare(value, this._upperBound) < 0
}

function lte (value) {
  return ltgt.compare(value, this._upperBound) <= 0
}

function FileDOWNIterator (db, options) {
  AbstractIterator.call(this, db)
  this._limit = options.limit

  if (this._limit === -1) this._limit = Infinity

  var tree = db._store

  this.keyAsBuffer = options.keyAsBuffer !== false
  this.valueAsBuffer = options.valueAsBuffer !== false
  this._reverse = options.reverse
  this._options = options
  this._done = 0

  if (!this._reverse) {
    this._incr = 'next'
    this._lowerBound = ltgt.lowerBound(options)
    this._upperBound = ltgt.upperBound(options)

    if (typeof this._lowerBound === 'undefined') {
      this._tree = tree.begin
    } else if (ltgt.lowerBoundInclusive(options)) {
      this._tree = tree.ge(this._lowerBound)
    } else {
      this._tree = tree.gt(this._lowerBound)
    }

    if (this._upperBound) {
      if (ltgt.upperBoundInclusive(options)) {
        this._test = lte
      } else {
        this._test = lt
      }
    }
  } else {
    this._incr = 'prev'
    this._lowerBound = ltgt.upperBound(options)
    this._upperBound = ltgt.lowerBound(options)

    if (typeof this._lowerBound === 'undefined') {
      this._tree = tree.end
    } else if (ltgt.upperBoundInclusive(options)) {
      this._tree = tree.le(this._lowerBound)
    } else {
      this._tree = tree.lt(this._lowerBound)
    }

    if (this._upperBound) {
      if (ltgt.lowerBoundInclusive(options)) {
        this._test = gte
      } else {
        this._test = gt
      }
    }
  }
}

inherits(FileDOWNIterator, AbstractIterator)

FileDOWNIterator.prototype._next = function (callback) {
  var key
  var value

  if (this._done++ >= this._limit) return setImmediate(callback)
  if (!this._tree.valid) return setImmediate(callback)

  key = this._tree.key
  value = this._tree.value

  if (!this._test(key)) return setImmediate(callback)

  if (this.keyAsBuffer && !Buffer.isBuffer(key)) {
    key = Buffer.from(String(key))
  }

  if (this.valueAsBuffer && !Buffer.isBuffer(value)) {
    value = Buffer.from(String(value))
  }

  this._tree[this._incr]()

  setImmediate(function callNext () {
    callback(null, key, value)
  })
}

FileDOWNIterator.prototype._test = function () {
  return true
}

function FileDOWN (location) {
  if (!(this instanceof FileDOWN)) return new FileDOWN(location)

  AbstractLevelDOWN.call(this, location)

  // this._store = createRBT(ltgt.compare)
  // console.log(JSON.stringify(this._store))
}

inherits(FileDOWN, AbstractLevelDOWN)

/**
 * Load a cache identified by the given Id. If the element does not exists, then initialize an empty
 * cache storage. If specified `cacheDir` will be used as the directory to persist the data to. If omitted
 * then the cache module directory `./cache` will be used instead
 *
 * @method load
 * @param docId {String} the id of the cache, would also be used as the name of the file cache
 * @param [cacheDir] {String} directory for the cache entry
 */
FileDOWN.prototype.load = function ( docId, cacheDir, options ) {
  var self = this;
  
  self._persisted = { };
  self._pathToFile = cacheDir ? path.resolve( cacheDir, docId ) : path.resolve( __dirname, './.cache/', docId );

  if ( fs.existsSync( self._pathToFile ) ) {
    self._persisted = utils.tryParse( self._pathToFile, { } );
    self._store = createRBT(ltgt.compare,self._persisted["root"])

  } else {
    self._persisted = self._store = createRBT(ltgt.compare)
    self.save();
  }
}

/**
 * Load the cache from the provided file
 * @method loadFile
 * @param  {String} pathToFile the path to the file containing the info for the cache
 * @param  {String} options 
 */
FileDOWN.prototype.loadFile = function ( pathToFile, options ) {
  var self = this;
  var dir = path.dirname( pathToFile );
  var fName = path.basename( pathToFile );

  self.load( fName, dir, options );
}

/**
 * Save the state of the cache identified by the docId to disk
 * as a JSON structure
 * @method save
 */
FileDOWN.prototype.save = function () {
  var self = this;
  writeJSON( self._pathToFile, self._persisted );
}

/**
 * remove the file where the cache is persisted
 * @method removeCacheFile
 * @return {Boolean} true or false if the file was successfully deleted
 */
FileDOWN.prototype.removeCacheFile = function () {
  return del( this._pathToFile, { force: true } );
}
/**
 * Destroy the file cache and cache content.
 * @method destroy
 */
FileDOWN.prototype.destroy = function () {
  var self = this;
  self._persisted = { };

  self.removeCacheFile();
}

FileDOWN.prototype._open = function (options, callback) {
  var self = this
  self.loadFile(path.resolve(self.location,'dynalite-json.db'),options)
  setImmediate(function callNext () {
    callback(null, self)
  })
}

FileDOWN.prototype._serializeKey = function (key) {
  return key
}

FileDOWN.prototype._serializeValue = function (value) {
  return value == null ? '' : value
}

FileDOWN.prototype._put = function (key, value, options, callback) {
  var self = this
  var iter = self._store.find(key)

  if (self.valid) {
    self._store = iter.update(value)
  } else {
    self._store = self._store.insert(key, value)
  }
  self._persisted = self._store
  self.save()

  setImmediate(callback)
}

FileDOWN.prototype._get = function (key, options, callback) {
  var self = this
  var value = self._store.get(key)

  if (typeof value === 'undefined') {
    // 'NotFound' error, consistent with LevelDOWN API
    return setImmediate(function callNext () {
      callback(new Error('NotFound'))
    })
  }

  if (options.asBuffer !== false && !Buffer.isBuffer(value)) {
    value = Buffer.from(String(value))
  }
  setImmediate(function callNext () {
    callback(null, value)
  })
}

FileDOWN.prototype._del = function (key, options, callback) {
  var self = this
  self._store = self._store.remove(key)
  self._persisted = self._store
  self.save()
  setImmediate(callback)
}

FileDOWN.prototype._batch = function (array, options, callback) {
  var self = this
  var i = -1
  var key
  var value
  var iter
  var len = array.length
  var tree = self._store

  while (++i < len) {
    key = array[i].key
    iter = tree.find(key)

    if (array[i].type === 'put') {
      value = array[i].value
      tree = iter.valid ? iter.update(value) : tree.insert(key, value)
    } else {
      tree = iter.remove()
    }
  }

  self._store = tree
  self._persisted = self._store
  self.save()

  setImmediate(callback)
}

FileDOWN.prototype._iterator = function (options) {
  return new FileDOWNIterator(this, options)
}

module.exports = FileDOWN.default = FileDOWN