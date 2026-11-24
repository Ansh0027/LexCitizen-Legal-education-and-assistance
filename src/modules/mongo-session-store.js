const session = require('express-session');

class MongoSessionStore extends session.Store {
  constructor(collection) {
    super();
    this.collection = collection;
  }

  get(sid, callback) {
    this.collection.findOne({
      _id: sid,
      $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }],
    }).then((record) => callback(null, record?.data || null))
      .catch(callback);
  }

  set(sid, value, callback = () => {}) {
    const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires) : null;
    this.collection.updateOne(
      { _id: sid },
      { $set: { data: value, expires_at: expiresAt } },
      { upsert: true },
    ).then(() => callback(null))
      .catch(callback);
  }

  touch(sid, value, callback = () => {}) {
    const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires) : null;
    this.collection.updateOne(
      { _id: sid },
      { $set: { expires_at: expiresAt } },
    ).then(() => callback(null))
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.collection.deleteOne({ _id: sid }).then(() => callback(null))
      .catch(callback);
  }
}

module.exports = MongoSessionStore;
