function Animal(name) {
  this.name = name;
}

Animal.prototype.speak = function () {
  return this.name;
};

Animal.prototype.toString = function () {
  return "Animal";
};

function Dog(name) {
  Animal.call(this, name);
}

Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.bark = function () {
  return "woof";
};
Dog.prototype.fetch = function () {
  return "fetch";
};
