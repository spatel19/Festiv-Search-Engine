var express = require('express');
var router = express.Router();
var models = require('../models');
var User = models.User;
var Venue = models.Venue;
var request = require('request-promise');
var fs = require('fs');
var NodeGeocoder = require('node-geocoder');
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);
const Handlebars = require('Handlebars');

//////////////////////////////// PUBLIC ROUTES ////////////////////////////////
// Users who are not logged in can see these routes

// no public routes!

///////////////////////////// END OF PUBLIC ROUTES /////////////////////////////

router.use(function(req, res, next) {
  if (!req.user) {
    res.redirect('/login');
  } else {
    return next();
  }
});

//////////////////////////////// PRIVATE ROUTES ////////////////////////////////
// Only logged in users can see these routes

/* HOME PAGE where you can enter your search */
router.get('/', function(req, res, next) {
  req.session.search = req.session.search || [];
  if (req.session.search.length > 0) {
    res.render('list', {
      venues: req.session.search,
      googleApi: process.env.GOOGLEPLACES
    })
  } else {
    res.render('home', {googleApi: process.env.GOOGLEPLACES});
  }
});

/* VENUES creates session venues */
router.post('/info', function(req, res) {
  if (req.session.search && req.session.search.length > 0) {
    res.render('list', {
      venues: req.session.search,
      googleApi: process.env.GOOGLEPLACES
    })
  } else {
    var options = {
      provider: 'google',
      httpAdapter: 'https', // Default
      apiKey: process.env.GOOGLEPLACES
    };
    var geocoder = NodeGeocoder(options);
    let placeId;
    let venues = [];
    let lat;
    let long;
    geocoder.geocode(req.body.location).then(function(response) {
      lat = response[0].latitude;
      long = response[0].longitude;
    }).then(function() {
      let radius = parseInt(req.body.radius) * 1609;
      let type = req.body.type.split(" ").join("_").toLowerCase();
      return request(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?key=${process.env.GOOGLEPLACES}&location=${lat},${long}&radius=${radius}&type=${type}`).then(resp => JSON.parse(resp)).then(obj => {
        placeId = [];
        obj.results.forEach(item => {
          placeId.push(item.place_id)
        });
        for (var i = 0; i < placeId.length; i++) {
          venues.push(request(`https://maps.googleapis.com/maps/api/place/details/json?key=${process.env.GOOGLEPLACES}&placeid=${placeId[i]}`).then(resp => JSON.parse(resp)).then(obj2 => ({
            name: obj2.result.name,
            address: obj2.result.formatted_address,
            phone: obj2.result.formatted_phone_number,
            photos: obj2.result.photos,
            rating: obj2.result.rating,
            lat: obj2.result.geometry.location.lat,
            long: obj2.result.geometry.location.lng,
            hours: obj2.result.opening_hours
              ? obj2.result.opening_hours.weekday_text
              : ["Not found"],
            type: obj2.result.types,
            url: obj2.result.url,
            website: obj2.result.website,
            link: obj2.result.photos
              ? 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=' + obj2.result.photos[0].photo_reference + '&key=' + process.env.GOOGLEPLACES
              : ''
          })))
        }
        return Promise.all(venues)
      }).then(arrayOfResults => {
        req.session.search = arrayOfResults;
        res.render('list', {
          venues: arrayOfResults,
          googleApi: process.env.GOOGLEPLACES
        });
      }).catch(err => console.log("ERR", err))
    }).catch(function(err) {
      console.log(err);
    });
  }
})

// router.get('allVenues', function(req, res) {
//   res.render('list', {
//     venues: req.session.search,
//     googleApi: process.env.GOOGLEPLACES
//   });
// })

/* REFRESH allows you to restart your search */
router.get('/refresh', function(req, res) {
  delete req.session.search;
  res.redirect('/');
})

/* NEW SEARCH goes here after search within venues is pinged*/
router.post('/newSearch', function(req, res) {
  delete req.session.search;
  res.redirect(307, '/info');
})

/* INDIVIDUAL VENUE can see more information about one venue */
router.get('/venue', function(req, res) {
  var venueName = req.query.name;
  var address = req.query.address;
  req.session.search.forEach(venue => {
    if (venue.name === venueName && venue.address === address) {
      res.render('venue', {venue});
    }
  })
})

