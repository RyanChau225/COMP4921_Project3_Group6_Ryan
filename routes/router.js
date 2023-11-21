const router = require('express').Router();

const database = include('databaseConnectionMongoDB');
var ObjectId = require('mongodb').ObjectId;

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');



const cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});
const mongoose = require('mongoose');

const bodyparser = require('body-parser');


const bcrypt = require('bcrypt');
const {
    render
} = require('express/lib/response');
const session = require('express-session');
const MongoStore = require('connect-mongodb-session')(session);
const express = require('express');
const passwordComplexity = require("joi-password-complexity");

const complexityOptions = {
  min: 10,            // Minimum length
  max: 30,            // Maximum length (adjust as needed)
  lowerCase: 1,       // Require at least 1 lowercase letter
  upperCase: 1,       // Require at least 1 uppercase letter
  numeric: 1,         // Require at least 1 digit
  symbol: 1,          // Require at least 1 special character
  requirementCount: 4, // Total number of requirements to satisfy
};

const req = require('express/lib/request');
const ejs = require('ejs');
const multer  = require('multer')
const storage = multer.memoryStorage()
const upload = multer({ storage: storage });

const mongodb_database = process.env.REMOTE_MONGODB_DATABASE;
const userCollection = database.db(mongodb_database).collection('users');
const eventCollection = database.db(mongodb_database).collection('events');



const Joi = require("joi");
const mongoSanitize = require('express-mongo-sanitize');

router.use(mongoSanitize(
    {replaceWith: '%'}
));

const secret_token = process.env.SECRET_TOKEN



router.use((req, res, next) => {
	// Set Expires header to a past date
	res.header('Expires', '-1');
	// Set other cache control headers
	res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate');
	next();
  });

router.use(session({
    secret: `${secret_token}`,
    saveUninitialized: true,
    resave: true
}));

router.use((req, res, next) => {
  if (req.session && req.session.user_id) {
      req.user_id = req.session.user_id;
  }
  next();
});




// Middleware to add user_id to res.locals for access in all templates
router.use((req, res, next) => {
  if (req.session && req.session.user_id) {
    res.locals.user_id = req.session.user_id;
  } else {
    res.locals.user_id = null;
  }
  next();
});





// Home page route
router.get('/', async (req, res) => {
  try {

      // Rendering the homepage view with threads, their authors, and view counts
      res.render("home-page.ejs", {
          user_id: req.session.user_id // pass the user_id to the template
      });
  } catch (ex) {
      res.render('error', { message: 'Error fetching threads from MongoDB' });
      console.log("Error fetching threads from MongoDB");
      console.log(ex);
  }
});





// Login page routes
router.get('/login', (req, res) => {
  res.render('login', {
    error: 'Invalid login credentials' // Only set this if there's an actual error
  });
});

router.get('/create-event', requireAuthentication, (req, res) => {
  res.render('create-event');
});

router.post('/create-event', requireAuthentication, async (req, res) => {
  try {
      // Extract event details from the request body
      const { title, startDateTime, endDateTime, color } = req.body;

      // Additional validation can be done here

      // Insert the event into the database

      await eventCollection.insertOne({
          userId: new ObjectId(req.session.user_id),
          title,
          startDateTime: new Date(startDateTime),
          endDateTime: new Date(endDateTime),
          color
      });

      // Redirect to a confirmation page or back to the calendar view
      res.redirect('/calendar-view'); // Update with your actual redirect route
  } catch (ex) {
      res.render('error', { message: 'Error creating event' });
      console.log("Error creating event", ex);
  }
});



