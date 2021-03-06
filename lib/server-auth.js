﻿module.exports = function (User, config) {
    var passport = require('passport')
    , util = require('util')
    , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

    var signup = require('./server-signup.js');
    
    // Passport session setup.
    //   To support persistent login sessions, Passport needs to be able to
    //   serialize users into and deserialize users out of the session.  Typically,
    //   this will be as simple as storing the user ID when serializing, and finding
    //   the user by ID when deserializing.  However, since this example does not
    //   have a database of user records, the complete Google profile is
    //   serialized and deserialized.
    passport.serializeUser(function (sessionUser, done) {
        //
        // serialize only the user id
        done(null, sessionUser.Id);
    });
    
    passport.deserializeUser(function (id, done) {
        // only the id was serialized. so look up the user record so that it is set in session
        User.findById(id, function (err, user) {
            if (err || !user) return done(err, null);
            done(null, mapUserToSessionUser(user));
        })
    });
    
    function mapUserToSessionUser(user) {
        return {
            Id: user._id, 
            name: user.lastName + ', ' + user.firstName, 
            email: user.email, 
            token: user.accessToken
        }
    }
    // Use the GoogleStrategy within Passport.
    //   Strategies in Passport require a `verify` function, which accept
    //   credentials (in this case, an accessToken, refreshToken, and Google
    //   profile), and invoke a callback with a user object.
    passport.use(new GoogleStrategy({
        clientID: config.google.oauth2.GOOGLE_CLIENT_ID,
        clientSecret: config.google.oauth2.GOOGLE_CLIENT_SECRET,
        callbackURL: config.google.oauth2.OAUTH2_CALL_BACK_URL,
        passReqToCallback: true
    },
        function (req, accessToken, refreshToken, profile, done) {
        // asynchronous verification, for effect...
        process.nextTick(function () {
            // To keep the example simple, the user's Google profile is returned to
            // represent the logged-in user.  In a typical application, you would want
            // to associate the Google account with a user record in your database,
            // and return that user instead.
            console.log(profile);
            
            // Check if the user has to be saved
            // Is the user already in database
            var u = new User({ profileId: profile.id });
            u.findUserByProfileId(function (err, user) {
                if (err) {
                    console.log(err);
                    req.session.error = {
                        title: "App Error", 
                        message: "Data retrieval failed" , 
                        code: 500
                    };
                    return done(req.session.error);
                }
                console.log(user);
                if (!user) {
                    console.log('********************** user is null *******************');
                    // User is not found in database
                    // is the user trying to sing up?
                    if (req.session.signup) {
                        // If yes,
                        // Has it exceeded sign up count?
                        User.count(function (err, count) {
                            if (err) {
                                console.log(err);
                                req.session.error = {
                                    title: "App Error", 
                                    message: "Data retrieval failed" , 
                                    code: 500
                                };
                                done(req.session.error);
                            }
                            
                            if (signup.canUserSignUp(count)) {
                                // If not exceeded, 
                                // Save user                                
                                User.create({
                                    email: profile.emails[0].value,
                                    firstName: profile.name.givenName,
                                    lastName: profile.name.familyName,
                                    profileId: profile.id,
                                    accessToken: accessToken
                                }, function (err, user) {
                                    if (err) {
                                        console.log(err);
                                        req.session.error = {
                                            title: "App Error", 
                                            message: "User save failed" , 
                                            code: 500
                                        };
                                        done(req.session.error);
                                    }
                                    // user created. continue
                                    return done(null, mapUserToSessionUser(user));
                                });
                            } else {
                                // If exceeded,
                                // reject
                                req.session.error = {
                                    title: 'Sign Up Error', 
                                    message: 'Max user sign up exceeded', 
                                    code: 401
                                };
                                return done(req.session.error);
                            }
                        })
                    } else {
                        // reject login
                        req.session.error = {
                            title: 'Login Error', 
                            message: 'Unauthorized user. Login rejected', 
                            code: 401
                        };
                        return done(req.session.error);
                    }
                } else {
                    console.log('********************** user is null *******************');
                    // user found. continue
                    return done(null, mapUserToSessionUser(user));
                }

            })
        //return done(null, profile);
        });
    }
    ));
    
    // Simple route middleware to ensure user is authenticated.
    //   Use this route middleware on any resource that needs to be protected.  If
    //   the request is authenticated (typically via a persistent login session),
    //   the request will proceed.  Otherwise, the user will be redirected to the
    //   login page.
    this.ensureAuthenticated = function (req, res, next) {
        if (req.isAuthenticated()) {
            req.session.error = null;
            return next();
        }
        res.redirect('/login');
    }
    
    this.ensureApiAuthenticated = function (req, res, next) {
        if (req.isAuthenticated()) {
            req.session.error = null;
            return next();
        }
        else {
            var err = (req.session.error)? req.session.error: {
                title: 'Login Error', 
                message: 'A valid login session is required', 
                code: 401
            };
            req.session.error = err;
            res.status(err.code).json(err);
        }
    }
    
    this.init = function (app) {
        // Initialize Passport!  Also use passport.session() middleware, to support
        // persistent login sessions (recommended).
        app.use(passport.initialize());
        app.use(passport.session());
    }
    
    this.authGoogle = function (app) {
        // GET /auth/google
        //   Use passport.authenticate() as route middleware to authenticate the
        //   request.  The first step in Google authentication will involve
        //   redirecting the user to google.com.  After authorization, Google
        //   will redirect the user back to this application at /auth/google/callback
        app.get('/auth/google',
            passport.authenticate('google', {
            scope: ['https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email']
        }),
            function (req, res) {
                // The request will be redirected to Google for authentication, so this
                // function will not be called.
        });
    }

    this.authGoogleCallback = function (app){
        // GET /auth/google/callback
        //   Use passport.authenticate() as route middleware to authenticate the
        //   request.  If authentication fails, the user will be redirected back to the
        //   login page.  Otherwise, the primary route function function will be called,
        //   which, in this example, will redirect the user to the home page.
        app.get('/auth/google/callback', 
            passport.authenticate('google', { failureRedirect: '/login' }), 
            function (req, res) {
            res.redirect('/');
        });
    }

    this.loggedInUserApi = function (app){
        app.get('/api/loggedInUser', this.ensureApiAuthenticated, function (req, res) {
            console.log('******** Logged In User ********' + req.user.name);
            res.status(200).json({ name: req.user.name, email: req.user.email });
        })
    }

    this.logoutApi = function (app){
        app.post('/api/logout', function (req, res) {
            req.logout();
            req.session.destroy();
            res.sendStatus(200).end();
        });
    }

    this.signUpApi = function (app){
        app.post('/api/signup', function (req, res, next) {
            var signUpCode = req.body.signUpCode;
            
            if (signup.isValidSignUpCode(signUpCode)) {
                req.session.signup = true;
                res.sendStatus(200).end();
            }
            else {
                var err = {
                    title: 'Sign Up Error', 
                    message: 'Invalid sign up code. Please provide a valid sign up code', 
                    code: 401
                };
                req.session.error = err;
                res.status(401).json(err);
            }
        });
    }

}