/**************Data structures ***************/

/**
 * A Set
 * @param fromIterable An iterable from which all items should be
 *                     added to this Set.
 */
function Set() {
  // Super simple implementation using Javascript's dict.
  // WARNING: This implementation tracks objects by JSON.stringify.
  // This can lead to unexpected behavior related to object property
  // order. It also has no support for iteration because Google's JS
  // is super old.
  this._contents = {};
  this._size = 0;
  if (arguments[0]) {
    for(var item in arguments[0]) {
      this.add(arguments[0][item]);
    }
  }
}

Set.prototype = {
  add: function(item) {
    if(!this.has(item)){
      this._contents[JSON.stringify(item)] = item;
      this._size++;
    }
  },
  remove: function(item) {
    if(this.has(item)) {
      delete this._contents[JSON.stringify(item)];
      this._size--;
    }
  },
  has: function(item) {
    return !!this._contents[JSON.stringify(item)];
  },
  size: function() {
    return this._size;
  }
}

function test_set() {
  var test = new Set();
  if(test.size() != 0){
    Logger.log("Size didn't start at 0");
    return;
  }

  test.add("test");
  if(test.size() != 1) {
    Logger.log("Add didn't correctly increase size: %d", test.size());
    return;
  }

  test.add("test");
  if(test.size() != 1) {
    Logger.log("Duplicate add changed size: %d", test.size());
    return;
  }

  if(!test.has("test")) {
    Logger.log("Contains can't find string");
    return;
  }
  
  test.add("test2");
  if(!test.has("test")) {
    Logger.log("Adding lost previous item");
    return;
  }
  if(test.size() != 2) {
    Logger.log("Second add didn't correctly increase size: %s", test.size());
    return;
  }

  test.remove("test");
  if(test.size() != 1) {
    Logger.log("Remove didn't decrement size: %s", test.size());
    return;
  }
  if(test.has("test")) {
    Logger.log("Remove didn't remove");
    return;
  }
  if(!test.has("test2")) {
    Logger.log("Remove killed an unexpected item.");
    return;
  }

  test = new Set();
  test.add({});
  if(test.size() != 1) {
    Logger.log("Add didn't correctly increase size: %d", test.size());
    return;
  }
  if(!test.has({})) {
    Logger.log("Contains can't find an identical empty object");
    return;
  }
  test = new Set();
  var oneProp = {prop1: "thing"}
  test.add(oneProp);
  if(!test.has(oneProp) || test.size() != 1) {
    Logger.log("Object with one property failed: %s %s", test.has(oneProp), test.size());
    return;
  }
}