router.get('/events/today', requireAuthentication, async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  try {
      const events = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          startDateTime: { $gte: startOfToday, $lt: endOfToday }
      }).toArray();
      res.json(events);
  } catch (ex) {
      console.error("Error fetching today's events", ex);
      res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/events/upcoming', requireAuthentication, async (req, res) => {
  const now = new Date();

  try {
      const upcomingEvent = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          startDateTime: { $gte: now }
      }).sort({ startDateTime: 1 }).limit(1).toArray();

      res.json(upcomingEvent);
  } catch (ex) {
      console.error("Error fetching upcoming event", ex);
      res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/events/week', requireAuthentication, async (req, res) => {
  const today = new Date();
  const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 1)); // Adjust for start of week (Monday)
  firstDayOfWeek.setHours(0, 0, 0, 0);
  const lastDayOfWeek = new Date(firstDayOfWeek);
  lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 7);

  try {
      const events = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          startDateTime: { $gte: firstDayOfWeek, $lt: lastDayOfWeek }
      }).toArray();
      res.json(events);
  } catch (ex) {
      console.error("Error fetching this week's events", ex);
      res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/events/month', requireAuthentication, async (req, res) => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  try {
      const events = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          startDateTime: { $gte: firstDayOfMonth, $lte: lastDayOfMonth }
      }).toArray();
      res.json(events);
  } catch (ex) {
      console.error("Error fetching this month's events", ex);
      res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/calendar-view', requireAuthentication, async (req, res) => {
  try {
      const userId = req.session.user_id;
      // Fetch user-specific events from the database
      const events = await eventCollection.find({ userId: new ObjectId(userId) }).toArray();

      res.render('calendar-view', {
          userId,
          events // Pass the events to the EJS template
      });
  } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).render('error', { message: 'Internal server error' });
  }
});





router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
      const user = await userCollection.findOne({ email });
      if (!user) {
          throw new Error('Invalid email or password');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
          throw new Error('Invalid email or password');
      }

      req.session.authenticated = true;
      req.session.user_id = user._id.toString(); // Ensure user_id is set in the session
      console.log("Session after login:", req.session);

      return res.redirect('/calendar-view'); // Redirect to calendar view after successful login
  } catch (error) {
      console.error("Error during login:", error.message);
      return res.render('login', { message: error.message });
  }
});




router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/'); 
    });
});

function requireAuthentication(req, res, next) {
  if (!req.session.authenticated) {
      console.log("Authentication required");
      return res.redirect('/login');
  }
  next();
}









router.post('/addUser', async (req, res) => {
	try {
	  console.log("form submit");
  
	  const saltRounds = 10;
	  const schema = Joi.object({
		first_name: Joi.string().alphanum().min(2).max(50).required(),
		last_name: Joi.string().alphanum().min(2).max(50).required(),
		email: Joi.string().email().min(2).max(150).required(),
		password: passwordComplexity(complexityOptions).required(),
	  });
	  const validationResult = schema.validate({
		first_name: req.body.first_name,
		last_name: req.body.last_name,
		email: req.body.email,
		password: req.body.password,
	  });
  
	  if (validationResult.error != null) {
		console.log(validationResult.error);
  
		res.render('error', { message: validationResult.error.details[0].message });
		return;
	  }
  
	  // Check if the user already exists in the database
	  const existingUser = await userCollection.findOne({ email: req.body.email });
	  if (existingUser) {
		return res.render('error', { message: 'User with this email already exists' });
	  }
  
	  bcrypt.hash(req.body.password, saltRounds, async (err, hash) => {
		if (err) {
		  console.log(err);
		  return res.render('error', { message: 'An error occurred' });
		}
  
		await userCollection.insertOne({
		  first_name: req.body.first_name,
		  last_name: req.body.last_name,
		  email: req.body.email,
		  password: hash
		});
  

  
		res.redirect("/login");
	  });
	} catch (ex) {
	  res.render('error', { message: 'Error connecting to MongoDB' });
	  console.log("Error connecting to MongoDB");
	  console.log(ex);
	}
  });


  






// Render signup.ejs
router.get('/signup', (req, res) => {
    res.render("signup.ejs");
})


router.get("*", (req,res) => {
	res.status(404);
	res.render("404");
})




module.exports = router;
