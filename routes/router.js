const router = require('express').Router();

const database = include('databaseConnectionMongoDB');
var ObjectId = require('mongodb').ObjectId;



const cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});



const bcrypt = require('bcrypt');
const {
    render
} = require('express/lib/response');
const session = require('express-session');

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

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

router.get('/manage-events', requireAuthentication, async (req, res) => {
  const thirtySecondsAgo = new Date(new Date() - 30 * 1000); // Current time minus 30 seconds

  try {
      const allEvents = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          deletedAt: { $exists: false }
      }).toArray();

      const softDeletedEvents = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          deletedAt: { $exists: true, $gte: thirtySecondsAgo }
      }).toArray();

      const expiredEvents = await eventCollection.find({
          userId: new ObjectId(req.session.user_id),
          deletedAt: { $exists: true, $lt: thirtySecondsAgo }
      }).toArray();

      console.log("Soft Deleted Events: ", softDeletedEvents);
      console.log("Expired Events: ", expiredEvents);

      res.render('manage-events', {
          allEvents,
          softDeletedEvents,
          expiredEvents
      });
  } catch (error) {
      res.status(500).render('error', { message: 'Error fetching events' });
  }
});



router.post('/restore-event/:eventId', requireAuthentication, async (req, res) => {
  const eventId = req.params.eventId;

  try {
      await eventCollection.updateOne(
          { _id: new ObjectId(eventId), userId: new ObjectId(req.session.user_id) },
          { $unset: { deletedAt: "" } } // Unset the deletedAt field
      );
      res.redirect('/manage-events'); // Redirect back to the manage events page
  } catch (error) {
      res.status(500).render('error', { message: 'Error restoring event' });
  }
});


router.post('/hard-delete-event/:eventId', requireAuthentication, async (req, res) => {
  const eventId = req.params.eventId;
  const thirtySecondsAgo = new Date(new Date() - 30 * 1000);


  try {
      await eventCollection.deleteOne({ 
          _id: new ObjectId(eventId), 
          userId: new ObjectId(req.session.user_id),
          deletedAt: { $lt: thirtySecondsAgo }
      });
      res.redirect('/manage-events');
  } catch (error) {
      res.status(500).render('error', { message: 'Error deleting event permanently' });
  }
});