// /* INDIVIDUAL VENUE can see more information about one venue */
// router.post('/venue/:venueName', function(req, res) {
//   console.log("cart registered");
// })

/* ADD TO CART adds the speicifc venue to your cart */
router.post('/cart', function(req, res) {
  var venueName = req.query.name;
  var address = req.query.address;
  User.findById(req.user._id).populate('cart').exec(function(err, user) {
    req.session.search.forEach(venue => {
      if (venue.name === venueName && venue.address === address) {
        var cart = user.cart;
        Cart.findById(cart._id, function(err, foundCart) {
          cart.venues.push(venue);
          cart.save(function(err, savedCart) {
            res.render('cart', {venues: user.cart.venues});
          })
        })
      }
    })
  })
})

/* SHOW CART shows all items in cart*/
router.get('/showCart', function(req, res) {
  User.findById(req.user._id).populate('cart').exec(function(err, user) {
    res.render('cart', {venues: user.cart.venues})
  })
})

/* REMOVE a specific venue from the cart*/
router.post('/remove', function(req, res) {
  var venueName = req.query.name;
  var address = req.query.address;
  User.findById(req.user._id).exec(function(err, user) {
    Cart.findById(user.cart, function(err, foundCart) {
      let index;
      foundCart.venues.forEach((venueObject, i) => {
        if (venueObject.name === venueName && venueObject.address === address) {
          index = i;
        }
      })
      foundCart.venues.splice(index, 1);
      foundCart.save(function(err, savedCart) {
        user.save(function(error, savedUser) {
          res.redirect('/showCart');
        })
      })
    })
  })
})

/* WISHLIST is the link tot he questionnaire*/
router.get('/wishlist', function(req, res, next) {
  res.render('wishlist');
})

/* SUBMIT WISHLIST we will now send an email to venues*/
router.post('/wishlist', function(req, res) {
  //Cart.findById(req.user.cart, function(foundCart) {
  // for (var i = 0; i < 1; i++) {
  // var nodemailer = require('nodemailer');
  //
  // var content = `Hello from Festiv!\n
  //   Our client, ${req.user.fname}, is interested in booking your venue for my upcoming event.
  //   ${req.user.fname} would like to inquire about scheduling an event on ${req.body.date}
  //   for ${req.body.hours} hours, for approximately ${req.body.guestCount} guests.
  //   In terms of pricing, our client would prefer ${req.body.price}. Please let me know
  //   of any packages or potential prices for the event.
  //   \n
  //   Looking forward to hearing back from you!\n\n
  //   Best,
  //   Festiv
  //   festivspaces@gmail.com`;
  // var transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: {
  //     user: 'festivspaces@gmail.com',
  //     pass: 'bookfestiv6'
  //   }
  // });
  //
  // var mailOptions = {
  //   from: 'festivspaces@gmail.com',
  //   to: 'jtomli@seas.upenn.edu',
  //   subject: req.user.fname + " would like to book your venue!",
  //   text: content
  // };
  //
  // transporter.sendMail(mailOptions, function(error, info) {
  //   if (error) {
  //     console.log(error);
  //   } else {
  //     console.log('Email sent: ' + info.response);
  //   }
  //  });
  var request = sg.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: {
      personalizations: [
        {
          to: [
            {
              email: 'jamie.tomlinson11@gmail.com'
            }
          ],
          'substitutions': {
            '-businessName-': 'tester businesss',
            '-fname-': req.user.fname,
            '-date-': req.body.date,
            '-guestCount-': req.body.guestCount,
            '-price-': req.body.price,
            '-hours-': req.body.hours
          },
          subject: req.user.fname + " would like to book your venue with Festiv!"
        }
      ],
      from: {
        email: 'festivspaces@gmail.com'
      },
      template_id: process.env.TEMPLATE_ID
    }
  });
  sg.API(request, function(error, response) {
    if (error) {
      console.log('Error response received');
    }
    console.log(response.statusCode);
    console.log(response.body);
    console.log(response.headers);
    res.redirect('/refresh');
  });
})

///////////////////////////// END OF PRIVATE ROUTES /////////////////////////////

module.exports = router;
