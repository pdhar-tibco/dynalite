var db = require('../db')

module.exports = function putItem(store, data, cb) {

  store.getTable(data.TableName, function(err, table) {
    if (err) return cb(err)

    var key = db.validateItem(data.Item, table), itemDb = store.getItemDb(data.TableName)
    if (key instanceof Error) return cb(key)

    itemDb.lock(key, function(release) {
      cb = release(cb)

      itemDb.get(key, function(err, existingItem) {
        if (err && err.name != 'NotFoundError') return cb(err)

        if ((err = db.checkConditional(data, existingItem)) != null) return cb(err)

        var returnObj = {}

        if (existingItem && data.ReturnValues == 'ALL_OLD')
          returnObj.Attributes = existingItem

        returnObj.ConsumedCapacity = db.addConsumedCapacity(data, false, existingItem, data.Item)

        itemDb.put(key, data.Item, function(err) {
          if (err) return cb(err)
          cb(null, returnObj)
        })
      })
    })
  })
}