router.post('/delete-event/:eventId', requireAuthentication, async (req, res) => {
  const eventId = req.params.eventId;
  const userId = req.session.user_id;

  try {
      await eventCollection.updateOne(
          { _id: new ObjectId(eventId), userId: new ObjectId(userId) },
          { $set: { deletedAt: new Date() } }
      );
      res.redirect('/manage-events'); 
  } catch (error) {
      res.status(500).render('error', { message: 'Error deleting event' });
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
          startDateTime: { $gte: startOfToday, $lt: endOfToday },
          deletedAt: { $exists: false } // Exclude soft-deleted events
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
          startDateTime: { $gte: now },
          deletedAt: { $exists: false } // Exclude soft-deleted events
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
          startDateTime: { $gte: firstDayOfWeek, $lt: lastDayOfWeek },
          deletedAt: { $exists: false } // Exclude soft-deleted events
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
          startDateTime: { $gte: firstDayOfMonth, $lte: lastDayOfMonth },
          deletedAt: { $exists: false } // Exclude soft-deleted events
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
      const events = await eventCollection.find({ 
          userId: new ObjectId(userId),
          deletedAt: { $exists: false } // Exclude soft-deleted events
      }).toArray();

      res.render('calendar-view', { userId, events });
  } catch (error) {
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





router.get('/friend-list', requireAuthentication, async (req, res) => {
  try {
      console.log("Accessing friend-list route"); // Debugging line
      const user = await userCollection.findOne({ _id: new ObjectId(req.session.user_id) });
      console.log("User found:", user); // Debugging line
      const friendList = user.friendList || [];

      res.render('friend-list', {
          friends: friendList,
          userFriendCode: user.friendCode
      });
  } catch (error) {
      console.error("Error fetching friend list:", error);
      res.status(500).render('error', { message: 'Error fetching friend list' });
  }
});




router.get('/friend-requests', requireAuthentication, async (req, res) => {
  try {
      const user = await userCollection.findOne({ _id: new ObjectId(req.session.user_id) });
      const friendRequests = user.friendRequests || [];

      // Render the friend requests page
      res.render('friend-requests', {
          friendRequests: friendRequests
      });
  } catch (error) {
      console.error("Error fetching friend requests:", error);
      res.status(500).render('error', { message: 'Error fetching friend requests' });
  }
});

// router.post('/add-friend', requireAuthentication, async (req, res) => {
//   const friendCode = req.body.friendCode;
//   const userId = req.session.user_id;

//   try {
//       // Find the user with the given friend code
//       const friendUser = await userCollection.findOne({ friendCode: friendCode });

//       if (!friendUser) {
//           // Handle case where no user is found with the given friend code
//           return res.status(404).render('error', { message: 'User with provided friend code not found' });
//       }

//       // Update the friendRequests array of the user with the given friend code
//       await userCollection.updateOne(
//           { _id: friendUser._id },
//           { $addToSet: { friendRequests: new ObjectId(userId) } } // Use $addToSet to avoid duplicate requests
//       );

//       res.redirect('/friend-requests'); // Redirect to the friend requests page
//   } catch (error) {
//       console.error("Error adding friend:", error);
//       res.status(500).render('error', { message: 'Error adding friend' });
//   }
// });

router.post('/accept-friend-request/:requesterId', requireAuthentication, async (req, res) => {
  const requesterId = req.params.requesterId;
  const userId = req.session.user_id;

  try {
      // Add each other to their respective friend lists
      await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $addToSet: { friendList: new ObjectId(requesterId) } }
      );

      await userCollection.updateOne(
          { _id: new ObjectId(requesterId) },
          { $addToSet: { friendList: new ObjectId(userId) } }
      );

      // Remove the request from the friendRequests array
      await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $pull: { friendRequests: new ObjectId(requesterId) } }
      );

      res.redirect('/friend-list'); // Redirect to the friend list page
  } catch (error) {
      console.error("Error accepting friend request:", error);
      res.status(500).render('error', { message: 'Error accepting friend request' });
  }
});

// Route to reject a friend request
router.post('/reject-friend-request/:requestId', requireAuthentication, async (req, res) => {
  const requestId = req.params.requestId;
  const userId = req.session.user_id;

  try {
      // Update the user's document to remove the friend request
      await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $pull: { friendRequests: { _id: new ObjectId(requestId) } } } // Remove the request from the friendRequests array
      );

      res.redirect('/friend-requests'); // Redirect back to the friend requests page
  } catch (error) {
      console.error("Error rejecting friend request:", error);
      res.status(500).render('error', { message: 'Error rejecting friend request' });
  }
});

// Route to send a friend request
router.post('/send-friend-request', requireAuthentication, async (req, res) => {
  try {
    const { friendCode } = req.body; // Friend code entered by the user
    const userId = req.session.user_id; // Current user's ID

    // Find the user with the given friend code
    const friendUser = await userCollection.findOne({ friendCode });

    if (!friendUser) {
      return res.status(404).render('error', { message: 'Friend code not found' });
    }

    // Add a friend request to the friend user's collection
    // Assuming there's a collection or array for friend requests in user document
    await userCollection.updateOne(
      { _id: friendUser._id },
      { $push: { friendRequests: userId } }
    );

    res.redirect('/friend-list'); // Redirect back to the friend list page
  } catch (error) {
    console.error("Error sending friend request:", error);
    res.status(500).render('error', { message: 'Error sending friend request' });
  }
});



function generateRandomCode(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
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
            // Generate a unique friend code
            const friendCode = generateRandomCode(6);

            await userCollection.insertOne({
                first_name: req.body.first_name,
                last_name: req.body.last_name,
                email: req.body.email,
                password: hash,
                friendCode: friendCode, // Store the friend code
                friendList: [], // Initialize empty friend list
                friendRequests: [] // Initialize empty friend requests list
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
