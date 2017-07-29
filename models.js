var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  username: String,
  password: String,
  email: String,
  fname: String,
  lname: String,
  cart: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cart'
  }
});

var venueSchema = mongoose.Schema({
  name: String,
  address: String,
  phone: String,
  rating: String,
  type: String,
  photos: Array,
  url: String,
  website: String,
  lat: Number,
  long: Number,
  hours: String,
  type: String,
  link: String
});

var cartSchema = mongoose.Schema({username: String, venues: []})

User = mongoose.model('User', userSchema);
// Venue = mongoose.model('Venue', venueSchema);
Cart = mongoose.model('Cart', cartSchema);

module.exports = {
  User: User,
  // Venue: Venue,
  Cart: Cart
};
