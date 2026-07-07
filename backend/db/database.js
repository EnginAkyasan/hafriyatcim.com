const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname);

const COLLECTIONS = [
  'users', 'refresh_tokens', 'ilanlar', 'teklifler',
  'siparisler', 'mesajlar', 'bildirimler', 'odemeler',
  'odeme_bekleyenler', 'puanlar', 'konumlar'
];

const stores = {};

const init = () => {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      for (const col of COLLECTIONS) {
        stores[col] = new Datastore({
          filename: path.join(DB_DIR, `${col}.db`),
          autoload: true,
        });
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

const findOne = (collection, query) => {
  return new Promise((resolve, reject) => {
    stores[collection].findOne(query, (err, doc) => {
      if (err) reject(err);
      else resolve(doc);
    });
  });
};

const find = (collection, query, options = {}) => {
  return new Promise((resolve, reject) => {
    let cursor = stores[collection].find(query);
    if (options.sort) cursor = cursor.sort(options.sort);
    if (typeof options.skip === 'number') cursor = cursor.skip(options.skip);
    if (typeof options.limit === 'number') cursor = cursor.limit(options.limit);
    cursor.exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs);
    });
  });
};

const insert = (collection, doc) => {
  return new Promise((resolve, reject) => {
    stores[collection].insert(doc, (err, newDoc) => {
      if (err) reject(err);
      else resolve(newDoc);
    });
  });
};

const update = (collection, query, updateDoc, options = {}) => {
  return new Promise((resolve, reject) => {
    stores[collection].update(query, updateDoc, options, (err, numReplaced) => {
      if (err) reject(err);
      else resolve(numReplaced);
    });
  });
};

const remove = (collection, query, options = {}) => {
  return new Promise((resolve, reject) => {
    stores[collection].remove(query, options, (err, numRemoved) => {
      if (err) reject(err);
      else resolve(numRemoved);
    });
  });
};

const count = (collection, query) => {
  return new Promise((resolve, reject) => {
    stores[collection].count(query, (err, n) => {
      if (err) reject(err);
      else resolve(n);
    });
  });
};

module.exports = { init, findOne, find, insert, update, remove, count };
