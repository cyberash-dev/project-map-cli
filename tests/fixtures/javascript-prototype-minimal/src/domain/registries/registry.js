function Registry() {
  this.items = {};
}

Registry.prototype = {
  add: function (k, v) {
    this.items[k] = v;
  },
  get: function (k) {
    return this.items[k];
  },
  remove: function (k) {
    delete this.items[k];
  },
};
