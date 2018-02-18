var fs = require( 'graceful-fs' );
var write = require( 'write' );
var circularJson = require( 'circular-json' );
var msgpack = require("msgpack-lite");

module.exports = {

  tryParse: function ( filePath, defaultValue) {
    var result;
    try {
      result = this.readJSON( filePath );
    } catch (ex) {
      result = defaultValue;
    }
    return result;
  },

  /**
   * Read json file synchronously using circular-json
   *
   * @method readJSON
   * @param  {String} filePath Json filepath
   * @returns {*} parse result
   */
  readJSON: function ( filePath ) {
    // return circularJson.parse( fs.readFileSync( filePath ).toString() );
    return   msgpack.decode(fs.readFileSync(filePath));
  },

  /**
   * Write json file synchronously using circular-json
   *
   * @method writeJSON
   * @param  {String} filePath Json filepath
   * @param  {*} data Object to serialize
   */
  writeJSON: function (filePath, data ) {
    if(fs.existsSync(filePath))
      fs.copyFileSync(filePath,filePath+".bak")
    // write.sync( filePath, circularJson.stringify( data ) );
    write.sync(filePath,msgpack.encode( data ));
  }

};